import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { generateQrToken } from "@/lib/attendance/qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/cham-cong/qr-token?centerId=... — token + ảnh QR (data URL).
// Màn hình TV poll mỗi ~25s. Chỉ staff có quyền view chấm công.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const centerId = new URL(req.url).searchParams.get("centerId");
  if (!(await checkPermission("hr_attendance:view", { centerId }))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (!centerId) {
    return NextResponse.json({ error: "Thiếu centerId" }, { status: 400 });
  }

  const { token } = generateQrToken(centerId);
  const checkinUrl = `${req.nextUrl.origin}/cham-cong/checkin?c=${encodeURIComponent(
    centerId,
  )}&t=${encodeURIComponent(token)}`;
  const qrDataUrl = await QRCode.toDataURL(checkinUrl, {
    width: 360,
    margin: 1,
    errorCorrectionLevel: "M",
  });

  return NextResponse.json({ token, qrDataUrl, checkinUrl });
}
