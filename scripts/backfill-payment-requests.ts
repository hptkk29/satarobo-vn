/**
 * BACKFILL SỔ THU MỚI — sinh `PaymentRequest` (+ `BankTransaction`/`PaymentAllocation`
 * tổng hợp từ lịch sử `Payment`) cho MỌI đơn đang tồn tại.
 *
 *   pnpm payments:backfill                 # DRY-RUN: chỉ in ra sẽ tạo gì, KHÔNG ghi
 *   pnpm payments:backfill --apply         # ghi thật (chỉ DB local/test)
 *   pnpm payments:backfill --apply --prod  # ghi lên DB KHÔNG-local (phải cố ý gõ)
 *
 * ⚠️ Mặc định DRY-RUN. Và ngay cả `--apply` cũng bị CHẶN nếu `DATABASE_URL` không
 * có dấu hiệu local/test — muốn ghi lên DB thật phải thêm `--prod` tường minh
 * (cùng fail-safe với `assertTestDb()` trong tests/e2e/_helpers/seed.ts).
 *
 * ── Vì sao cần script này ──
 * Sổ mới (PaymentRequest ← PaymentAllocation ← BankTransaction) chạy SONG SONG với
 * sổ cũ (Payment / OrderInstallment) cho tới khi `scripts/shadow-compare-debt.ts`
 * sạch. Đơn cũ chưa có phiếu thu nào ⇒ công nợ sổ mới = 0 với mọi đơn cũ ⇒ so lệch
 * vô nghĩa. Backfill là bước dựng mặt bằng để so.
 *
 * ── Cách xử lý ca "ĐÃ THU MỘT PHẦN" (chỗ dễ sai nhất) ──
 * Sổ mới không có khái niệm "đã thu" rời rạc: trạng thái phiếu SUY RA từ phân bổ.
 * Nên với mỗi khoản `Payment` còn hiệu lực, backfill dựng 1 `BankTransaction` tổng
 * hợp (provider "BACKFILL", providerTxnId `backfill:<paymentId>`) rồi rót vào phiếu
 * bằng ĐÚNG `planAllocation` mà webhook dùng:
 *   • Khoản có marker `[auto:order-installment:dotN]` → rót vào đúng phiếu đợt N
 *     trước (startId), dư mới tràn sang phiếu kế tiếp.
 *   • Khoản không marker → rót theo sortOrder tăng dần (đợt 1 trước đợt 2).
 *   • Thứ tự xử lý các khoản trong 1 đơn: theo `paidDate` tăng dần — tiền vào
 *     trước lấp đợt trước, giống hệt thực tế.
 * Nhờ vậy đơn "đã thu đợt 1" ra đúng: phiếu đợt 1 PAID, đợt 2 PENDING.
 *
 * ── Nguồn tiền dùng để rót: đúng bằng cái màn hình ĐANG hiện ──
 * Lọc `Payment` chỉ theo `deletedAt: null` (không lọc `saleStatus`/`accountantStatus`).
 * Đây là chủ ý: công nợ hiển thị hiện tại (`/orders/[id]`) = `totalAmount − Σ Payment
 * (saleStatus=RECORDED, deletedAt=null)`, mà trong code KHÔNG có đường nào set
 * `COLLECT_CONFIRMED` (chỉ là nhãn UI) và khoản bị kế toán từ chối vẫn giữ
 * `saleStatus=RECORDED` ⇒ hai tập trùng nhau trên thực tế. Chênh lệch nếu có sẽ do
 * `shadow-compare-debt.ts` chỉ mặt, KHÔNG bị chôn im lặng trong backfill.
 *
 * ── Idempotent ──
 * Chạy lại KHÔNG nhân đôi: phiếu neo `@@unique([orderId, installmentNo])`, giao dịch
 * neo `@@unique([provider, providerTxnId])`, phân bổ neo
 * `@@unique([bankTransactionId, paymentRequestId])` — đều `skipDuplicates`. Khoản đã
 * có giao dịch + phân bổ thì bỏ qua hẳn (không lập kế hoạch rót lại).
 *
 * KHÔNG tạo `CreditBalance`: tiền dư lịch sử (đơn đóng thừa) chỉ được GHI CHÚ vào
 * `BankTransaction.unmatchedNote` + đếm trong báo cáo. Đổ hàng loạt dư cũ vào hàng
 * chờ "Tiền thừa chưa xử lý" của kế toán là tạo việc giả ngay ngày cutover.
 *
 * ── ĐỘ LỆCH ĐÃ BIẾT so với `lib/payments/payment-request.ts` ──
 * File đó tự nhận là "NƠI DUY NHẤT tạo/huỷ phiếu thu" và cấm
 * `paymentRequest.create({ installmentNo: n>0 })` ở chỗ khác. Script này VẪN create
 * thẳng, vì `payment-request.ts` mở đầu bằng `import "server-only"` — không nạp được
 * trong tiến trình `tsx`. Bù lại, script giữ nguyên vẹn hai ràng buộc quan trọng của
 * nó: (a) phiếu theo đợt CHỈ sinh khi `installmentApprovalStatus = APPROVED`, (b)
 * phiếu tạo ra luôn PENDING rồi mới để phân bổ quyết trạng thái. Muốn gỡ hẳn độ lệch
 * thì tách phần thuần (không `server-only`) của `payment-request.ts` ra module riêng
 * — việc đó nằm NGOÀI phạm vi file được phép sửa trong lượt này.
 */
