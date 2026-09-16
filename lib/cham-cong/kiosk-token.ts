// lib/cham-cong/kiosk-token.ts — mã QR XOAY trên màn hình quầy (L4). THUẦN (chỉ crypto).
//
// Token = <workLocationId>.<cửa sổ 60s>.<HMAC>. Màn hình quầy làm mới mỗi 30s; máy chủ nhận
// cửa sổ hiện tại + 2 cửa sổ trước (≤ 3 phút) để người quét xong còn kịp bấm. Thay cho mã CỐ
// ĐỊNH không hết hạn của bản cũ (chụp ảnh QR là chấm được từ nhà). Sau khi qua cửa này, mỗi lượt
// còn phải có VÉ riêng (AttendanceTicket, 120s, tiêu nguyên tử) — xem timelog.ts.
import { createHmac, timingSafeEqual } from "crypto";

export const KIOSK_WINDOW_SECONDS = 60;
export const KIOSK_ALLOW_PREVIOUS_WINDOWS = 2;

export function kioskWindowIndex(now: Date, windowSeconds = KIOSK_WINDOW_SECONDS): number {
  return Math.floor(now.getTime() / 1000 / windowSeconds);
}

function sign(workLocationId: string, windowIndex: number, secret: string): string {
  return createHmac("sha256", secret).update(`kiosk:${workLocationId}:${windowIndex}`).digest("base64url").slice(0, 24);
}

export function makeKioskToken(workLocationId: string, secret: string, now: Date = new Date()): string {
  const w = kioskWindowIndex(now);
  return `${workLocationId}.${w}.${sign(workLocationId, w, secret)}`;
}

export type KioskVerify = { ok: true; workLocationId: string; ageWindows: number } | { ok: false; reason: "FORMAT" | "EXPIRED" | "SIGNATURE" };

export function verifyKioskToken(token: string, secret: string, now: Date = new Date()): KioskVerify {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "FORMAT" };
  const [workLocationId, wStr, sig] = parts;
  const w = Number(wStr);
  if (!workLocationId || !Number.isInteger(w) || !sig) return { ok: false, reason: "FORMAT" };
  const current = kioskWindowIndex(now);
  const age = current - w;
  if (age < 0 || age > KIOSK_ALLOW_PREVIOUS_WINDOWS) return { ok: false, reason: "EXPIRED" };
  const a = Buffer.from(sig);
  const b = Buffer.from(sign(workLocationId, w, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "SIGNATURE" };
  return { ok: true, workLocationId, ageWindows: age };
}

// ── Mã TĨNH in ra dán ở quầy (đợt 2, chốt 07/09/2026) ───────────────────────────────────
//
// Chủ dự án chốt: "chỉ dùng 1 QR để chấm công, QR tĩnh không thay đổi nữa, in ra đặt tại các
// trung tâm".
//
// Mã tĩnh MẤT ĐÚNG MỘT LỚP so với mã xoay: cửa sổ 60s. Rủi ro cụ thể là chụp ảnh mã dán ở quầy
// rồi gửi cho nhau, chấm từ nhà. Vé một lần (`AttendanceTicket`, 120s) KHÔNG cứu được — người ở
// xa mở URL là có vé mới; vé chỉ chặn bấm lại cùng một lượt. Lớp bù duy nhất còn lại là ĐỊNH VỊ,
// nên `timelog.ts` nay CHẶN khi ngoài vùng ở điểm đã khai toạ độ (chốt của chủ dự án).
//
// `keyVersion` là cách DUY NHẤT thu hồi một tờ mã đã in mà không phải đổi `NEXTAUTH_SECRET` —
// khoá đó dùng chung cho session, vé SCORM, cookie portal, OTP, đổi nó là đá sập cả hệ thống.
// Mất tờ giấy / nhân viên nghỉ mang theo ảnh chụp ⇒ tăng `WorkLocation.qrKeyVersion` lên 1, in
// lại, mọi ảnh chụp cũ chết ngay.
//
// GIỮ NGUYÊN cặp hàm xoay ở trên: mã đang chiếu trên màn TV không được chết giữa chừng lúc
// deploy, và hai dạng cùng đi qua một cổng.

/** Token tĩnh: `<workLocationId>.v<keyVersion>.<HMAC>` — không có chỉ số cửa sổ, không hết hạn. */
export function makeStaticKioskToken(workLocationId: string, keyVersion: number, secret: string): string {
  return `${workLocationId}.v${keyVersion}.${signStatic(workLocationId, keyVersion, secret)}`;
}

function signStatic(workLocationId: string, keyVersion: number, secret: string): string {
  return createHmac("sha256", secret)
    .update(`kiosk-static:${workLocationId}:${keyVersion}`)
    .digest("base64url")
    .slice(0, 24);
}

export type StaticVerify =
  | { ok: true; workLocationId: string; keyVersion: number }
  | { ok: false; reason: "FORMAT" | "SIGNATURE" };

/**
 * Kiểm mã tĩnh. KHÔNG kiểm `keyVersion` có còn dùng hay không — việc đó cần đọc DB, làm ở
 * `checkin-gate.ts`. Ở đây chỉ trả về version đọc được để chỗ gọi so với bản đang hiệu lực.
 */
export function verifyStaticKioskToken(token: string, secret: string): StaticVerify {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "FORMAT" };
  const [workLocationId, vStr, sig] = parts;
  if (!workLocationId || !sig || !vStr.startsWith("v")) return { ok: false, reason: "FORMAT" };
  const keyVersion = Number(vStr.slice(1));
  if (!Number.isInteger(keyVersion) || keyVersion < 1) return { ok: false, reason: "FORMAT" };
  const a = Buffer.from(sig);
  const b = Buffer.from(signStatic(workLocationId, keyVersion, secret));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "SIGNATURE" };
  return { ok: true, workLocationId, keyVersion };
}

/** Mã tĩnh hay mã xoay — phân biệt bằng chỉ số cửa sổ có tiền tố `v` hay không. */
export function laMaTinh(token: string): boolean {
  const parts = token.split(".");
  return parts.length === 3 && parts[1].startsWith("v");
}
