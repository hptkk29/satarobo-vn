// lib/cham-cong/recompute.ts — cầu DB cho engine: đọc ca + lượt + lễ + tham số → computeDay →
// upsert StaffAttendanceDay. ĐƯỜNG GHI DUY NHẤT vào bảng công ngày (kế hoạch §3.1): mọi chỗ
// khác chỉ được gọi `markAttendanceDayDirty()` để hàng đợi DomainEvent tính lại.
//
// Luật:
//  - Ngày thuộc kỳ LOCKED hoặc dòng đã LOCKED ⇒ bỏ qua, trả `skipped: "LOCKED"` (audit ở
//    tầng gọi khi cần). Sửa sau khoá chỉ qua TIMESHEET_FIX được duyệt + mở lại kỳ.
//  - Người `timesheetExempt` ⇒ không sinh dòng; dòng cũ (chưa khoá) bị xoá.
//  - `overrideUnits` (QLCS đã rà và ghi đè) được GIỮ qua mọi lần tính lại; status ADJUSTED.
//  - Chỉ lượt `result = ACCEPTED` vào engine (helper `acceptedLogsOfDay`, có test).
//  - Ngày công tính theo giờ VN (`lib/time/vn.ts`); `workDate` là DATE-only UTC-midnight.
import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/service";
import { vnDateAt, vnParts, vnWeekday, vnYmd } from "@/lib/time/vn";
import { computeDay, type EngineAssignment, type EngineInput, type EngineLog, type EngineRules } from "./engine";
import { resolveHomeCenter } from "./home-center";
import type { ShiftSegment } from "./catalog";

type Client = PrismaClient | Prisma.TransactionClient;

/** Chỉ lượt ACCEPTED, sắp theo giờ — mọi câu tính công đi qua đây. */
export async function acceptedLogsOfDay(client: Client, userId: string, workDate: Date) {
  return client.staffTimeLog.findMany({
    where: { userId, workDate, result: "ACCEPTED" },
    orderBy: { loggedAt: "asc" },
    select: { id: true, loggedAt: true, direction: true, flags: true, centerId: true, orgUnitId: true },
  });
}

/** Phút VN trong ngày của một mốc thời gian (lượt lúc 00:30 ngày sau vẫn thuộc ngày sau — GC-09). */
export function vnMinuteOfDay(d: Date): number {
  const p = vnParts(d);
  return p.hour * 60 + p.minute;
}

export async function loadEngineRules(orgUnitId: string | null): Promise<EngineRules> {
  const o = { orgUnitId };
  const [lateGraceMinutes, earlyArrivalMinutes, duplicateTapMinutes, maxLogsPerDay, pairingMaxGapMinutes] = await Promise.all([
    getSetting("shift.lateGraceMinutes", o),
    getSetting("shift.earlyArrivalMinutes", o),
    getSetting("shift.duplicateTapMinutes", o),
    getSetting("shift.maxLogsPerDay", o),
    getSetting("shift.pairingMaxGapMinutes", o),
  ]);
  return { lateGraceMinutes, earlyArrivalMinutes, duplicateTapMinutes, maxLogsPerDay, pairingMaxGapMinutes };
}

export type RecomputeResult =
  | { ok: true; skipped?: undefined; dayId: string | null; flags: string[] }
  | { ok: true; skipped: "LOCKED" | "EXEMPT" | "NO_USER" };

