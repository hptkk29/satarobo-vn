"use server";

import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createMakeupNeed, cancelPendingMakeupNeed } from "@/lib/makeup/service";
import { evaluateAbsenceRisk } from "@/lib/risk/service";
import { getSessionRosterStudentIds } from "@/lib/attendance/roster";
import {
  notifyAttendanceForSession,
  notifyTeacherAttendanceEdited,
} from "@/lib/notify/attendance";
import { writeAudit } from "@/lib/audit/audit-log";
import { decideAttendanceWrite } from "@/lib/lms/attendance-edit-policy";
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
  const session = await auth();
  if (!session?.user) return { error: "Chưa đăng nhập" };
  const user = session.user;

  const parsed = payloadSchema.safeParse({ sessionId, records });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const data = parsed.data;

  // Cách ly cơ sở (A0-04): ClassSession ∈ SCOPED_MODELS → đọc qua scopedDb;
  // findUnique trả null nếu buổi ngoài tầm nhìn cơ sở (CSKH CS1 KHÔNG thấy buổi CS2).
  // Attendance CHƯA scoped (SCOPE_EXEMPT chờ backfill) — scope tay qua classSession.class.
  const actor = await resolveActor(user.id);
  const sdb = scopedDb(actor);

  // select thêm centerId top-level: sdb.findUnique lọc hậu kỳ theo passesScope.
  const gateSess = await sdb.classSession.findUnique({
    where: { id: data.sessionId },
    select: {
      date: true,
      centerId: true,
      class: { select: { teacherId: true, assistantId: true, centerId: true } },
    },
  });
  if (!gateSess) return { error: "Buổi học không tồn tại" };

  const centerId = gateSess.class.centerId ?? gateSess.centerId ?? null;

  // Task #16 (Kiệt duyệt 07/07/2026, Phương án A) — phân quyền + cửa sổ hồi tố:
  //  • canManageSessionClass = GV chính/trợ giảng lớp mình (attendance:mark, LMS-1/W1-1),
  //    CENTER_MANAGER cùng cơ sở, SUPER_ADMIN → thao tác KHÔNG giới hạn thời gian
  //    (buổi chưa có bản ghi = ĐÁNH MỚI; buổi đã có = SỬA).
  //  • Còn lại chỉ qua attendance:edit theo cơ sở (CSKH SALES_CSM / Quản lý lớp học
  //    CENTER_CLASS_MANAGER) → chỉ SỬA/hồi tố trong 7 ngày; quá hạn phải nhờ quản lý cơ sở.
  const canManage = await canManageSessionClass(
    { id: user.id, role: user.role, centerId: user.centerId },
    gateSess.class,
  );
  const hasEditPermission = canManage
    ? true
    : await checkPermission("attendance:edit", { centerId });

  // Buổi đã có bản ghi điểm danh (đang SỬA) hay chưa (ĐÁNH MỚI)? — dùng làm snapshot audit.
  const beforeRows = await sdb.attendance.findMany({
    where: { sessionId: data.sessionId },
    select: { studentId: true, status: true, note: true, makeupStatus: true, absenceReason: true },
    orderBy: { studentId: "asc" },
  });

  const decision = decideAttendanceWrite({
    canManage,
    hasEditPermission,
    hasExistingAttendance: beforeRows.length > 0,
    sessionDate: gateSess.date,
  });
  if (!decision.ok) return { error: decision.message };

  // SEC-M02 (mirror teacher path): mỗi studentId PHẢI thuộc ROSTER hợp lệ của buổi
  // (enrolled active trong lớp ∪ học bù SCHEDULED, kể cả liên cơ sở). Attendance là
  // SCOPE_EXEMPT nên scopedDb KHÔNG chặn — thiếu check này là ghi được attendance
  // cho HV cơ sở khác rồi gửi thông báo thật tới phụ huynh.
  const rosterIds = await getSessionRosterStudentIds(actor, data.sessionId);
  if (data.records.some((r) => !rosterIds.has(r.studentId))) {
    return { error: "Có học viên không thuộc danh sách buổi này" };
  }

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
            // #04 prep: denormalize centerId từ buổi/lớp để Attendance sẵn sàng flip
            // EXEMPT→SCOPED (record mới KHÔNG null → không bị ẩn nhầm sau flip).
            centerId,
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

  // Task #16 — SỬA/hồi tố buổi ĐÃ điểm danh: ghi AuditLog (before/after) + báo GV
  // đứng lớp. "ĐÁNH MỚI" (mode=mark, buổi chưa có bản ghi) KHÔNG audit/notify.
  // Best-effort: lỗi audit/notify KHÔNG ảnh hưởng việc lưu điểm danh.
  if (decision.mode === "edit") {
    try {
      const afterRows = await sdb.attendance.findMany({
        where: { sessionId: data.sessionId },
        select: { studentId: true, status: true, note: true, makeupStatus: true, absenceReason: true },
        orderBy: { studentId: "asc" },
      });
      await writeAudit({
        actor: { id: user.id, name: user.name ?? user.email ?? user.id },
        module: "attendance",
        entityType: "ClassSession",
        entityId: data.sessionId,
        action: "attendance.edited",
        oldValues: { records: beforeRows },
        newValues: { records: afterRows },
        changedFields: ["attendance"],
        orgUnitId: null,
      });
    } catch (err) {
      console.error("[markAttendance] audit error:", err);
    }
    try {
      await notifyTeacherAttendanceEdited({
        sessionId: data.sessionId,
        editedByUserId: user.id,
        editedByName: user.name ?? user.email ?? null,
      });
    } catch (err) {
      console.error("[markAttendance] notify teacher error:", err);
    }
  }

  // B1 — record "Cần học bù" (NEEDS_MAKEUP) → tạo MakeupNeed PENDING gắn buổi này.
  // Chiều ngược: sửa vắng → CÓ MẶT (PRESENT/LATE) → thu hồi MakeupNeed PENDING còn
  // treo của (HV, buổi này) — không để nhu cầu bù ma nằm ở /admin/hoc-bu.
  //
  // 19/08 — thu hồi theo makeupStatus HIỆU LỰC, không theo "có mặt hay không". Nhánh cũ
  // chỉ chạy khi HV chuyển sang PRESENT/LATE, nên thao tác "vắng cần bù → vắng KHÔNG cần
  // bù (có phép)" rơi vào khe: không tạo, cũng không thu hồi ⇒ MakeupNeed PENDING nằm
  // mồ côi ở /admin/hoc-bu. MADE_UP thì không đụng (nhu cầu đã hoàn tất).
  try {
    for (const r of data.records) {
      const absent = r.status === "ABSENT" || r.status === "EXCUSED";
      const makeupStatus: MakeupStatus = absent ? (r.makeupStatus ?? "NONE") : "NONE";
      if (makeupStatus === "NEEDS_MAKEUP") {
        await createMakeupNeed({ studentId: r.studentId, missedSessionId: data.sessionId, note: r.absenceReason ?? null });
      } else if (makeupStatus === "NONE") {
        await cancelPendingMakeupNeed({ studentId: r.studentId, missedSessionId: data.sessionId });
      }
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
