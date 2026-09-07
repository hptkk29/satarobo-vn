import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit/audit-log";
import { publishEvent } from "@/lib/events/publish";
import { canCompleteSession } from "@/lib/sessions/status";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";

// =============================================================================
// R7-07 (PR2) — State machine buổi học "Hoàn tất buổi".
//
//   SCHEDULED / IN_PROGRESS  ──completeSession──▶  COMPLETED (tx)
//   CANCELLED                ──────────────────▶  CHẶN
//
// completeSession ghi dữ liệu THỰC TẾ (GV/giờ/phòng thực dạy) + nhận xét lớp
// (classComment, mọi PH lớp thấy — khác StudentSessionFeedback per-HV). Yêu cầu
// điểm danh đã lưu (thiếu → cảnh báo bắt confirm). Idempotent: bấm 2 lần → lần 2
// không phát lại event. Sau commit phát `session.taught` (idempotent theo sessionId;
// R7-14 consume để auto giao bài/tiến độ).
// =============================================================================

/** PURE — buổi có thể "hoàn tất" không (test được). CANCELLED chặn; COMPLETED idempotent. */
export function classifySessionForComplete(
  status: string,
): "OK" | "ALREADY_COMPLETED" | "BLOCKED_CANCELLED" {
  if (status === "CANCELLED") return "BLOCKED_CANCELLED";
  if (status === "COMPLETED") return "ALREADY_COMPLETED";
  return "OK";
}

export type CompleteSessionResult = {
  ok: boolean;
  error?: string;
  /** Đã COMPLETED từ trước → no-op idempotent (không phát lại event). */
  alreadyCompleted?: boolean;
  /** Thiếu điểm danh → UI bắt người dùng confirm rồi gọi lại với confirmNoAttendance. */
  needsConfirm?: boolean;
  /** Cảnh báo không chặn (vd hoàn tất buổi quá khứ — GV quên đóng). */
  warning?: string;
};

