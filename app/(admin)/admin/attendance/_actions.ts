"use server";

import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createMakeupNeed } from "@/lib/makeup/service";
import { evaluateAbsenceRisk } from "@/lib/risk/service";
import { notifyAttendanceForSession } from "@/lib/notify/attendance";
import { canManageSessionClass } from "@/app/(admin)/admin/sessions/[id]/_actions";

type ActionResult = { error?: string; saved?: number };

const ATTENDANCE_STATUSES = ["PRESENT", "ABSENT", "LATE", "EXCUSED"] as const;
type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

const MAKEUP_STATUSES = ["NONE", "NEEDS_MAKEUP", "MADE_UP"] as const;
type MakeupStatus = (typeof MAKEUP_STATUSES)[number];

const recordSchema = z.object({
  studentId: z.string().min(1),
  status: z.enum(ATTENDANCE_STATUSES),
  note: z.string().optional().nullable(),
  // PHẦN 2 — vắng có cấu trúc.
  makeupStatus: z.enum(MAKEUP_STATUSES).optional(),
  absenceReason: z.string().optional().nullable(),
});

const payloadSchema = z.object({
  sessionId: z.string().min(1),
  records: z.array(recordSchema),
});

async function requireTeacherOrAdmin() {
  const session = await auth();
  if (!session?.user) throw new Error("Unauthorized");
  const role = session.user.role;
  if (role !== "SUPER_ADMIN" && role !== "CENTER_MANAGER" && role !== "TEACHER") {
    throw new Error("Forbidden");
  }
  return session.user;
}

export async function markAttendance(
  sessionId: string,
  records: Array<{
    studentId: string;
    status: string;
    note?: string | null;
    makeupStatus?: string;
    absenceReason?: string | null;
  }>,
): Promise<ActionResult> {
  let user: Awaited<ReturnType<typeof requireTeacherOrAdmin>>;
  try {
    user = await requireTeacherOrAdmin();
  } catch {
    return { error: "Không có quyền điểm danh" };
  }

  const parsed = payloadSchema.safeParse({ sessionId, records });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const data = parsed.data;

  // Cách ly cơ sở (A0-04): ClassSession ∈ SCOPED_MODELS → đọc qua scopedDb;
  // Attendance CHƯA scoped (SCOPE_EXEMPT chờ backfill) — scope tay qua classSession.class.
  const sdb = scopedDb(await resolveActor(user.id));

  // LMS-1 / W1-1 — owner-scope: GV chỉ điểm danh lớp mình dạy/trợ giảng;
  // admin/CENTER_MANAGER theo cơ sở (tái dùng canManageSessionClass).
  // select thêm centerId top-level: sdb.findUnique lọc hậu kỳ theo passesScope.
  const gateSess = await sdb.classSession.findUnique({
    where: { id: data.sessionId },
    select: { centerId: true, class: { select: { teacherId: true, assistantId: true, centerId: true } } },
  });
  if (!gateSess) return { error: "Buổi học không tồn tại" };
  const allowed = await canManageSessionClass(
    { id: user.id, role: user.role, centerId: user.centerId },
    gateSess.class,
  );
  if (!allowed) return { error: "Không có quyền với buổi của lớp này" };

  // Upsert each — composite unique key sessionId_studentId.
  // Wrap in $transaction so a mid-batch failure rolls back the entire save
  // (atomicity matters when teacher hits Save with concurrent edits open).
  try {
    await sdb.$transaction(
      data.records.map((r) => {
        const absent = r.status === "ABSENT" || r.status === "EXCUSED";
        // Có mặt → reset makeup/lý do vắng; vắng → giữ giá trị nhập (mặc định NONE).
        const makeupStatus: MakeupStatus = absent ? (r.makeupStatus ?? "NONE") : "NONE";
        const absenceReason = absent ? (r.absenceReason?.trim() || null) : null;
        return sdb.attendance.upsert({
          where: {
            sessionId_studentId: {
              sessionId: data.sessionId,
              studentId: r.studentId,
            },
          },
          create: {
            sessionId: data.sessionId,
            studentId: r.studentId,
            status: r.status as AttendanceStatus,
            note: r.note ?? null,
            makeupStatus,
            absenceReason,
          },
          update: {
            status: r.status as AttendanceStatus,
            note: r.note ?? null,
            makeupStatus,
            absenceReason,
          },
        });
      }),
    );
  } catch (err) {
    console.error("[markAttendance]", err);
    return { error: "Lỗi cơ sở dữ liệu — không lưu được điểm danh" };
  }

  // B1 — record "Cần học bù" (NEEDS_MAKEUP) → tạo MakeupNeed PENDING gắn buổi này.
  try {
    const needMakeup = data.records.filter((r) => r.makeupStatus === "NEEDS_MAKEUP");
    for (const r of needMakeup) {
      await createMakeupNeed({ studentId: r.studentId, missedSessionId: data.sessionId, note: r.absenceReason ?? null });
    }
  } catch (err) {
    console.error("[markAttendance] makeup error:", err);
  }

  // B2 — đánh giá rủi ro (nghỉ 2 buổi liên tiếp) cho HV vừa bị đánh vắng.
  try {
    const absent = data.records.filter((r) => r.status === "ABSENT" || r.status === "EXCUSED");
    const sess = absent.length
      ? await sdb.classSession.findUnique({
          where: { id: data.sessionId },
          select: { classId: true, centerId: true }, // centerId cho passesScope hậu kỳ
        })
      : null;
    if (sess) {
      for (const r of absent) await evaluateAbsenceRisk(r.studentId, sess.classId);
    }
  } catch (err) {
    console.error("[markAttendance] risk error:", err);
  }

  // Commit 5 — thông báo điểm danh cho phụ huynh (email ngay; Zalo khi đã cấu hình).
  // Best-effort: lỗi gửi KHÔNG ảnh hưởng việc lưu điểm danh.
  try {
    await notifyAttendanceForSession(data.sessionId);
  } catch (err) {
    console.error("[markAttendance] notify error:", err);
  }

  revalidatePath("/attendance");
  revalidatePath(`/attendance?sessionId=${data.sessionId}`);
  revalidatePath("/hoc-bu");
  return { saved: data.records.length };
}

export async function deleteAttendance(id: string): Promise<ActionResult> {
  let user: Awaited<ReturnType<typeof requireTeacherOrAdmin>>;
  try {
    user = await requireTeacherOrAdmin();
  } catch {
    return { error: "Không có quyền" };
  }

  // Cách ly cơ sở: Attendance chưa scoped — scope tay qua session.class (dưới).
  const sdb = scopedDb(await resolveActor(user.id));

  // LMS-1 / W1-1 — owner-scope: chặn GV xoá điểm danh lớp không thuộc mình.
  const att = await sdb.attendance.findUnique({
    where: { id },
    select: {
      session: { select: { class: { select: { teacherId: true, assistantId: true, centerId: true } } } },
    },
  });
  if (!att) return { error: "Không thể xoá bản ghi" };
  const allowed = await canManageSessionClass(
    { id: user.id, role: user.role, centerId: user.centerId },
    att.session.class,
  );
  if (!allowed) return { error: "Không có quyền với buổi của lớp này" };

  try {
    await sdb.attendance.delete({ where: { id } });
  } catch {
    return { error: "Không thể xoá bản ghi" };
  }
  revalidatePath("/attendance");
  return {};
}
