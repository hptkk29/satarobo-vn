// lib/crm/backfill-order.ts — tạo Order + Payment RECORDED cho khoản khách đã đóng
// TRƯỚC khi có hệ thống (nhập liệu ban đầu). Chạy TRONG transaction của convert
// (convertLeadV2) — convert fail là order/payment rollback theo, KHÔNG để lại
// "khoản tiền ma" CONFIRMED/RECORDED treo ngoài ghi danh (finding review 02/08).
// Race 2 lượt chốt song song cũng tự giải: atomic-claim của convert chỉ cho 1
// transaction sống sót, transaction thua rollback cả phần tiền tạo ở đây.
import type { Prisma } from "@prisma/client";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { materializeInstallmentRequests } from "@/lib/payments/payment-request";
import { generateOrderCode } from "@/lib/orders/code";

type Tx = Prisma.TransactionClient;

export const BACKFILL_PAYMENT_MARKER = "[backfill-import]";

export type BackfillPaymentInput = {
  amount: number;
  paidDate: Date;
  note?: string | null;
  items: Array<{ itemName: string; unitPrice: number }>;
  /**
   * 04/08 — khoản GIẢM nhập ở màn xem thử import (theo số tiền hoặc theo %),
   * đã quy ra SỐ TIỀN. Đơn ghi `subtotal` = giá niêm yết, `discountAmount` = khoản
   * giảm, `totalAmount` = phần khách thực phải nộp. Thiếu chỗ này thì công nợ của
   * mọi ca có khuyến mãi đều dôi ra đúng bằng khoản giảm.
   */
  discountAmount?: number;
  /** Bắt buộc khi có giảm giá — cùng luật với màn tạo đơn tay. */
  discountReason?: string | null;
  /**
   * 04/08 — khách trả LÀM 2 ĐỢT: hạn đóng đợt 2 (người nhập gõ ở màn xem thử import).
   * Có hạn + còn nợ ⇒ dựng luôn kế hoạch 2 đợt để đơn có phiếu thu + QR đợt 2 ngay,
   * khỏi phải mở lại từng đơn lập kế hoạch bằng tay.
   */
  dueDate2?: Date | null;
};

/**
 * Idempotent theo marker trong Payment.note (per lead): đã có khoản backfill →
 * không tạo lại. Order tạo thẳng CONFIRMED (tiền đã về từ trước, không cần vòng
 * xác nhận; không đi changeOrderStatusAction nên không kích side-effect provision
 * — convert ngay sau đó mới là chỗ tạo tài khoản phụ huynh).
 */
