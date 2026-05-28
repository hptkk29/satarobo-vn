import "server-only";
import { db } from "@/lib/db";

// =============================================================================
// PORTAL LEARNING DATA — Phase T2.2
// Mọi helper nhận studentId (đã verify ownership qua requireActiveStudent) và
// chỉ trả data của các lớp HS đang theo học.
// =============================================================================

const ACTIVE_ENROLLMENT = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

export type StudentClass = {
  id: string;
  name: string;
  classCode: string | null;
  courseName: string;
  centerName: string | null;
};

export async function getStudentClasses(studentId: string): Promise<StudentClass[]> {
  const enrollments = await db.enrollment.findMany({
    where: { studentId, status: { in: [...ACTIVE_ENROLLMENT] } },
    select: {
      class: {
        select: {
          id: true,
          name: true,
          classCode: true,
          course: { select: { name: true } },
          center: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  return enrollments.map((e) => ({
    id: e.class.id,
    name: e.class.name,
    classCode: e.class.classCode,
    courseName: e.class.course.name,
    centerName: e.class.center?.name ?? null,
  }));
}

async function classIdsFor(studentId: string): Promise<string[]> {
  const classes = await getStudentClasses(studentId);
  return classes.map((c) => c.id);
}

export type SessionRow = {
  id: string;
  date: string;
  topic: string | null;
  className: string;
  lessonTitle: string | null;
  past: boolean;
};

export async function getStudentSessions(studentId: string): Promise<SessionRow[]> {
  const classIds = await classIdsFor(studentId);
  if (classIds.length === 0) return [];
  const now = Date.now();
  const sessions = await db.classSession.findMany({
    where: { classId: { in: classIds } },
    select: {
      id: true,
      date: true,
      topic: true,
      class: { select: { name: true } },
      lesson: { select: { title: true } },
    },
    orderBy: { date: "asc" },
  });
  return sessions.map((s) => ({
    id: s.id,
    date: s.date.toISOString(),
    topic: s.topic,
    className: s.class.name,
    lessonTitle: s.lesson?.title ?? null,
    past: s.date.getTime() < now,
  }));
}

export type LessonRow = {
  id: string;
  title: string;
  description: string | null;
  objectives: string[];
  taughtAt: string | null;
  documents: { id: string; title: string; type: string; fileUrl: string }[];
};

/** Bài giảng = lesson đã được dạy (có ClassSession.lessonId) + tài liệu đính kèm. */
export async function getStudentLessons(studentId: string): Promise<LessonRow[]> {
  const classIds = await classIdsFor(studentId);
  if (classIds.length === 0) return [];

  const taught = await db.classSession.findMany({
    where: { classId: { in: classIds }, lessonId: { not: null }, date: { lte: new Date() } },
    select: { lessonId: true, date: true },
    orderBy: { date: "asc" },
  });
  const lessonDate = new Map<string, Date>();
  for (const t of taught) {
    if (t.lessonId && !lessonDate.has(t.lessonId)) lessonDate.set(t.lessonId, t.date);
  }
  const lessonIds = [...lessonDate.keys()];
  if (lessonIds.length === 0) return [];

  const lessons = await db.lesson.findMany({
    where: { id: { in: lessonIds } },
    select: {
      id: true,
      title: true,
      description: true,
      objectives: true,
      order: true,
      documents: {
        select: { id: true, title: true, type: true, fileUrl: true },
        orderBy: { createdAt: "asc" },
      },
    },
    orderBy: { order: "asc" },
  });

  return lessons.map((l) => ({
    id: l.id,
    title: l.title,
    description: l.description,
    objectives: l.objectives,
    taughtAt: lessonDate.get(l.id)?.toISOString() ?? null,
    documents: l.documents,
  }));
}

export type AssignmentRow = {
  id: string;
  title: string;
  className: string;
  dueAt: string | null;
  totalPoints: number;
  status: string;
  score: number | null;
};

export async function getStudentAssignments(studentId: string): Promise<AssignmentRow[]> {
  const classIds = await classIdsFor(studentId);
  if (classIds.length === 0) return [];

  const assignments = await db.assignment.findMany({
    where: { classId: { in: classIds }, status: { in: ["PUBLISHED", "CLOSED"] } },
    select: {
      id: true,
      title: true,
      dueAt: true,
      totalPoints: true,
      class: { select: { name: true } },
      submissions: {
        where: { studentId },
        select: { status: true, score: true },
        take: 1,
      },
    },
    orderBy: { assignedAt: "desc" },
  });

  return assignments.map((a) => ({
    id: a.id,
    title: a.title,
    className: a.class.name,
    dueAt: a.dueAt?.toISOString() ?? null,
    totalPoints: a.totalPoints,
    status: a.submissions[0]?.status ?? "NOT_SUBMITTED",
    score: a.submissions[0]?.score ?? null,
  }));
}

export type ExamRow = {
  id: string;
  title: string;
  className: string | null;
  durationMinutes: number;
  openAt: string | null;
  closeAt: string | null;
  isOpen: boolean;
  attemptStatus: string | null;
  totalScore: number | null;
};

export async function getStudentExams(studentId: string): Promise<ExamRow[]> {
  const classIds = await classIdsFor(studentId);
  if (classIds.length === 0) return [];
  const now = Date.now();

  const exams = await db.exam.findMany({
    where: { classId: { in: classIds }, status: "PUBLISHED" },
    select: {
      id: true,
      title: true,
      durationMinutes: true,
      openAt: true,
      closeAt: true,
      class: { select: { name: true } },
      attempts: {
        where: { studentId },
        select: { status: true, totalScore: true },
        take: 1,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return exams.map((e) => {
    const openOk = !e.openAt || e.openAt.getTime() <= now;
    const closeOk = !e.closeAt || e.closeAt.getTime() >= now;
    return {
      id: e.id,
      title: e.title,
      className: e.class?.name ?? null,
      durationMinutes: e.durationMinutes,
      openAt: e.openAt?.toISOString() ?? null,
      closeAt: e.closeAt?.toISOString() ?? null,
      isOpen: openOk && closeOk,
      attemptStatus: e.attempts[0]?.status ?? null,
      totalScore: e.attempts[0]?.totalScore ?? null,
    };
  });
}

export type ExamResultRow = {
  attemptId: string;
  examTitle: string;
  status: string;
  totalScore: number | null;
  totalPoints: number;
  passed: boolean | null;
  graded: boolean;
  feedback: string | null;
};

/** Kết quả bài thi đã nộp (điểm + nhận xét hiện khi đã chấm xong). */
export async function getStudentExamResults(
  studentId: string,
): Promise<ExamResultRow[]> {
  const attempts = await db.examAttempt.findMany({
    where: { studentId, status: { in: ["SUBMITTED", "GRADED", "REVIEWED"] } },
    select: {
      id: true,
      status: true,
      totalScore: true,
      passed: true,
      gradedAt: true,
      feedback: true,
      exam: { select: { title: true, totalPoints: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return attempts.map((a) => ({
    attemptId: a.id,
    examTitle: a.exam.title,
    status: a.status,
    totalScore: a.totalScore,
    totalPoints: a.exam.totalPoints,
    passed: a.passed,
    graded: a.gradedAt !== null,
    feedback: a.feedback,
  }));
}
