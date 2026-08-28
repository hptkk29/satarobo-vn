import "server-only";
import { db } from "@/lib/db";
import { getModelVisibleCenterIds, scopedDb } from "@/lib/db-scope";
import type { Actor } from "@/lib/auth/actor";
import type { ScopeFilters } from "@/lib/reports/filters";
import { netRevenueOf, revenueWhere } from "@/lib/finance/revenue";
import { vnDateAt, vnParts } from "@/lib/time/vn";

// B-03 (§B.6.2 → §B.6.4) — tầng ĐỌC của Chi phí · Lợi nhuận · Dòng tiền.
//
// 🔴 HAI NGUỒN CHI, TÁCH BIỆT TUYỆT ĐỐI:
//   1. `CostEntry` đã DUYỆT, đầu phí `isSystemFed = false` — nhập tay / import;
//   2. chi phí quảng cáo — đọc từ D1 (`lib/reports/ads-spend.ts`), KHÔNG đọc từ `CostEntry`.
// Cộng ở tầng ứng dụng, không ở SQL. Trộn hai nguồn là trừ tiền quảng cáo HAI LẦN, và
// không ai đối chiếu ra vì hai con số nằm ở hai màn khác nhau.
//
// ⚠️ Nguồn 2 CHƯA TỒN TẠI (chặn bởi OQ-D4 — token Meta chưa có). Hàm dưới đây trả
// `adsSpend: null` chứ KHÔNG trả 0: `0` đọc là "đã đo, không tốn đồng nào" còn `null`
// đọc là "chưa nối nguồn". Trả 0 làm B2 báo thiếu và B3 báo LÃI CAO HƠN THỰC TẾ — sai
// theo hướng dễ chịu, tức hướng khó bị phát hiện nhất.

/** Phạm vi cơ sở HIỆU LỰC cho model chi phí = (bộ lọc) ∩ (tầm nhìn actor). */
function effectiveCenterIds(actor: Actor, f: ScopeFilters): string[] | null {
  const visible = getModelVisibleCenterIds("CostEntry", actor);
  if (f.centerIds === null) return visible === "ALL" ? null : visible;
  return visible === "ALL" ? f.centerIds : f.centerIds.filter((c) => visible.includes(c));
}

function nextDayStart(dateTo: Date): Date {
  const p = vnParts(dateTo);
  return vnDateAt(p.year, p.month, p.day + 1);
}

export type CostByCategory = {
  categoryId: string;
  code: string;
  label: string;
  amount: number;
};

export type CostBreakdown = {
  /** Chi đã duyệt, gắn ĐÚNG một cơ sở trong phạm vi đang xem. */
  byCategory: CostByCategory[];
  centerTotal: number;
  /**
   * 🔴 Chi phí CẤP CÔNG TY (`centerId = null`) — TÁCH RIÊNG, cố ý không gộp vào
   * `centerTotal`. Lý do: dòng này hiện với MỌI phạm vi (nó thuộc
   * `NULL_IS_GLOBAL_MODELS`), nên nếu gộp thì xem CS1 cộng đủ 100% chi phí công ty, xem
   * CS2 cũng cộng đủ 100%, và cộng hai màn lại là đếm đôi. v1 KHÔNG phân bổ (OQ-B6).
   */
  companyTotal: number;
  companyByCategory: CostByCategory[];
  /**
   * Chi phí quảng cáo từ D1. `null` = **chưa nối nguồn** (OQ-D4 còn treo), KHÔNG phải 0.
   * Mọi con số dẫn xuất (B2/B3/B4) phải là `null` theo, đừng thay bằng 0 cho "đẹp".
   */
  adsSpend: number | null;
  /** Tổng chi của kỳ. `null` khi `adsSpend` chưa có — vì tổng thiếu một vế. */
  total: number | null;
};

