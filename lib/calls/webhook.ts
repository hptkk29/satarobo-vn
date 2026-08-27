import "server-only";
import { createHmac } from "crypto";
import { rateLimit } from "@/lib/rate-limit";
import { safeEqual } from "@/lib/security/safe-equal";
import { logWebhookDelivery, markWebhookDelivery } from "@/lib/lead/webhook";
import { docMaCuocGoi } from "@/lib/calls/cdr";
import { napCdr } from "@/lib/calls/nap-cdr";

// =============================================================================
// WEBHOOK CDR — chép NGUYÊN khuôn `lib/lead/webhook.ts:260-338`.
//
// Bảy bước, đúng thứ tự này, và thứ tự là phần quan trọng nhất:
//   1. giới hạn tần suất theo IP (fail-soft)
//   2. chặn thân quá lớn (đọc `content-length` TRƯỚC khi đọc thân)
//   3. kiểm bí mật, FAIL-CLOSED trên production (thiếu secret → 503, KHÔNG tạo record)
//   4. đọc thân thô ĐÚNG MỘT LẦN (chữ ký tính trên byte gốc)
//   5. kiểm chữ ký (401 nếu sai)
//   6. ghi `WebhookDelivery` TRƯỚC khi xử lý — có gì cũng còn vết
//   7. `markWebhookDelivery` với trạng thái PROCESSED | DUPLICATE | FAILED
//
// ⚠️ TQ-5 CHƯA CÓ LỜI ĐÁP: tài liệu OMICall được ghi lại là cấu hình bằng
// "Api-key + Domain" (`docs/ba-crm-hien-trang-va-misa.md:454`), tức CÓ THỂ KHÔNG
// CÓ CHỮ KÝ. Vì vậy file này bảo vệ hai lớp và lớp thứ hai là TUỲ CHỌN:
//   · `OMICALL_WEBHOOK_SECRET` — shared secret bắt buộc (bước 3);
//   · `OMICALL_WEBHOOK_SIGNING_SECRET` — nếu ĐẶT thì chữ ký HMAC-SHA256 trở thành
//     BẮT BUỘC. Không đặt thì bỏ qua bước ký.
// Nếu nhà cung cấp xác nhận "không có chữ ký" thì rủi ro còn lại phải ghi vào biên
// bản, và bù bằng allowlist IP ở tầng hạ tầng — code không làm thay được.
//
// ⚠️ LUÔN trả 200 cho payload hợp lệ (kể cả xử lý lỗi) — 5xx làm provider retry bão.
// =============================================================================

const NGUON = "omicall-cdr";

export type CallWebhookResult = {
  httpStatus: number;
  body: { ok: boolean; error?: string; callLogId?: string; duplicate?: boolean };
};

type KiemKetQua = { ok: true } | { ok: false; lyDo: "missing-secret" | "mismatch" };

/**
 * Bước 3 — bí mật dùng chung. FAIL-CLOSED trên production: thiếu secret là lỗi
 * CẤU HÌNH của mình, trả 503 và KHÔNG tạo bản ghi nào. Dev/test giữ chế độ stub
 * để chạy được fixture tay mà chưa cần secret thật.
 */
export function kiemBiMatWebhook(req: Request): KiemKetQua {
  const expected = process.env.OMICALL_WEBHOOK_SECRET;
  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      // Không log giá trị secret (luật cứng #9) — chỉ log là THIẾU.
      console.error(
        `[webhook:${NGUON}] THIẾU OMICALL_WEBHOOK_SECRET trên production — TỪ CHỐI (fail-closed).`,
      );
      return { ok: false, lyDo: "missing-secret" };
    }
    console.warn(
      `[webhook:${NGUON}] CHƯA cấu hình OMICALL_WEBHOOK_SECRET — chế độ stub (không xác thực).`,
    );
    return { ok: true };
  }
  const url = new URL(req.url);
  const provided =
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-omicall-key") ??
    url.searchParams.get("secret") ??
    "";
  return provided.length > 0 && safeEqual(provided, expected)
    ? { ok: true }
    : { ok: false, lyDo: "mismatch" };
}

