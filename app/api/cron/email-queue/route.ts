import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { processEmailQueue } from "@/lib/email/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Worker xử lý EmailQueue. Chạy qua cron (CRON_SECRET) HOẶC thủ công bởi admin
// có quyền emails:view. Trả về số đã gửi/lỗi.
async function authorize(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization");
    if (header === `Bearer ${secret}`) return true;
  }
  const session = await auth();
  return !!session?.user && can(session.user, "emails:view");
}

export async function GET(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 25);
  const result = await processEmailQueue(Number.isFinite(limit) ? limit : 25);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export const POST = GET;
