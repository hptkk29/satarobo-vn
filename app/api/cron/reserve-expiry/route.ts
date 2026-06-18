import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { findExpiredReserves } from "@/lib/students/reserve-service";

export const dynamic = "force-dynamic";

// YYYY-MM-DD theo giờ VN (Asia/Ho_Chi_Minh) — khoá chống spam 1 cảnh báo/ngày/lượt bảo lưu.
const vnDate = (d: Date): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(d);

// LMS-11 / W3-3 — Cron quét bảo lưu QUÁ HẠN: StudentReserve còn hiệu lực (isActive,
// chưa endedAt) có expectedEndAt < now → cảnh báo nhân sự phụ trách (người tạo lượt
// bảo lưu) qua StaffNotification để xử lý thủ công (gia hạn / kết thúc / liên hệ PH).
// KHÔNG auto-resume — mặc định an toàn là cảnh báo. Idempotent 1 cảnh báo/ngày/lượt
// qua dedupeKey `reserve.expired:${reserveId}:${YYYY-MM-DD VN}`.
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const expired = await findExpiredReserves(now);

  const stats = {
    found: expired.length,
    notified: 0,
    skippedNoOwner: 0,
  };

  for (const r of expired) {
    // Không có người tạo (createdByUserId null) → không xác định được nhân sự phụ trách.
    if (!r.createdByUserId) {
      stats.skippedNoOwner++;
      continue;
    }
    const dueStr = r.expectedEndAt.toLocaleDateString("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
    });
    const dedupeKey = `reserve.expired:${r.id}:${vnDate(now)}`;
    await db.staffNotification.upsert({
      where: { userId_dedupeKey: { userId: r.createdByUserId, dedupeKey } },
      create: {
        userId: r.createdByUserId,
        category: "STUDENT",
        title: "Bảo lưu đã quá hạn",
        body: `Lượt bảo lưu của học viên ${r.studentName} đã quá hạn dự kiến quay lại (${dueStr}). Vui lòng liên hệ phụ huynh để gia hạn hoặc kết thúc bảo lưu.`,
        href: `/students/${r.studentId}`,
        dedupeKey,
      },
      update: {},
    });
    stats.notified++;
  }

  console.log("[cron] reserve-expiry:", stats);
  return NextResponse.json({ ok: true, stats });
}
