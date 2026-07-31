import "server-only";
import { db } from "@/lib/db";
import { cancelSession, adjustSession } from "@/lib/classes/adjust";

// =============================================================================
// BGĐ 31/07 — DUYỆT ĐƠN GV PHẢI CÓ HIỆU LỰC THẬT.
//
// Trước đây duyệt WorkRequest chỉ đổi status (giấy tờ): buổi học KHÔNG bị huỷ,
// GV dạy thay KHÔNG được gán ⇒ lịch trên hệ thống lệch thực tế.
//
// Nay khi APPROVED:
//   CLASS_OFF  → huỷ buổi của lớp trong ngày xin nghỉ (cancelSession: sinh buổi bù
//                + đánh dấu HV cần học bù theo luật sẵn có).
//   SUB_TEACH  → gán GV dạy thay cho buổi đó (adjustSession → substituteTeacherId,
//                đã kèm soát trùng GV/phòng).
//   CLASS_CHANGE và các loại khác → KHÔNG tự đổi lịch (đổi lớp phụ trách là việc
//                của quản lý trên màn lớp; đơn chỉ là căn cứ).
//
// Best-effort: lỗi áp dụng KHÔNG rollback trạng thái duyệt — trả lời rõ để quản lý
// xử lý tay, vì đơn đã duyệt là quyết định hành chính đã ra.
// =============================================================================

export type ApplyWorkRequestResult = {
  /** Có tác động lên lịch không (false = loại đơn không cần áp dụng). */
  applied: boolean;
  /** Thông báo phụ để hiện cho người duyệt (thành công hoặc lý do không áp được). */
  message?: string;
};

/** Buổi học của lớp trong ĐÚNG ngày (bỏ buổi đã huỷ). */
async function findSessionOnDate(classId: string, day: Date) {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return db.classSession.findFirst({
    where: {
      classId,
      date: { gte: start, lt: end },
      status: { notIn: ["CANCELLED"] },
    },
    orderBy: { date: "asc" },
    select: { id: true, status: true },
  });
}

export async function applyApprovedWorkRequest(params: {
  request: {
    id: string;
    kind: string;
    classId: string | null;
    fromDate: Date | null;
    targetUserId: string | null;
    reason: string;
    requesterId: string;
  };
  actorId: string | null;
  actorName: string;
}): Promise<ApplyWorkRequestResult> {
  const { request: req, actorId, actorName } = params;

  if (req.kind !== "CLASS_OFF" && req.kind !== "SUB_TEACH") {
    return { applied: false };
  }
  if (!req.classId || !req.fromDate) {
    return { applied: false, message: "Đơn thiếu lớp/ngày — hãy cập nhật lịch thủ công." };
  }

  const session = await findSessionOnDate(req.classId, req.fromDate);
  if (!session) {
    return {
      applied: false,
      message: "Không tìm thấy buổi học của lớp trong ngày này — hãy cập nhật lịch thủ công.",
    };
  }

  if (req.kind === "CLASS_OFF") {
    const r = await cancelSession({
      sessionId: session.id,
      reason: `Duyệt đơn nghỉ dạy: ${req.reason}`.slice(0, 500),
      actorId,
      actorName,
    });
    return r.ok
      ? { applied: true, message: "Đã huỷ buổi học tương ứng." }
      : { applied: false, message: r.error ?? "Không huỷ được buổi học — xử lý thủ công." };
  }

  // SUB_TEACH — cần biết ai dạy thay.
  if (!req.targetUserId) {
    return { applied: false, message: "Đơn chưa chọn người dạy thay — gán thủ công." };
  }
  const r = await adjustSession({
    sessionId: session.id,
    teacherId: req.targetUserId,
    actorId,
    actorName,
  });
  return r.ok
    ? { applied: true, message: "Đã gán giáo viên dạy thay cho buổi học." }
    : { applied: false, message: r.error ?? "Không gán được GV dạy thay — xử lý thủ công." };
}
