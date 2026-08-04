import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/service";
import { ensureParentAccountForOrder } from "@/lib/parents/provision";
import { sendEmailForTrigger } from "@/lib/email/trigger";
import { notifyOrderByZnsIfNoEmail } from "@/lib/notify/order";
import { extractOrderCode } from "@/lib/payments/sepay";
import {
  planAllocation,
  deriveStatus,
  isOrderSettled,
  type AllocTarget,
  type RequestStatus,
} from "./allocation";
import { PAYOS_PROVIDER } from "./payos";

// =============================================================================
// 03/08 — THÂN XỬ LÝ webhook payOS: tiền về → ghi sổ → phân bổ theo waterfall.
// Route `app/api/public/webhook/payos/route.ts` chỉ còn vỏ (verify chữ ký + gọi
// hàm này) để test được ở tầng service, không phải dựng HTTP.
//
// ⚠️ BẤT BIẾN (vi phạm là tái tạo đúng con bug đang sửa):
//  1. `QrSession.expiresAt` TUYỆT ĐỐI KHÔNG phải điều kiện đối khớp. QR hết hạn
//     30 phút mà tiền vẫn về thì tiền đó VẪN phân bổ bình thường — hạn dùng chỉ
//     để hiển thị đếm ngược và chặn 2 QR ACTIVE ở màn sale.
//  2. SỐ TIỀN không phải khoá đối khớp — chỉ dùng để phân bổ. Thiếu → PARTIAL,
//     dư → CreditBalance. Không bao giờ từ chối vì lệch tiền.
//  3. Ngoại lệ THẬT duy nhất rơi vào xử lý tay = không tra ra phiếu thu nào
//     (UNMATCHED). Tiền vẫn nằm nguyên trong `BankTransaction`, không mất.
//  4. KHÔNG gọi API ngoài (email/ZNS/cấp tài khoản) BÊN TRONG transaction.
// =============================================================================

/** Payload `data` của webhook payOS (chỉ khai field ta dùng; cổng gửi thêm nhiều). */
export type PayosWebhookData = {
  orderCode?: number | string;
  amount?: number | string;
  description?: string;
  accountNumber?: string;
  reference?: string;
  transactionDateTime?: string;
  currency?: string;
  paymentLinkId?: string;
  code?: string;
  desc?: string;
  counterAccountBankId?: string | null;
  counterAccountBankName?: string | null;
  counterAccountName?: string | null;
  counterAccountNumber?: string | null;
  virtualAccountName?: string | null;
  virtualAccountNumber?: string | null;
  [k: string]: unknown;
};

export type IngestOutcome =
  /** Giao dịch đã ghi nhận trước đó → không làm gì thêm (cổng retry là chuyện thường). */
  | { status: "DUPLICATE"; bankTransactionId: string }
  /** Không tra ra phiếu thu → chờ kế toán xử lý tay. Tiền đã ghi sổ. */
  | { status: "UNMATCHED"; bankTransactionId: string; reason: string }
  | {
      status: "MATCHED";
      bankTransactionId: string;
      orderId: string;
      paymentRequestId: string;
      /** Tổng đã rót vào các phiếu thu trong lần này. */
      allocated: number;
      /** Tiền dư → CreditBalance. */
      credit: number;
      /** Phần thiếu được tha theo dung sai làm tròn. */
      waived: number;
      settled: boolean;
      orderConfirmed: boolean;
    }
  /** Payload không phải giao dịch tiền vào hợp lệ (ping đăng ký webhook, số tiền ≤ 0…). */
  | { status: "IGNORED"; reason: string }
  | { status: "ERROR"; reason: string };

// ── Log ─────────────────────────────────────────────────────────────────────
export async function logPayos(params: {
  action: string;
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  payload: unknown;
  response?: unknown;
  error?: string;
}): Promise<void> {
  await db.integrationLog
    .create({
      data: {
        provider: PAYOS_PROVIDER,
        direction: "PULL",
        action: params.action,
        status: params.status,
        requestPayload: (params.payload ?? {}) as Prisma.InputJsonValue,
        responsePayload: (params.response ?? undefined) as Prisma.InputJsonValue | undefined,
        errorMessage: params.error ?? null,
      },
    })
    .catch(() => {});
}

