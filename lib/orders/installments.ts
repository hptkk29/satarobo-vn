import "server-only";
import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import { assertCan } from "@/lib/auth/permissions";
import { writeAudit } from "@/lib/audit/audit-log";
import { ensureOrderPaymentRecorded, confirmPayment } from "@/lib/finance/payment";
import { formatVndPlain } from "@/lib/format/money";

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

  const order = await db.order.findUnique({
    where: { id: orderId },
    select: { totalAmount: true, centerId: true, leadId: true, installmentApprovalStatus: true },
  });
  if (!order) return { ok: false, error: "Không tìm thấy đơn" };
  if (dot1Amount + dot2Amount !== order.totalAmount) {
    return { ok: false, error: `Tổng 2 đợt phải bằng học phí (${formatVndPlain(order.totalAmount, false)})` };
  }
  if (dot2Amount > 0 && !dot2DueDate) return { ok: false, error: "Cần ngày hẹn đóng đợt 2" };

  const now = new Date();
  await db.$transaction(async (tx) => {
    await tx.orderInstallment.deleteMany({ where: { orderId } });
    // S1-fix (double-write) — kế hoạch 2 đợt là NGUỒN SỰ THẬT về tiền của đơn:
    // xoá mềm MỌI Payment auto cũ ([auto:order-confirm] khi đơn đã xác nhận tổng,
    // và [auto:order-installment:dotN] của lần lưu trước) TRƯỚC khi dựng lại. Nếu không:
    //  (a) đơn CONFIRMED trước rồi mới lưu kế hoạch → confirm(full) + đợt1 = cộng đôi "đã nộp";
    //  (b) sửa lại số tiền đợt 1 → marker cũ khiến ensureOrderPaymentRecorded no-op, lệch số.
    // Chỉ set deletedAt (không DELETE) nên không vướng FK Receipt (Restrict); khoản auto vốn
    // chưa gắn enrollment nên không có Receipt.
    await tx.payment.updateMany({
      where: { orderId, deletedAt: null, note: { contains: "[auto:" } },
      data: { deletedAt: now },
    });
    await tx.orderInstallment.create({
      data: { orderId, soDot: 1, amount: dot1Amount, status: dot1Amount > 0 ? "PAID" : "PENDING", paidAt: dot1Amount > 0 ? now : null, recordedById: actorId },
    });
    if (dot2Amount > 0) {
      await tx.orderInstallment.create({
        data: { orderId, soDot: 2, amount: dot2Amount, status: "PENDING", dueDate: dot2DueDate, recordedById: actorId, reminderDays: reminderDays ?? null },
      });
      // C4 — kế hoạch 2 đợt cần CENTER_MANAGER duyệt; mặc định PENDING_APPROVAL (chỉ set khi chưa có).
      if (order.installmentApprovalStatus == null) {
        await tx.order.update({
          where: { id: orderId },
          data: { installmentApprovalStatus: "PENDING_APPROVAL", installmentRequestedById: actorId },
        });
      }
    }
    // S1 — đợt 1 (đã thu) ghi Payment(RECORDED) idempotent → Ledger-A khớp Ledger-B.
    if (dot1Amount > 0) {
      await ensureOrderPaymentRecorded(tx, {
        orderId,
        soDot: 1,
        amount: dot1Amount,
        leadId: order.leadId,
        centerId: order.centerId,
        actor: { id: actorId },
      });
    }
  });
  await recomputeOrder(orderId);
  return { ok: true };
}

