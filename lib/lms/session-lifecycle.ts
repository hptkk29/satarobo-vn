import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit/audit-log";
import { publishEvent } from "@/lib/events/publish";

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

  await db.$transaction(async (tx) => {
    await tx.classSession.update({
      where: { id: session.id },
      data: {
        status: "COMPLETED",
        completedAt: now,
        completedById: opts.actorId,
        // Dữ liệu thực tế: mặc định lấy theo lớp nếu GV không nhập override.
        actualTeacherId: opts.actualTeacherId ?? session.class?.teacherId ?? null,
        actualRoomId: opts.actualRoomId ?? session.class?.roomId ?? null,
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
        actualTeacherId: opts.actualTeacherId ?? session.class?.teacherId ?? null,
        actualRoomId: opts.actualRoomId ?? session.class?.roomId ?? null,
      },
      tx,
    });

    await publishEvent(
      "session.taught",
      { sessionId: session.id, classId: session.classId },
      { tx, dedupeKey: `session.taught:${session.id}` },
    );
  });

  return { ok: true, warning };
}