export async function recomputeAttendanceDay(
  userId: string,
  workDate: Date,
  opts: { tx?: Prisma.TransactionClient } = {},
): Promise<RecomputeResult> {
  const client: Client = opts.tx ?? db;
  const home = await resolveHomeCenter(userId);
  const existing = await client.staffAttendanceDay.findUnique({
    where: { userId_workDate: { userId, workDate } },
    select: { id: true, status: true, overrideUnits: true, overrideById: true, overrideAt: true, overrideNote: true, periodId: true },
  });
  if (existing?.status === "LOCKED") return { ok: true, skipped: "LOCKED" };

  if (home.timesheetExempt) {
    if (existing) await client.staffAttendanceDay.delete({ where: { id: existing.id } });
    return { ok: true, skipped: "EXEMPT" };
  }

  const assignment = await client.shiftAssignment.findFirst({
    where: { userId, workDate, status: "ACTIVE" },
    select: {
      id: true,
      centerId: true,
      orgUnitId: true,
      templateCode: true,
      segments: true,
      attendanceMode: true,
      dayCredit: true,
      isLeave: true,
      nominalMinutes: true,
      placeMode: true,
      template: { select: { kind: true } },
    },
  });
  const logs = await acceptedLogsOfDay(client, userId, workDate);
  const centerId = assignment?.centerId ?? logs[0]?.centerId ?? home.centerId;
  const orgUnitId = assignment?.orgUnitId ?? logs[0]?.orgUnitId ?? null;

  // Kỳ đã khoá ⇒ không tính lại (kể cả khi chưa có dòng — dòng mới sau khoá là sai).
  const periodKey = vnYmd(vnDateAt(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate())).slice(0, 7);
  const period = await client.attendancePeriod.findUnique({
    where: { centerId_periodKey: { centerId, periodKey } },
    select: { id: true, status: true },
  });
  if (period?.status === "LOCKED") return { ok: true, skipped: "LOCKED" };

  // Lễ: dòng toàn hệ thống (centerId null) hoặc của đúng cơ sở, phủ ngày này.
  const holidays = await client.holiday.findMany({
    where: {
      date: { lte: workDate },
      OR: [{ endDate: null, date: workDate }, { endDate: { gte: workDate } }],
      AND: [{ OR: [{ centerId: null }, { centerId }] }],
    },
    select: { type: true, attendanceEffect: true, coefficient: true },
  });
  const hol = holidays.find((h) => h.type === "HOLIDAY") ?? holidays[0] ?? null;
  const holiday: EngineInput["holiday"] = hol
    ? {
        coefficient: hol.coefficient,
        effect: hol.attendanceEffect ?? (hol.type === "HOLIDAY" ? "PAID_LEAVE" : "INFO_ONLY"),
      }
    : null;

  const rules = await loadEngineRules(orgUnitId);
  const weeklyOff = await getSetting("shift.weeklyOffDays", { orgUnitId });

  const engineAssignment: EngineAssignment | null = assignment
    ? {
        templateCode: assignment.templateCode,
        segments: ((assignment.segments as ShiftSegment[] | null) ?? []).map((s) => ({ start: s.start, end: s.end, kind: s.kind, place: s.place })),
        attendanceMode: assignment.attendanceMode,
        dayCredit: assignment.dayCredit,
        isLeave: assignment.isLeave,
        nominalMinutes: assignment.nominalMinutes,
        placeMode: assignment.placeMode,
        isOff: assignment.template.kind === "OFF",
      }
    : null;
  const engineLogs: EngineLog[] = logs.map((l) => ({ id: l.id, minute: vnMinuteOfDay(l.loggedAt), direction: l.direction, flags: l.flags }));

  const r = computeDay({
    assignment: engineAssignment,
    logs: engineLogs,
    rules,
    holiday,
    exempt: false,
    isWeeklyOff: weeklyOff.includes(vnWeekday(vnDateAt(workDate.getUTCFullYear(), workDate.getUTCMonth(), workDate.getUTCDate(), 12))),
  });

  const keepOverride = existing?.overrideUnits != null;
  const data = {
    centerId,
    orgUnitId,
    assignmentId: assignment?.id ?? null,
    templateCode: assignment?.templateCode ?? null,
    placeMode: assignment?.placeMode ?? null,
    dayType: r.dayType,
    expectedMinutes: r.expectedMinutes,
    workedMinutes: r.workedMinutes,
    paidBreakMinutes: r.paidBreakMinutes,
    rawPairedMinutes: r.rawPairedMinutes,
    amExpected: r.amExpected,
    amWorked: r.amWorked,
    pmExpected: r.pmExpected,
    pmWorked: r.pmWorked,
    lateMinutes: r.lateMinutes,
    earlyLeaveMinutes: r.earlyLeaveMinutes,
    missedEarlyArrival: r.missedEarlyArrival,
    dayCreditExpected: r.dayCreditExpected,
    dayCreditEarned: r.dayCreditEarned,
    hourCredit: r.hourCredit,
    leaveUnits: r.leaveUnits,
    holidayPaidUnits: r.holidayPaidUnits,
    pairs: r.pairs as unknown as Prisma.InputJsonValue,
    flags: r.flags,
    status: keepOverride ? ("ADJUSTED" as const) : ("COMPUTED" as const),
    ruleSnapshot: { ...r.ruleSnapshot, holiday, weeklyOff } as Prisma.InputJsonValue,
    computedBy: "ENGINE" as const,
    computedAt: new Date(),
    periodId: period?.id ?? existing?.periodId ?? null,
  };
  const row = await client.staffAttendanceDay.upsert({
    where: { userId_workDate: { userId, workDate } },
    create: { userId, workDate, ...data },
    update: data,
    select: { id: true },
  });
  return { ok: true, dayId: row.id, flags: r.flags };
}

