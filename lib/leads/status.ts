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
  AWAITING_DECISION: "Chờ quyết định",
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
  AWAITING_DECISION: "bg-orange-100 text-orange-700",
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
  AWAITING_DECISION: "border-orange-400",
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
  "TRIAL_ATTENDED",
  "AWAITING_DECISION",
  "ENROLLED",
  "NURTURING",
  "LOST",
  "DUPLICATE",
];

// Status hợp lệ cho filter + chuyển đổi (gồm cả deprecated để lọc data cũ nếu còn).
export const ALL_LEAD_STATUSES: LeadStatus[] = [
  ...KANBAN_COLUMNS,
  "DEMO_SCHEDULED",
];

export function leadStatusLabel(status: LeadStatus | string): string {
  return LEAD_STATUS_LABEL[status as LeadStatus] ?? String(status);
}
