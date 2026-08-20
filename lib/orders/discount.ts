import "server-only";
import type { DiscountApprovalStatus, Prisma, Role } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/audit/audit-log";

// =============================================================================
// BGĐ 31/07 — GIẢM GIÁ nhập tay: giá gốc → giảm (% hoặc số tiền) → tổng →
// giải trình → Quản lý cơ sở duyệt → mới được xác nhận đơn.
//
// 03/08 — hệ MÃ KHUYẾN MÃI đã gỡ theo chốt chủ dự án (giảm theo %/số tiền linh
// động hơn, khỏi tạo mã cho từng đợt) ⇒ nay MỌI giảm giá đều đi luồng này.
//
// Cùng khuôn với duyệt trả góp (lib/orders/installments.ts): lib nhận actor thuần
// + assertCan (lớp phòng thủ); gate CHÍNH theo cờ RBAC nằm ở server action wrapper.
// =============================================================================

/** THUẦN — số tiền giảm từ % (làm tròn, clamp trong [0, subtotal]). */
export function discountFromPercent(subtotal: number, percent: number): number {
  if (!(percent > 0)) return 0;
  const pct = Math.min(100, Math.max(0, percent));
  return Math.min(subtotal, Math.round((subtotal * pct) / 100));
}

/** THUẦN — đơn có cần duyệt giảm giá không (mọi giảm giá > 0 đều cần). */
export function needsDiscountApproval(input: { discountAmount: number }): boolean {
  return input.discountAmount > 0;
}

export type DiscountApprovalActor = {
  id: string;
  name: string;
  role?: Role | string | null;
  roles?: (Role | string)[] | null;
};

/** Phần đơn mà việc duyệt giảm giá cần đọc — dùng chung cho luồng lẻ và luồng gộp. */
export type DiscountApprovalOrder = {
  id: string;
  centerId: string | null;
  discountApprovalStatus: DiscountApprovalStatus | null;
};

// -----------------------------------------------------------------------------
// THÂN của việc duyệt/từ chối giảm giá, nhận sẵn `tx`.
//
// VÌ SAO TÁCH RA. Từ 20/08 quản lý cơ sở duyệt CẢ ĐƠN bằng MỘT nút (giảm giá +
// kế hoạch thanh toán cùng lúc — xem lib/orders/approval.ts). Hai việc đó phải nằm
// trong CÙNG một transaction, nếu không sẽ có đơn "duyệt xong một nửa" khi lệnh
// hỏng giữa chừng. Chép lại thân hàm sang chỗ mới là cách chắc chắn để hai bản
// trôi khác nhau sau vài lần sửa, nên chỗ duy nhất biết cách đặt cột + ghi nhật ký
// vẫn là đây; luồng gộp chỉ mượn lại.
// -----------------------------------------------------------------------------

/** Đặt cột duyệt giảm giá + ghi nhật ký. Caller lo assertCan và kiểm trạng thái. */
export async function applyDiscountApproval(
  tx: Prisma.TransactionClient,
  params: { order: DiscountApprovalOrder; actor: DiscountApprovalActor; reason?: string },
): Promise<void> {
  const { order, actor } = params;
  await tx.order.update({
    where: { id: order.id },
    data: {
      discountApprovalStatus: "APPROVED",
      discountApprovedById: actor.id,
      discountApprovedAt: new Date(),
      discountRejectReason: null,
    },
  });
  await writeAudit({
    actor: { id: actor.id, name: actor.name },
    module: "finance",
    entityType: "Order",
    entityId: order.id,
    action: "DISCOUNT_APPROVED",
    oldValues: { discountApprovalStatus: order.discountApprovalStatus },
    newValues: { discountApprovalStatus: "APPROVED" },
    reason: params.reason?.trim() || undefined,
    orgUnitId: order.centerId,
    tx,
  });
}

/** Đặt cột từ chối giảm giá + ghi nhật ký. Caller lo assertCan và kiểm `reason`. */
export async function applyDiscountRejection(
  tx: Prisma.TransactionClient,
  params: { order: DiscountApprovalOrder; actor: DiscountApprovalActor; reason: string },
): Promise<void> {
  const { order, actor } = params;
  const reason = params.reason.trim();
  await tx.order.update({
    where: { id: order.id },
    data: {
      discountApprovalStatus: "REJECTED",
      discountApprovedById: actor.id,
      discountApprovedAt: new Date(),
      discountRejectReason: reason,
    },
  });
  await writeAudit({
    actor: { id: actor.id, name: actor.name },
    module: "finance",
    entityType: "Order",
    entityId: order.id,
    action: "DISCOUNT_REJECTED",
    oldValues: { discountApprovalStatus: order.discountApprovalStatus },
    newValues: { discountApprovalStatus: "REJECTED" },
    reason,
    orgUnitId: order.centerId,
    tx,
  });
}

/**
 * QLCS/SUPER_ADMIN duyệt giảm giá → APPROVED (đơn được phép xác nhận).
 *
 * @deprecated Dùng `approveOrder()` (lib/orders/approval.ts) — một nút duyệt cho cả
 * giảm giá lẫn kế hoạch thanh toán. Giữ lại cho đơn/luồng chỉ có giảm giá và cho
 * caller cũ; hành vi KHÔNG đổi.
 */
export async function approveOrderDiscount(params: {
  orderId: string;
  actor: DiscountApprovalActor;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    assertCan(
      { role: params.actor.role ?? null, roles: params.actor.roles ?? undefined },
      "discounts:approve",
    );
  } catch {
    return { ok: false, error: "Không có quyền duyệt giảm giá" };
  }

  const order = await db.order.findUnique({
    where: { id: params.orderId },
    select: { id: true, centerId: true, leadId: true, discountApprovalStatus: true },
  });
  if (!order) return { ok: false, error: "Không tìm thấy đơn" };
  if (order.discountApprovalStatus == null) {
    return { ok: false, error: "Đơn không có giảm giá cần duyệt" };
  }

  await db.$transaction(async (tx) => {
    await applyDiscountApproval(tx, { order, actor: params.actor, reason: params.reason });
  });
  return { ok: true };
}

/**
 * QLCS/SUPER_ADMIN từ chối giảm giá → REJECTED (reason bắt buộc).
 *
 * @deprecated Dùng `rejectOrder()` (lib/orders/approval.ts) — xem chú thích ở
 * `approveOrderDiscount`.
 */
export async function rejectOrderDiscount(params: {
  orderId: string;
  actor: DiscountApprovalActor;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    assertCan(
      { role: params.actor.role ?? null, roles: params.actor.roles ?? undefined },
      "discounts:approve",
    );
  } catch {
    return { ok: false, error: "Không có quyền duyệt giảm giá" };
  }
  if (!params.reason?.trim()) return { ok: false, error: "Lý do từ chối là bắt buộc" };

  const order = await db.order.findUnique({
    where: { id: params.orderId },
    select: { id: true, centerId: true, discountApprovalStatus: true },
  });
  if (!order) return { ok: false, error: "Không tìm thấy đơn" };
  if (order.discountApprovalStatus == null) {
    return { ok: false, error: "Đơn không có giảm giá cần duyệt" };
  }

  await db.$transaction(async (tx) => {
    await applyDiscountRejection(tx, { order, actor: params.actor, reason: params.reason });
  });
  return { ok: true };
}
