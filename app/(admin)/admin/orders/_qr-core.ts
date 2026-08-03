// _qr-core.ts — LOGIC THẬT của "Xuất QR theo từng đợt" (QrSession), tách khỏi
// _qr-actions.ts ("use server") vì 2 lý do — giống tiền lệ _feedback-core.ts:
//   1. Test được (tests/e2e/r7/qr-session.spec.ts): runner Playwright stub `@/lib/auth`
//      → auth() = null, wrapper action không chạy được happy-path; core nhận `actor`
//      tường minh nên spec gọi thẳng.
//   2. An toàn: MỌI export của file "use server" là HTTP endpoint — hàm nhận `actor`
//      làm tham số KHÔNG được nằm trong đó (client forge actor = leo quyền).
//      Caller hợp lệ DUY NHẤT: _qr-actions.ts (đã auth() + checkPermission) và
//      [id]/page.tsx (đã auth() + gate orders:view).
//
// ⚠️ BẤT BIẾN #3 (chủ dự án 03/08): `PaymentRequest.matchKey` là ĐỊNH DANH BỀN THEO
// ĐỜI PHIẾU. File này TUYỆT ĐỐI KHÔNG ghi/không đổi matchKey — chỉ đọc. Sale bấm
// "Tạo lại QR" lần thứ 5 thì tiền vẫn phải rơi đúng đợt đó.
//
// ⚠️ `expiresAt` CHỈ để hiển thị đếm ngược + chặn 2 QR sống song song. Nó KHÔNG phải
// cửa sổ nhận tiền: QR hết hạn mà phụ huynh vẫn chuyển thì webhook vẫn khớp về đúng
// phiếu qua matchKey. Đừng thêm điều kiện `expiresAt` vào bất kỳ đường đối khớp nào.
import "server-only";
import QRCode from "qrcode";
import type { Actor } from "@/lib/auth/actor";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { scopedDb } from "@/lib/db-scope";
import { outstandingOf, type RequestStatus } from "@/lib/payments/allocation";
import {
  createPaymentLink,
  generateProviderOrderCode,
  isPayosConfigured,
} from "@/lib/payments/payos";
import { getPaymentConfig, buildVietQrImageUrl } from "@/lib/payments/vietqr";
import { getSetting } from "@/lib/settings/service";

/** Một phiên QR đã "phẳng hoá" cho client component (Date → ISO). */
export type QrSessionView = {
  id: string;
  paymentRequestId: string;
  amountShown: number;
  /** Ảnh QR (URL img.vietqr.io) hoặc chuỗi EMVCo của cổng. */
  qrContent: string | null;
  /** Trang thanh toán của cổng (payOS) — null với QR ảnh tĩnh. */
  checkoutUrl: string | null;
  providerOrderCode: string | null;
  /** ISO — client dựng đồng hồ đếm ngược từ mốc này. */
  expiresAt: string;
  status: "ACTIVE" | "EXPIRED" | "CONSUMED";
  createdAt: string;
  /** src dùng thẳng cho <img>: URL ảnh hoặc data-URL sinh từ chuỗi EMVCo. */
  imageSrc: string | null;
  /** Định danh đối khớp của PHIẾU (nội dung CK) — hiển thị cho sale đọc cho phụ huynh. */
  matchKey: string | null;
};

export type QrIssueResult =
  | { ok: true; session: QrSessionView; reused: boolean }
  | { ok: false; error: string };

/** Phiếu thu + tổng đã phân bổ, đủ để tính phần còn thiếu. */
type LoadedRequest = {
  id: string;
  orderId: string;
  centerId: string | null;
  installmentNo: number;
  amountDue: number;
  matchKey: string | null;
  status: RequestStatus;
  sortOrder: number;
  allocated: number;
  order: { id: string; code: string; centerId: string | null };
};

/**
 * Đọc phiếu thu QUA scopedDb — phiếu thuộc cơ sở ngoài tầm nhìn trả null, và caller
 * chỉ được phép báo "không tìm thấy" (đừng lộ là nó tồn tại).
 */
async function loadScopedRequest(
  actor: Actor,
  paymentRequestId: string,
): Promise<LoadedRequest | null> {
  const row = await scopedDb(actor).paymentRequest.findUnique({
    where: { id: paymentRequestId },
    include: {
      allocations: { select: { amount: true } },
      order: { select: { id: true, code: true, centerId: true } },
    },
  });
  if (!row) return null;
  return {
    id: row.id,
    orderId: row.orderId,
    centerId: row.centerId,
    installmentNo: row.installmentNo,
    amountDue: row.amountDue,
    matchKey: row.matchKey,
    status: row.status as RequestStatus,
    sortOrder: row.sortOrder,
    allocated: row.allocations.reduce((s, a) => s + a.amount, 0),
    order: row.order,
  };
}

/** Phần CÒN THIẾU của riêng phiếu này (không phải tổng đơn). */
export function outstandingOfRequest(req: {
  id: string;
  amountDue: number;
  allocated: number;
  sortOrder: number;
  status: RequestStatus;
}): number {
  return outstandingOf(req);
}

