import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getSigningSecret } from "@/lib/security/signing-key";
import { makeKioskToken, makeStaticKioskToken, KIOSK_WINDOW_SECONDS } from "@/lib/cham-cong/kiosk-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/cham-cong/qr-token?centerId=…[&workLocationId=…][&tinh=1]
//
// Hai chế độ:
//  · mặc định — QR XOAY cho màn hình TV (đổi mỗi 60s, máy chủ nhận thêm 2 cửa sổ trước).
//  · `tinh=1` — QR TĨNH để IN RA dán tại quầy (chốt chủ dự án 07/09). Mã không đổi, không hết
//    hạn; thu hồi bằng cách tăng `WorkLocation.qrKeyVersion`.
//
// `workLocationId` để chọn ĐÚNG điểm khi một cơ sở có nhiều quầy — trước đây `findFirst` lấy
// bừa điểm đầu tiên, nên cơ sở hai quầy thì quầy thứ hai không bao giờ in được mã của mình.
//
// Chỉ staff có quyền view chấm công tại cơ sở đó. Mã TĨNH thì đòi quyền cấu hình: in mã là việc
// một lần của người quản trị điểm, không phải việc ai mở màn cũng làm được.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = new URL(req.url).searchParams;
  const centerId = q.get("centerId");
  const workLocationId = q.get("workLocationId");
  const tinh = q.get("tinh") === "1";
  if (!centerId) {
    return NextResponse.json({ error: "Thiếu centerId" }, { status: 400 });
  }
  const quyen = tinh ? "hr_attendance:config" : "hr_attendance:view";
  if (!(await checkPermission(quyen, { centerId }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const sdb = scopedDb(await resolveActor(session.user.id));
  const wl = workLocationId
    ? await sdb.workLocation.findFirst({ where: { id: workLocationId, centerId, isActive: true }, select: { id: true, name: true, geofenceEnabled: true, qrKeyVersion: true } })
    : await sdb.workLocation.findFirst({ where: { centerId, isActive: true }, select: { id: true, name: true, geofenceEnabled: true, qrKeyVersion: true } });
  if (!wl) {
    return NextResponse.json({ error: "Cơ sở chưa có điểm chấm công — vào Chấm công → Điểm chấm công để tạo (hoặc chạy seed nền)." }, { status: 404 });
  }

  const token = tinh
    ? makeStaticKioskToken(wl.id, wl.qrKeyVersion, getSigningSecret())
    : makeKioskToken(wl.id, getSigningSecret());
  const checkinUrl = `${req.nextUrl.origin}/cham-cong/checkin?w=${encodeURIComponent(wl.id)}&t=${encodeURIComponent(token)}`;
  // Mã in ra to hơn và sửa lỗi ở mức cao hơn: tờ giấy dán ở quầy sẽ bị mờ, bị xước, bị dán đè
  // góc — mức M chịu được ~15% hỏng, mức Q chịu ~25%.
  const qrDataUrl = await QRCode.toDataURL(checkinUrl, {
    width: tinh ? 720 : 360,
    margin: tinh ? 2 : 1,
    errorCorrectionLevel: tinh ? "Q" : "M",
  });
  return NextResponse.json({
    token,
    qrDataUrl,
    checkinUrl,
    workLocation: wl,
    tinh,
    ...(tinh ? { qrKeyVersion: wl.qrKeyVersion } : { windowSeconds: KIOSK_WINDOW_SECONDS }),
  });
}