export async function getCostBreakdown(actor: Actor, f: ScopeFilters): Promise<CostBreakdown> {
  const sdb = scopedDb(actor);
  const effective = effectiveCenterIds(actor, f);
  const range = { gte: f.dateFrom, lt: nextDayStart(f.dateTo) };

  const rows = await sdb.costEntry.findMany({
    where: {
      deletedAt: null,
      // DRAFT và VOID KHÔNG vào báo cáo. Điều kiện này lặp ở cả tầng đọc lẫn tầng ghi —
      // trùng lặp có chủ đích, vì mất nó thì khoản mới nhập chưa ai duyệt đã lên báo cáo.
      status: "APPROVED",
      spentDate: range,
      // Đầu phí do HỆ THỐNG nạp (ADS) đi đường D1, không đi đường này. Đây là chốt chặn
      // THỨ HAI chống trừ hai lần; chốt thứ nhất nằm ở validator nhập tay/import.
      category: { isSystemFed: false },
      ...(effective ? { OR: [{ centerId: { in: effective } }, { centerId: null }] } : {}),
    },
    select: {
      amount: true,
      centerId: true,
      categoryId: true,
      category: { select: { code: true, label: true } },
    },
  });

  const center = new Map<string, CostByCategory>();
  const company = new Map<string, CostByCategory>();
  let centerTotal = 0;
  let companyTotal = 0;
  for (const r of rows) {
    const bucket = r.centerId === null ? company : center;
    const cur = bucket.get(r.categoryId) ?? {
      categoryId: r.categoryId,
      code: r.category.code,
      label: r.category.label,
      amount: 0,
    };
    cur.amount += r.amount;
    bucket.set(r.categoryId, cur);
    if (r.centerId === null) companyTotal += r.amount;
    else centerTotal += r.amount;
  }

  const adsSpend = await getAdsSpend(actor, f);
  const sortDesc = (m: Map<string, CostByCategory>) =>
    [...m.values()].sort((a, b) => b.amount - a.amount);

  return {
    byCategory: sortDesc(center),
    centerTotal,
    companyTotal,
    companyByCategory: sortDesc(company),
    adsSpend,
    total: adsSpend === null ? null : centerTotal + companyTotal + adsSpend,
  };
}

/**
 * Chi phí quảng cáo của kỳ — cửa DUY NHẤT của đầu phí `ADS`.
 *
 * 🔴 Hôm nay trả `null` vì nguồn chưa tồn tại: job đồng bộ Meta (D.5) đứng sau `OQ-D4`
 * (loại token + hạn) mà câu đó **chưa có câu trả lời**. Khi D.7 xong, thay thân hàm này
 * bằng `getAdsSpendByCenter(actor, f)` và **không** đụng gì khác — mọi chỗ dùng đã xử
 * `null` sẵn.
 *
 * ⚠️ Đừng "tạm trả 0 cho đỡ vướng". `0` là một khẳng định (không tốn đồng nào), `null`
 * là một thú nhận (chưa đo được). Chỉ cái thứ hai là đúng.
 */
async function getAdsSpend(_actor: Actor, _f: ScopeFilters): Promise<number | null> {
  return null;
}

export type FinanceSummary = {
  /** B1 — thực thu THUẦN của kỳ + phạm vi. */
  netRevenue: number;
  /** B1 bản GỘP — chỉ để đối chiếu với ba màn cũ khi ai đó hỏi "sao số tụt". */
  grossRevenue: number;
  cost: CostBreakdown;
  /** B3 = B1 − B2. `null` khi B2 chưa đủ vế (chi phí quảng cáo chưa nối). */
  profit: number | null;
  /** B4 = B1 − B2 (v1 chốt "thu ghi nhận", không dùng BankTransaction — xem §B.6.4). */
  cashflow: number | null;
};

export async function getFinanceSummary(
  actor: Actor,
  f: ScopeFilters,
): Promise<FinanceSummary> {
  const sdb = scopedDb(actor);
  const visible = getModelVisibleCenterIds("Payment", actor);
  const paymentCenterIds =
    f.centerIds === null
      ? visible === "ALL"
        ? null
        : visible
      : visible === "ALL"
        ? f.centerIds
        : f.centerIds.filter((c) => visible.includes(c));

  const [rows, cost] = await Promise.all([
    sdb.payment.findMany({
      where: revenueWhere({
        centerIds: paymentCenterIds,
        dateFrom: f.dateFrom,
        dateToExclusive: nextDayStart(f.dateTo),
      }),
      select: { id: true, amount: true, accountantStatus: true, adjustmentOfId: true },
      // Trần cao có chủ đích: `netRevenueOf` phải thấy TOÀN BỘ tập của kỳ để ghép được
      // bản gốc với bản điều chỉnh. Cắt theo trang ở đây là cộng nhầm bản cũ.
      take: 100_000,
    }),
    getCostBreakdown(actor, f),
  ]);

  const netRevenue = netRevenueOf(rows);
  const grossRevenue = rows
    .filter((r) => r.accountantStatus === "CONFIRMED")
    .reduce((s, r) => s + r.amount, 0);

  const profit = cost.total === null ? null : netRevenue - cost.total;
  return { netRevenue, grossRevenue, cost, profit, cashflow: profit };
}

export type MoneyReconciliation = {
  /** Lớp 1 — tiền VẬT LÝ về ngân hàng (KHÔNG gồm tiền mặt). */
  bankIn: number;
  /** Lớp 2 — tiền đã GHI NHẬN trên sổ (mọi trạng thái kế toán, kể cả chờ duyệt). */
  recorded: number;
  /** Lớp 3 — DOANH THU thuần (đã xác nhận, đã trừ hoàn/điều chỉnh). */
  netRevenue: number;
};

