import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// =============================================================================
// QR ATTENDANCE TOKEN — Phase NHÓM 4
// Token xoay theo cửa sổ 30s (HMAC), không cần lưu DB. Chấp nhận cửa sổ hiện
// tại + 1 cửa sổ trước (grace ~30-60s) để bù trễ scan/clock skew.
// Token = "<centerId>.<window>.<sig>" — single-use enforced ở DB
// (unique [userId, type, qrToken]).
// =============================================================================

const WINDOW_MS = 30_000;

function secret(): string {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
}

function sign(centerId: string, windowIdx: number): string {
  return createHmac("sha256", secret())
    .update(`attendance:${centerId}:${windowIdx}`)
    .digest("base64url")
    .slice(0, 24);
}

function currentWindow(now = Date.now()): number {
  return Math.floor(now / WINDOW_MS);
}

/** Token QR cho cửa sổ hiện tại + thời điểm hết hạn (ms). */
export function generateQrToken(centerId: string): {
  token: string;
  expiresAt: number;
} {
  const w = currentWindow();
  return {
    token: `${centerId}.${w}.${sign(centerId, w)}`,
    expiresAt: (w + 1) * WINDOW_MS,
  };
}

/** Verify token; chấp nhận cửa sổ hiện tại và cửa sổ liền trước (grace). */
export function verifyQrToken(
  token: string,
  expectedCenterId: string,
): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [centerId, windowStr, sig] = parts;
  if (centerId !== expectedCenterId) return false;
  const w = Number.parseInt(windowStr, 10);
  if (Number.isNaN(w)) return false;

  const now = currentWindow();
  if (w !== now && w !== now - 1) return false; // chỉ chấp nhận 2 cửa sổ gần nhất

  const expected = sign(centerId, w);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Khoảng cách Haversine (mét) giữa 2 toạ độ. */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
