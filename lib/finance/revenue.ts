// §B.6.0 — NGUỒN SỰ THẬT DUY NHẤT cho "thực thu". Hàm THUẦN, không chạm DB.
//
// 🔴 Vì sao phải có file này: ba màn đang tự tính doanh thu theo ba công thức khác nhau
// (`bao-cao/doanh-thu`, `manager-dashboard`, `bao-cao/trung-tam`), và không màn nào sai
// rõ ràng đủ để ai đó đi sửa. Mọi số B1/B3/B4 từ nay đi qua đây.
//
// 🔴 HỆ QUẢ PHẢI THÔNG BÁO TRƯỚC KHI BẬT: số mới sẽ **THẤP HƠN** con số ba màn cũ đang
// hiện, đúng bằng (tổng hoàn tiền) + (chênh lệch điều chỉnh). Đây không phải lỗi — nhưng
// nếu bật im lặng thì người dùng sẽ báo "hệ thống mất doanh thu". Chạy truy vấn đo ở
// §B.6.8 trước, và ĐỪNG hứa chiều đổi (bài học §B.6.8: dự báo "số sẽ tụt" hoá ra sai chiều).

/** Trạng thái kế toán được tính vào doanh thu THUẦN. */
export const NET_REVENUE_STATUSES = ["CONFIRMED", "ADJUSTED", "REFUNDED"] as const;

export type RevenueScope = {
  /** `null` = không giới hạn cơ sở. Caller PHẢI giao với tầm nhìn actor trước khi gọi. */
  centerIds: string[] | null;
  dateFrom: Date;
  /** Mốc NỬA MỞ — hàm dùng `lt`, không `lte` (CHUNG-3). */
  dateToExclusive: Date;
};

/**
 * `where` dùng chung của sổ thực thu.
 *
 * ⚠️ CỐ Ý **không** gồm điều kiện "loại bản gốc đã bị điều chỉnh": điều kiện đó cần quan
 * hệ `adjustments` nên phải xử ở `netRevenueOf()` sau khi fetch. Dùng riêng `revenueWhere`
 * rồi `sum(amount)` là **cộng đôi** khoản đã điều chỉnh.
 */
export function revenueWhere(f: RevenueScope) {
  // ⚠️ KHÔNG `as const` ở đây: Prisma đòi mảng `in` là MUTABLE, còn `as const` biến nó
  // thành `readonly` và mọi call-site đỏ với một thông báo lỗi dài ba màn hình.
  return {
    deletedAt: null,
    accountantStatus: { in: [...NET_REVENUE_STATUSES] },
    paidDate: { gte: f.dateFrom, lt: f.dateToExclusive },
    ...(f.centerIds ? { centerId: { in: f.centerIds } } : {}),
  };
}

export type RevenueRow = {
  id: string;
  amount: number;
  accountantStatus: string;
  adjustmentOfId: string | null;
};

/**
 * Tổng THUẦN của một tập khoản đã fetch.
 *
 * Ba quy ước gộp lại ở đây, mỗi cái đều là một cách tính sai nếu bỏ:
 *  • bản `CONFIRMED` đã có bản `ADJUSTED` trỏ về ⇒ **loại** (bản gốc mang số CŨ);
 *  • `REFUNDED` ⇒ **cộng** vào, vì `amount` của nó đã mang dấu ÂM sẵn từ đường hoàn tiền
 *    — viết `- Math.abs(...)` ở đây là trừ hai lần;
 *  • `PENDING`/`REJECTED`/soft-delete đã bị `revenueWhere` loại từ tầng truy vấn.
 *
 * ⚠️ Chỉ xét TRONG TẬP ĐÃ FETCH. Bản `ADJUSTED` chép `paidDate` từ bản gốc nên hai bản
 * luôn rơi cùng kỳ ⇒ với bộ lọc theo kỳ thì đủ. Nhưng nếu ai đó fetch theo trang rồi gọi
 * hàm này từng trang, bản gốc và bản điều chỉnh có thể rơi hai trang khác nhau và bản cũ
 * sẽ được cộng. Gọi trên TOÀN BỘ tập của kỳ, không gọi theo trang.
 */
export function netRevenueOf(rows: readonly RevenueRow[]): number {
  const supersededIds = new Set(
    rows
      .filter((r) => r.accountantStatus === "ADJUSTED" && r.adjustmentOfId)
      .map((r) => r.adjustmentOfId as string),
  );
  let sum = 0;
  for (const r of rows) {
    if (r.accountantStatus === "CONFIRMED" && supersededIds.has(r.id)) continue;
    sum += r.amount;
  }
  return sum;
}

/**
 * Bản GỘP (chỉ `CONFIRMED`, không trừ hoàn, không thay bản điều chỉnh).
 * Giữ để **đối chiếu** với ba màn cũ khi giải thích chênh lệch — KHÔNG dùng làm số chính.
 */
export function grossRevenueOf(
  rows: readonly { amount: number; accountantStatus: string }[],
): number {
  return rows
    .filter((r) => r.accountantStatus === "CONFIRMED")
    .reduce((s, r) => s + r.amount, 0);
}
