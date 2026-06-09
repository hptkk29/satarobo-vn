// lib/finance/debt.ts — R2-06 công nợ + R2-03 confirm payment (Doc 15 §4.9).
import type { Order } from "@prisma/client";
import { db } from "@/lib/db";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";

/** Công nợ = tổng hoá đơn − đã trả (không âm). THUẦN (C6.1). */
export function computeDebt(totalAmount: number, paidAmount: number): number {
  return Math.max(0, totalAmount - paidAmount);
}

/** Đã trả của 1 order (CONFIRMED/COMPLETED = trả đủ; còn lại = 0). THUẦN. */
export function paidOf(order: Pick<Order, "status" | "totalAmount">): number {
  return order.status === "CONFIRMED" || order.status === "COMPLETED" ? order.totalAmount : 0;
}

export class PaymentError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PaymentError";
    this.code = code;
  }
}

/** C3.3/C3.4 — kế toán xác nhận thanh toán. Idempotent: gọi 2 lần → 1 kết quả. */
export async function confirmOrderPayment(
  actor: AuditActor,
  orderId: string,
  reason?: string,
): Promise<{ order: Order; alreadyConfirmed: boolean }> {
  const order = await db.order.findUnique({ where: { id: orderId } });
  if (!order) throw new PaymentError("ORDER_NOT_FOUND", "Không tìm thấy hoá đơn.");
  if (order.status === "CONFIRMED" || order.status === "COMPLETED") {
    return { order, alreadyConfirmed: true }; // idempotent
  }
  const updated = await db.order.update({
    where: { id: orderId },
    data: { status: "CONFIRMED", paidAt: new Date() },
  });
  await writeAudit({
    actor, module: "finance", entityType: "Order", entityId: order.id, action: "STATUS_CHANGE",
    oldValues: { status: order.status }, newValues: { status: "CONFIRMED" }, reason, orgUnitId: order.centerId,
  });
  return { order: updated, alreadyConfirmed: false };
}

/** Order quá hạn chưa thanh toán (cho cron nhắc nợ C6.2). */
export async function getOverdueOrders(opts: { olderThanDays?: number; now?: Date } = {}): Promise<Order[]> {
  const now = opts.now ?? new Date();
  const cutoff = new Date(now.getTime() - (opts.olderThanDays ?? 7) * 86_400_000);
  return db.order.findMany({
    where: { status: "PENDING_PAYMENT", createdAt: { lt: cutoff } },
    orderBy: { createdAt: "asc" },
  });
}
