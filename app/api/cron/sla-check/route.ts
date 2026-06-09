import { NextResponse, type NextRequest } from "next/server";
import { verifyCronAuth } from "@/lib/cron/auth";
import { runSlaCheck } from "@/lib/crm/sla";

export const dynamic = "force-dynamic";

// R1-06 — Cron SLA (15'): quét lead vi phạm SLA → StaffNotification (dedupeKey).
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const result = await runSlaCheck();
  return NextResponse.json({ ok: true, data: result });
}