export async function completeSession(opts: {
  sessionId: string;
  actualTeacherId?: string | null;
  actualRoomId?: string | null;
  actualStartAt?: Date | null;
  actualEndAt?: Date | null;
  classComment?: string | null;
  /** true → bỏ qua cảnh báo thiếu điểm danh (người dùng đã xác nhận). */
  confirmNoAttendance?: boolean;
  // R7-14 — GV chọn cách giao bài kèm khi hoàn tất buổi:
  //   NOW (mặc định) = giao ngay, hạn = Exam.defaultDueDays;
  //   DEFER = chưa giao (bấm "Giao bài" sau); CUSTOM_DUE = giao với hạn assignDueAt.
  assignMode?: "NOW" | "DEFER" | "CUSTOM_DUE";
  assignDueAt?: Date | null;
  actorId: string | null;
  actorName: string;
  now?: Date;
}): Promise<CompleteSessionResult> {
  const now = opts.now ?? new Date();

  const session = await db.classSession.findUnique({
    where: { id: opts.sessionId },
    select: {
      id: true,
      classId: true,
      date: true,
      status: true,
      substituteTeacherId: true,
      class: {
        select: { teacherId: true, roomId: true, startTime: true, endTime: true },
      },
    },
  });
  if (!session) return { ok: false, error: "Buổi học không tồn tại" };

  const verdict = classifySessionForComplete(session.status);
  if (verdict === "BLOCKED_CANCELLED") {
    return { ok: false, error: "Buổi đã bị huỷ — không thể hoàn tất" };
  }
  if (verdict === "ALREADY_COMPLETED") {
    // Idempotent: không cập nhật lại, không phát lại event.
    return { ok: true, alreadyCompleted: true };
  }

  // Chốt single-source-of-truth: guard state machine chuẩn. Sau khi nới guard,
  // SCHEDULED (offline, trực tiếp) & IN_PROGRESS đều pass.
  if (!canCompleteSession(session.status)) {
    return { ok: false, error: "Trạng thái buổi không cho phép hoàn tất" };
  }

  // Yêu cầu điểm danh đã lưu — thiếu thì cảnh báo bắt confirm (AC4/C5).
  if (!opts.confirmNoAttendance) {
    const attCount = await db.attendance.count({ where: { sessionId: session.id } });
    if (attCount === 0) {
      return {
        ok: false,
        needsConfirm: true,
        warning: "Chưa lưu điểm danh cho buổi này. Xác nhận vẫn hoàn tất?",
      };
    }
  }

  // Buổi quá khứ chưa đóng (GV quên) → cho phép kèm cảnh báo (edge §6).
  const warning =
    session.date.getTime() < now.getTime()
      ? "Hoàn tất buổi đã qua ngày diễn ra."
      : undefined;

  // Người ĐỨNG LỚP và phòng THỰC TẾ — tính MỘT LẦN, dùng cho cả dòng ghi DB lẫn dòng nhật ký.
  //
  // Trước đây hai chỗ có hai bản sao của cùng chuỗi ưu tiên, và chúng ĐÃ LỆCH: bản vá 07/09 thêm
  // `substituteTeacherId` vào dòng ghi DB nhưng bỏ quên dòng nhật ký ⇒ nhật ký ghi tên GV CHÍNH
  // trong khi bản ghi thật mang tên người DẠY THAY. Không sai con số nào, nhưng người đi soát sau
  // này đọc nhật ký sẽ tin nhầm — đúng lúc họ cần nhật ký nhất.
  //
  // Chuỗi ưu tiên này còn ít nhất 8 bản sao rải khắp repo (period.ts, cong-day-db.ts,
  // session-teacher-notify.ts, media-review/tree.ts, …), trong đó HAI bản đảo thứ tự
  // (`substituteTeacherId ?? actualTeacherId ?? …` ở schedule-conflict.ts và birthday-notify.ts) nên
  // cho kết quả KHÁC ở buổi có cả hai cột. Gom về một helper dùng chung là việc riêng, chưa làm ở
  // đây — nhưng trong PHẠM VI một hàm thì không được để hai bản.
  const nguoiDungLop =
    opts.actualTeacherId ?? session.substituteTeacherId ?? session.class?.teacherId ?? null;
  const phongThucTe = opts.actualRoomId ?? session.class?.roomId ?? null;

  // ── SNAPSHOT SĨ SỐ BIÊN CHẾ (chốt chủ dự án 07/09/2026) ────────────────────────────────
  //
  // Đo NGAY ĐÂY vì đây là mốc "buổi đã diễn ra" duy nhất mà hệ thống biết chắc, và vì con số này
  // về sau sẽ tính ra tiền (SR.QD.230 PL04 §A.1 phân bậc đơn giá theo sĩ số 1-4 / 5-8 / 9-12 /
  // ≥13). Ghi cứng chứ KHÔNG join động: học viên vào lớp tháng 10 mà làm đổi số buổi tháng 8 là
  // đổi cả kỳ lương đã chốt.
  //
  // BIÊN CHẾ, không phải điểm danh — đếm ghi danh của lớp, nên:
  //  · khách HỌC BÙ ngồi trong phòng KHÔNG được tính (họ thuộc lớp khác);
  //  · học viên nghỉ ốm hôm đó VẪN được tính (số tính tiền phải biết trước khi buổi diễn ra).
  //
  // Dùng `ENROLLMENT_ACTIVE_STATUS_LIST` — nguồn chân lý DUY NHẤT cho "học viên đang thuộc lớp",
  // gồm cả PAUSED (bảo lưu nhưng vẫn thuộc lớp). ĐỪNG chép tay một danh sách status thứ hai:
  // repo có 7 bộ status song song và chép tay là nguồn của bug 21/08/2026.
  //
  // `deletedAt: null` viết TƯỜNG MINH: extension soft-delete chỉ tự chèn ở truy vấn top-level của
  // client gốc, và ở đây đang chạy trong `tx` — thà thừa một điều kiện còn hơn đếm cả dòng đã xoá.
  const rosterSize = await db.enrollment.count({
    where: {
      classId: session.classId,
      deletedAt: null,
      status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
    },
  });

  await db.$transaction(async (tx) => {
    await tx.classSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        rosterSize,
        rosterSource: "SNAPSHOT",
        rosterAt: now,
        completedAt: now,
        completedById: opts.actorId,
        // Dữ liệu thực tế: không nhập override thì lấy NGƯỜI DẠY THAY trước, rồi mới tới GV
        // chính của lớp.
        //
        // Trước 07/09 dòng này bỏ qua `substituteTeacherId` và rơi thẳng về `class.teacherId`.
        // Ô chọn GV ở form hoàn tất buổi là TUỲ CHỌN, nên bỏ trống là ghi đè người dạy thay —
        // mà `substituteTeacherId` chính là thứ `adjust.ts` vừa gán khi duyệt đơn dạy thay.
        // Hậu quả: buổi dạy thay bị quy về GV chính ở mọi bảng đếm buổi dạy, và người thật sự
        // đứng lớp mất công. Bắt được khi dựng phần công dạy giáo viên.
        actualTeacherId: nguoiDungLop,
        actualRoomId: phongThucTe,
        actualStartAt: opts.actualStartAt ?? null,
        actualEndAt: opts.actualEndAt ?? null,
        classComment: opts.classComment?.trim() ? opts.classComment.trim() : null,
      },
    });

    await writeAudit({
      actor: { id: opts.actorId, name: opts.actorName },
      module: "classes",
      entityType: "ClassSession",
      entityId: session.id,
      action: "COMPLETE_SESSION",
      oldValues: { status: session.status },
      newValues: {
        status: "COMPLETED",
        actualTeacherId: nguoiDungLop,
        actualRoomId: phongThucTe,
      },
      tx,
    });

    await publishEvent(
      "session.taught",
      {
        sessionId: session.id,
        classId: session.classId,
        // R7-14 — handler homework-assign đọc các field này để quyết cách giao bài.
        assignMode: opts.assignMode ?? "NOW",
        dueAt: opts.assignDueAt ? opts.assignDueAt.toISOString() : null,
        assignedById: opts.actorId,
      },
      { tx, dedupeKey: `session.taught:${session.id}` },
    );
  });

  return { ok: true, warning };
}