// PHẢI đứng TRƯỚC import lib/db — Prisma đọc DATABASE_URL lúc khởi tạo module.
import { currentDbHost } from "./_load-env";
import { db } from "../lib/db";
import {
  deriveStatus,
  planAllocation,
  type AllocTarget,
  type RequestStatus,
} from "../lib/payments/allocation";

// ─── Quy ước khoá đối khớp ────────────────────────────────────────────────────

/** Provider giả cho giao dịch tổng hợp từ sổ cũ (không phải tiền về thật hôm nay). */
export const BACKFILL_PROVIDER = "BACKFILL";

/** Khoá idempotency của giao dịch tổng hợp: 1 khoản Payment ⇄ 1 BankTransaction. */
export function backfillTxnId(paymentId: string): string {
  return `backfill:${paymentId}`;
}

/**
 * Khoá đối khớp — PHẢI trùng từng ký tự với `paymentMatchKey()` trong
 * `lib/payments/payment-request.ts` (nơi DUY NHẤT sinh phiếu ở đường chạy thật):
 * `<mã đơn bỏ ký tự không phải chữ-số>D<số đợt>`, KỂ CẢ phiếu toàn đơn (`…D0`).
 *
 * ⚠️ Vì sao chép lại thay vì import: `payment-request.ts` mở đầu bằng
 * `import "server-only"`, mà package đó KHÔNG resolve được trong tiến trình `tsx`
 * (script CLI) — import vào là script chết ngay dòng đầu. Chống trôi bằng test:
 * `tests/e2e/r7/payment-backfill.spec.ts` khẳng định hai hàm cho ra chuỗi y hệt
 * (spec chạy trong Playwright, nơi `server-only` đã có stub). Đổi công thức bên kia
 * mà quên bên này → test đỏ, không âm thầm lệch.
 *
 * Lệch một ký tự ở đây là tiền về không tra ra phiếu (`matchKey` dò khớp CHÍNH XÁC
 * trong `collectMatchKeyCandidates`) → giao dịch rơi vào UNMATCHED, đúng cái mà cả
 * tính năng này sinh ra để tránh.
 */
export function requestMatchKey(orderCode: string, installmentNo: number): string {
  return `${orderCode.replace(/[^A-Za-z0-9]/g, "")}D${installmentNo}`;
}

const INSTALLMENT_MARKER_RE = /\[auto:order-installment:dot(\d+)\]/;

