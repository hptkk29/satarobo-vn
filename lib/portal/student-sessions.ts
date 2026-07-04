import "server-only";
import { db } from "@/lib/db";
import { getStudentSchedule } from "@/lib/portal/schedule";

// Portal v2 — Cổng học sinh "Buổi học": mục tiêu + điểm danh + bài tập từng buổi.

const ACTIVE = ["CONFIRMED", "STUDYING", "ACTIVE", "PAUSED"] as const;
const DONE = new Set(["SUBMITTED", "GRADED"]);

export type SessionAttendance = "PRESENT" | "EXCUSED" | "ABSENT" | "MAKEUP" | "FUTURE";

export type StudentSessionItem = {
  id: string;
  order: number;
  title: string;
  date: string;
  past: boolean;
  today: boolean;
  attendance: SessionAttendance;
  objectives: string[];
  assignment: { id: string; title: string; dueAt: string | null; done: boolean } | null;
};

export type StudentSessionsView = {
  courseName: string | null;
  className: string | null;
  done: number;
  total: number;
  present: number;
  absent: number;
  makeup: number;
  sessions: StudentSessionItem[];
};

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export async function getStudentSessionsView(studentId: string): Promise<StudentSessionsView> {
  const [enrollments, sched] = await Promise.all([
    db.enrollment.findMany({
      where: { studentId, status: { in: [...ACTIVE] }, deletedAt: null },
      select: { classId: true },
    }),
    getStudentSchedule(studentId),
  ]);
  const classIds = enrollments.map((e) => e.classId);
  const empty: StudentSessionsView = {
    courseName: sched?.courseName ?? null, className: sched?.className ?? null,
    done: 0, total: 0, present: 0, absent: 0, makeup: 0, sessions: [],
  };
  if (classIds.length === 0) return empty;

  const [sessions, attendances, makeups, assignments] = await Promise.all([
    db.classSession.findMany({
      where: { classId: { in: classIds }, lessonId: { not: null } },
      select: { id: true, date: true, lesson: { select: { id: true, order: true, title: true, objectives: true } } },
      orderBy: { date: "asc" },
    }),
    db.attendance.findMany({ where: { studentId, session: { classId: { in: classIds } } }, select: { sessionId: true, status: true } }),
    db.makeupNeed.findMany({ where: { studentId, status: "COMPLETED" }, select: { missedSessionId: true } }),
    db.assignment.findMany({
      where: { classId: { in: classIds }, lessonId: { not: null }, status: { in: ["PUBLISHED", "CLOSED"] } },
      select: { id: true, lessonId: true, title: true, dueAt: true, submissions: { where: { studentId }, select: { status: true }, take: 1 } },
    }),
  ]);

  const attMap = new Map(attendances.map((a) => [a.sessionId, a.status]));
  const madeUp = new Set(makeups.map((m) => m.missedSessionId));
  const byLesson = new Map<string, (typeof assignments)[number]>();
  for (const a of assignments) if (a.lessonId && !byLesson.has(a.lessonId)) byLesson.set(a.lessonId, a);

  const now = new Date();
  const seen = new Set<string>();
  const items: StudentSessionItem[] = [];
  let present = 0, absent = 0, makeup = 0, done = 0;

  for (const s of sessions) {
    const l = s.lesson;
    if (!l || seen.has(l.id)) continue;
    seen.add(l.id);
    const past = s.date.getTime() < now.getTime();
    const today = sameDay(s.date, now);
    const st = attMap.get(s.id);

    let attendance: SessionAttendance;
    if (madeUp.has(s.id)) attendance = "MAKEUP";
    else if (!past) attendance = "FUTURE";
    else if (st === "PRESENT") attendance = "PRESENT";
    else if (st === "EXCUSED" || st === "ABSENT_EXCUSED") attendance = "EXCUSED";
    else if (st === "ABSENT" || st === "ABSENT_UNEXCUSED") attendance = "ABSENT";
    else attendance = "PRESENT"; // past, chưa điểm danh → coi như có mặt (an toàn)

    if (past) {
      done++;
      if (attendance === "MAKEUP") makeup++;
      else if (attendance === "PRESENT") present++;
      else absent++;
    }

    const a = byLesson.get(l.id);
    const assignment = a ? { id: a.id, title: a.title, dueAt: a.dueAt?.toISOString() ?? null, done: DONE.has(a.submissions[0]?.status ?? "") } : null;

    items.push({
      id: s.id, order: l.order, title: l.title, date: s.date.toISOString(),
      past, today, attendance, objectives: l.objectives, assignment,
    });
  }
  items.sort((x, y) => x.order - y.order);

  return {
    courseName: sched?.courseName ?? null, className: sched?.className ?? null,
    done, total: items.length, present, absent, makeup, sessions: items,
  };
}
