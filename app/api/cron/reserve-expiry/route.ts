import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runReserveExpiryCheck } from "@/lib/students/reserve-expiry";

export const dynamic = "force-dynamic";

// LMS-11 — Cron (hàng ngày): quét bảo lưu quá hạn → cảnh báo staff (idempotent).
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await runReserveExpiryCheck();
  return NextResponse.json({ ok: true, data: result });
}
