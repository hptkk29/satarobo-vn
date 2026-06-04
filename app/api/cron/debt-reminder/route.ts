import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { sendZaloNotification } from "@/lib/zalo/service";

export const dynamic = "force-dynamic";

const ZNS_TEMPLATE_DEBT = process.env.ZALO_ZNS_TEMPLATE_DEBT || null;

// Commit 4/5 — nhắc công nợ ĐỢT 2: từ ≤14 ngày trước dueDate đến khi đóng đủ (hoặc
// tới dueDate). Gửi qua ZALO OA (khi cấu hình) + fallback EMAIL. Chống spam: tối đa
// 1 nhắc/ngày/đợt (mốc lastReminderAt).
export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const in14d = new Date(now.getTime() + 14 * 86400 * 1000);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const dueSoon = await db.orderInstallment.findMany({
    where: {
      soDot: 2,
      status: "PENDING",
      dueDate: { gte: now, lte: in14d },
      order: { status: { notIn: ["CANCELLED", "REFUNDED"] } },
    },
    select: {
      id: true,
      amount: true,
      dueDate: true,
      lastReminderAt: true,
      order: {
        select: {
          code: true,
          customerName: true,
          customerEmail: true,
          customerPhone: true,
          totalAmount: true,
          items: { select: { itemName: true }, take: 1 },
        },
      },
    },
    take: 500,
  });

  const stats = { found: dueSoon.length, sent: 0, skippedToday: 0, skippedNoChannel: 0 };

  for (const inst of dueSoon) {
    // Đã nhắc hôm nay rồi → bỏ qua.
    if (inst.lastReminderAt && inst.lastReminderAt >= startOfToday) {
      stats.skippedToday++;
      continue;
    }
    const email = inst.order.customerEmail?.trim() || null;
    const phone = inst.order.customerPhone?.trim() || null;
    if (!email && !phone) {
      stats.skippedNoChannel++;
      continue;
    }
    const due = inst.dueDate ? new Date(inst.dueDate).toLocaleDateString("vi-VN") : "";
    const courseName = inst.order.items[0]?.itemName ?? "khoá học";
    const amountStr = inst.amount.toLocaleString("vi-VN");
    const bodyText = `Kính gửi ${inst.order.customerName ?? "Quý phụ huynh"},\nĐơn ${inst.order.code} (${courseName}) còn ${amountStr}đ học phí đợt 2, hạn đóng ${due}.\nQuý phụ huynh vui lòng hoàn tất trước hạn. Xin cảm ơn.\n— Sata Robo`;

    // Zalo OA khi đã cấu hình; chưa có → fallback EMAIL (chạy ngay).
    await sendZaloNotification({
      toPhone: phone ?? "",
      templateKey: ZNS_TEMPLATE_DEBT,
      params: { order: inst.order.code, amount: amountStr, due, course: courseName },
      fallbackEmail: email
        ? { to: email, toName: inst.order.customerName, subject: `Nhắc đóng học phí đợt 2 — đơn ${inst.order.code}`, bodyText }
        : null,
    }).catch(() => {});

    await db.orderInstallment.update({ where: { id: inst.id }, data: { lastReminderAt: now } });
    stats.sent++;
  }

  console.log("[cron] debt-reminder:", stats);
  return NextResponse.json({ ok: true, stats });
}
