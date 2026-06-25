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
 */
export async function getLeadPaymentSummary(
  sdb: ReturnType<typeof scopedDb>,
  leadId: string,
): Promise<LeadPaymentSummary> {
  const [recorded, orders] = await Promise.all([
    sdb.payment.aggregate({
      where: { saleStatus: "RECORDED", order: { leadId } },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    sdb.order.aggregate({
      where: { leadId, deletedAt: null },
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
  ]);

  const paid = recorded._sum.amount ?? 0;
  const recordedCount = recorded._count._all;
  const total = orders._sum.totalAmount ?? 0;
  const hasOrder = orders._count._all > 0;
  const remaining = Math.max(0, total - paid);
  const scholarshipFull = hasOrder && total === 0;
  const eligible = recordedCount > 0 || scholarshipFull;

  return { paid, total, remaining, recordedCount, hasOrder, scholarshipFull, eligible };
}
