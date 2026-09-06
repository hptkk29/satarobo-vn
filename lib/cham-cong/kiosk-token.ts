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
