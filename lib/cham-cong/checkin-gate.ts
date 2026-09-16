// lib/cham-cong/checkin-gate.ts — cổng vào trang check-in (L4): xác minh mã kiosk xoay → cấp vé.
// Dùng chung cho admin `/cham-cong/checkin` và site GV `/teacher/cham-cong/checkin`.
import "server-only";
import { db } from "@/lib/db";
import { getSigningSecret } from "@/lib/security/signing-key";
import { laMaTinh, verifyKioskToken, verifyStaticKioskToken } from "./kiosk-token";
import { issueTicket } from "./timelog";

export type CheckinGate =
  | { ok: true; ticketId: string; nonce: string; expiresAt: string; workLocation: { id: string; name: string; geofenceEnabled: boolean } }
  | { ok: false; error: string };

export async function prepareCheckin(input: { token: string | undefined; workLocationId: string | undefined; userId: string; ip?: string | null }): Promise<CheckinGate> {
  if (!input.token || !input.workLocationId) return { ok: false, error: "Mã QR không hợp lệ. Quét lại mã dán tại quầy chấm công." };

  // HAI DẠNG MÃ cùng đi qua cổng này: mã TĨNH in ra (đợt 2) và mã XOAY của màn TV. Giữ cả hai
  // vì mã đang chiếu trên TV không được chết giữa chừng lúc deploy, và một số cơ sở có thể còn
  // dùng màn TV một thời gian.
  const secret = getSigningSecret();
  let workLocationId: string;
  let keyVersion: number | null = null;

  if (laMaTinh(input.token)) {
    const v = verifyStaticKioskToken(input.token, secret);
    if (!v.ok) return { ok: false, error: "Mã QR không hợp lệ. Quét lại mã dán tại quầy chấm công." };
    workLocationId = v.workLocationId;
    keyVersion = v.keyVersion;
  } else {
    const v = verifyKioskToken(input.token, secret);
    if (!v.ok) {
      return { ok: false, error: v.reason === "EXPIRED" ? "Mã QR đã hết hạn. Quét lại mã đang hiện trên màn hình." : "Mã QR không hợp lệ. Quét lại mã dán tại quầy chấm công." };
    }
    workLocationId = v.workLocationId;
  }

  if (workLocationId !== input.workLocationId) return { ok: false, error: "Mã QR không khớp điểm chấm công." };
  const wl = await db.workLocation.findUnique({ where: { id: workLocationId }, select: { id: true, name: true, isActive: true, geofenceEnabled: true, latitude: true, longitude: true, qrKeyVersion: true } });
  if (!wl || !wl.isActive) return { ok: false, error: "Điểm chấm công đã tắt. Báo Quản lý cơ sở." };

  // Mã in đời cũ: chữ ký vẫn đúng nhưng tờ giấy đã bị thu hồi. Nói rõ để người quét đi lấy mã
  // mới chứ không đứng bấm lại.
  if (keyVersion !== null && keyVersion !== wl.qrKeyVersion) {
    return { ok: false, error: "Mã QR này đã bị thu hồi. Quét tờ mã MỚI dán tại quầy — hỏi Quản lý cơ sở nếu chưa thấy." };
  }
  const t = await issueTicket({ userId: input.userId, workLocationId: wl.id, ip: input.ip });
  return { ok: true, ticketId: t.ticketId, nonce: t.nonce, expiresAt: t.expiresAt.toISOString(), workLocation: { id: wl.id, name: wl.name, geofenceEnabled: wl.geofenceEnabled } };
}