export async function createBackfillOrderPaymentInTx(
  tx: Tx,
  params: {
    actor: AuditActor;
    lead: { id: string; centerId: string | null; parentName: string; phone: string; email: string | null };
    paid: BackfillPaymentInput;
  },
): Promise<{ created: boolean; paymentId: string | null }> {
  const { actor, lead, paid } = params;

  const existing = await tx.payment.findFirst({
    where: { deletedAt: null, note: { contains: BACKFILL_PAYMENT_MARKER }, order: { leadId: lead.id } },
    select: { id: true },
  });
  if (existing) return { created: false, paymentId: existing.id };

  const subtotal = paid.items.reduce((s, it) => s + Math.max(0, Math.round(it.unitPrice)), 0);
  // Giảm không được vượt giá niêm yết (đơn âm) và không âm.
  const discountAmount = Math.min(Math.max(0, Math.round(paid.discountAmount ?? 0)), subtotal);
  const totalAmount = subtotal - discountAmount;
  const amount = Math.round(paid.amount);
  if (!Number.isFinite(amount) || amount <= 0) return { created: false, paymentId: null };

  const order = await tx.order.create({
    data: {
      code: await generateOrderCode(tx),
      type: "COURSE",
      status: "CONFIRMED",
      customerName: lead.parentName,
      customerPhone: lead.phone,
      customerEmail: lead.email,
      leadId: lead.id,
      centerId: lead.centerId,
      // Người tạo đơn = người nhập khoản tiền đã thu (cột danh sách /admin/orders).
      createdById: actor.id ?? null,
      subtotal,
      discountAmount,
      totalAmount,
      ...(discountAmount > 0
        ? {
            discountReason: paid.discountReason ?? null,
            // Backfill = tiền đã thu từ trước, giảm giá đã được duyệt ngoài hệ thống
            // ⇒ đánh dấu ĐÃ DUYỆT để đơn không kẹt ở "chờ duyệt giảm giá".
            discountApprovalStatus: "APPROVED" as const,
            discountApprovedById: actor.id,
            discountApprovedAt: paid.paidDate,
          }
        : {}),
      paidAt: paid.paidDate,
      confirmedByUserId: actor.id,
      confirmedAt: paid.paidDate,
      items: {
        create: paid.items.map((it) => ({
          type: "COURSE_ENROLLMENT" as const,
          itemName: it.itemName,
          quantity: 1,
          unitPrice: Math.max(0, Math.round(it.unitPrice)),
          totalPrice: Math.max(0, Math.round(it.unitPrice)),
        })),
      },
    },
    select: { id: true, code: true },
  });

  const payment = await tx.payment.create({
    data: {
      orderId: order.id,
      amount,
      method: "backfill",
      paidDate: paid.paidDate,
      note: `Nhập liệu ban đầu — khoản đã thu trước khi lên hệ thống${
        paid.note?.trim() ? ` (${paid.note.trim()})` : ""
      } ${BACKFILL_PAYMENT_MARKER}`,
      saleStatus: "RECORDED",
      accountantStatus: "PENDING",
      recordedById: actor.id,
      centerId: lead.centerId,
    },
    select: { id: true },
  });

  // ── Kế hoạch 2 đợt (khi người nhập tick "Đóng 2 đợt" + đặt hạn ở màn xem thử) ──
  const remaining = totalAmount - amount;
  if (paid.dueDate2 && remaining > 0) {
    await tx.orderInstallment.createMany({
      data: [
        { orderId: order.id, soDot: 1, amount, status: "PAID", paidAt: paid.paidDate, recordedById: actor.id },
        { orderId: order.id, soDot: 2, amount: remaining, status: "PENDING", dueDate: paid.dueDate2, recordedById: actor.id },
      ],
    });
    // Backfill = kế hoạch đã thoả thuận với khách từ trước ⇒ ĐÃ DUYỆT luôn, không
    // bắt quản lý duyệt lại một việc đã xảy ra rồi.
    await tx.order.update({
      where: { id: order.id },
      data: {
        installmentApprovalStatus: "APPROVED",
        installmentRequestedById: actor.id,
        installmentApprovedById: actor.id,
        installmentApprovedAt: paid.paidDate,
        // Còn nợ thì đơn CHƯA đóng đủ — đừng để paidAt làm mọi màn tưởng đã thu xong.
        paidAt: null,
        status: "PENDING_PAYMENT",
      },
    });

    await materializeInstallmentRequests(tx, order.id, actor);

    // ⚠️ Phiếu thu đợt 1 phải HUỶ. Tiền đợt 1 đã vào từ trước khi lên hệ thống nên
    // nó nằm ở sổ CŨ (Payment), không có PaymentAllocation ở sổ mới ⇒ phiếu đợt 1
    // sẽ đứng "chờ thu". Để nguyên là sale xuất QR đòi lại đúng khoản khách đã đóng.
    await tx.paymentRequest.updateMany({
      where: { orderId: order.id, installmentNo: 1 },
      data: { status: "VOID" },
    });
  }

  await writeAudit({
    actor,
    module: "finance",
    entityType: "Payment",
    entityId: payment.id,
    action: "CREATE",
    newValues: {
      amount,
      saleStatus: "RECORDED",
      source: "bulk-convert-backfill",
      orderCode: order.code,
      paidDate: paid.paidDate.toISOString(),
    },
    orgUnitId: lead.centerId,
    tx,
  });

  return { created: true, paymentId: payment.id };
}