/**
 * Bước 5 — chữ ký HMAC-SHA256 trên BYTE GỐC. Chỉ áp dụng khi
 * `OMICALL_WEBHOOK_SIGNING_SECRET` đã đặt (xem ghi chú TQ-5 đầu file).
 */
export function kiemChuKy(rawBody: string, header: string | null): KiemKetQua {
  const secret = process.env.OMICALL_WEBHOOK_SIGNING_SECRET;
  if (!secret) return { ok: true }; // nhà cung cấp chưa xác nhận có ký hay không
  if (!header) return { ok: false, lyDo: "mismatch" };
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const provided = header.startsWith("sha256=") ? header.slice(7) : header;
  return safeEqual(provided, expected) ? { ok: true } : { ok: false, lyDo: "mismatch" };
}

export async function xuLyWebhookCdr(req: Request): Promise<CallWebhookResult> {
  // ── 1. Giới hạn tần suất theo IP. fail-soft (Upstash → bộ nhớ). ──────────
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const rl = await rateLimit({ key: `webhook:${NGUON}:${ip}`, max: 120, windowMs: 60_000 });
  if (!rl.success) {
    return { httpStatus: 429, body: { ok: false, error: "Quá nhiều request — thử lại sau" } };
  }

  // ── 2. Chặn thân quá lớn TRƯỚC khi đọc. ─────────────────────────────────
  if (Number(req.headers.get("content-length") ?? 0) > 100_000) {
    return { httpStatus: 413, body: { ok: false, error: "Payload quá lớn" } };
  }

  // ── 3. Bí mật, fail-closed. ─────────────────────────────────────────────
  const biMat = kiemBiMatWebhook(req);
  if (!biMat.ok) {
    return biMat.lyDo === "missing-secret"
      ? { httpStatus: 503, body: { ok: false, error: "Webhook chưa cấu hình secret" } }
      : { httpStatus: 401, body: { ok: false, error: "Unauthorized" } };
  }

  // ── 4. Đọc thân thô ĐÚNG MỘT LẦN. ───────────────────────────────────────
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    raw = "";
  }

  // ── 5. Chữ ký. ──────────────────────────────────────────────────────────
  const chuKy = kiemChuKy(raw, req.headers.get("x-omicall-signature"));
  if (!chuKy.ok) {
    console.warn(`[webhook:${NGUON}] chữ ký không hợp lệ`);
    return { httpStatus: 401, body: { ok: false, error: "Chữ ký không hợp lệ" } };
  }

  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    payload = null;
  }

  // ── 6. Ghi WebhookDelivery TRƯỚC khi xử lý. ─────────────────────────────
  // `WebhookDelivery` đã có sẵn `@@index([source, externalId])` — đúng chỗ để
  // chống trùng, nên mã giao dịch của nhà cung cấp vào thẳng `externalId`.
  const maCuocGoi = docMaCuocGoi(payload);
  const deliveryId = await logWebhookDelivery({
    source: NGUON,
    externalId: maCuocGoi,
    payload: payload ?? {},
  });

  // ── 7. Xử lý + đánh dấu. ────────────────────────────────────────────────
  try {
    const kq = await napCdr(payload);
    if (!kq.ok) {
      await markWebhookDelivery(deliveryId, "FAILED", kq.ma);
      return { httpStatus: 200, body: { ok: false, error: kq.thongDiep } };
    }
    // OC-1 — TRÙNG có trạng thái RIÊNG. Đây là chỗ "không cộng chỉ tiêu lần hai":
    // `napCdr` đã dừng ở nhánh cập-nhật-vết, không tạo bản ghi thứ hai.
    await markWebhookDelivery(deliveryId, kq.trung ? "DUPLICATE" : "PROCESSED");
    return {
      httpStatus: 200,
      body: { ok: true, callLogId: kq.callLogId, duplicate: kq.trung },
    };
  } catch (err) {
    console.error(`[webhook:${NGUON}] lỗi xử lý:`, err);
    await markWebhookDelivery(deliveryId, "FAILED", "Lỗi hệ thống");
    return { httpStatus: 200, body: { ok: false, error: "Lỗi hệ thống" } };
  }
}
