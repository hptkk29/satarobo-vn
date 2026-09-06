// lib/cham-cong/my-schedule.ts — L5: LỊCH CA CỦA TÔI đọc từ lưới mới (ShiftAssignment), thay
// ShiftRegistration cũ (đăng ký ca tự đề xuất — đã đóng băng L5, kế hoạch §5). Dùng chung cho
// /cham-cong/lich-ca (admin), /teacher/lich và /teacher/bang-cong. Đọc `db` trần vì luôn lọc theo
// CHÍNH userId của phiên (dữ liệu của mình).
import { db } from "@/lib/db";
import type { ShiftSegment } from "./catalog";

export type MyShiftRow = {
  date: Date; // @db.Date → UTC 00:00
  code: string;
  name: string;
  centerId: string;
  centerLabel: string;
  isLeave: boolean;
  dayCredit: number;
  /** "07:45–11:30 · 14:00–17:45" hoặc "" (mã không giờ). */
  timeLabel: string;
  source: string;
};

export async function getMyAssignments(userId: string, from: Date, to: Date): Promise<MyShiftRow[]> {
  const rows = await db.shiftAssignment.findMany({
    where: { userId, workDate: { gte: from, lt: to }, status: "ACTIVE" },
    select: { workDate: true, templateCode: true, centerId: true, isLeave: true, dayCredit: true, segments: true, source: true, template: { select: { name: true } } },
    orderBy: { workDate: "asc" },
    take: 100,
  });
  const centerIds = [...new Set(rows.map((r) => r.centerId))];
  const centers = centerIds.length ? await db.center.findMany({ where: { id: { in: centerIds } }, select: { id: true, code: true, name: true } }) : [];
  const labelOf = new Map(centers.map((c) => [c.id, c.code ?? c.name]));
  return rows.map((r) => ({
    date: r.workDate,
    code: r.templateCode,
    name: r.template.name,
    centerId: r.centerId,
    centerLabel: labelOf.get(r.centerId) ?? (r.centerId === "hoi-so" ? "HO" : r.centerId),
    isLeave: r.isLeave,
    dayCredit: r.dayCredit,
    timeLabel: ((r.segments as ShiftSegment[] | null) ?? []).filter((s) => s.kind === "WORK").map((s) => `${s.start}–${s.end}`).join(" · "),
    source: r.source,
  }));
}

export type MyDayRow = { date: Date; units: number; worked: number; expected: number; flags: string[]; override: boolean; locked: boolean; code: string | null };

export async function getMyAttendanceDays(userId: string, from: Date, to: Date): Promise<MyDayRow[]> {
  const rows = await db.staffAttendanceDay.findMany({
    where: { userId, workDate: { gte: from, lt: to } },
    select: { workDate: true, overrideUnits: true, dayCreditEarned: true, workedMinutes: true, expectedMinutes: true, flags: true, status: true, templateCode: true },
    orderBy: { workDate: "asc" },
  });
  return rows.map((r) => ({ date: r.workDate, units: r.overrideUnits ?? r.dayCreditEarned, worked: r.workedMinutes, expected: r.expectedMinutes, flags: r.flags, override: r.overrideUnits != null, locked: r.status === "LOCKED", code: r.templateCode }));
}
