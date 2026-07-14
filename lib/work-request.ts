// lib/work-request.ts — cấu hình Đơn từ GV (pure, dùng chung client/server/PDF).
// 10 loại / 3 nhóm + nhãn + quy tắc field theo loại (khớp reference :3001 don-tu).

export const WORK_REQUEST_KINDS = [
  "CLASS_CHANGE",
  "SUB_TEACH",
  "CLASS_OFF",
  "SHIFT_SWAP",
  "OT",
  "LATE_EARLY",
  "TIMESHEET_FIX",
  "LEAVE",
  "REMOTE",
  "BUSINESS_TRIP",
] as const;
export type WorkRequestKindV = (typeof WORK_REQUEST_KINDS)[number];

export const WORK_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
export type WorkRequestStatusV = (typeof WORK_REQUEST_STATUSES)[number];

export const WR_KIND_LABEL: Record<WorkRequestKindV, string> = {
  CLASS_CHANGE: "Đổi lớp dạy",
  SUB_TEACH: "Dạy thay",
  CLASS_OFF: "Nghỉ buổi dạy",
  SHIFT_SWAP: "Đổi ca",
  OT: "Tăng ca (OT)",
  LATE_EARLY: "Đi muộn / Về sớm",
  TIMESHEET_FIX: "Chỉnh công",
  LEAVE: "Nghỉ phép",
  REMOTE: "Làm từ xa",
  BUSINESS_TRIP: "Đi công tác",
};

export type WrCategoryKey = "class" | "shift" | "leave";
export const WR_CATEGORIES: { key: WrCategoryKey; label: string; kinds: WorkRequestKindV[] }[] = [
  { key: "class", label: "Liên quan lớp học", kinds: ["CLASS_CHANGE", "SUB_TEACH", "CLASS_OFF"] },
  { key: "shift", label: "Ca làm & chấm công", kinds: ["SHIFT_SWAP", "OT", "LATE_EARLY", "TIMESHEET_FIX"] },
  { key: "leave", label: "Nghỉ phép & khác", kinds: ["LEAVE", "REMOTE", "BUSINESS_TRIP"] },
];

export function wrCategoryOf(k: WorkRequestKindV): (typeof WR_CATEGORIES)[number] {
  return WR_CATEGORIES.find((c) => c.kinds.includes(k))!;
}
export const isClassKind = (k: WorkRequestKindV) => wrCategoryOf(k).key === "class";
/** Đơn 1 ngày + có mốc giờ/số giờ. */
export const isSingleKind = (k: WorkRequestKindV) =>
  k === "LATE_EARLY" || k === "OT" || k === "TIMESHEET_FIX";
/** Đơn khoảng ngày (từ → đến). */
export const isRangeKind = (k: WorkRequestKindV) =>
  k === "LEAVE" || k === "REMOTE" || k === "BUSINESS_TRIP";

export const WR_STATUS_LABEL: Record<WorkRequestStatusV, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
};

/** Số giờ từ 2 mốc "HH:mm" (dương mới hợp lệ). */
export function diffHours(a?: string | null, b?: string | null): number | null {
  if (!a || !b) return null;
  const [h1, m1] = a.split(":").map(Number);
  const [h2, m2] = b.split(":").map(Number);
  if ([h1, m1, h2, m2].some((n) => Number.isNaN(n))) return null;
  const v = (h2 * 60 + m2 - (h1 * 60 + m1)) / 60;
  return v > 0 ? Number(v.toFixed(1)) : null;
}
