/**
 * SHADOW-COMPARE CÔNG NỢ — so công nợ **sổ mới** với công nợ **đang hiển thị**.
 *
 *   pnpm payments:shadow-compare              # in mọi đơn LỆCH (mặc định)
 *   pnpm payments:shadow-compare --all        # in cả đơn khớp
 *   pnpm payments:shadow-compare --limit 50   # giới hạn số dòng in
 *
 * CHỈ ĐỌC — không ghi một dòng nào. Đây là thứ chủ dự án dùng để quyết có bật cờ
 * `PAYMENT_LEDGER_V2` (cutover) hay không: bảng này sạch thì mới lật.
 *
 * ── Hai công thức đang so ──
 * • SỔ CŨ (đang hiển thị): `computeDebt(order.totalAmount, Σ Payment.amount)` với
 *   `Payment` lọc `saleStatus="RECORDED", deletedAt=null` — ĐÚNG bằng công thức
 *   `/admin/orders/[id]` (paidSoFar) và `computeDueNow` đang dùng. `computeDebt`
 *   import thẳng từ `lib/finance/debt.ts`, KHÔNG chép lại công thức.
 *   ⚠️ Lưu ý: `paidOf()` trong debt.ts (đã trả = toàn bộ nếu đơn CONFIRMED) KHÔNG
 *   phải thứ màn hình dùng — nó chỉ còn sống trong unit test. Script vẫn tính nó ra
 *   để chỉ mặt đơn CONFIRMED mà chưa ghi đủ khoản (split-brain trạng thái ↔ sổ).
 * • SỔ MỚI: Σ `outstandingOf(phiếu)` = Σ max(0, amountDue − Σ(amount + roundingWaived)),
 *   phiếu VOID coi như không phải thu (dùng đúng `lib/payments/allocation.ts`).
 *   `roundingWaived` phải cộng vào: đó là phần hệ thống đã tha theo dung sai làm tròn
 *   nên phiếu đã PAID — bỏ qua nó là mọi phiếu PAID-nhờ-dung-sai thành "lệch" giả.
 *
 * Chênh lệch = nợ sổ mới − nợ sổ cũ. Dương = sổ mới đòi nhiều hơn (thường do thiếu
 * phân bổ); âm = sổ mới đòi ít hơn (thường do thiếu phiếu / phiếu nhỏ hơn đơn).
 */
// PHẢI đứng TRƯỚC import lib/db.
import { currentDbHost } from "./_load-env";
import type { OrderStatus } from "@prisma/client";
import { db } from "../lib/db";
import { computeDebt, paidOf } from "../lib/finance/debt";
import { outstandingOf, type RequestStatus } from "../lib/payments/allocation";

export type DebtDiffRow = {
  orderCode: string;
  orderId: string;
  orderStatus: string;
  centerName: string;
  totalAmount: number;
  /** Σ Payment RECORDED còn hiệu lực — mẫu số của công nợ đang hiển thị. */
  recordedPaid: number;
  oldDebt: number;
  /** Σ PaymentAllocation trên mọi phiếu của đơn. */
  allocated: number;
  /** Σ phần thiếu đã THA theo dung sai làm tròn (coi như đã thu ở sổ mới). */
  waived: number;
  newDebt: number;
  diff: number;
  reasons: string[];
};

export type ShadowCompareResult = {
  scanned: number;
  matched: number;
  mismatched: number;
  /** Tổng |chênh lệch| của các đơn lệch. */
  totalAbsDiff: number;
  /** Tổng chênh lệch có dấu (bù trừ) — dùng để thấy lệch hệ thống hay lệch ngẫu nhiên. */
  totalSignedDiff: number;
  reasonCounts: Record<string, number>;
  rows: DebtDiffRow[];
};

const PAGE = 200;