/** URL ảnh (http…) dùng thẳng; chuỗi EMVCo của cổng → data-URL sinh tại server. */
export async function qrImageSrc(qrContent: string | null): Promise<string | null> {
  if (!qrContent) return null;
  if (/^https?:\/\//i.test(qrContent)) return qrContent;
  try {
    return await QRCode.toDataURL(qrContent, { width: 320, margin: 1 });
  } catch {
    return null;
  }
}

type QrSessionRow = {
  id: string;
  paymentRequestId: string;
  amountShown: number;
  qrContent: string | null;
  checkoutUrl: string | null;
  providerOrderCode: string | null;
  expiresAt: Date;
  status: string;
  createdAt: Date;
};

async function toView(row: QrSessionRow, matchKey: string | null): Promise<QrSessionView> {
  return {
    id: row.id,
    paymentRequestId: row.paymentRequestId,
    amountShown: row.amountShown,
    qrContent: row.qrContent,
    checkoutUrl: row.checkoutUrl,
    providerOrderCode: row.providerOrderCode,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    status: row.status as QrSessionView["status"],
    imageSrc: await qrImageSrc(row.qrContent),
    matchKey,
  };
}

const QR_SESSION_SELECT = {
  id: true,
  paymentRequestId: true,
  amountShown: true,
  qrContent: true,
  checkoutUrl: true,
  providerOrderCode: true,
  expiresAt: true,
  status: true,
  createdAt: true,
  centerId: true,
} as const;

/**
 * Phiên ACTIVE CÒN HẠN mới nhất của từng phiếu (cho lần render đầu của trang đơn).
 * Đọc qua scopedDb → phiếu/phiên cơ sở khác không lọt sang.
 */
export async function loadActiveQrSessions(
  actor: Actor,
  requests: { id: string; matchKey: string | null }[],
): Promise<Record<string, QrSessionView>> {
  if (requests.length === 0) return {};
  const rows = await scopedDb(actor).qrSession.findMany({
    where: {
      paymentRequestId: { in: requests.map((r) => r.id) },
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: QR_SESSION_SELECT,
  });
  const matchKeyById = new Map(requests.map((r) => [r.id, r.matchKey]));
  const out: Record<string, QrSessionView> = {};
  for (const row of rows) {
    // orderBy desc → bản ghi đầu tiên gặp là mới nhất; bỏ qua bản sau.
    if (out[row.paymentRequestId]) continue;
    out[row.paymentRequestId] = await toView(row, matchKeyById.get(row.paymentRequestId) ?? null);
  }
  return out;
}

/** Nội dung đối khớp in lên QR: ưu tiên matchKey của phiếu, lùi về mã đơn. */
function addInfoFor(req: LoadedRequest): string {
  // matchKey null = phiếu tạo trước khi có định danh per-đợt → lùi về mã đơn (khớp
  // MỨC ĐƠN như hành vi cũ của webhook SePay). KHÔNG tự sinh/ghi matchKey ở đây.
  return req.matchKey ?? req.order.code.replace(/-/g, "");
}

type QrPayload = {
  qrContent: string | null;
  checkoutUrl: string | null;
  providerOrderCode: string | null;
};

/**
 * Dựng nội dung QR cho số tiền `amount`.
 *
 * payOS đã cấu hình → xin link/QR của cổng (`providerOrderCode` là đường tra dự
 * phòng của webhook: providerOrderCode → QrSession → phiếu thu). Cổng chưa cấu hình
 * HOẶC trả lỗi → lùi về QR ảnh tĩnh VietQR với `addInfo = matchKey`, tức vẫn đối
 * khớp theo ĐỊNH DANH chứ không theo số tiền. Không có nhánh nào ném lỗi ra ngoài:
 * cổng chết không được phép làm sale không thu được tiền.
 */
async function buildQrPayload(
  req: LoadedRequest,
  amount: number,
  expiresAt: Date,
): Promise<QrPayload | null> {
  const addInfo = addInfoFor(req);

  if (isPayosConfigured()) {
    const link = await createPaymentLink({
      orderCode: generateProviderOrderCode(),
      // Mô tả CHÍNH LÀ định danh đối khớp — webhook payOS đọc `description` để tra
      // matchKey (collectMatchKeyCandidates). Đổi chuỗi này là gãy đối khớp.
      description: addInfo,
      amount,
      expiresAt,
    });
    if (link.ok) {
      return {
        qrContent: link.data.qrContent,
        checkoutUrl: link.data.checkoutUrl,
        providerOrderCode: String(link.data.providerOrderCode),
      };
    }
  }

  const cfg = await getPaymentConfig(req.order.centerId ?? req.centerId);
  const imageUrl = buildVietQrImageUrl(cfg, amount, addInfo);
  if (!imageUrl) return null;
  return { qrContent: imageUrl, checkoutUrl: null, providerOrderCode: null };
}

function guardIssuable(req: LoadedRequest): string | null {
  if (req.status === "PAID") return "Phiếu thu đã đóng đủ — không xuất QR nữa";
  if (req.status === "VOID") return "Phiếu thu đã huỷ — không xuất QR";
  if (outstandingOfRequest(req) <= 0) return "Phiếu thu không còn khoản phải thu";
  return null;
}

async function createSession(
  actor: Actor,
  auditActor: AuditActor,
  req: LoadedRequest,
): Promise<QrIssueResult> {
  const amount = outstandingOfRequest(req);
  const ttlMinutes = await getSetting("payment.qrTtlMinutes");
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);
  const payload = await buildQrPayload(req, amount, expiresAt);
  if (!payload) {
    return {
      ok: false,
      error: "Chưa cấu hình tài khoản nhận tiền cho cơ sở này (Tích hợp → VietQR)",
    };
  }

  // ⚠️ scopedDb KHÔNG che write — nhưng `req` đã qua findUnique có scope ở trên,
  // và centerId ghi xuống lấy TỪ chính phiếu (không nhận từ client).
  const row = await scopedDb(actor).qrSession.create({
    data: {
      paymentRequestId: req.id,
      centerId: req.centerId ?? req.order.centerId,
      amountShown: amount,
      qrContent: payload.qrContent,
      checkoutUrl: payload.checkoutUrl,
      providerOrderCode: payload.providerOrderCode,
      expiresAt,
      status: "ACTIVE",
      createdById: auditActor.id,
      createdByName: auditActor.name,
    },
    select: QR_SESSION_SELECT,
  });

  return { ok: true, session: await toView(row, req.matchKey), reused: false };
}

/**
 * Xuất QR cho MỘT phiếu thu.
 *
 * Idempotent theo phiên: phiếu còn QrSession ACTIVE chưa quá hạn → TRẢ LẠI phiên đó,
 * không tạo mới (sale bấm 2 lần không ra 2 mã).
 * Số tiền in trên QR = phần CÒN THIẾU CỦA PHIẾU (`outstandingOf`), không phải tổng đơn.
 */
export async function issueQrForRequestCore(
  actor: Actor,
  auditActor: AuditActor,
  input: { paymentRequestId: string },
): Promise<QrIssueResult> {
  const req = await loadScopedRequest(actor, input.paymentRequestId);
  // Cách ly cơ sở: ngoài tầm nhìn → "không tìm thấy" (đừng lộ là phiếu có tồn tại).
  if (!req) return { ok: false, error: "Không tìm thấy phiếu thu" };

  const blocked = guardIssuable(req);
  if (blocked) return { ok: false, error: blocked };

  const live = await scopedDb(actor).qrSession.findFirst({
    where: { paymentRequestId: req.id, status: "ACTIVE", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: QR_SESSION_SELECT,
  });
  if (live) {
    // Không ghi audit cho lượt tái sử dụng — không có gì thay đổi trong hệ thống.
    return { ok: true, session: await toView(live, req.matchKey), reused: true };
  }

  const res = await createSession(actor, auditActor, req);
  if (!res.ok) return res;
  await writeAudit({
    actor: auditActor,
    module: "finance",
    entityType: "QrSession",
    entityId: res.session.id,
    action: "qr.issue",
    newValues: {
      paymentRequestId: req.id,
      orderId: req.orderId,
      installmentNo: req.installmentNo,
      amountShown: res.session.amountShown,
      expiresAt: res.session.expiresAt,
    },
    orgUnitId: null,
  });
  return res;
}

/**
 * Tạo lại QR: đóng MỌI phiên ACTIVE của phiếu về EXPIRED rồi mở phiên mới TRÊN CÙNG
 * `PaymentRequest`.
 *
 * ⚠️ KHÔNG đụng `matchKey` — tạo lại lần thứ N vẫn cùng định danh đối khớp, nên tiền
 * của các QR cũ (phụ huynh quét mã cũ) vẫn rơi đúng phiếu này.
 */
export async function regenerateQrCore(
  actor: Actor,
  auditActor: AuditActor,
  input: { paymentRequestId: string },
): Promise<QrIssueResult> {
  const req = await loadScopedRequest(actor, input.paymentRequestId);
  if (!req) return { ok: false, error: "Không tìm thấy phiếu thu" };

  const blocked = guardIssuable(req);
  if (blocked) return { ok: false, error: blocked };

  // updateMany KHÔNG được scopedDb che — an toàn vì `where` neo vào phiếu đã qua
  // findUnique có scope ở trên (không nhận centerId/where từ client).
  await scopedDb(actor).qrSession.updateMany({
    where: { paymentRequestId: req.id, status: "ACTIVE" },
    data: { status: "EXPIRED" },
  });

  const res = await createSession(actor, auditActor, req);
  if (!res.ok) return res;
  await writeAudit({
    actor: auditActor,
    module: "finance",
    entityType: "QrSession",
    entityId: res.session.id,
    action: "qr.regenerate",
    newValues: {
      paymentRequestId: req.id,
      orderId: req.orderId,
      installmentNo: req.installmentNo,
      amountShown: res.session.amountShown,
      expiresAt: res.session.expiresAt,
      // Ghi lại để đối chiếu: định danh đối khớp KHÔNG đổi qua các lần tạo lại.
      matchKey: req.matchKey,
    },
    orgUnitId: null,
  });
  return res;
}
