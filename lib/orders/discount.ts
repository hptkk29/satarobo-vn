import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/audit/audit-log";

// =============================================================================
// BGĐ 31/07 — GIẢM GIÁ nhập tay: giá gốc → giảm (% hoặc số tiền) → tổng →
// giải trình → Quản lý cơ sở duyệt → mới được xác nhận đơn.
//
// Voucher (chính sách đã duyệt sẵn) KHÔNG đi luồng này — chỉ giảm giá do nhân
// viên tự nhập mới cần giải trình + duyệt.
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

/** THUẦN — đơn có cần duyệt giảm giá không (giảm tay > 0 và KHÔNG do voucher). */
export function needsDiscountApproval(input: {
  discountAmount: number;
  voucherCode?: string | null;
}): boolean {
  return input.discountAmount > 0 && !input.voucherCode?.trim();
}

export type DiscountApprovalActor = {
  id: string;
  name: string;
  role?: Role | string | null;
  roles?: (Role | string)[] | null;
};

/** QLCS/SUPER_ADMIN duyệt giảm giá → APPROVED (đơn được phép xác nhận). */
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
    await tx.order.update({
      where: { id: order.id },
      data: {
        discountApprovalStatus: "APPROVED",
        discountApprovedById: params.actor.id,
        discountApprovedAt: new Date(),
        discountRejectReason: null,
      },
    });
    await writeAudit({
      actor: { id: params.actor.id, name: params.actor.name },
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
  });
  return { ok: true };
}

/** QLCS/SUPER_ADMIN từ chối giảm giá → REJECTED (reason bắt buộc). */
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
    await tx.order.update({
      where: { id: order.id },
      data: {
        discountApprovalStatus: "REJECTED",
        discountApprovedById: params.actor.id,
        discountApprovedAt: new Date(),
        discountRejectReason: params.reason.trim(),
      },
    });
    await writeAudit({
      actor: { id: params.actor.id, name: params.actor.name },
      module: "finance",
      entityType: "Order",
      entityId: order.id,
      action: "DISCOUNT_REJECTED",
      oldValues: { discountApprovalStatus: order.discountApprovalStatus },
      newValues: { discountApprovalStatus: "REJECTED" },
      reason: params.reason.trim(),
      orgUnitId: order.centerId,
      tx,
    });
  });
  return { ok: true };
}