/** Đọc số đợt từ marker idempotency mà `ensureOrderPaymentRecorded` ghi vào note. */
export function markerInstallmentNo(note: string | null | undefined): number | null {
  const m = note ? INSTALLMENT_MARKER_RE.exec(note) : null;
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

// ─── Fail-safe DB ─────────────────────────────────────────────────────────────

const LOCAL_URL_RE = /(@|\/\/)(localhost|127\.0\.0\.1)[:/]/;
const TEST_DB_RE = /satarobo_test|ci_test/;

/** Chặn ghi nhầm lên DB thật. `--prod` là đường thoát DUY NHẤT và phải gõ tay. */
export function assertWritableDb(allowRemote: boolean): void {
  const url = process.env.DATABASE_URL ?? "";
  if (allowRemote) return;
  if (LOCAL_URL_RE.test(url) || TEST_DB_RE.test(url)) return;
  throw new Error(
    `[backfill] TỪ CHỐI GHI: DATABASE_URL không trỏ DB local/test (host=${currentDbHost()}).\n` +
      `  • Đúng ý → thêm cờ --prod (cố ý ghi lên DB thật).\n` +
      `  • Nhầm   → nạp .env.test rồi chạy lại. Xem .claude/rules/prisma-db.md.`,
  );
}

// ─── Lập kế hoạch phiếu thu cho 1 đơn (THUẦN) ─────────────────────────────────

export type OrderForPlan = {
  code: string;
  totalAmount: number;
  installmentApprovalStatus: string | null;
  installments: { soDot: number; amount: number; dueDate: Date | null }[];
};

export type DesiredRequest = {
  installmentNo: number;
  amountDue: number;
  dueDate: Date | null;
  sortOrder: number;
  matchKey: string;
};

/**
 * Kế hoạch 2 đợt CHỈ có hiệu lực khi đã DUYỆT (`installmentApprovalStatus=APPROVED`).
 * Mọi ca còn lại (không trả góp, chờ duyệt, bị từ chối, duyệt rồi nhưng không có dòng
 * đợt nào) → 1 phiếu toàn đơn `installmentNo = 0`.
 *
 * ⚠️ Cố ý KHÁC `computeDueNow` (lib/payments/due-now.ts) — hàm đó coi
 * `installmentApprovalStatus == null` là kế hoạch CÒN hiệu lực. Đơn có dòng
 * OrderInstallment mà `installmentApprovalStatus = null` vì thế sẽ lệch giữa hai
 * cách hiểu; shadow-compare gắn cờ ca này thay vì tự chọn hộ.
 */
export function planRequests(order: OrderForPlan): DesiredRequest[] {
  const approved = order.installmentApprovalStatus === "APPROVED";
  const plan = [...order.installments].sort((a, b) => a.soDot - b.soDot);

  if (approved && plan.length > 0) {
    return plan.map((i) => ({
      installmentNo: i.soDot,
      amountDue: i.amount,
      dueDate: i.dueDate,
      sortOrder: i.soDot,
      matchKey: requestMatchKey(order.code, i.soDot),
    }));
  }

  return [
    {
      installmentNo: 0,
      amountDue: order.totalAmount,
      dueDate: null,
      sortOrder: 0,
      matchKey: requestMatchKey(order.code, 0),
    },
  ];
}

// ─── Báo cáo ──────────────────────────────────────────────────────────────────

export type BackfillReport = {
  apply: boolean;
  ordersScanned: number;
  /** Phiếu thu sẽ tạo (dry-run) / đã tạo (apply). */
  requestsCreated: number;
  requestsExisting: number;
  bankTxnCreated: number;
  allocationsCreated: number;
  allocatedAmount: number;
  /** Khoản Payment đã backfill từ lần chạy trước → bỏ qua. */
  paymentsSkipped: number;
  /** Khoản amount ≤ 0 (bút toán âm/hoàn) → không rót. */
  paymentsIgnored: number;
  /** Tiền dư không rót được vào phiếu nào (đơn đóng thừa). KHÔNG tạo CreditBalance. */
  leftoverCredit: number;
  /** Số khoản Payment có phần dư không rót hết được. */
  overpaidPayments: number;
  statusUpdated: number;
  byStatus: Record<RequestStatus, number>;
};

function emptyReport(apply: boolean): BackfillReport {
  return {
    apply,
    ordersScanned: 0,
    requestsCreated: 0,
    requestsExisting: 0,
    bankTxnCreated: 0,
    allocationsCreated: 0,
    allocatedAmount: 0,
    paymentsSkipped: 0,
    paymentsIgnored: 0,
    leftoverCredit: 0,
    overpaidPayments: 0,
    statusUpdated: 0,
    byStatus: { PENDING: 0, PARTIAL: 0, PAID: 0, VOID: 0 },
  };
}

// ─── Chạy ─────────────────────────────────────────────────────────────────────

const PAGE = 200;

type LoadedOrder = {
  id: string;
  code: string;
  centerId: string | null;
  totalAmount: number;
  installmentApprovalStatus: string | null;
  installments: { soDot: number; amount: number; dueDate: Date | null }[];
  payments: { id: string; amount: number; note: string | null; paidDate: Date; centerId: string | null }[];
  paymentRequests: {
    id: string;
    installmentNo: number;
    amountDue: number;
    sortOrder: number;
    status: RequestStatus;
    allocations: { amount: number; roundingWaived: number }[];
  }[];
};

/**
 * Phiếu đang làm việc trong bộ nhớ (thật khi --apply, ảo khi dry-run).
 * `waived` = tổng phần thiếu ĐÃ THA theo dung sai làm tròn ở các lần tiền về thật.
 * Bắt buộc mang theo: `deriveStatus` cần nó mới giữ được phiếu PAID — recompute mà
 * truyền waived=0 sẽ ghi đè PAID về PARTIAL (đúng cảnh báo trong payos-ingest.ts).
 */
type WorkingRequest = AllocTarget & { installmentNo: number; persisted: boolean; waived: number };

export async function runBackfill(
  opts: { apply?: boolean; allowRemote?: boolean; log?: (line: string) => void } = {},
): Promise<BackfillReport> {
  const apply = opts.apply === true;
  const log = opts.log ?? (() => {});
  if (apply) assertWritableDb(opts.allowRemote === true);

  const report = emptyReport(apply);
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
        centerId: true,
        totalAmount: true,
        installmentApprovalStatus: true,
        installments: { select: { soDot: true, amount: true, dueDate: true } },
        payments: {
          where: { deletedAt: null },
          select: { id: true, amount: true, note: true, paidDate: true, centerId: true },
        },
        paymentRequests: {
          select: {
            id: true,
            installmentNo: true,
            amountDue: true,
            sortOrder: true,
            status: true,
            allocations: { select: { amount: true, roundingWaived: true } },
          },
        },
      },
    });

    if (orders.length === 0) break;
    for (const order of orders) await processOrder(order, apply, report, log);
    report.ordersScanned += orders.length;
    skip += orders.length;
    if (orders.length < PAGE) break;
  }

  return report;
}

