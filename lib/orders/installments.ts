import "server-only";
import { db } from "@/lib/db";

// =============================================================================
// Commit 4 — thanh toán TỐI ĐA 2 ĐỢT cho 1 Order.
//  - Đợt 1: số tiền đã thu + thời gian đóng (paidAt = lúc ghi nhận).
//  - Đợt 2: số tiền còn lại + ngày hẹn đóng (dueDate).
//  - Tổng 2 đợt = totalAmount của Order. Cập nhật Order.paidAt + status.
// =============================================================================

export async function getOrderInstallments(orderId: string) {
  return db.orderInstallment.findMany({
    where: { orderId },
    orderBy: { soDot: "asc" },
    select: { id: true, soDot: true, amount: true, status: true, dueDate: true, paidAt: true, lastReminderAt: true },
  });
}

/** Tính lại Order.paidAt/status từ tổng các đợt đã PAID. */
async function recomputeOrder(orderId: string): Promise<void> {
  const order = await db.order.findUnique({ where: { id: orderId }, select: { totalAmount: true } });
  if (!order) return;
  const paid = await db.orderInstallment.aggregate({
    where: { orderId, status: "PAID" },
    _sum: { amount: true },
    _max: { paidAt: true },
  });
  const paidTotal = paid._sum.amount ?? 0;
  await db.order.update({
    where: { id: orderId },
    data: {
      paidAt: paidTotal >= order.totalAmount ? paid._max.paidAt ?? new Date() : null,
      status: paidTotal >= order.totalAmount ? "CONFIRMED" : "PENDING_PAYMENT",
    },
  });
}

/**
 * Ghi/ghi đè kế hoạch 2 đợt. dot1Amount đã thu (PAID ngay), dot2 còn lại (PENDING,
 * dueDate hẹn). Nếu dot2Amount=0 → chỉ 1 đợt (đã đóng đủ).
 */
export async function recordInstallmentPlan(params: {
  orderId: string;
  dot1Amount: number;
  dot2Amount: number;
  dot2DueDate: Date | null;
  actorId: string | null;
  // R7-04 (QĐ-O7) — số ngày nhắc trước hạn đợt 2; null → cron dùng SystemSetting default 14.
  reminderDays?: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { orderId, dot1Amount, dot2Amount, dot2DueDate, actorId, reminderDays } = params;
  if (dot1Amount < 0 || dot2Amount < 0) return { ok: false, error: "Số tiền không hợp lệ" };

  const order = await db.order.findUnique({ where: { id: orderId }, select: { totalAmount: true } });
  if (!order) return { ok: false, error: "Không tìm thấy đơn" };
  if (dot1Amount + dot2Amount !== order.totalAmount) {
    return { ok: false, error: `Tổng 2 đợt phải bằng học phí (${order.totalAmount.toLocaleString("vi-VN")}đ)` };
  }
  if (dot2Amount > 0 && !dot2DueDate) return { ok: false, error: "Cần ngày hẹn đóng đợt 2" };

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.orderInstallment.deleteMany({ where: { orderId } });
    await tx.orderInstallment.create({
      data: { orderId, soDot: 1, amount: dot1Amount, status: dot1Amount > 0 ? "PAID" : "PENDING", paidAt: dot1Amount > 0 ? now : null, recordedById: actorId },
    });
    if (dot2Amount > 0) {
      await tx.orderInstallment.create({
        data: { orderId, soDot: 2, amount: dot2Amount, status: "PENDING", dueDate: dot2DueDate, recordedById: actorId, reminderDays: reminderDays ?? null },
      });
    }
  });
  await recomputeOrder(orderId);
  return { ok: true };
}

/** Đánh dấu 1 đợt đã đóng (đợt 2). */
export async function markInstallmentPaid(installmentId: string, actorId: string | null): Promise<{ ok: boolean; error?: string }> {
  const inst = await db.orderInstallment.findUnique({ where: { id: installmentId }, select: { id: true, orderId: true, status: true } });
  if (!inst) return { ok: false, error: "Không tìm thấy đợt" };
  if (inst.status === "PAID") return { ok: true };
  await db.orderInstallment.update({ where: { id: installmentId }, data: { status: "PAID", paidAt: new Date(), recordedById: actorId } });
  await recomputeOrder(inst.orderId);
  return { ok: true };
}
