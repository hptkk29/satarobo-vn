import type { ParentRequestType, ParentRequestStatus } from "@prisma/client";

// Phase NHÓM 3 — nhãn cho yêu cầu phụ huynh (dùng chung portal + admin).
export const REQUEST_TYPE_LABEL: Record<ParentRequestType, string> = {
  ABSENCE: "Báo vắng",
  MAKEUP: "Xin học bù",
  TRANSFER_CLASS: "Chuyển lớp",
  TRANSFER_CENTER: "Chuyển cơ sở",
  RESERVE: "Bảo lưu",
  OTHER: "Khác",
};

export const REQUEST_STATUS_LABEL: Record<ParentRequestStatus, string> = {
  PENDING: "Chờ xử lý",
  APPROVED: "Đã duyệt",
  REJECTED: "Từ chối",
  CANCELLED: "Đã huỷ",
};

export const REQUEST_STATUS_BADGE: Record<ParentRequestStatus, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  APPROVED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-neutral-100 text-neutral-500",
};

export const ALL_REQUEST_TYPES = [
  "ABSENCE",
  "MAKEUP",
  "TRANSFER_CLASS",
  "TRANSFER_CENTER",
  "RESERVE",
  "OTHER",
] as const satisfies readonly ParentRequestType[];