// ── Trích khoá đối khớp (THUẦN) ─────────────────────────────────────────────
/**
 * Ứng viên `matchKey` lấy từ payload, THEO THỨ TỰ ƯU TIÊN:
 *  1. `virtualAccountNumber` — VA cấp riêng cho phiếu thu (đường bền nhất).
 *  2. `reference` — mã tham chiếu giao dịch.
 *  3. Nội dung chuyển khoản: cả chuỗi, rồi từng token ≥ 6 ký tự (ngân hàng hay
 *     chèn thêm chữ vào nội dung).
 * `matchKey` là @unique nên dò theo danh sách này không sợ đụng nhầm phiếu khác.
 */
export function collectMatchKeyCandidates(data: PayosWebhookData): string[] {
  const out: string[] = [];
  const push = (v: unknown, min = 4) => {
    if (typeof v !== "string") return;
    const s = v.trim();
    if (s.length >= min) out.push(s);
  };

  push(data.virtualAccountNumber);
  push(data.reference);

  const desc = typeof data.description === "string" ? data.description.trim() : "";
  if (desc) {
    push(desc);
    for (const tok of desc.split(/[^A-Za-z0-9_-]+/)) push(tok, 6);
  }
  return [...new Set(out)];
}

/** Định danh giao dịch dùng làm khoá idempotency (@@unique[provider, providerTxnId]). */
export function resolveProviderTxnId(data: PayosWebhookData): string | null {
  const pick = (v: unknown): string | null => {
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    return null;
  };
  // `reference` = mã giao dịch ngân hàng (bền nhất). Thiếu thì lùi về id link,
  // cuối cùng là orderCode (mỗi lần xuất QR một mã nên vẫn duy nhất).
  return pick(data.reference) ?? pick(data.paymentLinkId) ?? pick(data.orderCode);
}

/**
 * payOS gọi thử 1 phát khi ĐĂNG KÝ webhook URL (orderCode 123 / mô tả VQRIO123).
 * Nhận diện để khỏi đẻ giao dịch rác UNMATCHED mỗi lần cấu hình lại cổng.
 */
export function isPayosVerificationPing(data: PayosWebhookData): boolean {
  const desc = typeof data.description === "string" ? data.description : "";
  return String(data.orderCode ?? "") === "123" && /VQRIO123/i.test(desc);
}

