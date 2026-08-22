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
import { mapWithConcurrency } from "@/lib/util/concurrency";

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
  // ⚠️ CHỈ thu hồi khi HV quay lại CÓ MẶT — xem ghi chú cùng chỗ ở teacher/lop/_actions.ts:
  // mở rộng sang "mọi trạng thái không cần bù" sẽ xoá mất suất bù của HV vắng CÓ PHÉP
  // (nhu cầu do phiếu xin nghỉ đã duyệt sinh ra).
  // Song song CÓ TRẦN: mỗi học viên là một lượt độc lập, chạy nối đuôi thì cả lớp 20 em
  // phải chờ 20 vòng truy vấn trước khi action trả về.
  try {
    await mapWithConcurrency(data.records, 5, async (r) => {
      const absent = r.status === "ABSENT" || r.status === "EXCUSED";
      const makeupStatus: MakeupStatus = absent ? (r.makeupStatus ?? "NONE") : "NONE";
      if (makeupStatus === "NEEDS_MAKEUP") {
        await createMakeupNeed({
          studentId: r.studentId,
          missedSessionId: data.sessionId,
          note: r.absenceReason ?? null,
          // Xem ghi chú cùng chỗ ở teacher/lop/_actions.ts.
          reviveCancelled:
            beforeRows.find((b) => b.studentId === r.studentId)?.makeupStatus !==
            "NEEDS_MAKEUP",
        });
      } else if (r.status === "PRESENT" || r.status === "LATE") {
        await cancelPendingMakeupNeed({ studentId: r.studentId, missedSessionId: data.sessionId });
      }
    });
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

// ─────────────────────────────────────────────────────────────────────────────
// 21/08 — "Hoàn tất buổi" bấm thẳng từ danh sách buổi của lớp ở màn điểm danh.
//
// ⚠️ ĐỌC TRƯỚC KHI SỬA — hai chỗ ở đây là quyết định có chủ đích, không phải sót:
//
// 1. KHÔNG đi qua `completeSessionAction` (classes/[id]/session/_actions.ts). Hàm đó
//    gác sau cờ `SESSION_LIFECYCLE_V2` — cờ TẮT ở cả dev lẫn prod, nên bấm nút sẽ chỉ
//    nhận "tính năng chưa được bật". Chủ dự án chốt 21/08: màn này phải đóng được buổi.
//    Nên ở đây gọi thẳng `lib/lms/session-lifecycle.completeSession` — CÙNG một state
//    machine, không đẻ đường thứ hai đổi `status` bằng tay.
//
// 2. `assignMode` GIM CỨNG "DEFER". Chủ dự án nói rõ: "hoàn tất buổi ở đây là hoàn tất
//    điểm danh, nhận xét, ảnh/video — bài tập về nhà không liên quan". Để "NOW" thì
//    event `session.taught` sẽ tự tạo HomeworkAssignment và bắn thông báo "Bài tập mới"
//    tới học viên/phụ huynh ngay lúc nhân viên bấm nút. Giao bài vẫn làm được bằng nút
//    "Giao bài" sẵn có ở trang lớp. ĐỪNG mở thành tham số cho gọn — mở ra là màn điểm
//    danh im lặng trở thành đường gửi tin cho phụ huynh.
//
// Cổng: 3 việc phải XONG ĐỦ (kiểm lại Ở SERVER, không tin nút bị disable trên giao
// diện — Server Action là endpoint riêng, POST thẳng vào được).
import { completeSession } from "@/lib/lms/session-lifecycle";
import { getAuditActor } from "@/lib/audit/log";
import { passesScope } from "@/lib/db-scope";
import { sessionWorkState } from "@/lib/lms/attendance-queue";
import {
  buildSessionMediaCoverage,
  isSessionWorkComplete,
  SESSION_MEDIA_SELECT,
} from "@/lib/lms/session-order";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";

export type CompleteAttendanceSessionResult = {
  ok: boolean;
  error?: string;
  /** Buổi vốn đã COMPLETED — bấm lại không phát lại event. */
  alreadyCompleted?: boolean;
};

export async function completeAttendanceSessionAction(
  sessionId: string,
): Promise<CompleteAttendanceSessionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("sessions:edit"))) {
    return { ok: false, error: "Không có quyền hoàn tất buổi" };
  }

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const sess = await sdb.classSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      classId: true,
      status: true,
      centerId: true,
      class: { select: { centerId: true } },
    },
  });
  if (!sess) return { ok: false, error: "Không tìm thấy buổi học" };
  if (!passesScope("Class", { centerId: sess.class?.centerId ?? null }, actor)) {
    return { ok: false, error: "Lớp không thuộc cơ sở bạn quản lý" };
  }

  // Ownership: quản lý/HO/SUPER_ADMIN, hoặc GV phụ trách ĐÚNG lớp này — khớp luật của
  // completeSessionAction để hai đường không cho phép hai tập người khác nhau.
  const isManager =
    actor.isSuperAdmin ||
    actor.isHoLevel ||
    actor.orgRoles.some((r) => r.roleCode === "CENTER_MANAGER");
  if (!isManager && !actor.assignedClassIds.has(sess.classId)) {
    return { ok: false, error: "Chỉ giáo viên phụ trách mới hoàn tất được buổi này" };
  }
  if (sess.status === "CANCELLED") {
    return { ok: false, error: "Buổi đã bị huỷ — không thể hoàn tất" };
  }

  // Kiểm lại đủ 3 việc ở server.
  const [roster, attendanceRows, feedbackRows, mediaRows] = await Promise.all([
    sdb.enrollment.findMany({
      where: {
        classId: sess.classId,
        status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
        deletedAt: null,
        student: { deletedAt: null },
      },
      select: { studentId: true },
    }),
    sdb.attendance.findMany({
      where: { sessionId },
      select: { studentId: true, status: true },
    }),
    sdb.studentSessionFeedback.findMany({
      where: { classSessionId: sessionId },
      select: { studentId: true },
    }),
    // Từng dòng kèm thẻ học viên — luật là mọi em đi học phải có ảnh, đếm gộp không
    // trả lời được câu đó (xem SessionWorkInput.media).
    sdb.classSessionMedia.findMany({
      where: { classSessionId: sessionId, status: { not: "REJECTED" } },
      select: SESSION_MEDIA_SELECT,
    }),
  ]);

  const cover = buildSessionMediaCoverage(mediaRows).get(sessionId) ?? {
    classWide: false,
    tagged: new Set<string>(),
  };
  const work = sessionWorkState({
    rosterStudentIds: roster.map((r) => r.studentId),
    attendanceRows,
    feedbackStudentIds: feedbackRows.map((f) => f.studentId),
    media: { taggedStudentIds: cover.tagged, hasClassWide: cover.classWide },
  });
  if (!isSessionWorkComplete(work)) {
    const missing = [
      work.attendanceDone ? null : "điểm danh đủ lớp",
      work.feedbackDone ? null : "nhận xét đủ học viên đi học",
      work.photoDone ? null : "ảnh/video cho mọi học viên đi học",
    ].filter(Boolean);
    return { ok: false, error: `Chưa hoàn tất: còn thiếu ${missing.join(", ")}.` };
  }

  const { actorId, actorName } = getAuditActor(session);
  const res = await completeSession({
    sessionId,
    // Đã kiểm điểm danh ĐỦ CẢ LỚP ở trên — chặt hơn hẳn cảnh báo "chưa có bản ghi nào"
    // của lifecycle, nên không cần hỏi lại người dùng.
    confirmNoAttendance: true,
    assignMode: "DEFER", // xem ghi chú (2) ở đầu khối
    actorId,
    actorName,
  });
  if (!res.ok) return { ok: false, error: res.error ?? "Hoàn tất buổi thất bại" };

  revalidatePath("/attendance");
  revalidatePath(`/classes/${sess.classId}`);
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true, alreadyCompleted: res.alreadyCompleted };
}
