import type { SessionStatus } from "@prisma/client";

/**
 * FIX-H4 — Guard state machine cho ClassSession (`SessionStatus`).
 *
 * State machine: chuyển trạng thái HỢP LỆ theo từng trạng thái nguồn.
 * Mẫu theo `lib/orders/status.ts` (transition map + canTransition).
 *
 * Quy tắc:
 * - SCHEDULED (chưa bắt đầu) → IN_PROGRESS | CANCELLED
 * - IN_PROGRESS (đang diễn ra) → COMPLETED | CANCELLED
 * - COMPLETED | CANCELLED → terminal (không ra) — không re-start buổi đã xong/đã hủy.
 */
export const SESSION_TRANSITIONS: Record<SessionStatus, SessionStatus[]> = {
  SCHEDULED: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [], // terminal
  CANCELLED: [], // terminal
};

export function canTransition(from: SessionStatus, to: SessionStatus): boolean {
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Chỉ được bắt đầu buổi khi đang SCHEDULED. */
export function canStartSession(status: SessionStatus): boolean {
  return canTransition(status, "IN_PROGRESS");
}

/** Chỉ được hoàn tất buổi khi đang IN_PROGRESS. */
export function canCompleteSession(status: SessionStatus): boolean {
  return canTransition(status, "COMPLETED");
}
