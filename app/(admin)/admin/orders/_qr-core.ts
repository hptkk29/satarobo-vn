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
// đơn (matchKey với QR cũ, SĐT trong nội dung CK với QR mới). Đừng thêm điều kiện
// `expiresAt` vào bất kỳ đường đối khớp nào.
//
// ⚠️ 20/08 — NỘI DUNG CK in ra nay là dạng người đọc `HoTenCon_SdtPH_TenKhoa`, KHÔNG
// còn là `matchKey`. matchKey vẫn nằm nguyên trong DB và vẫn là đường khớp của mọi
// QR đã phát trước ngày này.
//
// ⚠️ 20/08 (vá vòng 3) — HỆ QUẢ BẢO MẬT của định dạng trên: SĐT phụ huynh nay nằm
// TRONG chính mã QR. Nên "QR" và "quyền xem thông tin liên hệ" (`orders:view-pii`)
// dính liền nhau: ai không được xem SĐT thì cũng KHÔNG được nhận mã QR — che số
// trong mã là mã hỏng, tiền không về được (xem `piiGate` bên dưới).
import "server-only";
import QRCode from "qrcode";
import type { Actor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/can";
import { writeAudit, type AuditActor } from "@/lib/audit/audit-log";
import { scopedDb } from "@/lib/db-scope";
import { outstandingOf, type RequestStatus } from "@/lib/payments/allocation";
import {
  createPaymentLink,
  generateProviderOrderCode,
  isPayosConfigured,
} from "@/lib/payments/payos";
import {
  resolveOrderPaymentConfig,
  buildVietQrImageUrl,
  transferContentForOrder,
  VIETQR_ADDINFO_MAX,
} from "@/lib/payments/vietqr";
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
  /**
   * Định danh đối khớp KỸ THUẬT của phiếu (`ORD…D1`). KHÔNG in ra cho sale nữa —
   * giữ lại vì webhook vẫn khớp qua nó với mọi QR phát trước 20/08.
   */
  matchKey: string | null;
  /** Nội dung CK dạng người đọc (`NguyenVanA_84987654321_Sata4`) — thứ IN RA cho sale. */
  transferContent: string;
};

export type QrIssueResult =
  | { ok: true; session: QrSessionView; reused: boolean }
  | { ok: false; error: string };

/**
 * Người xem có được nhận MÃ QR (và nội dung CK đầy đủ) hay không.
 *
 * VÌ SAO CÓ THAM SỐ NÀY: từ 20/08 nội dung CK là `HoTenCon_SdtPH_TenKhoa`, tức SĐT
 * phụ huynh nằm ngay trong `addInfo` của mã. Ảnh QR BẮT BUỘC mang chuỗi ĐẦY ĐỦ (che
 * số = mã hỏng = phụ huynh chuyển tiền xong không khớp được), nên không có cách nào
 * "vừa đưa QR vừa giấu số". Kết luận: thiếu `orders:view-pii` ⇒ KHÔNG đưa QR.
 *
 * VÌ SAO CALLER TRUYỀN VÀO chứ không để core tự đoán: caller tầng HTTP đã hỏi quyền
 * bằng `checkPermission()` (đường runtime duy nhất, có grant + cờ RBAC v1/v2). Nếu
 * core hỏi lại bằng đường khác thì hai bên có thể ra hai kết quả — trang che số mà
 * nút "Xuất QR" lại nhả số, đúng cái lệch mà đợt vá này đang dọn.
 *
 * ⚠️ Cờ này là dữ liệu SERVER, KHÔNG được nhận từ đối số client: `_qr-actions.ts`
 * ("use server") phải tự gọi `checkPermission` rồi truyền xuống. Bỏ trống thì core
 * suy từ chính `actor` bằng `can()` — fail-closed theo quyền, chứ mặc định KHÔNG
 * bao giờ là "cho xem" (test service-level gọi core 3 tham số rơi vào nhánh này).
 */
export type QrPiiOption = { canViewPii?: boolean };

function resolveCanViewPii(actor: Actor, opts?: QrPiiOption): boolean {
  return opts?.canViewPii ?? can(actor, "orders:view-pii");
}

/** Câu từ chối dùng chung cho cả xuất mới lẫn tạo lại — sale đọc là hiểu phải xin gì. */
const NO_PII_ERROR =
  "Mã QR mang nội dung chuyển khoản có SĐT phụ huynh — cần quyền xem thông tin liên hệ (orders:view-pii) mới lấy được mã.";

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
  order: {
    id: string;
    code: string;
    centerId: string | null;
    /** Phương thức đã chọn trên đơn — quyết định tài khoản mã QR trỏ vào. */
    paymentMethodId: string | null;
    /** 3 mảnh dựng nội dung CK dạng người đọc (chốt 20/08). */
    studentName: string;
    customerName: string;
    customerPhone: string | null;
    courseName: string | null;
  };
};

