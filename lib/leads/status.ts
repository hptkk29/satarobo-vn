import type { LeadStatus } from "@prisma/client";

// =============================================================================
// LEAD PIPELINE — Phase T1.1
// =============================================================================

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "Mới",
  ASSIGNED: "Đã phân công",
  CONTACTED: "Đã liên hệ",
  NO_ANSWER: "Không nghe máy",
  CONSULTING: "Đang tư vấn",
  TRIAL_SCHEDULED: "Đã hẹn học thử",
  TRIAL_ATTENDED: "Đã học thử",
  TRIAL_IN_PROGRESS: "Đang học thử",
  AWAITING_DECISION: "Chờ quyết định",
  REGISTERED: "Đã đăng ký",
  ENROLLED: "Đã ghi danh",
  NURTURING: "Đang nuôi dưỡng",
  LOST: "Đã mất",
  DUPLICATE: "Trùng lặp",
  DEMO_SCHEDULED: "Đã hẹn demo (cũ)",
};

export const LEAD_STATUS_BADGE: Record<LeadStatus, string> = {
  NEW: "bg-sky-100 text-sky-700",
  ASSIGNED: "bg-cyan-100 text-cyan-700",
  CONTACTED: "bg-blue-100 text-blue-700",
  NO_ANSWER: "bg-amber-100 text-amber-700",
  CONSULTING: "bg-indigo-100 text-indigo-700",
  TRIAL_SCHEDULED: "bg-violet-100 text-violet-700",
  TRIAL_ATTENDED: "bg-purple-100 text-purple-700",
  TRIAL_IN_PROGRESS: "bg-violet-100 text-violet-800",
  AWAITING_DECISION: "bg-orange-100 text-orange-700",
  REGISTERED: "bg-emerald-100 text-emerald-700",
  ENROLLED: "bg-green-100 text-green-700",
  NURTURING: "bg-yellow-100 text-yellow-700",
  LOST: "bg-red-100 text-red-700",
  DUPLICATE: "bg-gray-200 text-gray-600",
  DEMO_SCHEDULED: "bg-purple-100 text-purple-700",
};

// Top border accent cho Kanban column header.
export const LEAD_STATUS_ACCENT: Record<LeadStatus, string> = {
  NEW: "border-sky-400",
  ASSIGNED: "border-cyan-400",
  CONTACTED: "border-blue-400",
  NO_ANSWER: "border-amber-400",
  CONSULTING: "border-indigo-400",
  TRIAL_SCHEDULED: "border-violet-400",
  TRIAL_ATTENDED: "border-purple-400",
  TRIAL_IN_PROGRESS: "border-violet-500",
  AWAITING_DECISION: "border-orange-400",
  REGISTERED: "border-emerald-500",
  ENROLLED: "border-green-500",
  NURTURING: "border-yellow-400",
  LOST: "border-red-400",
  DUPLICATE: "border-gray-300",
  DEMO_SCHEDULED: "border-purple-300",
};

// Cột Kanban hiển thị (theo thứ tự vận hành). KHÔNG show DEMO_SCHEDULED (deprecated).
export const KANBAN_COLUMNS: LeadStatus[] = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "NO_ANSWER",
  "CONSULTING",
  "TRIAL_SCHEDULED",
  "TRIAL_IN_PROGRESS",
  "TRIAL_ATTENDED",
  "AWAITING_DECISION",
  "ENROLLED",
  "NURTURING",
  "LOST",
  "DUPLICATE",
];

// Status hợp lệ cho filter + chuyển đổi (gồm cả deprecated để lọc data cũ nếu còn).
// Thứ tự theo phễu SR.QD.217: TRIAL_IN_PROGRESS sau TRIAL_ATTENDED, REGISTERED sau AWAITING_DECISION.
export const ALL_LEAD_STATUSES: LeadStatus[] = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "NO_ANSWER",
  "CONSULTING",
  "TRIAL_SCHEDULED",
  "TRIAL_ATTENDED",
  "TRIAL_IN_PROGRESS",
  "AWAITING_DECISION",
  "REGISTERED",
  "ENROLLED",
  "NURTURING",
  "LOST",
  "DUPLICATE",
  "DEMO_SCHEDULED",
];

export function leadStatusLabel(status: LeadStatus | string): string {
  return LEAD_STATUS_LABEL[status as LeadStatus] ?? String(status);
}

// =============================================================================
// R7-01 — Transition guard (permissive; chỉ chặn case REGISTERED có điều kiện C4).
// =============================================================================

/**
 * Kiểm tra chuyển trạng thái lead có hợp lệ không.
 * PERMISSIVE: cho phép mọi chuyển đổi giữa các status hiện hữu, TRỪ:
 *  - to === "REGISTERED": chỉ hợp lệ khi from === "AWAITING_DECISION" và đã có khoản ghi nhận.
 *  - from === to: no-op, luôn ok.
 */
export function canTransitionLeadStatus(
  from: LeadStatus,
  to: LeadStatus,
  opts: { hasRecordedPayment: boolean },
): { ok: boolean; reason?: string } {
  if (from === to) return { ok: true };

  if (to === "REGISTERED") {
    if (from === "AWAITING_DECISION" && opts.hasRecordedPayment === true) {
      return { ok: true };
    }
    return {
      ok: false,
      reason:
        "Chỉ chuyển sang 'Đã đăng ký' từ 'Chờ quyết định' khi đã có khoản ghi nhận",
    };
  }

  return { ok: true };
}
