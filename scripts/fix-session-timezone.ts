import "./_load-env";
import { currentDbHost } from "./_load-env";
import { PrismaClient } from "@prisma/client";
import { resolveClassSlots, startTimeForWeekday } from "../lib/classes/slots";
import { vnDateAt, vnParts, vnYmd } from "../lib/time/vn";

// =============================================================================
// Sửa DỮ LIỆU CŨ của bug múi giờ 06/08/2026 (buổi học lệch 1 ngày / sai giờ).
//
// Bug: mọi buổi sinh trên Vercel (Node chạy UTC) bị ghi bằng đồng hồ UTC —
// lớp 17:30 T7 20/06 lưu thành `2026-06-20T17:30:00Z`, ở VN đọc ra 00:30 CN 21/06.
// Code đã vá (`lib/time/vn.ts`), nhưng buổi ĐÃ SINH vẫn sai → cần sửa 1 lần.
//
// Nhận diện 2 dấu vết, KHÔNG đụng buổi đã đúng:
//   [UTC-WRITE]  giờ+thứ đọc theo UTC khớp lịch lớp, đọc theo VN thì KHÔNG
//                → dịch lại: lấy đúng số giờ đó nhưng hiểu là giờ VN.
//   [HAND-FIX]   buổi đã chỉnh tay qua nút "Điều chỉnh" (lưu 00:00Z = 07:00 VN):
//                ngày VN đã đúng lịch nhưng giờ sai → gắn lại giờ của thứ đó.
//
// Mặc định DRY-RUN (chỉ in ra). Ghi thật: thêm `--apply`.
// Bỏ qua buổi CANCELLED. Buổi COMPLETED chỉ sửa khi có thêm `--include-completed`.
//
//   npx tsx scripts/fix-session-timezone.ts                  # xem trước
//   npx tsx scripts/fix-session-timezone.ts --apply          # ghi
// =============================================================================

const APPLY = process.argv.includes("--apply");
const INCLUDE_COMPLETED = process.argv.includes("--include-completed");

const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const hhmm = (h: number, m: number) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;

/** Đọc thời điểm bằng đồng hồ UTC (chính là thứ mà code cũ đã ghi nhầm). */
function utcParts(d: Date) {
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth(),
    day: d.getUTCDate(),
    weekday: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
  };
}

const fmtVN = (d: Date) =>
  d.toLocaleString("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

type Fix = { id: string; kind: "UTC-WRITE" | "HAND-FIX"; from: Date; to: Date };

async function main() {
  console.log(`DB: ${currentDbHost()}`);
  console.log(APPLY ? "CHẾ ĐỘ: GHI THẬT (--apply)\n" : "CHẾ ĐỘ: xem trước, KHÔNG ghi (thêm --apply để sửa)\n");

  const statuses = INCLUDE_COMPLETED
    ? (["SCHEDULED", "IN_PROGRESS", "COMPLETED"] as const)
    : (["SCHEDULED", "IN_PROGRESS"] as const);

  const classes = await db.class.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      name: true,
      scheduleDays: true,
      startTime: true,
      endTime: true,
      scheduleSlots: { select: { weekday: true, startTime: true, endTime: true } },
      sessions: {
        where: { status: { in: [...statuses] } },
        orderBy: { date: "asc" },
        select: { id: true, date: true, status: true },
      },
    },
  });

  let totalFixes = 0;
  let skippedNoSchedule = 0;

  for (const cls of classes) {
    const slots = resolveClassSlots({
      scheduleDays: cls.scheduleDays,
      startTime: cls.startTime,
      endTime: cls.endTime,
      slots: cls.scheduleSlots,
    });
    // Không đủ dữ kiện (chưa có lịch hoặc chưa có giờ) → KHÔNG đoán, bỏ qua.
    if (slots.length === 0 || slots.every((s) => !s.startTime)) {
      if (cls.sessions.length > 0) skippedNoSchedule++;
      continue;
    }

    const fixes: Fix[] = [];
    for (const s of cls.sessions) {
      const v = vnParts(s.date);
      const u = utcParts(s.date);
      const slotVN = startTimeForWeekday(slots, v.weekday);
      const slotUTC = startTimeForWeekday(slots, u.weekday);

      // Đã đúng theo lịch VN → không đụng.
      if (slotVN && hhmm(v.hour, v.minute) === slotVN) continue;

      if (slotUTC && hhmm(u.hour, u.minute) === slotUTC) {
        // Dấu vết code cũ: ghi bằng đồng hồ UTC. Hiểu lại đúng số giờ đó là giờ VN.
        fixes.push({ id: s.id, kind: "UTC-WRITE", from: s.date, to: vnDateAt(u.year, u.month, u.day, u.hour, u.minute) });
      } else if (slotVN && u.hour === 0 && u.minute === 0) {
        // Dấu vết chỉnh tay: ngày VN đúng lịch nhưng giờ bị đẩy về 07:00 VN.
        fixes.push({ id: s.id, kind: "HAND-FIX", from: s.date, to: vnDateAt(v.year, v.month, v.day, ...splitHm(slotVN)) });
      }
      // Còn lại (buổi bù lệch thứ, giờ tự đặt…) → KHÔNG đoán, để nguyên.
    }

    if (fixes.length === 0) continue;
    totalFixes += fixes.length;

    console.log(`\n=== ${cls.name} — ${fixes.length} buổi cần sửa`);
    console.log(`    lịch: ${slots.map((s) => `${s.weekday}@${s.startTime || "?"}`).join(", ")}`);
    for (const f of fixes.slice(0, 5)) {
      console.log(`    [${f.kind}] ${fmtVN(f.from)}  →  ${fmtVN(f.to)}   (${vnYmd(f.from)} → ${vnYmd(f.to)})`);
    }
    if (fixes.length > 5) console.log(`    … và ${fixes.length - 5} buổi nữa`);

    if (APPLY) {
      await db.$transaction(fixes.map((f) => db.classSession.update({ where: { id: f.id }, data: { date: f.to } })));
      console.log(`    ✔ đã ghi ${fixes.length} buổi`);
    }
  }

  console.log(`\n────────────────────────────────────────`);
  console.log(`Tổng buổi cần sửa: ${totalFixes}`);
  if (skippedNoSchedule > 0) {
    console.log(`Bỏ qua ${skippedNoSchedule} lớp chưa có lịch/giờ (không đủ dữ kiện để suy).`);
  }
  if (!INCLUDE_COMPLETED) console.log(`Buổi đã COMPLETED chưa xét — thêm --include-completed nếu muốn.`);
  if (totalFixes > 0 && !APPLY) console.log(`\nChạy lại với --apply để ghi.`);
}

function splitHm(t: string): [number, number] {
  const [h, m] = t.split(":").map((x) => parseInt(x, 10));
  return [h || 0, m || 0];
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
