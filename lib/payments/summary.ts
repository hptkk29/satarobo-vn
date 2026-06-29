// lib/payments/summary.ts — FL-R2 (E2-LEAD / item 2)
// Tóm tắt thanh toán của 1 lead cho trang chi tiết lead + trang chốt đơn:
// đã nộp / tổng phải thu / còn thiếu + điều kiện chốt (khớp guard convertLeadV2).
import { scopedDb } from "@/lib/db-scope";

export type LeadPaymentSummary = {
  /** Đã nộp = Σ Payment.amount (saleStatus=RECORDED) trên các đơn của lead. */
  paid: number;
  /** Tổng phải thu = Σ Order.totalAmount (chưa xoá) của lead. */
  total: number;
  /** Còn thiếu = max(0, total - paid). */
  remaining: number;
  /** Số khoản Sale đã ghi nhận. */
  recordedCount: number;
  /** Lead đã có ≥1 đơn hàng (để phân biệt "chưa có đơn" với "miễn phí"). */
  hasOrder: boolean;
  /** Học bổng toàn phần = có đơn nhưng tổng phải thu = 0. */
  scholarshipFull: boolean;
  /** Đủ điều kiện chốt ghi danh (guard: có khoản ghi nhận HOẶC miễn phí toàn phần). */
  eligible: boolean;
};

/**
 * Đọc tóm tắt thanh toán qua scopedDb (cách ly cơ sở). KHÔNG coi "lead chưa có đơn"
 * là miễn phí — `scholarshipFull` chỉ true khi đã có đơn mà tổng = 0.
 *
 * S2 — cách ly đi qua quan hệ ĐƠN (Order là SCOPED_MODEL) thay vì scope thẳng trên
 * Payment.centerId. Lý do: Payment.centerId có thể null (đơn thủ công không gắn cơ sở)
 * → nếu scope thẳng trên Payment, non-SUPER_ADMIN sẽ MẤT khoản hợp lệ (card hiển thị 0
 * dù guard convert đếm được — lệch nhau, gốc rễ "bonus null-center"). Đếm Payment NESTED
 * dưới Order đã-trong-scope ⇒ bao gồm cả khoản centerId=null thuộc đơn của lead, và vẫn
 * cách ly cơ sở vì Order top-level đã bị inject `centerId IN visibleCenters`.
 */
export async function getLeadPaymentSummary(
  sdb: ReturnType<typeof scopedDb>,
  leadId: string,
): Promise<LeadPaymentSummary> {
  const orders = await sdb.order.findMany({
    where: { leadId, deletedAt: null },
    select: {
      totalAmount: true,
      payments: {
        where: { saleStatus: "RECORDED", deletedAt: null },
        select: { amount: true },
      },
    },
  });

  let total = 0;
  let paid = 0;
  let recordedCount = 0;
  for (const o of orders) {
    total += o.totalAmount;
    for (const p of o.payments) {
      paid += p.amount;
      recordedCount += 1;
    }
  }

  const hasOrder = orders.length > 0;
  const remaining = Math.max(0, total - paid);
  const scholarshipFull = hasOrder && total === 0;
  const eligible = recordedCount > 0 || scholarshipFull;

  return { paid, total, remaining, recordedCount, hasOrder, scholarshipFull, eligible };
}
