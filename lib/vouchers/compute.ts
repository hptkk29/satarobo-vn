import { db } from "@/lib/db";
import type { OrderType } from "@prisma/client";

export type VoucherValidationError =
  | "NOT_FOUND"
  | "INACTIVE"
  | "NOT_YET_VALID"
  | "EXPIRED"
  | "QUANTITY_EXHAUSTED"
  | "MIN_ORDER_NOT_MET"
  | "TYPE_MISMATCH"
  | "TYPE_NOT_SUPPORTED_YET"
  | "USER_LIMIT_REACHED";

const ERROR_LABEL: Record<VoucherValidationError, string> = {
  NOT_FOUND: "Mã voucher không tồn tại",
  INACTIVE: "Voucher đã bị vô hiệu hoá",
  NOT_YET_VALID: "Voucher chưa đến ngày hiệu lực",
  EXPIRED: "Voucher đã hết hạn",
  QUANTITY_EXHAUSTED: "Voucher đã hết lượt sử dụng",
  MIN_ORDER_NOT_MET: "Đơn hàng chưa đạt giá trị tối thiểu",
  TYPE_MISMATCH: "Voucher không áp dụng cho loại đơn này",
  TYPE_NOT_SUPPORTED_YET: "Loại voucher chưa hỗ trợ (đợi Sprint 5.10)",
  USER_LIMIT_REACHED: "SĐT này đã dùng voucher quá số lần cho phép",
};

export type VoucherValidationResult =
  | {
      ok: true;
      voucherId: string;
      discountAmount: number; // VND actual discount sau cap
      voucherCode: string;
      voucherName: string;
    }
  | {
      ok: false;
      error: VoucherValidationError;
      message: string;
    };

/**
 * Validate voucher + calculate discount cho 1 order.
 *
 * Note: chỉ tính discount, KHÔNG ghi VoucherRedemption hay increment
 * usedCount. Caller (server action) phải làm phần đó trong cùng
 * transaction với Order create để guarantee atomicity.
 */
export async function validateAndComputeDiscount(params: {
  code: string;
  orderType: OrderType;
  subtotal: number;
  customerPhone: string;
}): Promise<VoucherValidationResult> {
  const code = params.code.toUpperCase().trim();

  const voucher = await db.voucher.findUnique({
    where: { code },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      discountKind: true,
      discountPercent: true,
      discountAmount: true,
      maxDiscount: true,
      minOrderValue: true,
      quantity: true,
      usedCount: true,
      usageLimitPerUser: true,
      validFrom: true,
      validUntil: true,
      isActive: true,
    },
  });

  if (!voucher) {
    return { ok: false, error: "NOT_FOUND", message: ERROR_LABEL.NOT_FOUND };
  }

  // KIT_ROBOT + SENSOR not supported until Sprint 5.10 (Product model).
  if (voucher.type === "KIT_ROBOT" || voucher.type === "SENSOR") {
    return {
      ok: false,
      error: "TYPE_NOT_SUPPORTED_YET",
      message: ERROR_LABEL.TYPE_NOT_SUPPORTED_YET,
    };
  }

  // Type compatibility check
  if (voucher.type !== "ALL") {
    const matches =
      (voucher.type === "COURSE" && params.orderType === "COURSE") ||
      (voucher.type === "PACKAGE" && params.orderType === "PACKAGE");
    if (!matches) {
      return {
        ok: false,
        error: "TYPE_MISMATCH",
        message: ERROR_LABEL.TYPE_MISMATCH,
      };
    }
  }

  if (!voucher.isActive) {
    return { ok: false, error: "INACTIVE", message: ERROR_LABEL.INACTIVE };
  }

  const now = new Date();
  if (now < voucher.validFrom) {
    return {
      ok: false,
      error: "NOT_YET_VALID",
      message: ERROR_LABEL.NOT_YET_VALID,
    };
  }
  if (now > voucher.validUntil) {
    return { ok: false, error: "EXPIRED", message: ERROR_LABEL.EXPIRED };
  }

  if (voucher.quantity != null && voucher.usedCount >= voucher.quantity) {
    return {
      ok: false,
      error: "QUANTITY_EXHAUSTED",
      message: ERROR_LABEL.QUANTITY_EXHAUSTED,
    };
  }

  if (params.subtotal < voucher.minOrderValue) {
    return {
      ok: false,
      error: "MIN_ORDER_NOT_MET",
      message: `${ERROR_LABEL.MIN_ORDER_NOT_MET} (cần ${voucher.minOrderValue.toLocaleString("vi-VN")} đ)`,
    };
  }

  // Per-user limit check
  const userRedemptionCount = await db.voucherRedemption.count({
    where: {
      voucherId: voucher.id,
      customerPhone: params.customerPhone.trim(),
    },
  });
  if (userRedemptionCount >= voucher.usageLimitPerUser) {
    return {
      ok: false,
      error: "USER_LIMIT_REACHED",
      message: ERROR_LABEL.USER_LIMIT_REACHED,
    };
  }

  // Compute discount
  let discountAmount: number;
  if (voucher.discountKind === "PERCENT") {
    discountAmount = Math.floor(
      (params.subtotal * (voucher.discountPercent ?? 0)) / 100,
    );
    if (voucher.maxDiscount != null && discountAmount > voucher.maxDiscount) {
      discountAmount = voucher.maxDiscount;
    }
  } else {
    discountAmount = voucher.discountAmount ?? 0;
  }

  // Cap discount tại subtotal (không để total âm)
  if (discountAmount > params.subtotal) {
    discountAmount = params.subtotal;
  }

  return {
    ok: true,
    voucherId: voucher.id,
    voucherCode: voucher.code,
    voucherName: voucher.name,
    discountAmount,
  };
}