export const ATTENDANCE_DAY_DIRTY = "hr.attendance_day_dirty";

/**
 * Xếp hàng tính lại một ngày công. dedupeKey theo phút để một loạt lượt quét trong cùng phút
 * chỉ sinh MỘT event, nhưng thay đổi ở phút sau vẫn kích hoạt lại (dedupeKey là unique vĩnh viễn).
 */
export async function markAttendanceDayDirty(
  userId: string,
  workDate: Date,
  opts: { tx?: Prisma.TransactionClient; reason?: string } = {},
): Promise<void> {
  // KHÔNG dùng publishEvent ở đây: nó bắt P2002 rồi findUnique, nhưng TRONG một transaction
  // Postgres thì INSERT vỡ unique đã làm hỏng cả tx (25P02) — duyệt đơn đổi ca + chỉnh công
  // cùng phút cho cùng người là đổ (bắt được ở tests/cham-cong/requests.spec.ts, 06/09).
  // createMany + skipDuplicates = ON CONFLICT DO NOTHING, an toàn cả trong lẫn ngoài tx.
  await markAttendanceDaysDirtyMany([{ userId, workDate }], opts);
}

/** Xếp hàng nhiều ngày một lượt (import lưới, duyệt đơn nhiều ngày) — 1 INSERT, trùng thì bỏ. */
export async function markAttendanceDaysDirtyMany(
  days: { userId: string; workDate: Date }[],
  opts: { tx?: Prisma.TransactionClient; reason?: string } = {},
): Promise<number> {
  if (days.length === 0) return 0;
  const client: Client = opts.tx ?? db;
  const bucket = Math.floor(Date.now() / 60_000);
  const seen = new Set<string>();
  const data: Prisma.DomainEventCreateManyInput[] = [];
  for (const d of days) {
    const ymd = d.workDate.toISOString().slice(0, 10);
    const key = `attday:${d.userId}:${ymd}:${bucket}`;
    if (seen.has(key)) continue;
    seen.add(key);
    data.push({ type: ATTENDANCE_DAY_DIRTY, payloadJson: { userId: d.userId, workDate: ymd, reason: opts.reason ?? null }, dedupeKey: key, maxAttempts: 5 });
  }
  const r = await client.domainEvent.createMany({ data, skipDuplicates: true });
  return r.count;
}

/** Tính lại cả kỳ (chốt sổ / import): duyệt từng ngày, không tx bọc chung (mỗi ngày độc lập). */
export async function recomputeRange(userIds: string[], from: Date, to: Date): Promise<{ days: number; locked: number }> {
  let days = 0;
  let locked = 0;
  for (const userId of userIds) {
    for (let d = new Date(from); d <= to; d = new Date(d.getTime() + 86_400_000)) {
      const r = await recomputeAttendanceDay(userId, d);
      if (r.skipped === "LOCKED") locked += 1;
      else days += 1;
    }
  }
  return { days, locked };
}