function parseTransferredAt(raw: unknown): Date {
  if (typeof raw === "string" && raw.trim()) {
    const d = new Date(raw.trim());
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

// ── Tra đích phân bổ ────────────────────────────────────────────────────────
export type MatchTarget = {
  paymentRequestId: string;
  orderId: string;
  via: "matchKey" | "qrSession" | "orderCode";
  qrSessionId?: string;
};

/**
 * Tìm phiếu thu đích: (a) `matchKey` → (b) `providerOrderCode` → QrSession → phiếu.
 *
 * ⚠️ Nhánh (b) KHÔNG được lọc theo `expiresAt`/`status` của QrSession. Sale xuất
 * lại QR 5 lần thì có 5 session cùng trỏ 1 phiếu thu; PH quét cái nào, hết hạn
 * bao lâu, tiền cũng phải về đúng phiếu đó.
 */
export async function resolvePaymentTarget(data: PayosWebhookData): Promise<MatchTarget | null> {
  const candidates = collectMatchKeyCandidates(data);
  if (candidates.length > 0) {
    const rows = await db.paymentRequest.findMany({
      where: { matchKey: { in: candidates } },
      select: { id: true, orderId: true, matchKey: true },
    });
    for (const c of candidates) {
      const hit = rows.find((r) => r.matchKey === c);
      if (hit) return { paymentRequestId: hit.id, orderId: hit.orderId, via: "matchKey" };
    }
  }

  const orderCode = data.orderCode != null ? String(data.orderCode).trim() : "";
  if (orderCode) {
    const session = await db.qrSession.findUnique({
      where: { providerOrderCode: orderCode },
      select: { id: true, paymentRequest: { select: { id: true, orderId: true } } },
    });
    if (session?.paymentRequest) {
      return {
        paymentRequestId: session.paymentRequest.id,
        orderId: session.paymentRequest.orderId,
        via: "qrSession",
        qrSessionId: session.id,
      };
    }
  }

  // (c) Chỉ ra được MÃ ĐƠN, không ra đợt — nội dung CK của khách chuyển tay, hoặc
  // QR cũ in trước khi có định danh theo đợt. Vẫn phải nhận tiền: neo vào phiếu
  // chưa đóng đủ sớm nhất của đơn rồi để waterfall lo phần còn lại. Không map
  // được đợt KHÔNG phải lý do đẩy sang xử lý tay.
  for (const c of collectMatchKeyCandidates(data)) {
    const code = extractOrderCode(c);
    if (!code) continue;
    const order = await db.order.findUnique({
      where: { code },
      select: {
        id: true,
        paymentRequests: {
          where: { status: { in: ["PENDING", "PARTIAL"] } },
          orderBy: [{ sortOrder: "asc" }, { installmentNo: "asc" }],
          select: { id: true },
          take: 1,
        },
      },
    });
    const first = order?.paymentRequests[0];
    if (order && first) {
      return { paymentRequestId: first.id, orderId: order.id, via: "orderCode" };
    }
  }
  return null;
}

// ── Thân xử lý ──────────────────────────────────────────────────────────────
type TxResult =
  | { kind: "DUPLICATE" }
  | {
      kind: "MATCHED";
      allocated: number;
      credit: number;
      waived: number;
      settled: boolean;
    };

/**
 * Ghi nhận + phân bổ MỘT giao dịch tiền về. Idempotent theo `providerTxnId`.
 * Gọi được thẳng từ test (không cần HTTP) — route chỉ là vỏ.
 *
 * `provider` tham số hoá vì hai cổng dùng CHUNG đường này: payOS (khi đã xác thực
 * doanh nghiệp xong) và SePay (đang chạy thật). Khác nhau chỉ ở khâu đọc payload
 * — phần ghi sổ, phân bổ, chống đua, side-effect sau commit là một.
 */
export async function ingestPayosWebhook(
  data: PayosWebhookData,
  provider: string = PAYOS_PROVIDER,
): Promise<IngestOutcome> {
  if (isPayosVerificationPing(data)) {
    return { status: "IGNORED", reason: "Ping xác thực webhook của payOS" };
  }

  const amount = Math.round(Number(data.amount ?? 0));
  if (!Number.isFinite(amount) || amount <= 0) {
    await logPayos({
      action: "INGEST_TXN",
      status: "SKIPPED",
      payload: data,
      error: "Số tiền không hợp lệ",
    });
    return { status: "IGNORED", reason: "Số tiền không hợp lệ" };
  }

  const providerTxnId = resolveProviderTxnId(data);
  if (!providerTxnId) {
    await logPayos({
      action: "INGEST_TXN",
      status: "FAILED",
      payload: data,
      error: "Thiếu định danh giao dịch (reference/paymentLinkId/orderCode)",
    });
    return { status: "IGNORED", reason: "Thiếu định danh giao dịch" };
  }

  const where = { provider_providerTxnId: { provider, providerTxnId } };

  // ── Bước 2: upsert BankTransaction (khoá idempotency) ─────────────────────
  let txn = await db.bankTransaction.findUnique({ where });
  if (txn && txn.status !== "UNMATCHED") {
    // Đã xử lý xong rồi → trả ngay, KHÔNG phân bổ lần 2.
    await logPayos({ action: "INGEST_TXN", status: "SKIPPED", payload: data, error: "Đã ghi nhận" });
    return { status: "DUPLICATE", bankTransactionId: txn.id };
  }
  if (!txn) {
    const createData = {
      provider,
      providerTxnId,
      amount,
      transferredAt: parseTransferredAt(data.transactionDateTime),
      accountNumber:
        (typeof data.accountNumber === "string" ? data.accountNumber : null) ??
        (typeof data.virtualAccountNumber === "string" ? data.virtualAccountNumber : null),
      referenceCode: typeof data.reference === "string" ? data.reference : null,
      content: typeof data.description === "string" ? data.description : null,
      rawPayload: data as Prisma.InputJsonValue,
    };
    try {
      txn = await db.bankTransaction.create({ data: createData });
    } catch (err) {
      if (!isUniqueViolation(err)) {
        const message = err instanceof Error ? err.message : "Unknown";
        await logPayos({ action: "INGEST_TXN", status: "FAILED", payload: data, error: message });
        return { status: "ERROR", reason: message };
      }
      // Hai webhook cùng giao dịch chạy song song → cái thua đọc lại bản của cái thắng.
      txn = await db.bankTransaction.findUnique({ where });
      if (!txn) return { status: "ERROR", reason: "Không đọc lại được giao dịch vừa tạo" };
      if (txn.status !== "UNMATCHED") {
        return { status: "DUPLICATE", bankTransactionId: txn.id };
      }
    }
  }
  const bankTransactionId = txn.id;

  // ── Bước 4: tra đích phân bổ ──────────────────────────────────────────────
  const target = await resolvePaymentTarget(data);
  if (!target) {
    const note =
      `Không tra ra phiếu thu. orderCode=${data.orderCode ?? "-"}, ` +
      `VA=${data.virtualAccountNumber ?? "-"}, ref=${data.reference ?? "-"}, ` +
      `nội dung="${data.description ?? "-"}"`;
    await db.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { status: "UNMATCHED", unmatchedNote: note },
    });
    await logPayos({ action: "MATCH_TXN", status: "FAILED", payload: data, error: note });
    return { status: "UNMATCHED", bankTransactionId, reason: note };
  }

  const order = await db.order.findUnique({
    where: { id: target.orderId },
    select: {
      id: true,
      code: true,
      status: true,
      centerId: true,
      orgUnitId: true,
      studentId: true,
      student: { select: { id: true, parentUserId: true } },
    },
  });
  if (!order) {
    const note = `Phiếu thu ${target.paymentRequestId} trỏ tới đơn không tồn tại`;
    await db.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { status: "UNMATCHED", unmatchedNote: note },
    });
    await logPayos({ action: "MATCH_TXN", status: "FAILED", payload: data, error: note });
    return { status: "UNMATCHED", bankTransactionId, reason: note };
  }

  // Dung sai làm tròn — đọc TRƯỚC transaction (getSetting tự truy vấn DB riêng,
  // gọi trong transaction là mời deadlock pool).
  const tolerance = await getSetting("payment.roundingToleranceVnd", {
    orgUnitId: order.orgUnitId,
  }).catch(() => 5_000);

  // ── Bước 3/5/6/7: transaction + advisory lock theo đơn ────────────────────
  let result: TxResult;
  try {
    result = await db.$transaction(async (tx) => {
      // ⚠️ PHẢI $executeRaw, KHÔNG $queryRaw: `pg_advisory_xact_lock()` trả kiểu
      // `void`, Prisma sẽ ném "Failed to deserialize column of type 'void'"
      // (đúng con bug PR #76 — test hồi quy tests/e2e/a0/zalo-token-lock.spec.ts).
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${order.id})::bigint)`;

      // Trong khoá mới đọc lại trạng thái giao dịch: hai webhook cùng txn chạy
      // song song thì cái vào sau thấy MATCHED và rút lui, không rót tiền 2 lần.
      const fresh = await tx.bankTransaction.findUnique({
        where: { id: bankTransactionId },
        select: { status: true },
      });
      if (!fresh || fresh.status !== "UNMATCHED") return { kind: "DUPLICATE" as const };

      const rows = await tx.paymentRequest.findMany({
        where: { orderId: order.id },
        select: {
          id: true,
          amountDue: true,
          sortOrder: true,
          status: true,
          allocations: { select: { amount: true } },
        },
        orderBy: { sortOrder: "asc" },
      });
      if (rows.length === 0) {
        // Phiếu vừa bị xoá giữa chừng — coi như không tra ra.
        throw new NoRequestError();
      }

      const targets: AllocTarget[] = rows.map((r) => ({
        id: r.id,
        amountDue: r.amountDue,
        allocated: r.allocations.reduce((s, a) => s + a.amount, 0),
        sortOrder: r.sortOrder,
        status: r.status as RequestStatus,
      }));

      const plan = planAllocation(amount, targets, target.paymentRequestId, tolerance);

      if (plan.lines.length > 0) {
        await tx.paymentAllocation.createMany({
          data: plan.lines.map((l) => ({
            bankTransactionId,
            paymentRequestId: l.paymentRequestId,
            amount: l.amount,
            // PHẢI lưu phần tha: `deriveStatus` cần nó mới coi phiếu là PAID. Không
            // lưu thì mọi lần tính lại trạng thái sau này (recomputeRequestStatuses)
            // truyền waived=0 và ghi đè PAID về PARTIAL — dung sai chỉ đúng 1 lần.
            roundingWaived: l.roundingWaived,
            centerId: order.centerId,
          })),
          skipDuplicates: true,
        });
      }

      // Tính lại status TỪ SỔ (không cộng nhẩm): đọc tổng phân bổ + tổng phần tha
      // thực tế sau ghi, để kết quả trùng khớp với mọi lần recompute về sau.
      const affected = plan.lines.map((l) => l.paymentRequestId);
      const sums =
        affected.length > 0
          ? await tx.paymentAllocation.groupBy({
              by: ["paymentRequestId"],
              where: { paymentRequestId: { in: affected } },
              _sum: { amount: true, roundingWaived: true },
            })
          : [];
      const rowOf = (id: string) => sums.find((s) => s.paymentRequestId === id);
      const sumOf = (id: string) => rowOf(id)?._sum.amount ?? 0;
      const waivedOf = (id: string) => rowOf(id)?._sum.roundingWaived ?? 0;

      const statusById = new Map<string, RequestStatus>(
        targets.map((t) => [t.id, t.status]),
      );
      for (const line of plan.lines) {
        const row = rows.find((r) => r.id === line.paymentRequestId)!;
        const next = deriveStatus(
          row.amountDue,
          sumOf(line.paymentRequestId),
          waivedOf(line.paymentRequestId),
          row.status as RequestStatus,
        );
        statusById.set(line.paymentRequestId, next);
        if (next !== row.status) {
          await tx.paymentRequest.update({
            where: { id: line.paymentRequestId },
            data: { status: next },
          });
        }
      }

      await tx.bankTransaction.update({
        where: { id: bankTransactionId },
        data: { status: "MATCHED", centerId: order.centerId, unmatchedNote: null },
      });

      // QR đã dùng → đánh dấu CONSUMED (chỉ để hiển thị; KHÔNG bao giờ là điều
      // kiện đối khớp — session CONSUMED/EXPIRED vẫn tra ra phiếu như thường).
      if (target.qrSessionId) {
        await tx.qrSession.updateMany({
          where: { id: target.qrSessionId, status: { not: "CONSUMED" } },
          data: { status: "CONSUMED" },
        });
      }

      if (plan.credit > 0) {
        await tx.creditBalance.create({
          data: {
            parentUserId: order.student?.parentUserId ?? null,
            studentId: order.studentId,
            orderId: order.id,
            bankTransactionId,
            centerId: order.centerId,
            amount: plan.credit,
            note: `Tiền dư từ giao dịch ${provider} ${providerTxnId} (đơn ${order.code})`,
          },
        });
      }

      const allocated = plan.lines.reduce((s, l) => s + l.amount, 0);
      const waived = plan.lines.reduce((s, l) => s + l.roundingWaived, 0);

      // ── Ghi SỔ CŨ song song (giai đoạn trước cutover) ───────────────────────
      // Cờ PAYMENT_LEDGER_V2 còn TẮT ⇒ công nợ hiển thị (màn /cong-no, học phí của
      // phụ huynh, dashboard) VẪN đọc `Payment`. Không ghi sang đó thì đơn thanh
      // toán qua payOS hiện ra "chưa đóng đồng nào" ở mọi màn tiền — đúng cái bẫy
      // sẽ nổ nếu bật payOS trước khi cutover.
      //
      // Marker RIÊNG `[auto:payos:<txn>]`, KHÔNG dùng lại [auto:order-confirm] /
      // [auto:order-installment:dotN]: hai marker đó idempotent theo (orderId, soDot)
      // nên lần đóng thứ hai vào CÙNG một đợt (trả thiếu rồi trả bù) sẽ bị nuốt →
      // sổ cũ thiếu tiền. Neo theo mã giao dịch thì mỗi lần tiền về là một dòng,
      // và webhook retry vẫn idempotent vì cùng providerTxnId.
      if (allocated > 0) {
        const marker = `[auto:${provider.toLowerCase()}:${providerTxnId}]`;
        const dup = await tx.payment.findFirst({
          where: { orderId: order.id, deletedAt: null, note: { contains: marker } },
          select: { id: true },
        });
        if (!dup) {
          await tx.payment.create({
            data: {
              orderId: order.id,
              amount: allocated,
              method: provider.toLowerCase(),
              paidDate: new Date(),
              note: `Tiền về qua ${provider} ${providerTxnId} ${marker}`,
              saleStatus: "RECORDED",
              accountantStatus: "PENDING",
              recordedById: null,
              centerId: order.centerId,
            },
          });
        }
      }
      return {
        kind: "MATCHED" as const,
        allocated,
        credit: plan.credit,
        waived,
        settled: isOrderSettled([...statusById.values()]),
      };
    });
  } catch (err) {
    if (err instanceof NoRequestError) {
      const note = "Đơn không còn phiếu thu nào để phân bổ";
      await db.bankTransaction
        .update({
          where: { id: bankTransactionId },
          data: { status: "UNMATCHED", unmatchedNote: note },
        })
        .catch(() => {});
      await logPayos({ action: "MATCH_TXN", status: "FAILED", payload: data, error: note });
      return { status: "UNMATCHED", bankTransactionId, reason: note };
    }
    const message = err instanceof Error ? err.message : "Unknown";
    await logPayos({ action: "ALLOCATE_TXN", status: "FAILED", payload: data, error: message });
    return { status: "ERROR", reason: message };
  }

  if (result.kind === "DUPLICATE") {
    return { status: "DUPLICATE", bankTransactionId };
  }

  // ── Bước 8: SAU commit mới tới side-effect (không API ngoài trong transaction) ──
  let orderConfirmed = false;
  if (result.settled) {
    orderConfirmed = await confirmSettledOrder(order.id, amount, providerTxnId);
    if (orderConfirmed) {
      await ensureParentAccountForOrder(order.id).catch((err) =>
        console.error("[payos] provision parent:", err),
      );
      await sendOrderReceipt(order.id).catch((err) => console.error("[payos] receipt:", err));
    }
  }

  if (result.waived > 0) {
    await logPayos({
      action: "ROUNDING_WAIVED",
      status: "SUCCESS",
      payload: data,
      response: {
        orderId: order.id,
        orderCode: order.code,
        waived: result.waived,
        tolerance,
        paymentRequestId: target.paymentRequestId,
      },
    });
  }

  await logPayos({
    action: "MATCH_TXN",
    status: "SUCCESS",
    payload: data,
    response: {
      orderId: order.id,
      orderCode: order.code,
      via: target.via,
      paymentRequestId: target.paymentRequestId,
      allocated: result.allocated,
      credit: result.credit,
      waived: result.waived,
      settled: result.settled,
      orderConfirmed,
    },
  });

  return {
    status: "MATCHED",
    bankTransactionId,
    orderId: order.id,
    paymentRequestId: target.paymentRequestId,
    allocated: result.allocated,
    credit: result.credit,
    waived: result.waived,
    settled: result.settled,
    orderConfirmed,
  };
}

/** Đơn không còn phiếu thu (bị xoá giữa chừng) — rollback transaction rồi ghi UNMATCHED. */
class NoRequestError extends Error {
  constructor() {
    super("NO_PAYMENT_REQUEST");
  }
}

/**
 * Đơn đã đóng đủ → CONFIRMED. `updateMany` có điều kiện `PENDING_PAYMENT` để hai
 * luồng song song chỉ một cái đổi được trạng thái; trả về true = CHÍNH luồng này
 * vừa chuyển (chỉ khi đó mới gửi biên nhận, tránh gửi trùng).
 */
async function confirmSettledOrder(
  orderId: string,
  amount: number,
  providerTxnId: string,
): Promise<boolean> {
  const now = new Date();
  // Giảm giá do nhân viên nhập tay phải được QLCS duyệt TRƯỚC khi đơn được xác
  // nhận (BGĐ 31/07). Tiền vẫn được ghi nhận và phân bổ bình thường — bất biến
  // "không bao giờ từ chối vì lệch/điều kiện" chỉ nói về việc NHẬN tiền; chốt đơn
  // là việc khác. Thiếu guard này thì quét QR trở thành đường lách duyệt giảm giá.
  const upd = await db.order.updateMany({
    where: {
      id: orderId,
      status: "PENDING_PAYMENT",
      // ⚠️ KHÔNG dùng `NOT: { in: [...] }`: cột này NULL ở ca BÌNH THƯỜNG (đơn
      // không giảm giá), mà `NOT (col IN (...))` với NULL cho ra NULL — không
      // phải true — nên sẽ loại luôn mọi đơn bình thường và KHÔNG đơn nào tự
      // chốt được nữa. Phải liệt kê tường minh nhánh NULL.
      OR: [
        { discountApprovalStatus: null },
        { discountApprovalStatus: { notIn: ["PENDING_APPROVAL", "REJECTED"] } },
      ],
    },
    data: {
      status: "CONFIRMED",
      confirmedAt: now,
      paidAt: now,
      gatewayTxnId: providerTxnId,
    },
  });
  if (upd.count === 0) return false;

  await db.orderStatusHistory
    .create({
      data: {
        orderId,
        fromStatus: "PENDING_PAYMENT",
        toStatus: "CONFIRMED",
        changedByUserId: null,
        changedByName: "Cổng thanh toán (webhook)",
        reason: `Tự động xác nhận: đã thu đủ mọi đợt (giao dịch cuối ${amount.toLocaleString(
          "vi-VN",
        )}đ, ref ${providerTxnId})`,
      },
    })
    .catch((err) => console.error("[payos] order history:", err));
  return true;
}

/**
 * Biên nhận sau khi đơn được xác nhận — mirror `sendOrderReceipt` của webhook
 * SePay: khách có email → email PAYMENT_RECEIPT; chỉ có SĐT → ZNS học phí.
 * Best-effort: lỗi thông báo KHÔNG được làm webhook trả 500 (tiền đã ghi sổ xong,
 * payOS retry sẽ đi vào nhánh DUPLICATE và không gửi lại gì).
 */
async function sendOrderReceipt(orderId: string): Promise<void> {
  const order = await db.order
    .findUnique({
      where: { id: orderId },
      select: {
        id: true,
        code: true,
        customerEmail: true,
        customerName: true,
        totalAmount: true,
        paidAt: true,
        paymentMethod: { select: { name: true } },
      },
    })
    .catch(() => null);
  if (!order) return;

  if (order.customerEmail?.trim()) {
    await sendEmailForTrigger({
      trigger: "PAYMENT_RECEIPT",
      recipient: { email: order.customerEmail, name: order.customerName },
      vars: {
        customer_name: order.customerName,
        order_code: order.code,
        total_amount: order.totalAmount,
        payment_method: order.paymentMethod?.name ?? "Chuyển khoản (payOS)",
        paid_at: order.paidAt ?? new Date(),
      },
      context: { type: "Order", id: order.id },
      triggerType: "SYSTEM",
      actor: { userId: null, name: "payOS webhook" },
    }).catch((err) => console.error("[payos] PAYMENT_RECEIPT email:", err));
  }

  await notifyOrderByZnsIfNoEmail(order.id).catch((err) =>
    console.error("[payos] ZNS receipt:", err),
  );
}
