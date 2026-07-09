// app/(teacher)/teacher/lop/_actions.ts — #06 (L6, câu 50): điểm danh 6 nhãn lớp GV.
//
// BẢO MẬT 2 lớp chống IDOR:
//   (1) withMakeupException(actor) nạp buổi — ClassSession ∈ MAKEUP_EXCEPTION_MODELS
//       nên GV dạy bù LIÊN cơ sở nạp được buổi ở cơ sở khác (câu 47);
//   (2) isSessionOwnedByTeacher gác quyền sở hữu thật (lớp mình / dạy thay / thực dạy).
//   (3) checkPermission("attendance:mark") — role có được điểm danh không (CLASS scope v2).
// KHÔNG import @/lib/db trần (ESLint chặn app/(teacher)/**); write đi qua client mở rộng
// (extension chỉ can thiệp READ — upsert đi thẳng). ⚠️ Câu 46: KHÔNG đọc/gửi contact PH.
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { AttendanceStatus, type MakeupStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { withMakeupException } from "@/lib/db-scope";
import { isSessionOwnedByTeacher } from "@/lib/lms/session-ownership";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import { createMakeupNeed } from "@/lib/makeup/service";
import { notifyAttendanceForSession } from "@/lib/notify/attendance";

const MAKEUP_STATUSES = ["NONE", "NEEDS_MAKEUP", "MADE_UP"] as const;

const recordSchema = z.object({
  studentId: z.string().min(1),
  // Nhận đủ 6 giá trị enum (forward-compat với 2-phase R7-08); component 6 nhãn của
  // Kiệt gửi 1 trong 4 status markable (PRESENT/LATE/ABSENT_EXCUSED/ABSENT_UNEXCUSED).
  status: z.nativeEnum(AttendanceStatus),
  note: z.string().trim().max(500).optional().nullable(),
  makeupStatus: z.enum(MAKEUP_STATUSES).optional(),
  absenceReason: z.string().trim().max(500).optional().nullable(),
});
const payloadSchema = z.object({
  sessionId: z.string().min(1),
  records: z.array(recordSchema).min(1).max(100),
});

type SaveResult = { ok: true; saved: number } | { ok: false; error: string };

/** PRESENT/LATE = có mặt; còn lại = vắng (được mang makeupStatus/lý do). */
function isAbsent(status: AttendanceStatus): boolean {
  return status !== "PRESENT" && status !== "LATE";
}

/**
 * Suy makeupStatus khi component KHÔNG gửi tường minh (câu 50 "duyệt đúng toàn bộ"):
 * vắng KHÔNG phép → cần học bù; vắng có phép → NONE; có mặt → NONE.
 */
function deriveMakeup(status: AttendanceStatus, explicit?: (typeof MAKEUP_STATUSES)[number]): MakeupStatus {
  if (explicit) return explicit;
  if (status === "ABSENT_UNEXCUSED" || status === "ABSENT") return "NEEDS_MAKEUP";
  return "NONE";
}

export async function saveClassAttendanceAction(
  sessionId: string,
  records: Array<{
    studentId: string;
    status: string;
    note?: string | null;
    makeupStatus?: string;
    absenceReason?: string | null;
  }>,
): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  const parsed = payloadSchema.safeParse({ sessionId, records });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const actor = await resolveActor(session.user.id);
  const xdb = withMakeupException(actor);

  // (1) Nạp buổi — bypass cơ sở để buổi dạy bù liên cơ sở nạp được; centerId select để
  // denormalize vào Attendance (∈ SCOPED_MODELS sau #04 — record mới không null).
  const sess = await xdb.classSession.findUnique({
    where: { id: data.sessionId },
    select: {
      id: true,
      classId: true,
      centerId: true,
      substituteTeacherId: true,
      actualTeacherId: true,
      class: { select: { centerId: true } },
    },
  });
  if (!sess) return { ok: false, error: "Buổi không thuộc bạn" };

  // (2) Quyền sở hữu THẬT — chống GV điểm danh lớp không phân công.
  const owned = isSessionOwnedByTeacher(
    {
      classId: sess.classId,
      substituteTeacherId: sess.substituteTeacherId,
      actualTeacherId: sess.actualTeacherId,
    },
    { userId: session.user.id, assignedClassIds: actor.assignedClassIds },
  );
  if (!owned) return { ok: false, error: "Buổi không thuộc bạn" };

  const centerId = sess.class.centerId ?? sess.centerId ?? null;

  // (3) Role có quyền điểm danh không (CLASS scope — seed TEACHER:attendance:mark[CLASS]).
  const allowed = await checkPermission("attendance:mark", { classId: sess.classId, centerId });
  if (!allowed) return { ok: false, error: "Không có quyền điểm danh lớp này" };

  // Write — upsert theo khoá composite sessionId_studentId; $transaction để lỗi giữa
  // chừng rollback trọn lô (GV bấm Lưu 1 lần cho cả lớp).
  try {
    await xdb.$transaction(
      data.records.map((r) => {
        const absent = isAbsent(r.status);
        const makeupStatus = absent ? deriveMakeup(r.status, r.makeupStatus) : "NONE";
        const absenceReason = absent ? (r.absenceReason?.trim() || null) : null;
        return xdb.attendance.upsert({
          where: { sessionId_studentId: { sessionId: data.sessionId, studentId: r.studentId } },
          create: {
            sessionId: data.sessionId,
            studentId: r.studentId,
            status: r.status,
            note: r.note ?? null,
            makeupStatus,
            absenceReason,
            centerId,
          },
          update: { status: r.status, note: r.note ?? null, makeupStatus, absenceReason },
        });
      }),
    );
  } catch (err) {
    console.error("[saveClassAttendanceAction]", err);
    return { ok: false, error: "Lỗi cơ sở dữ liệu — không lưu được điểm danh" };
  }

  const { actorId, actorName } = getAuditActor(session);

  // Học bù: HV vắng-không-phép (hoặc component đánh NEEDS_MAKEUP) → MakeupNeed PENDING
  // (idempotent trong service — 1 nhu cầu/buổi/HV). câu 47: học bù có thể liên cơ sở.
  try {
    for (const r of data.records) {
      if (isAbsent(r.status) && deriveMakeup(r.status, r.makeupStatus) === "NEEDS_MAKEUP") {
        await createMakeupNeed({
          studentId: r.studentId,
          missedSessionId: data.sessionId,
          createdById: actorId,
          note: r.absenceReason?.trim() || null,
        });
      }
    }
  } catch (err) {
    console.error("[saveClassAttendanceAction] makeup:", err);
  }

  // Audit 1 dòng cho cả buổi (best-effort — không chặn việc lưu).
  try {
    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "attendance",
      entityType: "ClassSession",
      entityId: data.sessionId,
      action: "attendance.marked",
      newValues: { count: data.records.length },
    });
  } catch (err) {
    console.error("[saveClassAttendanceAction] audit:", err);
  }

  // Thông báo điểm danh cho phụ huynh (email; Zalo khi cấu hình) — best-effort.
  try {
    await notifyAttendanceForSession(data.sessionId);
  } catch (err) {
    console.error("[saveClassAttendanceAction] notify:", err);
  }

  revalidatePath("/lop");
  revalidatePath("/teacher/lop");
  return { ok: true, saved: data.records.length };
}