/** Nhãn lý do — gom cố định để đếm được, đừng nội suy chuỗi tự do. */
export const REASON = {
  NO_REQUEST: "Chưa có phiếu thu (chưa backfill)",
  PLAN_NOT_APPROVED: "Có dòng trả góp nhưng kế hoạch chưa APPROVED",
  PLAN_SUM_MISMATCH: "Σ amountDue các phiếu ≠ totalAmount đơn",
  UNALLOCATED_PAYMENT: "Có khoản đã thu chưa rót vào phiếu nào",
  OVER_ALLOCATED: "Đã rót nhiều hơn số đã thu (sổ mới có tiền sổ cũ không thấy)",
  OVERPAID: "Khách đóng thừa so với tổng đơn",
  STATUS_PAID_NO_MONEY: "Đơn CONFIRMED/COMPLETED nhưng chưa ghi đủ khoản thu",
  ORDER_CLOSED: "Đơn CANCELLED/REFUNDED nhưng phiếu vẫn còn phải thu",
  VOID_REQUEST: "Có phiếu VOID (không tính vào nợ sổ mới)",
  ROUNDING_WAIVED: "Có phần tha theo dung sai làm tròn (sổ mới không đòi, sổ cũ vẫn tính)",
} as const;

type LoadedOrder = {
  id: string;
  code: string;
  status: OrderStatus;
  totalAmount: number;
  installmentApprovalStatus: string | null;
  center: { name: string } | null;
  installments: { soDot: number }[];
  payments: { amount: number }[];
  paymentRequests: {
    installmentNo: number;
    amountDue: number;
    status: RequestStatus;
    sortOrder: number;
    allocations: { amount: number; roundingWaived: number }[];
  }[];
};

/** Dựng 1 dòng so lệch từ dữ liệu đã nạp. THUẦN — test được không cần DB. */
export function diffOrder(order: LoadedOrder): DebtDiffRow {
  const recordedPaid = order.payments.reduce((s, p) => s + p.amount, 0);
  const oldDebt = computeDebt(order.totalAmount, recordedPaid);

  let allocated = 0;
  let waivedTotal = 0;
  let newDebt = 0;
  let hasVoid = false;
  let dueSum = 0;
  for (const r of order.paymentRequests) {
    const a = r.allocations.reduce((s, x) => s + x.amount, 0);
    // Phần THA theo dung sai làm tròn là tiền hệ thống đã quyết không đòi nữa
    // (phiếu đã PAID). Không cộng vào đây thì mỗi phiếu PAID-nhờ-dung-sai đẻ ra một
    // đơn "lệch" giả, và bảng so lệch không bao giờ sạch được để cutover.
    const w = r.allocations.reduce((s, x) => s + x.roundingWaived, 0);
    allocated += a;
    waivedTotal += w;
    if (r.status === "VOID") hasVoid = true;
    else dueSum += r.amountDue;
    newDebt += outstandingOf({
      id: "",
      amountDue: r.amountDue,
      allocated: a + w,
      sortOrder: r.sortOrder,
      status: r.status,
    });
  }

  const reasons: string[] = [];
  if (order.paymentRequests.length === 0) reasons.push(REASON.NO_REQUEST);
  if (order.installments.length > 0 && order.installmentApprovalStatus !== "APPROVED") {
    reasons.push(REASON.PLAN_NOT_APPROVED);
  }
  if (order.paymentRequests.length > 0 && dueSum !== order.totalAmount) {
    reasons.push(REASON.PLAN_SUM_MISMATCH);
  }
  if (allocated < recordedPaid) reasons.push(REASON.UNALLOCATED_PAYMENT);
  if (allocated > recordedPaid) reasons.push(REASON.OVER_ALLOCATED);
  if (waivedTotal > 0) reasons.push(REASON.ROUNDING_WAIVED);
  if (recordedPaid > order.totalAmount) reasons.push(REASON.OVERPAID);
  // Trạng thái đơn nói "đã trả đủ" mà sổ khoản thu không ghi đủ → split-brain cũ.
  if (paidOf({ status: order.status, totalAmount: order.totalAmount }) > recordedPaid) {
    reasons.push(REASON.STATUS_PAID_NO_MONEY);
  }
  if ((order.status === "CANCELLED" || order.status === "REFUNDED") && newDebt > 0) {
    reasons.push(REASON.ORDER_CLOSED);
  }
  if (hasVoid) reasons.push(REASON.VOID_REQUEST);

  return {
    orderCode: order.code,
    orderId: order.id,
    orderStatus: order.status,
    centerName: order.center?.name ?? "(chưa gắn cơ sở)",
    totalAmount: order.totalAmount,
    recordedPaid,
    oldDebt,
    allocated,
    waived: waivedTotal,
    newDebt,
    diff: newDebt - oldDebt,
    reasons,
  };
}

