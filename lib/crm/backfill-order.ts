// lib/crm/backfill-order.ts — tạo Order + Payment RECORDED cho khoản khách đã đóng
// TRƯỚC khi có hệ thống (nhập liệu ban đầu). Chạy TRONG transaction của convert
// (convertLeadV2) — convert fail là order/payment rollback theo, KHÔNG để lại
// "khoản tiền ma" CONFIRMED/RECORDED treo ngoài ghi danh (finding review 02/08).
// Race 2 lượt chốt song song cũng tự giải: atomic-claim của convert chỉ cho 1
// transaction sống sót, transaction thua rollback cả phần tiền tạo ở đây.
import type { Prisma } from "@prisma/client";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { generateOrderCode } from "@/lib/orders/code";

type Tx = Prisma.TransactionClient;

export const BACKFILL_PAYMENT_MARKER = "[backfill-import]";

export type BackfillPaymentInput = {
  amount: number;
  paidDate: Date;
  note?: string | null;
  items: Array<{ itemName: string; unitPrice: number }>;
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

  const totalAmount = paid.items.reduce((s, it) => s + Math.max(0, Math.round(it.unitPrice)), 0);
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
      subtotal: totalAmount,
      totalAmount,
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
