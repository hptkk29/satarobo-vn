import "server-only";
import { db } from "@/lib/db";
import { getStudentSchedule } from "@/lib/portal/schedule";

// Portal v2 — Cổng học sinh "Bài tập": lộ trình từng buổi + trạng thái bài tập của con.

const ACTIVE = ["CONFIRMED", "STUDYING", "ACTIVE", "PAUSED"] as const;
const DONE = new Set(["SUBMITTED", "GRADED"]);

export type TrackAssignment = { id: string; title: string; dueAt: string | null; done: boolean; overdue: boolean };
export type TrackItem = {
  key: string;
  order: number;
  title: string;
  sessionDate: string | null;
  taught: boolean;
  assignment: TrackAssignment | null;
};
export type AssignmentTrack = {
  courseName: string | null;
  className: string | null;
  teacher: string | null;
  done: number;
  total: number;
  progressPct: number;
  items: TrackItem[];
};

export async function getStudentAssignmentTrack(studentId: string): Promise<AssignmentTrack> {
  const [enrollments, sched, enrTeacher] = await Promise.all([
    db.enrollment.findMany({
      where: { studentId, status: { in: [...ACTIVE] }, deletedAt: null },
      select: { classId: true },
    }),
    getStudentSchedule(studentId),
    db.enrollment.findFirst({
      where: { studentId },
      orderBy: { enrolledAt: "desc" },
      select: { class: { select: { teacher: { select: { name: true } } } } },
    }),
  ]);
  const classIds = enrollments.map((e) => e.classId);

  const now = Date.now();
  const items: TrackItem[] = [];
  if (classIds.length > 0) {
    const [sessions, assignments] = await Promise.all([
      db.classSession.findMany({
        where: { classId: { in: classIds }, lessonId: { not: null } },
        select: { id: true, date: true, lesson: { select: { id: true, order: true, title: true } } },
        orderBy: { date: "asc" },
      }),
      db.assignment.findMany({
        where: { classId: { in: classIds }, lessonId: { not: null }, status: { in: ["PUBLISHED", "CLOSED"] } },
        select: {
          id: true,
          lessonId: true,
          title: true,
          dueAt: true,
          submissions: { where: { studentId }, select: { status: true }, take: 1 },
        },
      }),
    ]);

    const byLesson = new Map<string, (typeof assignments)[number]>();
    for (const a of assignments) if (a.lessonId && !byLesson.has(a.lessonId)) byLesson.set(a.lessonId, a);

    // 1 buổi / lesson (buổi sớm nhất của lesson đó).
    const seen = new Set<string>();
    for (const s of sessions) {
      const l = s.lesson;
      if (!l || seen.has(l.id)) continue;
      seen.add(l.id);
      const a = byLesson.get(l.id);
      let assignment: TrackAssignment | null = null;
      if (a) {
        const done = DONE.has(a.submissions[0]?.status ?? "");
        const overdue = !done && !!a.dueAt && a.dueAt.getTime() < now;
        assignment = { id: a.id, title: a.title, dueAt: a.dueAt?.toISOString() ?? null, done, overdue };
      }
      items.push({
        key: l.id,
        order: l.order,
        title: l.title,
        sessionDate: s.date.toISOString(),
        taught: s.date.getTime() < now,
        assignment,
      });
    }
    items.sort((x, y) => x.order - y.order);
  }

  return {
    courseName: sched?.courseName ?? null,
    className: sched?.className ?? null,
    teacher: enrTeacher?.class?.teacher?.name ?? null,
    done: sched?.done ?? 0,
    total: sched?.total ?? items.length,
    progressPct: sched?.total ? Math.round(((sched?.done ?? 0) / sched.total) * 100) : 0,
    items,
  };
}