async function processOrder(
  order: LoadedOrder,
  apply: boolean,
  report: BackfillReport,
  log: (line: string) => void,
): Promise<void> {
  // ── 1. Phiếu thu ────────────────────────────────────────────────────────────
  const desired = planRequests(order);
  const existingByNo = new Map(order.paymentRequests.map((r) => [r.installmentNo, r]));
  const toCreate = desired.filter((d) => !existingByNo.has(d.installmentNo));

  report.requestsExisting += order.paymentRequests.length;
  report.requestsCreated += toCreate.length;

  if (apply && toCreate.length > 0) {
    await db.paymentRequest.createMany({
      data: toCreate.map((d) => ({
        orderId: order.id,
        centerId: order.centerId, // SCOPED_MODEL — create PHẢI set centerId
        installmentNo: d.installmentNo,
        amountDue: d.amountDue,
        dueDate: d.dueDate,
        matchKey: d.matchKey,
        sortOrder: d.sortOrder,
        status: "PENDING" as const,
      })),
      skipDuplicates: true,
    });
  }

  // ── 2. Dựng danh sách phiếu đang làm việc + mốc đã phân bổ ──────────────────
  let working: WorkingRequest[];
  if (apply) {
    const rows: LoadedOrder["paymentRequests"] = await db.paymentRequest.findMany({
      where: { orderId: order.id },
      select: {
        id: true,
        installmentNo: true,
        amountDue: true,
        sortOrder: true,
        status: true,
        allocations: { select: { amount: true, roundingWaived: true } },
      },
      orderBy: { sortOrder: "asc" },
    });
    working = rows.map((r) => ({
      id: r.id,
      installmentNo: r.installmentNo,
      amountDue: r.amountDue,
      allocated: r.allocations.reduce((s, a) => s + a.amount, 0),
      waived: r.allocations.reduce((s, a) => s + a.roundingWaived, 0),
      sortOrder: r.sortOrder,
      status: r.status,
      persisted: true,
    }));
  } else {
    // DRY-RUN: phiếu chưa tồn tại → id ảo, chỉ để đếm cho đúng.
    working = [
      ...order.paymentRequests.map((r) => ({
        id: r.id,
        installmentNo: r.installmentNo,
        amountDue: r.amountDue,
        allocated: r.allocations.reduce((s, a) => s + a.amount, 0),
        waived: r.allocations.reduce((s, a) => s + a.roundingWaived, 0),
        sortOrder: r.sortOrder,
        status: r.status,
        persisted: true,
      })),
      ...toCreate.map((d) => ({
        id: `dry:${order.id}:${d.installmentNo}`,
        installmentNo: d.installmentNo,
        amountDue: d.amountDue,
        allocated: 0,
        waived: 0,
        sortOrder: d.sortOrder,
        status: "PENDING" as RequestStatus,
        persisted: false,
      })),
    ].sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // ── 3. Rót tiền lịch sử theo waterfall ──────────────────────────────────────
  // Tiền vào trước lấp phiếu trước — sắp theo paidDate rồi id cho ổn định.
  const payments = [...order.payments].sort(
    (a, b) => a.paidDate.getTime() - b.paidDate.getTime() || a.id.localeCompare(b.id),
  );

  for (const p of payments) {
    if (!Number.isFinite(p.amount) || p.amount <= 0) {
      report.paymentsIgnored++; // bút toán âm / khoản 0đ → không có gì để rót
      continue;
    }

    const providerTxnId = backfillTxnId(p.id);
    const existingTxn = await db.bankTransaction.findUnique({
      where: { provider_providerTxnId: { provider: BACKFILL_PROVIDER, providerTxnId } },
      select: { id: true, _count: { select: { allocations: true } } },
    });
    if (existingTxn && existingTxn._count.allocations > 0) {
      report.paymentsSkipped++; // đã backfill lần trước — mốc `allocated` đã tính rồi
      continue;
    }

    // Khoản ghi tự động cho đợt N phải về đúng phiếu đợt N, không rót lại từ đầu.
    const soDot = markerInstallmentNo(p.note);
    const startId = soDot != null ? (working.find((w) => w.installmentNo === soDot)?.id ?? null) : null;

    const plan = planAllocation(p.amount, working, startId);
    const allocatedNow = plan.lines.reduce((s, l) => s + l.amount, 0);

    if (plan.credit > 0) {
      report.leftoverCredit += plan.credit;
      report.overpaidPayments++;
    }

    if (apply) {
      const txnId =
        existingTxn?.id ??
        (
          await db.bankTransaction.create({
            data: {
              provider: BACKFILL_PROVIDER,
              providerTxnId,
              amount: p.amount,
              transferredAt: p.paidDate,
              content: `Backfill sổ cũ · đơn ${order.code}${soDot != null ? ` · đợt ${soDot}` : ""}`,
              referenceCode: order.code,
              rawPayload: { source: "backfill-payment-requests", paymentId: p.id, orderId: order.id },
              status: allocatedNow > 0 ? "MATCHED" : "UNMATCHED",
              unmatchedNote:
                plan.credit > 0
                  ? `Backfill: ${plan.credit}đ không rót được (đơn đã đủ) — chưa tạo CreditBalance, kế toán quyết.`
                  : null,
              centerId: p.centerId ?? order.centerId,
            },
            select: { id: true },
          })
        ).id;

      if (plan.lines.length > 0) {
        await db.paymentAllocation.createMany({
          data: plan.lines.map((l) => ({
            bankTransactionId: txnId,
            paymentRequestId: l.paymentRequestId,
            amount: l.amount,
            centerId: p.centerId ?? order.centerId,
          })),
          skipDuplicates: true,
        });
      }
    }

    if (!existingTxn) report.bankTxnCreated++;
    report.allocationsCreated += plan.lines.length;
    report.allocatedAmount += allocatedNow;

    // Cập nhật mốc để khoản kế tiếp thấy đúng phần còn thiếu.
    for (const l of plan.lines) {
      const t = working.find((w) => w.id === l.paymentRequestId);
      if (t) t.allocated += l.amount;
    }
  }

  // ── 4. Tính lại trạng thái từng phiếu ───────────────────────────────────────
  for (const w of working) {
    // waived PHẢI truyền vào: phiếu đã PAID nhờ dung sai làm tròn mà recompute với
    // waived=0 sẽ bị đẩy ngược về PARTIAL — dung sai chỉ đúng được đúng một lần.
    const next = deriveStatus(w.amountDue, w.allocated, w.waived, w.status);
    report.byStatus[next]++;
    if (next === w.status) continue;
    report.statusUpdated++;
    if (apply && w.persisted) {
      await db.paymentRequest.update({ where: { id: w.id }, data: { status: next } });
    }
  }

  if (toCreate.length > 0) {
    log(
      `  ${order.code}: +${toCreate.length} phiếu · ${payments.length} khoản · ` +
        working.map((w) => `#${w.installmentNo}=${w.allocated}/${w.amountDue}`).join(" "),
    );
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return new Intl.NumberFormat("vi-VN").format(n);
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const allowRemote = process.argv.includes("--prod");

  console.log(`\n═══ BACKFILL PHIẾU THU ${apply ? "(GHI THẬT)" : "(DRY-RUN — không ghi gì)"} ═══`);
  console.log(`DB host: ${currentDbHost()}${allowRemote ? "  ⚠️  --prod: BỎ QUA chặn DB không-local" : ""}\n`);

  const r = await runBackfill({ apply, allowRemote, log: (l) => console.log(l) });

  console.log(`\n── Kết quả ──`);
  console.log(`Đơn quét:                ${r.ordersScanned}`);
  console.log(`Phiếu thu ${apply ? "đã tạo" : "sẽ tạo"}:        ${r.requestsCreated} (đã có sẵn: ${r.requestsExisting})`);
  console.log(`Giao dịch tổng hợp:      ${r.bankTxnCreated}`);
  console.log(`Dòng phân bổ:            ${r.allocationsCreated} · ${fmt(r.allocatedAmount)}đ`);
  console.log(`Khoản bỏ qua (đã làm):   ${r.paymentsSkipped}`);
  console.log(`Khoản ≤ 0đ (bỏ):         ${r.paymentsIgnored}`);
  console.log(`Tiền dư chưa rót:        ${fmt(r.leftoverCredit)}đ (${r.overpaidPayments} khoản đóng thừa)`);
  console.log(
    `Trạng thái phiếu:        PENDING ${r.byStatus.PENDING} · PARTIAL ${r.byStatus.PARTIAL} · ` +
      `PAID ${r.byStatus.PAID} · VOID ${r.byStatus.VOID}`,
  );

  if (!apply) {
    console.log(`\nDRY-RUN — chưa ghi gì. Chạy lại với \`--apply\` để ghi thật.`);
  } else {
    console.log(`\n✓ Xong. Bước kế: \`pnpm payments:shadow-compare\` để so công nợ 2 sổ.`);
  }
  console.log();
}

// Chỉ chạy CLI khi gọi trực tiếp (test import runBackfill thì KHÔNG chạy main).
if (process.argv[1] && /backfill-payment-requests/.test(process.argv[1])) {
  main()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => db.$disconnect());
}
