import "server-only";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/actor";
import { dayKey } from "@/lib/lms/calendar";
import type { CalEvent } from "@/components/lms/month-calendar";

// Truy vấn buổi cho lịch (server-only — page admin/portal gọi qua đây, không import db trần).

/** Buổi trong [from,to) thuộc cơ sở actor nhìn thấy (admin). */
export async function getAdminCalendarEvents(actor: Actor, from: Date, to: Date): Promise<CalEvent[]> {
  const cw = actor.isSuperAdmin || actor.isHoLevel ? undefined : { in: actor.visibleCenterIds };
  const sessions = await db.classSession.findMany({
    where: { date: { gte: from, lt: to }, status: { not: "CANCELLED" }, ...(cw ? { class: { centerId: cw } } : {}) },
    select: { date: true, class: { select: { name: true, startTime: true } } },
    take: 2000,
  });
  return sessions.map((s) => ({
    iso: dayKey(s.date),
    label: s.class?.name ?? "Lớp",
    sublabel: s.class?.startTime ?? undefined,
  }));
}

/** Buổi của 1 học viên trong [from,to) (portal — ownership-scoped theo studentId). */
export async function getStudentCalendarEvents(studentId: string, from: Date, to: Date): Promise<CalEvent[]> {
  const enrollments = await db.enrollment.findMany({ where: { studentId }, select: { classId: true } });
  const classIds = enrollments.map((e) => e.classId);
  if (classIds.length === 0) return [];
  const sessions = await db.classSession.findMany({
    where: { classId: { in: classIds }, date: { gte: from, lt: to }, status: { not: "CANCELLED" } },
    select: { date: true, class: { select: { name: true, startTime: true } } },
    take: 500,
  });
  return sessions.map((s) => ({
    iso: dayKey(s.date),
    label: s.class?.name ?? "Buổi học",
    sublabel: s.class?.startTime ?? undefined,
  }));
}
