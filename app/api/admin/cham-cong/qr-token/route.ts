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
// Cả hai chế độ chỉ đòi quyền VIEW tại cơ sở đó.
//
// Bản đầu tôi gác mã tĩnh ở `hr_attendance:config` với lý lẽ "in mã là việc của người quản trị".
// Sai hai đường: (a) màn TV nay chiếu chính mã tĩnh, nên gác ở config là nhân viên cơ sở KHÔNG
// MỞ NỔI MÀN TV — mà mở TV là việc hằng ngày; (b) nó không mua được gì về bảo mật: tờ mã dán
// công khai ở quầy, ai đứng đó cũng chụp được. Gác chặt một thứ vốn không phải bí mật thì chỉ
// đổi lấy phiền toái. Thứ thật sự chặn người ở xa là ĐỊNH VỊ, không phải quyền xem mã.
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
  if (!(await checkPermission("hr_attendance:view", { centerId }))) {
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
