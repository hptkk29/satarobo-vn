import Link from "next/link";
import type { LeadPaymentSummary } from "@/lib/payments/summary";

const fmt = (n: number) => `${n.toLocaleString("vi-VN")}đ`;

/**
 * Khối thanh toán của lead (đã nộp / tổng phải thu / còn thiếu) + điều kiện chốt.
 * Ngôn ngữ nghiệp vụ — KHÔNG hiện mã kỹ thuật (PAYMENT_REQUIRED/REGISTERED/R7-04).
 */
export function LeadPaymentCard({
  leadId,
  summary,
}: {
  leadId: string;
  summary: LeadPaymentSummary;
}) {
  const { paid, total, remaining, hasOrder, scholarshipFull, eligible } = summary;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-700">Thanh toán</h2>

      <div className="mt-2 grid grid-cols-3 gap-3 text-sm">
        <div>
          <div className="text-gray-500">Đã nộp</div>
          <div className="font-semibold text-emerald-700">{fmt(paid)}</div>
        </div>
        <div>
          <div className="text-gray-500">Tổng phải thu</div>
          <div className="font-semibold text-gray-900">
            {hasOrder ? fmt(total) : <span className="text-gray-400">Chưa có đơn hàng</span>}
          </div>
        </div>
        <div>
          <div className="text-gray-500">Còn thiếu</div>
          <div className="font-semibold text-amber-700">{hasOrder ? fmt(remaining) : "—"}</div>
        </div>
      </div>

      <div className="mt-3">
        {eligible ? (
          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
            ✓ Đủ điều kiện chốt{scholarshipFull ? " (miễn phí / học bổng toàn phần)" : ""}
          </span>
        ) : (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
            Chưa đủ điều kiện chốt — cần ghi nhận thanh toán trước
          </span>
        )}
      </div>

      <Link
        href={`/orders/new?leadId=${leadId}`}
        className="mt-3 inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
      >
        + Tạo đơn hàng cho lead này
      </Link>
    </div>
  );
}