/** Đánh dấu 1 đợt đã đóng (đợt 2). */
export async function markInstallmentPaid(installmentId: string, actorId: string | null): Promise<{ ok: boolean; error?: string }> {
  const inst = await db.orderInstallment.findUnique({
    where: { id: installmentId },
    select: { id: true, orderId: true, status: true, soDot: true, amount: true },
  });
  if (!inst) return { ok: false, error: "Không tìm thấy đợt" };
  if (inst.status === "PAID") return { ok: true };

  const order = await db.order.findUnique({
    where: { id: inst.orderId },
    select: { centerId: true, leadId: true, installmentApprovalStatus: true },
  });

  let autoPaymentId: string | null = null;
  await db.$transaction(async (tx) => {
    await tx.orderInstallment.update({ where: { id: installmentId }, data: { status: "PAID", paidAt: new Date(), recordedById: actorId } });
    // C4 — đợt 2 chỉ ghi Payment khi kế hoạch ĐÃ DUYỆT (APPROVED) hoặc không cần duyệt (null).
    // PENDING_APPROVAL / REJECTED → đánh dấu PAID ở Ledger-B nhưng CHƯA tính tiền (Ledger-A).
    const approvalOk =
      order?.installmentApprovalStatus == null || order.installmentApprovalStatus === "APPROVED";
    if (approvalOk) {
      const rec = await ensureOrderPaymentRecorded(tx, {
        orderId: inst.orderId,
        soDot: inst.soDot,
        amount: inst.amount,
        leadId: order?.leadId ?? null,
        centerId: order?.centerId ?? null,
        actor: { id: actorId },
      });
      if (rec.ok) autoPaymentId = rec.paymentId;
    }
  });
  await recomputeOrder(inst.orderId);
  // "Hợp nhất" (chốt: mark-PAID → Payment CONFIRMED): người bấm "đã đóng" có quyền
  // orders:manage (kế toán) nên XÁC NHẬN LUÔN khoản vừa ghi qua confirmPayment chuẩn
  // (CONFIRMED + Receipt + audit + event; idempotent). → công nợ theo Payment CONFIRMED
  // giảm ngay, khớp trạng thái đợt (hết "đã đóng nhưng chưa trừ nợ"). Best-effort: confirm
  // lỗi thì khoản vẫn PENDING để kế toán duyệt tay, KHÔNG rollback trạng thái đợt.
  // ⚠️ Nợ THEO GHI DANH (getDebtRows) không đổi ở đây: khoản auto gắn orderId, KHÔNG
  // enrollmentId, và Order chưa link Enrollment — reconcile tầng ghi danh cần ticket riêng.
  if (autoPaymentId && actorId) {
    await confirmPayment({ paymentId: autoPaymentId, confirmedById: actorId });
  }
  return { ok: true };
}

// =============================================================================
// C4 / S5 — Duyệt kế hoạch trả góp 2 đợt (CENTER_MANAGER + SUPER_ADMIN).
// requestInstallmentApproval: sale yêu cầu duyệt (set PENDING_APPROVAL).
// approveInstallmentPlan / rejectInstallmentPlan: assertCan('installments:approve') + audit
// (reject bắt buộc reason). Khi APPROVED, nếu đợt2 đã PAID (Ledger-B) → ghi bù Payment.
// =============================================================================

/** Actor cho luồng duyệt: id+name (audit) + role/roles (assertCan). */
export type InstallmentApprovalActor = {
  id: string;
  name: string;
  role?: Role | string | null;
  roles?: (Role | string)[] | null;
};

/** Sale yêu cầu duyệt kế hoạch 2 đợt → PENDING_APPROVAL (reset cờ duyệt/từ chối cũ). */
export async function requestInstallmentApproval(params: {
  orderId: string;
  actor: InstallmentApprovalActor;
}): Promise<{ ok: boolean; error?: string }> {
  const order = await db.order.findUnique({
    where: { id: params.orderId },
    select: { id: true, centerId: true },
  });
  if (!order) return { ok: false, error: "Không tìm thấy đơn" };

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        installmentApprovalStatus: "PENDING_APPROVAL",
        installmentRequestedById: params.actor.id,
        installmentApprovedById: null,
        installmentApprovedAt: null,
        installmentRejectReason: null,
      },
    });
    await writeAudit({
      actor: { id: params.actor.id, name: params.actor.name },
      module: "finance",
      entityType: "Order",
      entityId: order.id,
      action: "INSTALLMENT_APPROVAL_REQUEST",
      newValues: { installmentApprovalStatus: "PENDING_APPROVAL" },
      orgUnitId: order.centerId,
      tx,
    });
  });
  return { ok: true };
}

