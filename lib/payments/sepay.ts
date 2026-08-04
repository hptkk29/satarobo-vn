// lib/payments/sepay.ts — BGĐ 31/07: tự động xác nhận đơn khi tiền về tài khoản.
//
// SePay (https://sepay.vn) đọc biến động số dư ngân hàng rồi POST webhook về hệ
// thống. Ta khớp giao dịch với ĐƠN HÀNG qua MÃ ĐƠN nằm trong nội dung chuyển khoản
// (QR đã nhúng sẵn mã đơn ở addInfo — xem lib/payments/vietqr.ts).
//
// Phần THUẦN (parse/khớp) tách khỏi route để test không cần HTTP/DB.

/** Payload SePay gửi về (chỉ khai các field ta dùng; SePay còn gửi thêm). */
export type SepayWebhookPayload = {
  /** id giao dịch trên SePay — khoá idempotency. */
  id?: number | string;
  gateway?: string;
  transactionDate?: string;
  accountNumber?: string;
  /** Nội dung chuyển khoản (thô). */
  content?: string;
  description?: string;
  /** "in" = tiền vào, "out" = tiền ra. */
  transferType?: string;
  transferAmount?: number;
  referenceCode?: string;
};

/** Bỏ dấu/ký tự lạ + viết hoa → so khớp không phụ thuộc định dạng ngân hàng. */
export function normalizeContent(raw: string | null | undefined): string {
  return (raw ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Rút MÃ ĐƠN từ nội dung CK. Mã đơn dạng `ORD-YYMMDD-NNNNNN`; ngân hàng thường
 * xoá dấu gạch nối nên ta tìm chuỗi `ORD` + 12 chữ số rồi dựng lại mã có gạch.
 * Trả null nếu nội dung không chứa mã hợp lệ.
 */
export function extractOrderCode(content: string | null | undefined): string | null {
  const norm = normalizeContent(content);
  const m = norm.match(/ORD(\d{12})/);
  if (!m) return null;
  const digits = m[1]!;
  return `ORD-${digits.slice(0, 6)}-${digits.slice(6)}`;
}

export type SepayMatchInput = {
  payload: SepayWebhookPayload;
  /** Đơn tra được theo mã (null nếu không tìm thấy). */
  order: {
    id: string;
    code: string;
    status: string;
    totalAmount: number;
    gatewayTxnId: string | null;
    discountApprovalStatus: string | null;
  } | null;
  /**
   * Số tiền PHẢI THU NGAY (lib/payments/due-now.ts) — khách chọn đóng 2 đợt thì
   * đây là đợt 1, KHÔNG phải tổng đơn. Thiếu tham số này (đường gọi cũ) thì lùi
   * về `order.totalAmount` để không đổi hành vi ngoài ý muốn.
   */
  dueNow?: { amount: number; soDot: number | null };
};

export type SepayMatchResult =
  | { action: "CONFIRM"; orderId: string; amount: number; soDot: number | null }
  | { action: "SKIP"; reason: string }
  | { action: "MANUAL"; reason: string };

/**
 * Quyết định xử lý 1 giao dịch (THUẦN). Nguyên tắc:
 *  - Chỉ xử lý tiền VÀO ("in").
 *  - Không khớp mã đơn / không thấy đơn → MANUAL (đối soát tay), KHÔNG lỗi.
 *  - Đã ghi cùng gatewayTxnId → SKIP (idempotent, SePay retry an toàn).
 *  - Đơn không ở PENDING_PAYMENT → SKIP (đã xác nhận / đã huỷ).
 *  - Giảm giá chưa được duyệt → MANUAL (không tự xác nhận vòng qua khâu duyệt).
 *  - Số tiền < tổng đơn → MANUAL (trả thiếu/đặt cọc: người thật quyết định).
 */
export function decideSepayAction(input: SepayMatchInput): SepayMatchResult {
  const { payload, order } = input;

  if ((payload.transferType ?? "in").toLowerCase() !== "in") {
    return { action: "SKIP", reason: "Không phải giao dịch tiền vào" };
  }
  const amount = Number(payload.transferAmount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { action: "SKIP", reason: "Số tiền không hợp lệ" };
  }
  if (!order) {
    return { action: "MANUAL", reason: "Không khớp mã đơn trong nội dung chuyển khoản" };
  }
  const txnId = payload.id != null ? String(payload.id) : null;
  if (txnId && order.gatewayTxnId === txnId) {
    return { action: "SKIP", reason: "Giao dịch đã được xử lý" };
  }
  if (order.status !== "PENDING_PAYMENT") {
    return { action: "SKIP", reason: `Đơn đang ở trạng thái ${order.status}` };
  }
  if (
    order.discountApprovalStatus === "PENDING_APPROVAL" ||
    order.discountApprovalStatus === "REJECTED"
  ) {
    return { action: "MANUAL", reason: "Giảm giá chưa được duyệt — cần xử lý tay" };
  }
  // Ngưỡng đối khớp = số tiền phải thu NGAY (đợt 1 nếu khách chọn 2 đợt), không
  // phải tổng đơn — nếu không, mọi ca trả góp đều rơi vào "trả thiếu → xử lý tay"
  // và luồng tự xác nhận coi như không tồn tại với khách đóng 2 đợt.
  const expected = input.dueNow?.amount ?? order.totalAmount;
  if (amount < expected) {
    return {
      action: "MANUAL",
      reason: `Số tiền ${amount} nhỏ hơn số phải thu ${expected}`,
    };
  }
  return { action: "CONFIRM", orderId: order.id, amount, soDot: input.dueNow?.soDot ?? null };
}

/**
 * Xác thực webhook: SePay gửi header `Authorization: Apikey <key>`.
 * Thiếu env → từ chối TẤT CẢ (không mở cửa khi chưa cấu hình).
 */
export function isValidSepayAuth(authHeader: string | null): boolean {
  const expected = process.env.SEPAY_WEBHOOK_API_KEY?.trim();
  if (!expected) return false;
  const got = (authHeader ?? "").trim();
  const prefix = /^apikey\s+/i;
  if (!prefix.test(got)) return false;
  return got.replace(prefix, "").trim() === expected;
}
