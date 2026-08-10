import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { processEmailQueue } from "@/lib/email/queue";
import { safeEqual } from "@/lib/security/safe-equal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Worker xử lý EmailQueue. Chạy qua cron (CRON_SECRET) HOẶC thủ công bởi admin
// có quyền emails:view. Trả về số đã gửi/lỗi.
async function authorize(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const header = req.headers.get("authorization");
    if (safeEqual(header ?? "", `Bearer ${secret}`)) return true;
  }
  const session = await auth();
  return !!session?.user && (await checkPermission("emails:view"));
}

export async function GET(req: NextRequest) {
  if (!(await authorize(req))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // 10/08 — KẸP TRẦN. Trước đây `?limit=` đi thẳng vào `take` không chặn: một request
  // `?limit=100000` vét sạch hàng đợi trong một nhịp. Nguy hiểm vì route này nhận CẢ phiên
  // admin (`emails:view`), và hàng đợi có thể ôm email tồn nhiều ngày — bấm nhầm là cả
  // đống thư cũ bay ra khách cùng lúc. Số âm/NaN cũng phải chặn (`take: -1` làm Prisma nổ).
  const raw = Number(new URL(req.url).searchParams.get("limit") ?? 25);
  const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 100) : 25;
  const result = await processEmailQueue(limit);
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

export const POST = GET;
