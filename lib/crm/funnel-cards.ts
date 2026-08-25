// lib/crm/funnel-cards.ts — V-02 (25/08/2026): HỢP ĐỒNG HIỂN THỊ của bảng số Funnel Marketing.
//
// Vì sao là một module riêng chứ không phải mấy dòng trong `page.tsx`: `lib/crm/funnel-query.ts`
// tự đặt ra một hợp đồng ("chỗ hiển thị PHẢI đọc `spendAvailable` để ẩn thẻ Chi phí QC/CPL/
// CPA/ROAS thay vì in số 0") nhưng KHÔNG có chỗ nào thi hành, và không test nào phủ được vế
// "chỗ hiển thị" vì nó nằm trong một Server Component. Tách ra đây thì hợp đồng có một chỗ
// duy nhất để ghim và một chỗ duy nhất để đọc.
//
// ⚠️ `spendAvailable = false` KHÔNG phải "0 đồng" mà là "KHÔNG ĐO ĐƯỢC ở phạm vi này":
// `AdsInsightDaily` không có cột `centerId` (prisma/schema.prisma) nên với actor cấp cơ sở
// truy vấn chi phí bị BỎ HẲN. In "0" ở 4 ô đó đọc như "tháng này không tốn đồng quảng cáo
// nào và lead về miễn phí" — sai theo chiều còn nguy hiểm hơn con số rò rỉ trước đây.
// `computeFunnelMetrics` chia-0 an toàn (`lib/crm/marketing-metrics.ts`) nên KHÔNG có lỗi,
// không log, không dấu hiệu nào cho người đọc biết là số không đo được.
import type { FunnelCounts, FunnelMetrics } from "@/lib/crm/marketing-metrics";

/** Ô không đo được. Dùng dấu gạch ngang — KHÔNG bao giờ dùng "0". */
export const KHONG_DO_DUOC = "—";

export type FunnelCard = {
  label: string;
  value: string;
  /** true = ô đang ở trạng thái "không đo được" (UI làm nhạt + có chú thích). */
  khongDoDuoc?: boolean;
};

/** Đầu vào tối thiểu — cùng hình dạng `ScopedFunnelCounts` nhưng KHÔNG kéo theo `@/lib/db`. */
export type FunnelCardInput = FunnelCounts & { spendAvailable: boolean };

const vnd = (n: number) => Math.round(n).toLocaleString("vi-VN");
const soLuong = (n: number) => n.toLocaleString("vi-VN");

/**
 * Dựng 9 thẻ của trang /admin/marketing/funnel.
 *
 * L1/L2/L3 + CR luôn hiển thị: chúng lấy từ `Lead`/`MessengerConversation` vốn ĐÃ được lọc
 * theo cơ sở, nên đúng ở mọi phạm vi. 4 ô còn lại phụ thuộc `spend`, nên phụ thuộc
 * `spendAvailable`.
 */
export function buildFunnelCards(counts: FunnelCardInput, m: FunnelMetrics): FunnelCard[] {
  const doDuoc = counts.spendAvailable;
  const tien = (n: number): FunnelCard["value"] => (doDuoc ? vnd(n) : KHONG_DO_DUOC);

  return [
    { label: "L1 (hội thoại)", value: soLuong(counts.l1) },
    { label: "L2 (đạt SĐT)", value: soLuong(counts.l2) },
    { label: "L3 (chốt)", value: soLuong(counts.l3) },
    { label: "CR L1→L2", value: `${(m.crL1L2 * 100).toFixed(1)}%` },
    { label: "CR L2→L3", value: `${(m.crL2L3 * 100).toFixed(1)}%` },
    { label: "Chi phí QC", value: tien(counts.spend), khongDoDuoc: !doDuoc },
    { label: "CPL", value: tien(m.cpl), khongDoDuoc: !doDuoc },
    { label: "CPA", value: tien(m.cpa), khongDoDuoc: !doDuoc },
    {
      label: "ROAS",
      value: doDuoc ? m.roas.toFixed(2) : KHONG_DO_DUOC,
      khongDoDuoc: !doDuoc,
    },
  ];
}
