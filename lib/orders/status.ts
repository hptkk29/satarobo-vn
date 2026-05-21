import type { OrderStatus, OrderType } from "@prisma/client";

// State machine: allowed transitions per status
const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING_PAYMENT", "CANCELLED"],
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["REFUNDED"],
  CANCELLED: [], // terminal
  REFUNDED: [], // terminal
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  DRAFT: "Nháp",
  PENDING_PAYMENT: "Chờ thanh toán",
  CONFIRMED: "Đã xác nhận TT",
  COMPLETED: "Hoàn tất",
  CANCELLED: "Đã huỷ",
  REFUNDED: "Đã hoàn tiền",
};

export const ORDER_STATUS_BADGE_COLOR: Record<OrderStatus, string> = {
  DRAFT: "gray",
  PENDING_PAYMENT: "yellow",
  CONFIRMED: "blue",
  COMPLETED: "green",
  CANCELLED: "red",
  REFUNDED: "purple",
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  COURSE: "Khoá học",
  PACKAGE: "Gói combo",
  EXAM: "Kỳ thi",
  PRODUCT: "Sản phẩm",
  COMBO: "Combo",
};
