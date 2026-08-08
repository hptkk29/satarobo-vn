import "./_load-env";
import { currentDbHost } from "./_load-env";
import { PrismaClient } from "@prisma/client";
import { auditSessionSeries } from "../lib/classes/session-audit";
import { legacyPhaseFromClass, type SchedulePhase } from "../lib/classes/phases";
import { expandHolidaySet } from "../lib/classes/schedule";
import { vnStartOfDay, vnYmd } from "../lib/time/vn";
import { vnHm } from "../lib/classes/slots";

// =============================================================================
// RÀ SOÁT "buổi học có khớp ngày khai giảng + lịch học không" — THUẦN ĐỌC.
//
// Vì sao cần: dãy buổi chỉ được xếp MỘT LẦN (lúc duyệt lớp). Đổi ngày khai giảng sau
// đó chỉ tính lại `Class.endDate`, còn `ClassSession` giữ nguyên dãy cũ ⇒ lịch lớp và
// buổi học lệch nhau âm thầm (ca prod 08/08/2026: lệch 5 tuần, 48 buổi).
//
//   npx tsx scripts/audit-class-sessions.ts
//
// KHÔNG có chế độ sửa: việc sửa đi qua nút "Xếp lại buổi theo lịch" ở màn lớp (hoặc
// /admin/classes/kiem-tra-lich) để dùng đúng một đường code đã có audit log + soát
// trùng phòng/GV + giữ buổi đã có dữ liệu.
// =============================================================================

const db = new PrismaClient({
  datasources: { db: { url: process.env.DIRECT_URL || process.env.DATABASE_URL } },
});

const SEVERITY_TEXT: Record<string, string> = {
  ANCHOR_WRONG: "NEO SAI NGÀY KHAI GIẢNG",
  NO_SESSIONS: "CHƯA CÓ BUỔI NÀO",
  DRIFT: "lệch giữa khoá",
  NO_SCHEDULE: "thiếu lịch / ngày khai giảng",
};

const fmt = (d: Date | null) => (d ? `${vnYmd(d)} ${vnHm(d)}` : "—");

async function main() {
  console.log(`DB: ${currentDbHost()}\n`);

  const classes = await db.class.findMany({
    where: { deletedAt: null, status: { not: "CANCELLED" } },
    orderBy: { startDate: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      centerId: true,
      scheduleDays: true,
      startTime: true,
      endTime: true,
      scheduleSlots: { select: { weekday: true, startTime: true, endTime: true } },
      schedulePhases: {
        orderBy: { effectiveFrom: "asc" },
        select: {
          effectiveFrom: true,
          effectiveTo: true,
          slots: { select: { weekday: true, startTime: true, endTime: true } },
        },
      },
      sessions: {
        orderBy: { date: "asc" },
        select: { id: true, date: true, status: true },
      },
    },
  });

  const holidayRows = await db.holiday.findMany({
    select: { centerId: true, date: true, endDate: true },
  });
  const holidayCache = new Map<string, Set<string>>();
  const holidaysFor = (centerId: string | null) => {
    const key = centerId ?? "__global__";
    const hit = holidayCache.get(key);
    if (hit) return hit;
    const set = expandHolidaySet(
      holidayRows.filter((h) => h.centerId === null || h.centerId === centerId),
    );
    holidayCache.set(key, set);
    return set;
  };

  let bad = 0;
  for (const c of classes) {
    const phases: SchedulePhase[] =
      c.schedulePhases.length > 0
        ? c.schedulePhases.map((p) => ({
            effectiveFrom: p.effectiveFrom,
            effectiveTo: p.effectiveTo,
            slots: p.slots.map((s) => ({
              weekday: s.weekday,
              startTime: s.startTime,
              endTime: s.endTime,
            })),
          }))
        : (() => {
            const derived = legacyPhaseFromClass({
              scheduleDays: c.scheduleDays,
              startTime: c.startTime,
              endTime: c.endTime,
              slots: c.scheduleSlots,
              startDate: c.startDate,
            });
            return derived ? [derived] : [];
          })();

    const res = auditSessionSeries({
      from: c.startDate ? vnStartOfDay(c.startDate) : null,
      phases,
      holidays: holidaysFor(c.centerId),
      sessions: c.sessions,
      classStatus: c.status,
    });
    if (res.severity === "OK") continue;

    bad++;
    console.log(`── ${c.name}  [${c.status}]  — ${SEVERITY_TEXT[res.severity] ?? res.severity}`);
    console.log(`   khai giảng : ${c.startDate ? vnYmd(c.startDate) : "—"}`);
    console.log(`   buổi 1     : ${fmt(res.actualFirst)}   (đúng lịch: ${fmt(res.expectedFirst)})`);
    console.log(`   số buổi    : ${c.sessions.length}  ·  lệch ngày: ${res.wrongDateCount}  ·  lệch giờ: ${res.wrongTimeCount}`);
    if (res.message) console.log(`   ${res.message}`);
    console.log("");
  }

  console.log("────────────────────────────────────────");
  console.log(`Đã soát ${classes.length} lớp — ${bad} lớp có vấn đề.`);
  if (bad > 0) {
    console.log(`Sửa ở /admin/classes/kiem-tra-lich (nút "Xếp lại") hoặc trong từng lớp.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