/** CENTER_MANAGER/SUPER_ADMIN duyệt kế hoạch 2 đợt → APPROVED + ghi bù Payment đợt2 nếu đã PAID. */
export async function approveInstallmentPlan(params: {
  orderId: string;
  actor: InstallmentApprovalActor;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    assertCan({ role: params.actor.role ?? null, roles: params.actor.roles ?? undefined }, "installments:approve");
  } catch {
    return { ok: false, error: "Không có quyền duyệt kế hoạch trả góp" };
  }
  const order = await db.order.findUnique({
    where: { id: params.orderId },
    select: { id: true, centerId: true, leadId: true, installmentApprovalStatus: true },
  });
  if (!order) return { ok: false, error: "Không tìm thấy đơn" };
  if (order.installmentApprovalStatus == null) {
    return { ok: false, error: "Đơn không có kế hoạch trả góp cần duyệt" };
  }

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        installmentApprovalStatus: "APPROVED",
        installmentApprovedById: params.actor.id,
        installmentApprovedAt: new Date(),
        installmentRejectReason: null,
      },
    });
    await writeAudit({
      actor: { id: params.actor.id, name: params.actor.name },
      module: "finance",
      entityType: "Order",
      entityId: order.id,
      action: "INSTALLMENT_APPROVED",
      oldValues: { installmentApprovalStatus: order.installmentApprovalStatus },
      newValues: { installmentApprovalStatus: "APPROVED" },
      reason: params.reason?.trim() || undefined,
      orgUnitId: order.centerId,
      tx,
    });
    // Đợt2 đã PAID (Ledger-B) nhưng bị gate trước đó → ghi bù Payment(RECORDED).
    const dot2 = await tx.orderInstallment.findFirst({
      where: { orderId: order.id, soDot: 2, status: "PAID" },
      select: { soDot: true, amount: true },
    });
    if (dot2) {
      await ensureOrderPaymentRecorded(tx, {
        orderId: order.id,
        soDot: dot2.soDot,
        amount: dot2.amount,
        leadId: order.leadId,
        centerId: order.centerId,
        actor: { id: params.actor.id, name: params.actor.name },
      });
    }
  });
  return { ok: true };
}

/** CENTER_MANAGER/SUPER_ADMIN từ chối kế hoạch 2 đợt → REJECTED (reason bắt buộc). */
export async function rejectInstallmentPlan(params: {
  orderId: string;
  actor: InstallmentApprovalActor;
  reason: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    assertCan({ role: params.actor.role ?? null, roles: params.actor.roles ?? undefined }, "installments:approve");
  } catch {
    return { ok: false, error: "Không có quyền duyệt kế hoạch trả góp" };
  }
  if (!params.reason?.trim()) return { ok: false, error: "Lý do từ chối là bắt buộc" };

  const order = await db.order.findUnique({
    where: { id: params.orderId },
    select: { id: true, centerId: true, installmentApprovalStatus: true },
  });
  if (!order) return { ok: false, error: "Không tìm thấy đơn" };
  if (order.installmentApprovalStatus == null) {
    return { ok: false, error: "Đơn không có kế hoạch trả góp cần duyệt" };
  }

  await db.$transaction(async (tx) => {
    await tx.order.update({
      where: { id: order.id },
      data: {
        installmentApprovalStatus: "REJECTED",
        installmentApprovedById: params.actor.id,
        installmentApprovedAt: new Date(),
        installmentRejectReason: params.reason.trim(),
      },
    });
    await writeAudit({
      actor: { id: params.actor.id, name: params.actor.name },
      module: "finance",
      entityType: "Order",
      entityId: order.id,
      action: "INSTALLMENT_REJECTED",
      oldValues: { installmentApprovalStatus: order.installmentApprovalStatus },
      newValues: { installmentApprovalStatus: "REJECTED" },
      reason: params.reason.trim(),
      orgUnitId: order.centerId,
      tx,
    });
  });
  return { ok: true };
}
