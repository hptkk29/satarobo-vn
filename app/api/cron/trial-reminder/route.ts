// app/api/cron/trial-reminder/route.ts — GĐ6.
//
// Nhắc SALE trước buổi trải nghiệm, để Sale tự nhắn phụ huynh qua Zalo cá nhân.
//
// ⚠️ Hệ thống KHÔNG gửi tin tự động cho phụ huynh (không ZNS, không Zalo OA) — đây là
// chốt nghiệp vụ, không phải giới hạn kỹ thuật. Vai trò của cron này chỉ là nhắc ĐÚNG
// NGƯỜI ĐÚNG LÚC; việc liên lạc vẫn do Sale làm tay.
//
// Hai mốc nhắc, chạy chung một route:
//   - "1 ngày": buổi diễn ra trong khoảng 12h–36h tới.
//   - "2 giờ" : buổi diễn ra trong khoảng 1h–3h tới.
// Cửa sổ rộng hơn mốc danh nghĩa vì cron chỉ chạy theo nhịp cố định; hẹp quá thì buổi
// rơi vào khe giữa hai lần chạy sẽ không bao giờ được nhắc.
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { verifyCronAuth } from "@/lib/cron/auth";
import { notifyStaff } from "@/lib/notifications/notify";
import { vnParts } from "@/lib/time/vn";

export const dynamic = "force-dynamic";

/** Mốc thật của một buổi: cột `date` là UTC-midnight ngày VN, giờ nằm ở chuỗi `startTime`. */
function mocBatDau(date: Date, startTime: string): Date | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
  if (!m) return null;
  // `date` đã là UTC 00:00 của ngày VN ⇒ cộng giờ VN rồi trừ 7 tiếng ra mốc UTC thật.
  const ms =
    date.getTime() + (Number(m[1]) * 60 + Number(m[2])) * 60_000 - 7 * 3_600_000;
  return new Date(ms);
}

type Moc = { ten: "1-ngay" | "2-gio"; tuGio: number; denGio: number; nhan: string };

const MOC: readonly Moc[] = [
  { ten: "1-ngay", tuGio: 12, denGio: 36, nhan: "ngày mai" },
  { ten: "2-gio", tuGio: 1, denGio: 3, nhan: "khoảng 2 tiếng nữa" },
];

export async function GET(req: NextRequest) {
  if (!verifyCronAuth(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  // Quét rộng một lần rồi lọc trong bộ nhớ: cột `date` chỉ có NGÀY nên không thể lọc
  // theo giờ ở tầng SQL. Số buổi trải nghiệm mỗi ngày rất nhỏ, không đáng lo về tải.
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
    const moc = MOC.find((m) => conBaoLau >= m.tuGio && conBaoLau < m.denGio);
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

      const p = vnParts(batDau);
      const gio = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
      const ngay = `${String(p.day).padStart(2, "0")}/${String(p.month + 1).padStart(2, "0")}`;

      await notifyStaff({
        userIds: [userId],
        // Khoá kèm MỐC nhắc: một buổi được nhắc hai lần (1 ngày và 2 giờ) là hai việc
        // khác nhau. Kèm cả id ca để hai bé cùng buổi không đè chuông của nhau.
        dedupeKey: `trial.reminder:${moc.ten}:${ca.id}:${s.id}`,
        category: "TRIAL",
        title:
          moc.ten === "1-ngay"
            ? "Nhắc phụ huynh buổi trải nghiệm ngày mai"
            : "Buổi trải nghiệm sắp bắt đầu",
        // SĐT nằm trong body có chủ đích: nhắc việc mà phải mở lead ra mới gọi được thì
        // mất đúng cái tiện. `notifyStaff` tự che bớt số trước khi lưu.
        body: `Nhắn phụ huynh ${lead?.parentName ?? ""} (${lead?.phone ?? "chưa có SĐT"}) về buổi trải nghiệm của ${ca.leadChild?.fullName ?? "học viên"} — buổi ${s.seq} lớp ${s.trialClass?.name ?? ""}, ${moc.nhan} lúc ${gio} ngày ${ngay}.`,
        href: lead?.id ? `/leads/${lead.id}` : "/lop-trial",
        entityId: ca.id,
      });
      stats.daNhac++;
    }
  }

  return NextResponse.json({ ok: true, ...stats });
}
