// app/api/cron/trial-reminder/route.ts — GĐ6.
//
// Nhắc SALE trước buổi trải nghiệm, để Sale tự nhắn phụ huynh qua Zalo cá nhân.
//
// ⚠️ Hệ thống KHÔNG gửi tin tự động cho phụ huynh (không ZNS, không Zalo OA) — đây là
// chốt nghiệp vụ, không phải giới hạn kỹ thuật. Vai trò của cron này chỉ là nhắc ĐÚNG
// NGƯỜI ĐÚNG LÚC; việc liên lạc vẫn do Sale làm tay.
//
// Hai mốc nhắc, chạy chung một route: "1 ngày" (23h–25h tới) và "2 giờ" (1,5h–2,5h tới).
// Bề rộng cửa sổ + lý do phải rộng hơn nhịp cron một chút: xem `MOC` trong `_moc.ts`.
//
// Nội dung nhắc in NGÀY-GIỜ THẬT, không dùng chữ tương đối ("ngày mai") — chữ tương đối
// chỉ đúng khi cửa sổ trùng khít mốc danh nghĩa, và đã từng sai đúng như vậy (lỗi #21).
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { notifyStaff } from "@/lib/notifications/notify";
import { chonMoc, mocBatDau, nhanThoiDiem } from "./_moc";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Quét rộng một lần rồi lọc trong bộ nhớ: cột `date` chỉ có NGÀY nên không thể lọc
  // theo giờ ở tầng SQL. Số buổi trải nghiệm mỗi ngày rất nhỏ, không đáng lo về tải.
  // Khoảng quét (−24h…+72h) CỐ Ý rộng hơn cửa sổ nhắc (tối đa 25h): buổi 23:59 của ngày
  // VN lệch tới +31h so với mốc UTC-midnight của chính nó — cắt sát là mất buổi cuối ngày.
  const sessions = await db.trialClassSession.findMany({
    where: {
      status: "SCHEDULED",
      date: {
        gte: new Date(now.getTime() - 24 * 3_600_000),
        lte: new Date(now.getTime() + 72 * 3_600_000),
      },
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      seq: true,
      trialClass: { select: { name: true, centerId: true } },
    },
  });

  const stats = { buoiQuet: sessions.length, daNhac: 0, boQua: 0 };

  for (const s of sessions) {
    const batDau = mocBatDau(s.date, s.startTime);
    if (!batDau) {
      stats.boQua++;
      continue;
    }
    const conBaoLau = (batDau.getTime() - now.getTime()) / 3_600_000;
    const moc = chonMoc(conBaoLau);
    if (!moc) continue;

    // Ca ĐANG HỌC được xếp vào buổi này. Ca đã gỡ/đã xong thì không nhắc nữa.
    const cas = await db.trialEnrollment.findMany({
      where: { scheduledSessionId: s.id, status: "ACTIVE" },
      select: {
        id: true,
        leadChild: {
          select: {
            fullName: true,
            lead: {
              select: { id: true, parentName: true, phone: true, assignedToId: true, adminId: true },
            },
          },
        },
      },
    });

    for (const ca of cas) {
      const lead = ca.leadChild?.lead;
      // Người nhận là Sale phụ trách; không có thì admin lead. Không ai thì bỏ qua —
      // gửi cho cả cơ sở là làm nhiễu chuông của người không liên quan.
      const userId = lead?.assignedToId ?? lead?.adminId;
      if (!userId) {
        stats.boQua++;
        continue;
      }

      const { gio, ngay } = nhanThoiDiem(batDau);

      await notifyStaff({
        userIds: [userId],
        // Khoá kèm MỐC nhắc: một buổi được nhắc hai lần (1 ngày và 2 giờ) là hai việc
        // khác nhau. Kèm cả id ca để hai bé cùng buổi không đè chuông của nhau.
        dedupeKey: `trial.reminder:${moc.ten}:${ca.id}:${s.id}`,
        category: "TRIAL",
        // Tiêu đề in NGÀY/GIỜ THẬT thay vì "ngày mai": cửa sổ cron rộng hơn mốc danh
        // nghĩa nên chữ tương đối có thể lệch hẳn một ngày (lỗi #21).
        title:
          moc.ten === "1-ngay"
            ? `Nhắc phụ huynh buổi trải nghiệm ${gio} ngày ${ngay}`
            : `Buổi trải nghiệm bắt đầu lúc ${gio} ngày ${ngay}`,
        // SĐT nằm trong body có chủ đích: nhắc việc mà phải mở lead ra mới gọi được thì
        // mất đúng cái tiện. `notifyStaff` tự che bớt số trước khi lưu.
        body: `Nhắn phụ huynh ${lead?.parentName ?? ""} (${lead?.phone ?? "chưa có SĐT"}) về buổi trải nghiệm của ${ca.leadChild?.fullName ?? "học viên"} — buổi ${s.seq} lớp ${s.trialClass?.name ?? ""}, lúc ${gio} ngày ${ngay}.`,
        href: lead?.id ? `/leads/${lead.id}` : "/lop-trial",
        entityId: ca.id,
      });
      stats.daNhac++;
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}
