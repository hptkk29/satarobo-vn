// §C.6.0 — NGUỒN SỰ THẬT DUY NHẤT cho định nghĩa "đã chốt" của phễu lead.
// Dùng cho tab C (C1–C4), bảng C-03/C-05 và D2/D3. Hàm THUẦN, không chạm DB.
//
// 🔴 KHÔNG tái dùng `CONVERTED_STATUSES` (`lib/reports/lead.ts`): tập đó là
// {ENROLLED, REGISTERED} ở CẤP LEAD (phụ huynh) — khác đơn vị đếm (con vs phụ huynh)
// VÀ khác nghĩa (REGISTERED = đã trả tiền, chưa thành học viên). Trộn hai thứ là đúng
// cái bệnh §C.2.3 mô tả: mỗi màn đếm một kiểu, không màn nào sai rõ ràng để ai đó sửa.
//
// ⚠️ Vì sao "đã chốt" đòi CẢ HAI vế (`status = ENROLLED` **và** `closedAt != null`):
// C3 (tỷ lệ) và C4 (thời gian chốt trung bình) phải nói về CÙNG một tập. Nếu chấp nhận
// `ENROLLED` mà `closedAt` null thì C3 đếm được còn C4 lặng lẽ bỏ qua — hai con số cạnh
// nhau trên cùng màn, không con nào báo lỗi. Tiền lệ có sẵn: `Lead.convertedAt` được
// khai kiểu ở `lib/reports/lead.ts` rồi không hàm nào đọc.
import type { LeadChildStatus } from "@prisma/client";

/** Trạng thái con được coi là ĐÃ CHỐT. Đúng MỘT giá trị — cố ý không mở rộng. */
export const CLOSED_CHILD_STATUSES = ["ENROLLED"] as const satisfies readonly LeadChildStatus[];

/** Trạng thái con được coi là RỚT. */
export const LOST_CHILD_STATUSES = ["LOST"] as const satisfies readonly LeadChildStatus[];

/**
 * Trạng thái của lead (cấp PHỤ HUYNH) bị loại khỏi bảng "lead đang chăm" của C-05.
 * Ở đây dùng enum `LeadStatus` 15 giá trị, KHÁC `LeadChildStatus` — cố ý: cột "số ngày
 * chưa tiếp cận lại" neo ở cấp phụ huynh vì Sale gọi cho MỘT GIA ĐÌNH, không gọi riêng
 * từng đứa trẻ.
 */
export const NOT_IN_CARE_LEAD_STATUSES = [
  "ENROLLED",
  "REGISTERED",
  "LOST",
  "DUPLICATE",
] as const;

/** §C.6.0 — một học sinh được coi là đã chốt. */
export function isChildClosed(c: { status: LeadChildStatus; closedAt: Date | null }): boolean {
  return (CLOSED_CHILD_STATUSES as readonly string[]).includes(c.status) && c.closedAt != null;
}

/** §C.6.0 — một học sinh được coi là rớt. */
export function isChildLost(c: { status: LeadChildStatus }): boolean {
  return (LOST_CHILD_STATUSES as readonly string[]).includes(c.status);
}

/**
 * Loại `LeadActivity` được tính là "một lần TIẾP CẬN người thật" (OQ-C4, chốt 27/08).
 *
 * 🔴 `STATUS_CHANGE` và `HANDOVER` bị loại là **luật**, không phải mặc định kỹ thuật:
 * hai loại đó sinh TỰ ĐỘNG mỗi lần đổi trạng thái/bàn giao, nên tính chúng là "tiếp
 * cận" thì Sale chỉ cần bấm đổi trạng thái qua lại là RESET đồng hồ mà chưa gọi khách
 * lần nào. Đây không còn là chỗ để bàn lại khi ai đó thấy cột C5 cao quá.
 */
export const CONTACT_ACTIVITY_TYPES = ["CALL", "MESSAGE", "NOTE", "EMAIL"] as const;

/**
 * Tỷ lệ an toàn: mẫu số 0 ⇒ `null`, KHÔNG phải 0.
 *
 * Khác biệt này đi thẳng ra màn hình: `0` đọc là "đã đo, kết quả bằng không" còn `null`
 * đọc là "chưa đo được". Trả 0 cho ô "tỷ lệ đạt mục tiêu" khi CHƯA ĐẶT mục tiêu là báo
 * cho quản lý một tin xấu không có thật. Tiền lệ trong repo: `computeAchievement`
 * (`lib/reports/revenue-target.ts`) trả `null` đúng ca này.
 */
export function safeRate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return numerator / denominator;
}

/** Thống kê C3 tính từ một tập con đã nạp. Thuần để test được không cần DB. */
export type ChildFunnelStats = {
  total: number;
  closed: number;
  lost: number;
  /** null = mẫu số 0. Đơn vị: tỷ lệ 0..1, KHÔNG phải phần trăm. */
  successRate: number | null;
};

export function summariseChildFunnel(
  children: readonly { status: LeadChildStatus; closedAt: Date | null }[],
): ChildFunnelStats {
  const total = children.length;
  const closed = children.filter(isChildClosed).length;
  const lost = children.filter(isChildLost).length;
  return { total, closed, lost, successRate: safeRate(closed, total) };
}

/**
 * avg / median / p90 của một dãy số, đơn vị do người gọi quyết định.
 * Dãy rỗng ⇒ cả ba là `null` (xem `safeRate` về lý do không trả 0).
 *
 * ⚠️ Sắp xếp trên BẢN SAO — `[...xs]`. `Array.prototype.sort` sửa tại chỗ, và người gọi
 * thường truyền thẳng mảng vừa map từ kết quả DB rồi dùng lại nó để hiển thị.
 * p90 dùng phép nội suy tuyến tính giữa hai phần tử kề (khớp `percentile_cont` của
 * Postgres) để con số trên màn và con số chạy SQL tay không lệch nhau.
 */
export function describeDurations(xs: readonly number[]): {
  avg: number | null;
  median: number | null;
  p90: number | null;
} {
  if (xs.length === 0) return { avg: null, median: null, p90: null };
  const sorted = [...xs].sort((a, b) => a - b);
  const quantile = (q: number): number => {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo]!;
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
  };
  const avg = sorted.reduce((s, x) => s + x, 0) / sorted.length;
  return { avg, median: quantile(0.5), p90: quantile(0.9) };
}

/**
 * Nhãn thời gian chốt theo quy ước §C.6.4: dưới 1 ngày thì nói "< 1 ngày" chứ không
 * làm tròn xuống 0 — "0 ngày" đọc như dữ liệu hỏng.
 */
export function formatDaysToClose(days: number | null): string {
  if (days == null) return "—";
  if (days < 1) return "< 1 ngày";
  return `${days.toFixed(1).replace(".", ",")} ngày`;
}
