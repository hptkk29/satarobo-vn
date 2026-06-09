import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runMarketingAlerts } from "@/lib/crm/marketing-alerts";

export const dynamic = "force-dynamic";

// R1-09 C9.5 + R1-12 C12.3 — cron hằng ngày: alert chốt chi phí / báo cáo trễ.
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await runMarketingAlerts();
  return NextResponse.json({ ok: true, data: result });
}
