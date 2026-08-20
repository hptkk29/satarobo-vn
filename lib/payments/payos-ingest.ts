import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/service";
import { ensureParentAccountForOrder } from "@/lib/parents/provision";
import { sendEmailForTrigger } from "@/lib/email/trigger";
import { notifyOrderByZnsIfNoEmail } from "@/lib/notify/order";
import { extractOrderCode, normalizeContent } from "@/lib/payments/sepay";
import { canonicalPhone, phoneVariants } from "@/lib/phone";
import {
  transferContentPartsForOrder,
  MAX_TRANSFER_CONTENT,
  VIETQR_ADDINFO_MAX,
  type TransferContentParts,
} from "@/lib/payments/vietqr";
import {
  planAllocation,
  deriveStatus,
  isOrderSettled,
  outstandingOf,
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
//  5. 20/08 — nội dung CK đổi sang dạng người đọc (`NguyenVanA_84987654321_Sata4`),
//     đối khớp thêm nhánh (d) theo SĐT. Nhánh này chỉ rót khi ra ĐÚNG MỘT đơn
//     đang chờ thu; nhập nhằng thì trả null kèm lý do — rót nhầm đơn tệ hơn nhiều
//     so với để kế toán gán tay. Đây KHÔNG mâu thuẫn với "không từ chối nhận tiền":
//     tiền vẫn ghi sổ đầy đủ ở `BankTransaction`, chỉ là chưa phân bổ.
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
/**
 * ⚠️ `provider` PHẢI truyền theo cổng thật đang chạy. Hàm này dùng chung cho cả
 * payOS lẫn SePay; đóng cứng `PAYOS_PROVIDER` thì nhật ký của SePay bị gắn nhãn
 * payOS ⇒ biến mất khỏi khối lịch sử SePay ở /admin/bien-dong-so-du (lọc
 * `provider: "SEPAY"`) và hiện sai tên ở /admin/tich-hop.
 */
export async function logPayos(params: {
  provider?: string;
  action: string;
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  payload: unknown;
  response?: unknown;
  error?: string;
}): Promise<void> {
  await db.integrationLog
    .create({
      data: {
        provider: params.provider ?? PAYOS_PROVIDER,
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
  /** `manual` = kế toán tự gán ở /admin/bien-dong-so-du, không phải máy tra ra. */
  via: "matchKey" | "qrSession" | "orderCode" | "phone" | "manual";
  qrSessionId?: string;
};

/** Kết quả tra đích kèm LÝ DO khi không chốt được — `note` đi thẳng vào `unmatchedNote`. */
export type ResolveOutcome = {
  target: MatchTarget | null;
  /** Chỉ có khi target = null VÀ ta biết vì sao (vd khớp SĐT nhưng nhiều đơn). */
  note?: string;
};

/**
 * Bóc SĐT phụ huynh ra khỏi nội dung CK (THUẦN).
 *
 * 20/08 — nội dung CK đổi sang dạng người đọc `HoTenCon_SdtPH_TenKhoa`, nên SĐT
 * trở thành đường đối khớp. Nhận `84XXXXXXXXX` (11 số) và `0XXXXXXXXX` (10 số),
 * trả canonical `84XXXXXXXXX`.
 *
 * ⚠️ Hai vòng dò, KHÔNG gộp làm một:
 *  1. Theo BIÊN TOKEN (tách ở mọi ký tự không phải số) — đây là ca thường, và nó
 *     không thể cắt bừa giữa hai cụm số dính nhau.
 *  2. Chỉ khi (1) trượt mới quét cửa sổ trượt trên chuỗi số ĐÃ GỘP: có ngân hàng
 *     dán số tiền/mã tham chiếu dính liền SĐT.
 * Cửa sổ 11 dò trước 10 để "84…" không bị đọc nhầm thành mảnh của số khác.
 *
 * KHÔNG nhận dạng 9 số trần (Excel nuốt số 0) như `canonicalPhone`: quét chuỗi tự
 * do mà nhận 9 số thì mọi số tài khoản đều thành "SĐT".
 */
export function extractVnPhoneCandidates(content: string | null | undefined): string[] {
  // ⚠️ GỠ MÃ ĐƠN TRƯỚC KHI DÒ. `ORD260820000001` là 12 chữ số dính liền nhau, và
  // cửa sổ trượt ở vòng (2) đẻ ra "SĐT" hợp lệ GIẢ từ chính nó — đo được:
  // "ORD260820000001D1" → 84820000001. Mã đơn đã có nhánh (c) lo, ở đây nó chỉ là
  // rác gây nhiễu.
  const raw = String(content ?? "").replace(/ORD[\s.\-_]*\d{6}[\s.\-_]*\d{6}/gi, " ");
  if (!raw) return [];

  const out: string[] = [];
  const push = (hit: string | null) => {
    if (hit && !out.includes(hit)) out.push(hit);
  };

  for (const token of raw.split(/[^0-9]+/)) push(phoneFromDigits(token));
  // ⚠️ Cửa sổ trượt CHỈ chạy khi vòng token trắng tay — giữ nguyên ngữ nghĩa cũ.
  // Chạy luôn cả hai vòng thì mọi nội dung "sạch" cũng đẻ thêm số ứng viên rác từ
  // các cụm số dính nhau, mà từ 20/08 nhiều ứng viên = NHẬP NHẰNG = không rót ⇒
  // ta tự tay biến ca đang chạy tốt thành đối soát tay.
  if (out.length === 0) {
    const digits = raw.replace(/\D/g, "");
    for (const len of [11, 10]) {
      for (let i = 0; i + len <= digits.length; i++) {
        push(phoneFromDigits(digits.slice(i, i + len)));
      }
    }
  }
  // Trần an toàn: nội dung có 6 số điện thoại là rác/quảng cáo, đã chắc chắn phải
  // xử lý tay — không cần dò DB cho từng số.
  return out.slice(0, 5);
}

/**
 * Bản 1-số giữ cho đường gọi cũ (test hồi quy, log). ⚠️ ĐỪNG dùng nó cho việc
 * ĐỐI KHỚP: lấy số đầu tiên chính là con bug "bà ngoại chuyển hộ" — ngân hàng ghi
 * "CT tu 0912345678 NGUYEN THI B chuyen tien TranMinhAnh_84905111222_Sata2" thì số
 * đầu tiên là số NGƯỜI GỬI, không phải phụ huynh. Đối khớp dùng
 * `extractVnPhoneCandidates` + bằng chứng phụ (tên con / tên khoá).
 */
export function extractVnPhone(content: string | null | undefined): string | null {
  return extractVnPhoneCandidates(content)[0] ?? null;
}

/** Chỉ đúng 2 dạng người ta gõ vào nội dung CK; chuẩn hoá vẫn nhờ lib/phone.ts. */
function phoneFromDigits(digits: string): string | null {
  if (digits.length === 11 && digits.startsWith("84")) return canonicalPhone(digits);
  if (digits.length === 10 && digits.startsWith("0")) return canonicalPhone(digits);
  return null;
}

/**
 * (d) Đối khớp theo SĐT phụ huynh — nhánh SINH RA CÙNG định dạng nội dung CK mới.
 *
 * Nguyên tắc: SĐT chỉ THU HẸP tập ứng viên, không tự nó quyết định. Ra đúng 1 đơn
 * đang chờ thu mới rót tiền; còn nhập nhằng thì TRẢ NULL kèm lý do — rót nhầm đơn
 * tệ hơn nhiều so với để kế toán gán tay (tiền vẫn nằm nguyên trong BankTransaction).
 */
async function resolveByPhone(data: PayosWebhookData): Promise<ResolveOutcome> {
  const content = typeof data.description === "string" ? data.description : "";

  // Nội dung TỰ KHAI mã đơn ⇒ nhánh (c) đã thử và trượt (đơn không tồn tại, hoặc
  // đơn đó không còn phiếu nào chờ thu). Suy ra đơn khác từ SĐT lúc này là ĐOÁN:
  // đúng thứ mà chủ dự án cấm. Để kế toán gán tay.
  if (extractOrderCode(content)) return { target: null };

  const phones = extractVnPhoneCandidates(content);
  if (phones.length === 0) return { target: null };

  const amount = Math.round(Number(data.amount ?? 0));
  const lookups: PhoneLookup[] = [];
  for (const phone of phones) {
    lookups.push({ phone, orders: await findPendingOrdersByPhone(phone) });
  }
  return decideByPhoneCandidates(lookups, content, amount);
}

/** Tập ứng viên đã nạp sẵn cho MỘT số điện thoại — đầu vào của phần quyết định THUẦN. */
export type PhoneLookup = { phone: string; orders: PhoneCandidate[] };

/**
 * Phần QUYẾT ĐỊNH của nhánh (d), tách hẳn khỏi DB để test được không cần Postgres.
 *
 * Đơn thắng xét theo TỪNG số rồi gom theo orderId: hai số khác nhau cùng dẫn về
 * MỘT đơn (SĐT mẹ ở đơn, SĐT bố trong nội dung) vẫn là một ứng viên, không phải
 * nhập nhằng.
 */
export function decideByPhoneCandidates(
  lookups: PhoneLookup[],
  content: string,
  amount: number,
): ResolveOutcome {
  const winners = new Map<string, PhoneCandidate>();
  const notes: string[] = [];

  for (const { phone, orders } of lookups) {
    const picked = pickOrderForPhone(phone, orders, content, amount);
    if (picked.order) winners.set(picked.order.id, picked.order);
    if (picked.note) notes.push(picked.note);
  }

  if (winners.size === 0) {
    return { target: null, note: notes.join("; ") || undefined };
  }

  // ⚠️ ≥2 ĐƠN KHÁC NHAU cùng "hợp lệ" ⇒ KHÔNG rót. Nội dung CK có nhiều số (số
  // người gửi + số phụ huynh) là ca thật; chọn bừa một đơn là rót tiền nhà này vào
  // nợ nhà khác rồi tự động chốt đơn + gửi biên nhận — hỏng theo cách rất khó phát
  // hiện. Tiền vẫn nằm nguyên ở BankTransaction, kế toán gán tay.
  if (winners.size > 1) {
    const phones = lookups.map((l) => l.phone);
    const detail = [...winners.values()].map(describeCandidate).join(", ");
    return {
      target: null,
      note:
        `Nội dung CK chứa ${phones.length} số điện thoại (${phones.join(", ")}) dẫn tới ` +
        `${winners.size} đơn khác nhau (${detail}) — cần gán tay`,
    };
  }

  const chosen = [...winners.values()][0]!;
  // Neo vào phiếu chưa đóng đủ SỚM NHẤT y hệt nhánh (c): nội dung CK mới KHÔNG
  // phân biệt được đợt 1 với đợt 2 (cùng một chuỗi), nên waterfall lo phần còn lại.
  const first = chosen.paymentRequests[0];
  if (!first) return { target: null };
  return { target: { paymentRequestId: first.id, orderId: chosen.id, via: "phone" } };
}

/** Đơn đang chờ thu gắn với MỘT số điện thoại (người mua / phụ huynh của học viên). */
async function findPendingOrdersByPhone(phone: string): Promise<PhoneCandidate[]> {
  // DB còn lẫn `0…` (dữ liệu cũ) lẫn `84…` (đường ghi mới) → phải nở cả 2 dạng,
  // đúng lý do `phoneVariants` tồn tại.
  const variants = phoneVariants(phone);
  return db.order.findMany({
    where: {
      deletedAt: null,
      // Đơn đã huỷ/hoàn tiền không phải đích rót tự động. DRAFT cũng KHÔNG: đó là
      // đơn sale ĐANG SOẠN DỞ (vẫn kịp có phiếu thu PENDING) — rót tiền vào đó là
      // chốt giùm một đơn chưa ai duyệt, và đơn thật của khách vẫn nợ. Nếu đơn bị
      // loại là ứng viên DUY NHẤT thì ta ra 0 đơn → UNMATCHED → kế toán quyết,
      // đúng ý đồ.
      status: { notIn: ["DRAFT", "CANCELLED", "REFUNDED"] },
      paymentRequests: { some: { status: { in: ["PENDING", "PARTIAL"] } } },
      OR: [
        { customerPhone: { in: variants } },
        { student: { parentPhone: { in: variants } } },
        { student: { parentUser: { phone: { in: variants } } } },
      ],
    },
    select: {
      id: true,
      code: true,
      customerName: true,
      // ⚠️ PHẢI có: chuỗi đối chiếu được TÁI DỰNG bằng đúng công thức bên phát
      // (transferContentPartsForOrder), mà công thức đó lấy SĐT từ chính đơn —
      // không phải từ số vừa bóc ra khỏi nội dung CK.
      customerPhone: true,
      student: { select: { name: true } },
      items: { orderBy: { createdAt: "asc" }, take: 1, select: { itemName: true } },
      paymentRequests: {
        where: { status: { in: ["PENDING", "PARTIAL"] } },
        orderBy: [{ sortOrder: "asc" }, { installmentNo: "asc" }],
        // KHÔNG `take: 1` nữa: tiêu chí phụ theo số tiền (bên dưới) cần phần CÒN
        // THIẾU của CẢ ĐƠN, mà phần đó là tổng của mọi phiếu chưa đóng đủ.
        select: {
          id: true,
          amountDue: true,
          sortOrder: true,
          status: true,
          allocations: { select: { amount: true } },
        },
      },
    },
    // Trần an toàn: một SĐT ra vài chục đơn là dữ liệu bất thường, đã chắc chắn
    // phải xử lý tay — không cần kéo hết về chỉ để đếm.
    take: 20,
  });
}

/**
 * Chuẩn hoá để SO TÊN: đưa `đ/Đ` về `d/D` TRƯỚC khi `normalizeContent` xoá ký tự lạ.
 *
 * ⚠️ Bỏ bước này là hỏng thật, đã đo: `normalizeContent("Trần Đức Anh")` ra
 * "TRANUCANH" — chữ Đ (U+0110, không phân rã NFD được) bị xoá THẲNG — trong khi
 * nội dung CK do chính ta sinh ra là "TranDucAnh". Hai vế không bao giờ "chứa"
 * nhau, nên mọi tên có chữ Đ ở giữa mất khả năng thu hẹp.
 */
function normalizeForCompare(s: string | null | undefined): string {
  return normalizeContent(
    String(s ?? "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D"),
  );
}

/** Phiếu thu chờ thu của một đơn ứng viên — đủ số liệu để tính phần CÒN THIẾU. */
type CandidateRequest = {
  id: string;
  amountDue: number;
  sortOrder: number;
  status: string;
  allocations: { amount: number }[];
};

export type PhoneCandidate = {
  id: string;
  code: string;
  customerName: string;
  customerPhone: string | null;
  student: { name: string } | null;
  items: { itemName: string }[];
  paymentRequests: CandidateRequest[];
};

/** Phần CÒN THIẾU của MỘT phiếu thu ứng viên. */
function outstandingOfRequest(r: CandidateRequest): number {
  return outstandingOf({
    id: r.id,
    amountDue: r.amountDue,
    allocated: r.allocations.reduce((s, a) => s + a.amount, 0),
    sortOrder: r.sortOrder,
    status: r.status as RequestStatus,
  });
}

/**
 * Phần CÒN THIẾU của cả đơn = tổng phần còn thiếu của mọi phiếu chưa đóng đủ.
 *
 * ⚠️ CHỈ dùng để MÔ TẢ đơn cho kế toán trong note. KHÔNG dùng để so với số tiền
 * giao dịch — xem `narrowByAmount`, hai vế đó khác đơn vị.
 */
function outstandingOfOrder(o: PhoneCandidate): number {
  return o.paymentRequests.reduce((sum, r) => sum + outstandingOfRequest(r), 0);
}

const vnd = (n: number): string => `${n.toLocaleString("vi-VN")}đ`;

/** Mô tả một đơn ứng viên cho kế toán: mã đơn + phần còn thiếu (để chọn nhanh). */
function describeCandidate(o: PhoneCandidate): string {
  return `${o.code} (còn thiếu ${vnd(outstandingOfOrder(o))})`;
}

/**
 * Chuỗi mà hệ thống THỰC SỰ PHÁT RA cho đơn này, ở trần của mã QR.
 *
 * ⚠️ Dựng bằng CHÍNH `transferContentPartsForOrder` chứ không ghép tay: bên phát
 * (bảng phiếu thu, hộp QR, ảnh VietQR) và bên đối khớp phải chung một công thức,
 * lệch nhau là tiền rơi vào đối soát tay mà không ai biết.
 *
 * VÌ SAO ở trần 25: đó là trần của trường "purpose of transaction" (EMVCo) — chuỗi
 * đi vào mã QR, tức chuỗi phụ huynh quét và ngân hàng gửi lại. Đây là bản dùng cho
 * mọi so-mảnh (tầng 2), vì mảnh ở bản 25 luôn là TIỀN TỐ của mảnh ở bản 80.
 */
function expectedPartsFor(
  o: PhoneCandidate,
  maxLength: number = VIETQR_ADDINFO_MAX,
): TransferContentParts {
  return transferContentPartsForOrder(
    {
      studentName: o.student?.name ?? null,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      courseName: o.items[0]?.itemName ?? null,
    },
    maxLength,
  );
}

/**
 * CẢ HAI chuỗi hệ thống phát ra cho đơn này — bản 25 (nhúng vào mã QR) và bản 80
 * (sale đọc qua điện thoại, phụ huynh gõ tay).
 *
 * ⚠️ VÌ SAO PHẢI THỬ CẢ HAI: bản 25 KHÔNG phải chuỗi con của bản 80 khi tên con bị
 * cắt — nhát cắt rơi vào GIỮA chuỗi nên tính liền mạch đứt (`NguyenV_849…` không
 * nằm trong `NguyenVanA_849…`). Chỉ tái dựng bản 25 thì mọi phụ huynh GÕ TAY theo
 * bản sale đọc đều trượt tầng 1, tụt xuống tầng 2 (bằng chứng yếu hơn, và tầng 2
 * chỉ nhận khi ra đúng một đơn) — mất bằng chứng mạnh một cách vô cớ.
 *
 * Thử thêm bản 80 chỉ có thể THÊM khớp, không thể khớp nhầm: nó chứa NHIỀU thông
 * tin hơn bản 25 (tên con đầy đủ), tức là điều kiện CHẶT hơn.
 */
function expectedContentsFor(o: PhoneCandidate): string[] {
  const short = expectedPartsFor(o, VIETQR_ADDINFO_MAX).content;
  const long = expectedPartsFor(o, MAX_TRANSFER_CONTENT).content;
  return short === long ? [short] : [short, long];
}

/**
 * Chọn đơn cho MỘT số điện thoại — hoặc trả lý do vì sao không chọn được.
 *
 * ⚠️ LUẬT LÕI (vá 20/08): SĐT KHÔNG BAO GIỜ đủ để rót tiền, KỂ CẢ khi chỉ có đúng
 * một đơn ứng viên. Phải có BẰNG CHỨNG PHỤ trong nội dung CK.
 *
 * Vì sao bỏ lối tắt "một ứng viên thì khỏi kiểm" (đã đo, hỏng thật): bà ngoại
 * chuyển hộ, ngân hàng ghi "CT tu 0912345678 NGUYEN THI B chuyen tien
 * TranMinhAnh_84905111222_Sata2" — số ĐẦU TIÊN là số người gửi. Nếu người gửi tình
 * cờ cũng là phụ huynh và có đúng 1 đơn đang chờ thu thì tiền nhà A rót vào đơn nhà
 * B, đơn B tự CONFIRMED + gửi biên nhận + cấp tài khoản phụ huynh, còn đơn A vẫn nợ.
 *
 * ⚠️ SỬA 20/08 (vòng 3) — BẰNG CHỨNG PHỤ SO VỚI CÁI GÌ. Bản trước đòi nội dung CK
 * chứa TÊN HỌC VIÊN ĐẦY ĐỦ hoặc TÊN KHOÁ ĐẦY ĐỦ. Sai chuẩn: chuỗi nhúng vào QR bị
 * cắt còn 25 ký tự (VIETQR_ADDINFO_MAX), mà ngân sách tên con = 25 − (len(tên
 * khoá) + 13) nên với khoá tên dài thì tên con MẤT SẠCH và tên khoá cũng cụt. Đo
 * trên danh mục thật: 8/11 khoá không bao giờ khớp ⇒ mọi giao dịch hợp lệ rơi vào
 * đối soát tay, im lặng. Nay so với **chuỗi hệ thống thực sự phát ra**:
 *
 * (Từ 20/08 vòng 4, `shortCourseToken` rút tên khoá về MÃ NGẮN 5 ký tự nên tên con
 * quay lại chuỗi 25 ở cả 11/11 khoá. Lợi ích phụ đáng kể cho chính hàm này: hai
 * anh em ruột cùng phụ huynh cùng khoá không còn sinh chuỗi giống hệt nhau ⇒ tầng
 * 1 hết hoà ⇒ bớt phải trông vào tiêu chí phụ theo số tiền.)
 *
 *  Tầng 1 — nội dung CHỨA trọn chuỗi tái dựng của đơn đó, thử CẢ HAI trần 25 và 80
 *    (xem `expectedContentsFor`). Bằng chứng mạnh nhất (gồm cả SĐT lẫn phần
 *    tên/khoá sống sót) và không thể khớp nhầm sang nhà khác.
 *  Tầng 2 — nội dung chứa TIỀN TỐ tên con (≥4 ký tự) HOẶC phần tên khoá sống sót
 *    (≥3 ký tự): phủ ca phụ huynh gõ tay bản 80 ký tự, hoặc ngân hàng cắt bớt.
 *    Chỉ nhận khi tầng này ra ĐÚNG MỘT đơn — nhiều đơn thì rơi xuống tầng 3.
 *  Tầng 3 — không đủ bằng chứng ⇒ null + note liệt kê đơn cho kế toán chọn.
 *
 * Luôn so kiểu "CHỨA" (không phải "BẰNG") vì ngân hàng chèn thêm chữ đầu/cuối
 * ("CT tu …", "GD …"), trên chuỗi đã bỏ dấu + viết hoa + bỏ ký tự lạ.
 */
function pickOrderForPhone(
  phone: string,
  orders: PhoneCandidate[],
  content: string,
  amount: number,
): { order: PhoneCandidate | null; note?: string } {
  if (orders.length === 0) {
    return {
      order: null,
      note: `Nội dung CK có SĐT ${phone} nhưng không có đơn nào đang chờ thu gắn với số này`,
    };
  }

  const norm = normalizeForCompare(content);
  const contains = (piece: string, min: number): boolean => {
    const n = normalizeForCompare(piece);
    return n.length >= min && norm.includes(n);
  };

  // ── Tầng 1 — khớp trọn chuỗi tái dựng ─────────────────────────────────────
  // ⚠️ Đơn KHÔNG có cả tên lẫn khoá thì chuỗi tái dựng chỉ còn mỗi SĐT; "khớp"
  // lúc đó chính là khớp bằng SĐT trần — đúng cái lỗ hổng "bà ngoại chuyển hộ".
  // Nên loại thẳng: đơn đó không có bằng chứng phụ nào để xác thực.
  const exact = orders.filter((o) => {
    const p = expectedPartsFor(o);
    if (!p.name && !p.course) return false;
    return expectedContentsFor(o).some((c) => contains(c, 4));
  });
  if (exact.length === 1) return { order: exact[0]! };
  if (exact.length > 1) {
    // Hoà ở tầng mạnh nhất = hai đơn CÙNG con, CÙNG khoá, CÙNG số (ghi danh lại).
    // Chỉ ở đây mới dùng tới số tiền — xem ghi chú "TIÊU CHÍ PHỤ" bên dưới.
    const byAmount = narrowByAmount(exact, amount);
    if (byAmount) return { order: byAmount };
    return { order: null, note: ambiguousNote(phone, exact, amount) };
  }

  // ── Tầng 2 — khớp mảnh ────────────────────────────────────────────────────
  // Ngưỡng 4 (tên) / 3 (khoá): dưới ngưỡng thì mảnh quá ngắn, khớp bừa mọi chuỗi.
  const partial = orders.filter((o) => {
    const p = expectedPartsFor(o);
    return contains(p.name, 4) || contains(p.course, 3);
  });
  // ⚠️ CHỈ nhận khi ra ĐÚNG MỘT đơn. Bằng chứng ở tầng này yếu (một mảnh chữ),
  // dùng số tiền để tách hoà là biến số tiền thành khoá đối khớp — cấm (bất biến #2).
  if (partial.length === 1) return { order: partial[0]! };

  // ── Tầng 3 — không đủ bằng chứng ──────────────────────────────────────────
  if (partial.length === 0) {
    const detail = orders.map(describeCandidate).join(", ");
    return {
      order: null,
      note:
        `Khớp SĐT ${phone} với ${orders.length} đơn ${detail} nhưng nội dung CK không ` +
        `nhắc tên học viên hay tên khoá của đơn nào — cần gán tay`,
    };
  }
  return { order: null, note: ambiguousNote(phone, partial, amount) };
}

/**
 * ⚠️ TIÊU CHÍ PHỤ — số tiền. Đây KHÔNG phải khoá đối khớp (bất biến #2 của file:
 * không bao giờ từ chối/quyết định NHẬN tiền vì lệch số). Nó chỉ THU HẸP ở bước
 * cuối, sau khi SĐT và bằng chứng chuỗi đã lọc, cho ca "hai đơn cùng con cùng
 * khoá" vốn tắc vĩnh viễn. Không tách được thì vẫn nhường cho gán tay.
 *
 * ⚠️ VÁ 20/08 — SO ĐÚNG ĐƠN VỊ: phần còn thiếu của TỪNG PHIẾU THU, KHÔNG phải của
 * cả đơn. Mọi mã QR đều phát theo PHIẾU (`_qr-core.ts` lấy `outstandingOfRequest`,
 * màn chi tiết đơn lấy `dueNow.amount` của đợt đang tới hạn), nên `amount` mà ngân
 * hàng gửi về luôn ở đơn vị "một phiếu". So với tổng của cả đơn là so hai đại
 * lượng khác nhau, và nó rót tiền vào SAI ĐƠN chứ không chỉ trượt:
 *
 *   Đơn A trả góp 2 đợt, còn thiếu 10tr (đợt 1 = 5tr) · Đơn B trọn gói còn 5tr,
 *   cùng SĐT + cùng tên con + cùng khoá nên hoà ở tầng 1. Phụ huynh quét QR đợt 1
 *   của A, chuyển 5tr → bản cũ thấy A(10tr)≠5tr, B(5tr)==5tr ⇒ "đúng một đơn" ⇒
 *   rót hết vào B, B tự CONFIRMED + gửi biên nhận + cấp tài khoản phụ huynh, còn A
 *   vẫn nợ. Bản này: A có phiếu 5tr, B có phiếu 5tr ⇒ 2 đơn ⇒ trả null, gán tay.
 *
 * Vẫn GIỮ tie-break (thay vì bỏ hẳn) vì sau khi tên con quay lại chuỗi 25 ký tự,
 * hoà ở tầng 1 chỉ còn xảy ra với hai đơn CÙNG con CÙNG khoá (ghi danh lại, hoặc
 * anh em trùng 7 ký tự đầu của tên) — ca hiếm mà bỏ tie-break là tắc vĩnh viễn.
 */
function narrowByAmount(pool: PhoneCandidate[], amount: number): PhoneCandidate | null {
  if (amount <= 0) return null;
  const hit = pool.filter((o) => o.paymentRequests.some((r) => outstandingOfRequest(r) === amount));
  return hit.length === 1 ? hit[0]! : null;
}

/** Note tầng 3: kế toán cần mã đơn + phần còn thiếu để chọn tay cho nhanh. */
function ambiguousNote(phone: string, pool: PhoneCandidate[], amount: number): string {
  const detail = pool.map(describeCandidate).join(", ");
  return (
    `Khớp SĐT ${phone} và nội dung CK nhưng còn ${pool.length} đơn đang chờ thu ` +
    `${detail} — số tiền ${vnd(amount)} không tách được đơn nào, cần chọn tay`
  );
}

/**
 * Tìm phiếu thu đích: (a) `matchKey` → (b) `providerOrderCode` → QrSession → phiếu
 * → (c) mã đơn trong nội dung → (d) SĐT phụ huynh trong nội dung.
 *
 * ⚠️ Nhánh (b) KHÔNG được lọc theo `expiresAt`/`status` của QrSession. Sale xuất
 * lại QR 5 lần thì có 5 session cùng trỏ 1 phiếu thu; PH quét cái nào, hết hạn
 * bao lâu, tiền cũng phải về đúng phiếu đó.
 *
 * ⚠️ THỨ TỰ LÀ HỢP ĐỒNG HỒI QUY: (a)(b)(c) phải chạy TRƯỚC (d) thì mọi QR/nội dung
 * CK phát trước 20/08 (còn mang `ORD…D1`) mới tiếp tục khớp y như cũ.
 */
export async function resolvePaymentTargetDetailed(
  data: PayosWebhookData,
): Promise<ResolveOutcome> {
  const candidates = collectMatchKeyCandidates(data);
  if (candidates.length > 0) {
    const rows = await db.paymentRequest.findMany({
      where: { matchKey: { in: candidates } },
      select: { id: true, orderId: true, matchKey: true },
    });
    for (const c of candidates) {
      const hit = rows.find((r) => r.matchKey === c);
      if (hit) {
        return { target: { paymentRequestId: hit.id, orderId: hit.orderId, via: "matchKey" } };
      }
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
        target: {
          paymentRequestId: session.paymentRequest.id,
          orderId: session.paymentRequest.orderId,
          via: "qrSession",
          qrSessionId: session.id,
        },
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
      return { target: { paymentRequestId: first.id, orderId: order.id, via: "orderCode" } };
    }
  }

  // (d) Nội dung CK dạng người đọc `HoTenCon_SdtPH_TenKhoa` (chốt 20/08) — không
  // còn mã đơn để bám, tra ngược từ SĐT phụ huynh.
  return resolveByPhone(data);
}

/** Bản gọn giữ cho đường gọi cũ/test cũ — bỏ phần lý do, chỉ lấy đích. */
export async function resolvePaymentTarget(data: PayosWebhookData): Promise<MatchTarget | null> {
  return (await resolvePaymentTargetDetailed(data)).target;
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
      provider,
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
      provider,
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
    await logPayos({ provider, action: "INGEST_TXN", status: "SKIPPED", payload: data, error: "Đã ghi nhận" });
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
        await logPayos({ provider, action: "INGEST_TXN", status: "FAILED", payload: data, error: message });
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
  const resolved = await resolvePaymentTargetDetailed(data);
  const target = resolved.target;
  if (!target) {
    const note =
      `Không tra ra phiếu thu. orderCode=${data.orderCode ?? "-"}, ` +
      `VA=${data.virtualAccountNumber ?? "-"}, ref=${data.reference ?? "-"}, ` +
      `nội dung="${data.description ?? "-"}"` +
      // Lý do CỤ THỂ (vd "khớp SĐT … nhưng có 2 đơn đang chờ thu") là thứ kế toán
      // cần để gán tay ở /admin/bien-dong-so-du — không có nó thì họ phải tự dò.
      (resolved.note ? `. ${resolved.note}` : "");
    await db.bankTransaction.update({
      where: { id: bankTransactionId },
      data: { status: "UNMATCHED", unmatchedNote: note },
    });
    await logPayos({ provider, action: "MATCH_TXN", status: "FAILED", payload: data, error: note });
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
    await logPayos({ provider, action: "MATCH_TXN", status: "FAILED", payload: data, error: note });
    return { status: "UNMATCHED", bankTransactionId, reason: note };
  }

  // Từ đây là phần DÙNG CHUNG với đối soát tay ở /admin/bien-dong-so-du —
  // xem `allocateToOrder`. Hai đường phải rót tiền y hệt nhau, nếu không thì
  // giao dịch gán tay và giao dịch webhook để lại hai loại dấu vết khác nhau
  // trong sổ, và không ai đối chiếu nổi.
  return allocateToOrder({ bankTransactionId, order, amount, provider, providerTxnId, target, data });
}

/**
 * Phần của ĐƠN mà việc rót tiền cần đọc. Khai tường minh (thay vì suy từ Prisma)
 * để đường gán tay biết chính xác phải `select` những cột nào — thiếu `orgUnitId`
 * là dung sai làm tròn đọc nhầm cấu hình, thiếu `student` là không cấp được tài
 * khoản phụ huynh sau khi đơn chốt.
 */
export type AllocationOrder = {
  id: string;
  code: string;
  status: string;
  centerId: string | null;
  orgUnitId: string | null;
  studentId: string | null;
  student: { id: string; parentUserId: string | null } | null;
};

/**
 * RÓT một giao dịch đã ghi sổ vào phiếu thu của MỘT đơn — thân chung của cả hai
 * đường: webhook cổng thanh toán (`ingestPayosWebhook`) và ĐỐI SOÁT TAY của kế
 * toán (`/admin/bien-dong-so-du`).
 *
 * ⚠️ VÌ SAO PHẢI DÙNG CHUNG. Rót tiền không chỉ là ghi `PaymentAllocation`: còn
 * phải khoá đơn (advisory lock), đọc lại trạng thái trong khoá để hai luồng song
 * song không rót hai lần, tính lại trạng thái phiếu TỪ SỔ, ghi tiền dư sang
 * `CreditBalance`, ghi song song sổ CŨ (`Payment` marker) vì công nợ hiển thị vẫn
 * đọc ở đó, rồi mới tới side-effect sau commit (chốt đơn, cấp tài khoản phụ
 * huynh, gửi biên nhận). Viết bản thứ hai cho đường gán tay là chắc chắn bỏ sót
 * vài bước, và bỏ sót ở đây nghĩa là tiền vào sổ mới mà công nợ không đổi.
 *
 * Idempotent: đọc lại `BankTransaction.status` TRONG khoá, khác `UNMATCHED` thì
 * rút lui với `DUPLICATE`. Nhờ vậy kế toán bấm hai lần cũng chỉ rót một lần.
 */
export async function allocateToOrder(params: {
  bankTransactionId: string;
  order: AllocationOrder;
  amount: number;
  provider: string;
  providerTxnId: string;
  target: MatchTarget;
  /** Payload gốc — chỉ dùng để ghi nhật ký. Đường gán tay truyền bản tóm tắt. */
  data: PayosWebhookData;
}): Promise<IngestOutcome> {
  const { bankTransactionId, order, amount, provider, providerTxnId, target, data } = params;
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
      await logPayos({ provider, action: "MATCH_TXN", status: "FAILED", payload: data, error: note });
      return { status: "UNMATCHED", bankTransactionId, reason: note };
    }
    const message = err instanceof Error ? err.message : "Unknown";
    await logPayos({ provider, action: "ALLOCATE_TXN", status: "FAILED", payload: data, error: message });
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
      provider,
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
    provider,
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