/**
 * Bảng đối soát 3 lớp tiền — BẮT BUỘC hiện cùng B4 (§B.6.4).
 *
 * Ba số này **không bằng nhau và không nên bằng nhau**: khoảng cách giữa chúng chính là
 * thông tin. Lớp 1 thiếu tiền mặt (`Payment.method` là chuỗi tự do nên tiền mặt không
 * đi qua ngân hàng); lớp 2 gồm cả khoản kế toán chưa xác nhận; lớp 3 đã trừ hoàn tiền.
 * Hiện một mình B4 mà giấu bảng này là mời người đọc kết luận sai về "tiền đi đâu".
 */
export async function getMoneyReconciliation(
  actor: Actor,
  f: ScopeFilters,
): Promise<MoneyReconciliation> {
  const sdb = scopedDb(actor);
  const visible = getModelVisibleCenterIds("Payment", actor);
  const centerIds =
    f.centerIds === null
      ? visible === "ALL"
        ? null
        : visible
      : visible === "ALL"
        ? f.centerIds
        : f.centerIds.filter((c) => visible.includes(c));
  const to = nextDayStart(f.dateTo);

  const [bank, recorded, netRows] = await Promise.all([
    // `BankTransaction` ∈ NULL_IS_GLOBAL_MODELS: dòng `centerId = null` là giao dịch
    // CHƯA khớp được về cơ sở nào — và đó chính là nhóm người đối soát cần thấy.
    // `scopedDb` đã xử đúng, nên KHÔNG đắp thêm `centerId: { in }` ở đây.
    sdb.bankTransaction.aggregate({
      _sum: { amount: true },
      where: { transferredAt: { gte: f.dateFrom, lt: to } },
    }),
    sdb.payment.aggregate({
      _sum: { amount: true },
      where: {
        deletedAt: null,
        paidDate: { gte: f.dateFrom, lt: to },
        ...(centerIds ? { centerId: { in: centerIds } } : {}),
      },
    }),
    sdb.payment.findMany({
      where: revenueWhere({ centerIds, dateFrom: f.dateFrom, dateToExclusive: to }),
      select: { id: true, amount: true, accountantStatus: true, adjustmentOfId: true },
      take: 100_000,
    }),
  ]);

  return {
    bankIn: bank._sum.amount ?? 0,
    recorded: recorded._sum.amount ?? 0,
    netRevenue: netRevenueOf(netRows),
  };
}

/** B5 — doanh thu theo NGÀY LỊCH VN. Ngày không giao dịch vẫn có dòng `0`. */
export async function getRevenueByDay(
  actor: Actor,
  f: ScopeFilters,
): Promise<{ day: string; amount: number }[]> {
  const sdb = scopedDb(actor);
  const visible = getModelVisibleCenterIds("Payment", actor);
  const centerIds =
    f.centerIds === null
      ? visible === "ALL"
        ? null
        : visible
      : visible === "ALL"
        ? f.centerIds
        : f.centerIds.filter((c) => visible.includes(c));

  const rows = await sdb.payment.findMany({
    where: revenueWhere({
      centerIds,
      dateFrom: f.dateFrom,
      dateToExclusive: nextDayStart(f.dateTo),
    }),
    select: {
      id: true,
      amount: true,
      accountantStatus: true,
      adjustmentOfId: true,
      paidDate: true,
    },
    take: 100_000,
  });

  // Gom theo NGÀY LỊCH VN. Dùng `paidDate.toISOString().slice(0,10)` là gom theo ngày
  // UTC ⇒ mọi giao dịch 00:00–07:00 giờ VN rơi nhầm sang hôm trước.
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const p = vnParts(r.paidDate);
    const key = `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    const arr = byDay.get(key) ?? [];
    arr.push(r);
    byDay.set(key, arr);
  }

  const out: { day: string; amount: number }[] = [];
  const start = vnParts(f.dateFrom);
  const end = vnParts(f.dateTo);
  let cursor = vnDateAt(start.year, start.month, start.day);
  const last = vnDateAt(end.year, end.month, end.day);
  // Chặn 400 vòng: `dateTo` rác (năm 9999) sẽ treo server chứ không báo lỗi.
  for (let i = 0; i < 400 && cursor.getTime() <= last.getTime(); i++) {
    const p = vnParts(cursor);
    const key = `${p.year}-${String(p.month + 1).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
    out.push({ day: key, amount: netRevenueOf(byDay.get(key) ?? []) });
    cursor = vnDateAt(p.year, p.month, p.day + 1);
  }
  return out;
}

/** Danh mục đầu phí đang bật — cho form nhập tay và trình import. */
export async function listActiveCostCategories() {
  return db.costCategory.findMany({
    where: { isActive: true },
    select: { id: true, code: true, label: true, isSystemFed: true },
    orderBy: [{ displayOrder: "asc" }, { label: "asc" }],
  });
}
