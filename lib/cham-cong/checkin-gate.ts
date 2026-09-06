// lib/cham-cong/checkin-gate.ts — cổng vào trang check-in (L4): xác minh mã kiosk xoay → cấp vé.
// Dùng chung cho admin `/cham-cong/checkin` và site GV `/teacher/cham-cong/checkin`.
import "server-only";
import { db } from "@/lib/db";
import { getSigningSecret } from "@/lib/security/signing-key";
import { verifyKioskToken } from "./kiosk-token";
import { issueTicket } from "./timelog";

export type CheckinGate =
  | { ok: true; ticketId: string; nonce: string; expiresAt: string; workLocation: { id: string; name: string; geofenceEnabled: boolean } }
  | { ok: false; error: string };

export async function prepareCheckin(input: { token: string | undefined; workLocationId: string | undefined; userId: string; ip?: string | null }): Promise<CheckinGate> {
  if (!input.token || !input.workLocationId) return { ok: false, error: "Mã QR không hợp lệ. Quét lại mã trên màn hình chấm công tại quầy." };
  const v = verifyKioskToken(input.token, getSigningSecret());
  if (!v.ok) {
    return { ok: false, error: v.reason === "EXPIRED" ? "Mã QR đã hết hạn (mã đổi mỗi phút). Quét lại mã đang hiện trên màn hình." : "Mã QR không hợp lệ. Quét lại mã trên màn hình chấm công tại quầy." };
  }
  if (v.workLocationId !== input.workLocationId) return { ok: false, error: "Mã QR không khớp điểm chấm công." };
  const wl = await db.workLocation.findUnique({ where: { id: v.workLocationId }, select: { id: true, name: true, isActive: true, geofenceEnabled: true } });
  if (!wl || !wl.isActive) return { ok: false, error: "Điểm chấm công đã tắt. Báo Quản lý cơ sở." };
  const t = await issueTicket({ userId: input.userId, workLocationId: wl.id, ip: input.ip });
  return { ok: true, ticketId: t.ticketId, nonce: t.nonce, expiresAt: t.expiresAt.toISOString(), workLocation: { id: wl.id, name: wl.name, geofenceEnabled: wl.geofenceEnabled } };
}
