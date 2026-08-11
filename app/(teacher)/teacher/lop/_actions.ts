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
import { getSessionRosterStudentIds } from "@/lib/attendance/roster";
import { isSessionOwnedByTeacher } from "@/lib/lms/session-ownership";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import {
  createMakeupNeed,
  cancelPendingMakeupNeed,
} from "@/lib/makeup/service";
import { notifyAttendanceForSession } from "@/lib/notify/attendance";
import { evaluateAbsenceRisk } from "@/lib/risk/service";

const MAKEUP_STATUSES = ["NONE", "NEEDS_MAKEUP", "MADE_UP"] as const;

const VN_OFFSET_MS = 7 * 60 * 60 * 1000; // Asia/Ho_Chi_Minh (UTC+7, không DST)

/** Mốc hết ngày hôm nay (giờ VN) dạng UTC — buổi có date SAU mốc này là buổi tương lai. */
function vnTodayEnd(now = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  const startUtc =
    Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) -
    VN_OFFSET_MS;
  return new Date(startUtc + 24 * 60 * 60 * 1000);
}

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
function deriveMakeup(
  status: AttendanceStatus,
  explicit?: (typeof MAKEUP_STATUSES)[number],
): MakeupStatus {
  if (explicit) return explicit;
  if (status === "ABSENT_UNEXCUSED" || status === "ABSENT")
    return "NEEDS_MAKEUP";
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
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
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
      date: true,
      substituteTeacherId: true,
      actualTeacherId: true,
      class: { select: { centerId: true } },
    },
  });
  if (!sess) return { ok: false, error: "Buổi không thuộc bạn" };

  // Server chốt (cùng gate vnTodayEnd với UI /teacher/lop + hub-sessions-tab):
  // KHÔNG cho điểm danh buổi CHƯA diễn ra — chặn ghi attendance trước + gửi
  // thông báo PH cho buổi tương lai.
  if (sess.date.getTime() > vnTodayEnd().getTime()) {
    return {
      ok: false,
      error: "Buổi học chưa diễn ra — không thể điểm danh trước",
    };
  }

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
  const allowed = await checkPermission("attendance:mark", {
    classId: sess.classId,
    centerId,
  });
  if (!allowed) return { ok: false, error: "Không có quyền điểm danh lớp này" };

  // (4) SEC-M02: mỗi studentId từ client PHẢI thuộc ROSTER hợp lệ của buổi (enrolled active
  // trong lớp ∪ học bù SCHEDULED, kể cả liên cơ sở) — chống ghi attendance giả cho HV
  // lớp/cơ sở khác rồi gửi thông báo giả tới phụ huynh. Tái dùng roster hiển thị (không lệch).
  const rosterIds = await getSessionRosterStudentIds(actor, data.sessionId);
  if (data.records.some((r) => !rosterIds.has(r.studentId))) {
    return { ok: false, error: "Có học viên không thuộc danh sách buổi này" };
  }

  // Write — upsert theo khoá composite sessionId_studentId; $transaction để lỗi giữa
  // chừng rollback trọn lô (GV bấm Lưu 1 lần cho cả lớp).
  try {
    await xdb.$transaction(
      data.records.map((r) => {
        const absent = isAbsent(r.status);
        const makeupStatus = absent
          ? deriveMakeup(r.status, r.makeupStatus)
          : "NONE";
        const absenceReason = absent ? r.absenceReason?.trim() || null : null;
        return xdb.attendance.upsert({
          where: {
            sessionId_studentId: {
              sessionId: data.sessionId,
              studentId: r.studentId,
            },
          },
          create: {
            sessionId: data.sessionId,
            studentId: r.studentId,
            status: r.status,
            note: r.note ?? null,
            makeupStatus,
            absenceReason,
            centerId,
          },
          update: {
            status: r.status,
            note: r.note ?? null,
            makeupStatus,
            absenceReason,
          },
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
  // Chiều ngược: sửa vắng → CÓ MẶT (PRESENT/LATE) → thu hồi MakeupNeed PENDING còn
  // treo của (HV, buổi này) — không để nhu cầu bù ma nằm ở /admin/hoc-bu.
  try {
    for (const r of data.records) {
      if (
        isAbsent(r.status) &&
        deriveMakeup(r.status, r.makeupStatus) === "NEEDS_MAKEUP"
      ) {
        await createMakeupNeed({
          studentId: r.studentId,
          missedSessionId: data.sessionId,
          createdById: actorId,
          note: r.absenceReason?.trim() || null,
        });
      } else if (!isAbsent(r.status)) {
        await cancelPendingMakeupNeed({
          studentId: r.studentId,
          missedSessionId: data.sessionId,
        });
      }
    }
  } catch (err) {
    console.error("[saveClassAttendanceAction] makeup:", err);
  }

  // Rủi ro "vắng 2 buổi liên tiếp" — trước đây CHỈ đường admin gọi, làm điểm danh
  // từ site GV (đường chính) không bao giờ tạo StudentRiskAlert/CareTask. Best-effort:
  // .catch để không chặn luồng lưu.
  try {
    for (const r of data.records) {
      if (isAbsent(r.status)) {
        await evaluateAbsenceRisk(r.studentId, sess.classId).catch((err) =>
          console.error("[saveClassAttendanceAction] risk:", err),
        );
      }
    }
  } catch (err) {
    console.error("[saveClassAttendanceAction] risk:", err);
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
