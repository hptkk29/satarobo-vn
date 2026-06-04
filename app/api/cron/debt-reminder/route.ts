import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { enqueueEmail } from "@/lib/email/queue";

export const dynamic = "force-dynamic";

// Commit 4 — nhắc công nợ ĐỢT 2: từ ≤14 ngày trước dueDate đến khi đóng đủ (hoặc
// tới dueDate). Gửi EMAIL (EmailQueue). Zalo OA cắm ở commit 5. Chống spam: tối đa
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
          totalAmount: true,
          items: { select: { itemName: true }, take: 1 },
        },
      },
    },
    take: 500,
  });

  const stats = { found: dueSoon.length, sent: 0, skippedToday: 0, skippedNoEmail: 0 };

  for (const inst of dueSoon) {
    // Đã nhắc hôm nay rồi → bỏ qua.
    if (inst.lastReminderAt && inst.lastReminderAt >= startOfToday) {
      stats.skippedToday++;
      continue;
    }
    const email = inst.order.customerEmail?.trim();
    if (!email) {
      stats.skippedNoEmail++;
      continue;
    }
    const due = inst.dueDate ? new Date(inst.dueDate).toLocaleDateString("vi-VN") : "";
    const courseName = inst.order.items[0]?.itemName ?? "khoá học";
    const amountStr = inst.amount.toLocaleString("vi-VN");

    await enqueueEmail({
      to: email,
      toName: inst.order.customerName ?? undefined,
      subject: `Nhắc đóng học phí đợt 2 — đơn ${inst.order.code}`,
      bodyText: `Kính gửi ${inst.order.customerName ?? "Quý phụ huynh"},\nĐơn ${inst.order.code} (${courseName}) còn ${amountStr}đ học phí đợt 2, hạn đóng ${due}.\nQuý phụ huynh vui lòng hoàn tất trước hạn. Xin cảm ơn.\n— Sata Robo`,
      bodyHtml: `<div style="font-family:system-ui,sans-serif">
        <p>Kính gửi <b>${inst.order.customerName ?? "Quý phụ huynh"}</b>,</p>
        <p>Đơn <b>${inst.order.code}</b> (${courseName}) còn <b>${amountStr}đ</b> học phí <b>đợt 2</b>, hạn đóng <b>${due}</b>.</p>
        <p>Quý phụ huynh vui lòng hoàn tất trước hạn. Xin cảm ơn.</p>
        <p>— Sata Robo</p>
      </div>`,
      context: { type: "DEBT_REMINDER", id: inst.id },
    }).catch(() => {});

    await db.orderInstallment.update({ where: { id: inst.id }, data: { lastReminderAt: now } });
    stats.sent++;
  }

  console.log("[cron] debt-reminder:", stats);
  return NextResponse.json({ ok: true, stats });
}
