import "server-only";
import { db } from "@/lib/db";

// =============================================================================
// LMS-11 — Bảo lưu quá hạn: quét StudentReserve đang active có expectedEndAt < now
// → cảnh báo staff (StaffNotification idempotent). KHÔNG auto-resume (tránh đổi
// trạng thái HV ngoài ý muốn — để staff quyết định gia hạn / phục học).
// =============================================================================

export async function runReserveExpiryCheck(
  now: Date = new Date(),
): Promise<{ scanned: number; notified: number }> {
  const expired = await db.studentReserve.findMany({
    where: { isActive: true, expectedEndAt: { not: null, lt: now } },
    select: {
      id: true,
      studentId: true,
      expectedEndAt: true,
      createdByUserId: true,
      student: { select: { name: true } },
    },
  });

  let notified = 0;
  for (const r of expired) {
    const userId = r.createdByUserId;
    if (!userId) continue; // không có người phụ trách → bỏ qua (không có target)
    const dueStr = r.expectedEndAt?.toISOString().slice(0, 10) ?? "";
    await db.staffNotification.upsert({
      where: { userId_dedupeKey: { userId, dedupeKey: `reserve-expiry:${r.id}` } },
      update: { body: `Bảo lưu của ${r.student?.name ?? "HV"} đã quá hạn (${dueStr})` },
      create: {
        userId,
        category: "RESERVE_EXPIRY",
        title: "Bảo lưu quá hạn",
        body: `Bảo lưu của ${r.student?.name ?? "HV"} đã quá hạn (${dueStr}) — cần gia hạn hoặc cho phục học`,
        href: `/students/${r.studentId}/edit`,
        dedupeKey: `reserve-expiry:${r.id}`,
      },
    });
    notified++;
  }

  return { scanned: expired.length, notified };
}
