import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getSigningSecret } from "@/lib/security/signing-key";
import { makeKioskToken, KIOSK_WINDOW_SECONDS } from "@/lib/cham-cong/kiosk-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/cham-cong/qr-token?centerId=... — QR XOAY của điểm chấm công (L4).
// Màn hình TV poll mỗi ~30s. Token đổi mỗi 60s, máy chủ nhận thêm 2 cửa sổ trước.
// Chỉ staff có quyền view chấm công tại cơ sở đó.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const centerId = new URL(req.url).searchParams.get("centerId");
  if (!centerId) {
    return NextResponse.json({ error: "Thiếu centerId" }, { status: 400 });
  }
  if (!(await checkPermission("hr_attendance:view", { centerId }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sdb = scopedDb(await resolveActor(session.user.id));
  const wl = await sdb.workLocation.findFirst({ where: { centerId, isActive: true }, select: { id: true, name: true, geofenceEnabled: true } });
  if (!wl) {
    return NextResponse.json({ error: "Cơ sở chưa có điểm chấm công — vào Chấm công → Điểm chấm công để tạo (hoặc chạy seed nền)." }, { status: 404 });
  }
  const token = makeKioskToken(wl.id, getSigningSecret());
  const checkinUrl = `${req.nextUrl.origin}/cham-cong/checkin?w=${encodeURIComponent(wl.id)}&t=${encodeURIComponent(token)}`;
  const qrDataUrl = await QRCode.toDataURL(checkinUrl, { width: 360, margin: 1, errorCorrectionLevel: "M" });
  return NextResponse.json({ token, qrDataUrl, checkinUrl, workLocation: wl, windowSeconds: KIOSK_WINDOW_SECONDS });
}
