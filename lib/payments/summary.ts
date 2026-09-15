// lib/payments/summary.ts — FL-R2 (E2-LEAD / item 2)
// Tóm tắt thanh toán của 1 lead cho trang chi tiết lead + trang chốt đơn:
// đã nộp / tổng phải thu / còn thiếu + điều kiện chốt (khớp guard convertLeadV2).
import { scopedDb } from "@/lib/db-scope";
import { KHOAN_DA_GHI_NHAN } from "@/lib/finance/ghi-nhan";

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
  /**
   * ĐƠN CỦA LEAD, để trang lead bấm SANG được (15/09/2026).
   *
   * Chủ dự án: *"khi khách hàng đến để đóng đợt 2 thì sale vào lead đó rồi bấm sang
   * hoá đơn để cung cấp mã QR đóng đợt 2 cho KH."* Trước bản này card thanh toán của
   * lead BIẾT là đã có đơn (`hasOrder`) nhưng không có đường nào tới đơn đó — sale
   * phải sang danh sách đơn rồi tự tìm theo tên.
   */
  donHang: Array<{
    id: string;
    code: string;
    totalAmount: number;
    /** Σ `Payment` (trục B) của ĐÚNG đơn này. */
    daThu: number;
    conThieu: number;
    /**
     * Đợt CHƯA thu xong gần nhất — để nút nói đúng việc sale sắp làm
     * ("Đóng đợt 2 · 3.000.000đ") thay vì một chữ "Xem đơn" vô nghĩa.
     *
     * ⚠️ Đọc `PaymentRequest.status` chứ KHÔNG tự cộng lại allocation:
     * `recomputeRequestStatuses` là nơi duy nhất quyết định PENDING/PARTIAL/PAID, và
     * dựng phép tính thứ hai ở đây là đẻ ra một con số thứ hai để lệch.
     */
    dotKeTiep: { soDot: number; conThieu: number } | null;
  }>;
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
      id: true,
      code: true,
      totalAmount: true,
      payments: {
        where: KHOAN_DA_GHI_NHAN,
        select: { amount: true },
      },
      // Phiếu thu THEO ĐỢT còn nợ, đợt nhỏ nhất trước — đợt sale sắp thu.
      // `installmentNo > 0` loại phiếu "thu toàn đơn" (số 0): nó không phải một đợt.
      paymentRequests: {
        where: { installmentNo: { gt: 0 }, status: { in: ["PENDING", "PARTIAL"] } },
        select: { installmentNo: true, amountDue: true, allocations: { select: { amount: true } } },
        orderBy: { installmentNo: "asc" },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
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

  const donHang = orders.map((o) => {
    const daThu = o.payments.reduce((s, x) => s + x.amount, 0);
    const pr = o.paymentRequests[0];
    const daRot = pr ? pr.allocations.reduce((s, a) => s + a.amount, 0) : 0;
    return {
      id: o.id,
      code: o.code,
      totalAmount: o.totalAmount,
      daThu,
      conThieu: Math.max(0, o.totalAmount - daThu),
      dotKeTiep: pr
        ? { soDot: pr.installmentNo, conThieu: Math.max(0, pr.amountDue - daRot) }
        : null,
    };
  });

  return {
    paid,
    total,
    remaining,
    recordedCount,
    hasOrder,
    scholarshipFull,
    eligible,
    donHang,
  };
}
