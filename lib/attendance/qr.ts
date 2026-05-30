import "server-only";
import { createHmac, timingSafeEqual } from "crypto";

// =============================================================================
// QR ATTENDANCE — Phase NHÓM 4 (Module Chấm công PHẦN 1)
// QR CỐ ĐỊNH mỗi cơ sở: mã gắn centerId, KHÔNG hết hạn (bỏ cửa sổ xoay 30s).
// Token = "<centerId>.<sig>" với sig = HMAC(centerId). Dán cố định tại quầy.
// Hợp lệ check-in ⇔ quét đúng QR cơ sở + GPS trong bán kính 100m của cơ sở.
// =============================================================================

/** Bán kính geofence chấm công (mét). */
export const GEOFENCE_RADIUS_METERS = 100;

function secret(): string {
  return process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET ?? "";
}

function sign(centerId: string): string {
  return createHmac("sha256", secret())
    .update(`attendance:${centerId}`)
    .digest("base64url")
    .slice(0, 24);
}

/** Token QR CỐ ĐỊNH cho cơ sở (không hết hạn). */
export function generateQrToken(centerId: string): { token: string } {
  return { token: `${centerId}.${sign(centerId)}` };
}

/** Verify token QR cố định: đúng định dạng + đúng centerId + chữ ký hợp lệ. */
export function verifyQrToken(token: string, expectedCenterId: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [centerId, sig] = parts;
  if (centerId !== expectedCenterId) return false;

  const expected = sign(centerId);
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