export async function runShadowCompare(
  opts: { includeMatched?: boolean } = {},
): Promise<ShadowCompareResult> {
  const result: ShadowCompareResult = {
    scanned: 0,
    matched: 0,
    mismatched: 0,
    totalAbsDiff: 0,
    totalSignedDiff: 0,
    reasonCounts: {},
    rows: [],
  };

  let skip = 0;
  for (;;) {
    const orders: LoadedOrder[] = await db.order.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
      skip,
      take: PAGE,
      select: {
        id: true,
        code: true,
        status: true,
        totalAmount: true,
        installmentApprovalStatus: true,
        center: { select: { name: true } },
        installments: { select: { soDot: true } },
        // Đúng bộ lọc của màn hình đơn (paidSoFar) — không nới, không siết.
        payments: { where: { saleStatus: "RECORDED", deletedAt: null }, select: { amount: true } },
        paymentRequests: {
          select: {
            installmentNo: true,
            amountDue: true,
            status: true,
            sortOrder: true,
            allocations: { select: { amount: true, roundingWaived: true } },
          },
        },
      },
    });
    if (orders.length === 0) break;

    for (const o of orders) {
      const row = diffOrder(o);
      result.scanned++;
      if (row.diff === 0) {
        result.matched++;
        if (opts.includeMatched) result.rows.push(row);
      } else {
        result.mismatched++;
        result.totalAbsDiff += Math.abs(row.diff);
        result.totalSignedDiff += row.diff;
        result.rows.push(row);
        for (const r of row.reasons) result.reasonCounts[r] = (result.reasonCounts[r] ?? 0) + 1;
      }
    }

    skip += orders.length;
    if (orders.length < PAGE) break;
  }

  return result;
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s.padEnd(n));
const padL = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s.padStart(n));

async function main(): Promise<void> {
  const includeMatched = process.argv.includes("--all");
  const limitArg = process.argv.indexOf("--limit");
  const limit = limitArg >= 0 ? Number(process.argv[limitArg + 1]) || 100 : 100;

  console.log(`\n═══ SHADOW-COMPARE CÔNG NỢ (chỉ đọc) ═══`);
  console.log(`DB host: ${currentDbHost()}\n`);

  const r = await runShadowCompare({ includeMatched });

  console.log(
    `${pad("MÃ ĐƠN", 20)} ${pad("CƠ SỞ", 14)} ${padL("NỢ SỔ CŨ", 13)} ${padL("NỢ SỔ MỚI", 13)} ` +
      `${padL("CHÊNH", 13)}  LÝ DO`,
  );
  console.log("─".repeat(120));
  for (const row of r.rows.slice(0, limit)) {
    console.log(
      `${pad(row.orderCode, 20)} ${pad(row.centerName, 14)} ${padL(fmt(row.oldDebt), 13)} ` +
        `${padL(fmt(row.newDebt), 13)} ${padL(fmt(row.diff), 13)}  ` +
        (row.reasons.join(" · ") || (row.diff === 0 ? "khớp" : "chưa xác định — soi tay")),
    );
  }
  if (r.rows.length > limit) console.log(`… còn ${r.rows.length - limit} dòng (dùng --limit N).`);

  console.log(`\n── Tổng kết ──`);
  console.log(`Đơn quét:          ${r.scanned}`);
  console.log(`Khớp:              ${r.matched}`);
  console.log(`Lệch:              ${r.mismatched}`);
  console.log(`Tổng |chênh lệch|: ${fmt(r.totalAbsDiff)}đ`);
  console.log(`Chênh lệch ròng:   ${fmt(r.totalSignedDiff)}đ`);

  const reasons = Object.entries(r.reasonCounts).sort((a, b) => b[1] - a[1]);
  if (reasons.length) {
    console.log(`\n── Lý do (đếm theo đơn lệch) ──`);
    for (const [name, count] of reasons) console.log(`  ${padL(String(count), 5)}  ${name}`);
  }

  console.log(
    r.mismatched === 0
      ? `\n✓ SẠCH — đủ điều kiện xét bật PAYMENT_LEDGER_V2.`
      : `\n⚠ CÒN LỆCH — chưa bật PAYMENT_LEDGER_V2. Xử lý theo cột lý do rồi chạy lại.`,
  );
  console.log();
}

if (process.argv[1] && /shadow-compare-debt/.test(process.argv[1])) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