/**
 * Đọc phiếu thu QUA scopedDb — phiếu thuộc cơ sở ngoài tầm nhìn trả null, và caller
 * chỉ được phép báo "không tìm thấy" (đừng lộ là nó tồn tại).
 *
 * Nạp kèm tên học viên / SĐT phụ huynh / tên khoá vì nội dung CK nay dựng từ CHÚNG
 * chứ không còn là `matchKey`.
 */
async function loadScopedRequest(
  actor: Actor,
  paymentRequestId: string,
): Promise<LoadedRequest | null> {
  const row = await scopedDb(actor).paymentRequest.findUnique({
    where: { id: paymentRequestId },
    include: {
      allocations: { select: { amount: true } },
      order: {
        select: {
          id: true,
          code: true,
          centerId: true,
          // 31/08/2026 — tài khoản nhận tiền nay gắn vào PHƯƠNG THỨC của đơn, không còn
          // theo cơ sở. Thiếu cột này là mã QR rơi về đường lùi và trỏ sai tài khoản.
          paymentMethodId: true,
          customerName: true,
          customerPhone: true,
          student: { select: { name: true } },
          // Tên khoá = dòng hàng ĐẦU TIÊN, cùng quy ước với [id]/page.tsx.
          items: { orderBy: { createdAt: "asc" }, take: 1, select: { itemName: true } },
        },
      },
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
    order: {
      id: row.order.id,
      code: row.order.code,
      centerId: row.order.centerId,
      paymentMethodId: row.order.paymentMethodId,
      studentName: row.order.student?.name ?? row.order.customerName,
      customerName: row.order.customerName,
      customerPhone: row.order.customerPhone,
      courseName: row.order.items[0]?.itemName ?? null,
    },
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

async function toView(
  row: QrSessionRow,
  matchKey: string | null,
  transferContent: string,
): Promise<QrSessionView> {
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
    transferContent,
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
 *
 * `transferContent` nhận từ caller (mức ĐƠN) chứ không tự dựng lại: trang đơn đã
 * tính sẵn một lần cho khối QR mức đơn, truyền xuống thì cả 3 chỗ in ra chắc chắn
 * là CÙNG một chuỗi.
 *
 * ⚠️ Thiếu `orders:view-pii` → trả RỖNG. `QrSessionView.imageSrc` là URL
 * `img.vietqr.io/...?addInfo=NguyenVanA_84987654321_Sata4` (hoặc data-URL của chuỗi
 * EMVCo) — tức SĐT ĐẦY ĐỦ đi thẳng vào DOM + RSC payload dù ô "SĐT" phía trên đã che.
 * Trả rỗng là cách duy nhất bịt đường đó mà không phá mã QR (xem `QrPiiOption`).
 */
export async function loadActiveQrSessions(
  actor: Actor,
  requests: { id: string; matchKey: string | null }[],
  transferContent: string,
  opts?: QrPiiOption,
): Promise<Record<string, QrSessionView>> {
  if (requests.length === 0) return {};
  if (!resolveCanViewPii(actor, opts)) return {};
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
    out[row.paymentRequestId] = await toView(
      row,
      matchKeyById.get(row.paymentRequestId) ?? null,
      transferContent,
    );
  }
  return out;
}

/**
 * Nội dung CK in lên QR — dạng NGƯỜI ĐỌC `HoTenCon_SdtPH_TenKhoa` (chủ dự án chốt
 * 20/08, thay cho `ORD…D1` cũ mà sale không đọc nổi qua điện thoại).
 *
 * ⚠️ Đợt 1 và đợt 2 của CÙNG một đơn ra CÙNG một chuỗi. Đó là hệ quả tất yếu của
 * định dạng đã chọn, KHÔNG phải bug: nội dung không còn mang thông tin "đợt nào".
 * Tiền vẫn về đúng chỗ vì nhánh đối khớp theo SĐT (payos-ingest, nhánh (d)) neo
 * vào phiếu chưa đóng đủ SỚM NHẤT của đơn rồi để waterfall rót tiếp sang đợt sau —
 * y hệt cách nhánh (c) xử lý nội dung chỉ có mã đơn.
 *
 * ⚠️ KHÔNG ghi/không đổi `matchKey` ở đây (BẤT BIẾN #3). Chỉ đổi thứ ĐƯỢC IN RA.
 *
 * ⚠️ 20/08 (vá) — PHẢI cắt theo `VIETQR_ADDINFO_MAX` (25) chứ KHÔNG phải trần 80
 * mặc định. Chuỗi này vừa hiện cho sale đọc vừa nhúng thẳng vào `addInfo` của ảnh
 * QR, mà `addInfo` là trường EMVCo giới hạn 25 ký tự — để mặc định 80 thì mã QR bị
 * cắt đuôi im lặng đúng chỗ chứa SĐT, và nhánh đối khớp (d) mất khoá duy nhất.
 * Cắt tại đây thì phần mất là mấy chữ cuối của TÊN CON (vẫn đọc ra được), và chuỗi
 * in ra màn hình TRÙNG chuỗi nằm trong QR.
 */
function addInfoFor(req: LoadedRequest): string {
  return transferContentForOrder(
    {
      studentName: req.order.studentName,
      customerName: req.order.customerName,
      customerPhone: req.order.customerPhone,
      courseName: req.order.courseName,
    },
    VIETQR_ADDINFO_MAX,
  );
}

/**
 * Bản NGẮN cho payOS: cổng cắt `description` còn 25 ký tự (payos.ts DESCRIPTION_MAX).
 * Cắt sẵn ở đây thì phần bị bỏ là mấy chữ cuối của TÊN CON; để payos.ts tự cắt thì
 * dao rơi đúng vào SĐT. Đối khớp của payOS không đọc chuỗi này (webhook trả
 * `orderCode` → QrSession), nhưng nó vẫn hiện trên sao kê của phụ huynh.
 */
const PAYOS_DESCRIPTION_MAX = 25;

type QrPayload = {
  qrContent: string | null;
  checkoutUrl: string | null;
  providerOrderCode: string | null;
};

/**
 * Dựng nội dung QR cho số tiền `amount`.
 *
 * payOS đã cấu hình → xin link/QR của cổng. Cổng chưa cấu hình HOẶC trả lỗi → lùi
 * về QR ảnh tĩnh VietQR với `addInfo` = nội dung CK dạng người đọc. Không có nhánh
 * nào ném lỗi ra ngoài: cổng chết không được phép làm sale không thu được tiền.
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
      // ⚠️ ĐÃ KHÁC TRƯỚC 20/08: chuỗi này KHÔNG còn là định danh đối khớp. Webhook
      // payOS khớp qua `orderCode` cổng trả về → `QrSession.providerOrderCode`
      // (@unique) → phiếu thu — nhánh (b) của resolvePaymentTarget, không đọc mô
      // tả. Sửa/cắt chuỗi này CHỈ ảnh hưởng thứ phụ huynh nhìn thấy trên sao kê.
      description: transferContentForOrder(
        {
          studentName: req.order.studentName,
          customerName: req.order.customerName,
          customerPhone: req.order.customerPhone,
          courseName: req.order.courseName,
        },
        PAYOS_DESCRIPTION_MAX,
      ),
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

  // 31/08/2026 — lấy tài khoản theo PHƯƠNG THỨC của đơn (lùi dần về phương thức chuyển
  // khoản của cơ sở → dùng chung → kho VietQR cũ). Xem resolveOrderPaymentConfig.
  const cfg = await resolveOrderPaymentConfig({
    centerId: req.order.centerId ?? req.centerId,
    paymentMethodId: req.order.paymentMethodId,
  });
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

  return { ok: true, session: await toView(row, req.matchKey, addInfoFor(req)), reused: false };
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
  opts?: QrPiiOption,
): Promise<QrIssueResult> {
  // Gác PII TRƯỚC khi đọc phiếu: không có quyền xem SĐT thì không có mã nào để đưa,
  // nên không cần chạm DB. Chặn ở đây thì trang tải lần đầu và nút "Xuất QR" nói
  // CÙNG một câu trả lời — trước đợt vá này chúng lệch nhau (trang che, nút nhả).
  if (!resolveCanViewPii(actor, opts)) return { ok: false, error: NO_PII_ERROR };

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
    return { ok: true, session: await toView(live, req.matchKey, addInfoFor(req)), reused: true };
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
  opts?: QrPiiOption,
): Promise<QrIssueResult> {
  // Cùng lý do như `issueQrForRequestCore`: tạo lại QR cũng là phát ra một mã mang
  // SĐT, nên không có quyền PII thì cửa này cũng đóng (đóng ở một cửa là vô nghĩa).
  if (!resolveCanViewPii(actor, opts)) return { ok: false, error: NO_PII_ERROR };

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
