import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runParentRequestReminder } from "@/lib/portal/parent-request-notify";

export const dynamic = "force-dynamic";

// #08 (L8.2, câu 40) — Cron nhắc yêu cầu phụ huynh quá hạn: quét ParentRequest PENDING
// > 12h → StaffNotification nhắc Sale/QL cơ sở, dedupe theo requestId (mỗi yêu cầu 1 lần).
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await runParentRequestReminder();
  return NextResponse.json({ ok: true, data: result });
}
