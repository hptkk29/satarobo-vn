import "server-only";
import type { RubricCriterion, RubricLevel } from "@prisma/client";
import { db } from "@/lib/db";
import { getStudentClassProgress } from "@/lib/students/progress";
import { getClassExpectedEndDate, NEAR_END_THRESHOLD } from "@/lib/students/renewal";

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

export type ClassProgressSummary = {
  classId: string;
  className: string;
  courseName: string;
  total: number;
  attended: number;
  remaining: number;
  currentSession: number;
  expectedEndDate: string | null; // ISO — PHẦN 4
  nearingEnd: boolean; // còn ≤ 5 buổi
};

/** Module QL học viên PHẦN 1 + 4 — tiến độ + ngày kết thúc dự kiến theo lịch thực. */
export async function getStudentProgressSummaries(
  studentId: string,
): Promise<ClassProgressSummary[]> {
  const classes = await getStudentClasses(studentId);
  return Promise.all(
    classes.map(async (c) => {
      const [p, end] = await Promise.all([
        getStudentClassProgress(studentId, c.id),
        getClassExpectedEndDate(c.id),
      ]);
      return {
        classId: c.id,
        className: c.name,
        courseName: c.courseName,
        total: p.total,
        attended: p.attended,
        remaining: p.remaining,
        currentSession: p.currentSession,
        expectedEndDate: end?.toISOString() ?? null,
        nearingEnd: p.remaining > 0 && p.remaining <= NEAR_END_THRESHOLD,
      };
    }),
  );
}

export type SessionRow = {
  id: string;
  date: string;
  topic: string | null;
  className: string;
  lessonTitle: string | null;
  past: boolean;
  // #10 — giờ học THẬT lấy từ lịch lớp (HH:mm), KHÔNG dùng giờ tạo record.
  startTime: string | null;
  endTime: string | null;
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
      class: { select: { name: true, startTime: true, endTime: true } },
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
    startTime: s.class.startTime ?? null,
    endTime: s.class.endTime ?? null,
  }));
}

export type LessonRow = {
  id: string;
  title: string;
  description: string | null;
  content: string | null;
  objectives: string[];
  materials: string[];
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
      content: true,
      objectives: true,
      materials: true,
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
    content: l.content,
    objectives: l.objectives,
    materials: l.materials,
    taughtAt: lessonDate.get(l.id)?.toISOString() ?? null,
    documents: l.documents,
  }));
}

export type AssignmentRow = {
  id: string;
  title: string;
  kind: "CLASSWORK" | "HOMEWORK";
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
      kind: true,
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
    kind: a.kind,
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

export type AssignmentResultRow = {
  id: string;
  title: string;
  status: string;
  score: number | null;
  totalPoints: number;
  feedback: string | null;
};

/** Kết quả bài tập đã nộp/đã chấm (cho /ket-qua). */
export async function getStudentAssignmentResults(
  studentId: string,
): Promise<AssignmentResultRow[]> {
  const classIds = await classIdsFor(studentId);
  if (classIds.length === 0) return [];

  const subs = await db.assignmentSubmission.findMany({
    where: {
      studentId,
      status: { in: ["SUBMITTED", "LATE", "GRADED"] },
      assignment: { classId: { in: classIds } },
    },
    select: {
      status: true,
      score: true,
      feedback: true,
      assignment: { select: { id: true, title: true, totalPoints: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  return subs.map((s) => ({
    id: s.assignment.id,
    title: s.assignment.title,
    status: s.status,
    score: s.score,
    totalPoints: s.assignment.totalPoints,
    feedback: s.feedback,
  }));
}

export type AssignmentDetail = {
  id: string;
  title: string;
  description: string;
  instructions: string | null;
  dueAt: string | null;
  totalPoints: number;
  allowText: boolean;
  allowFile: boolean;
  documents: { id: string; title: string; fileUrl: string }[];
  submission: {
    status: string;
    textAnswer: string | null;
    fileUrl: string | null;
    fileName: string | null;
    score: number | null;
    feedback: string | null;
    rubricScores: { criterion: RubricCriterion; level: RubricLevel }[];
  } | null;
};

/** Chi tiết 1 bài tập + bài nộp của con — null nếu không thuộc lớp của con. */
export async function getAssignmentDetail(
  studentId: string,
  assignmentId: string,
): Promise<AssignmentDetail | null> {
  const classIds = await classIdsFor(studentId);
  const a = await db.assignment.findFirst({
    where: { id: assignmentId, classId: { in: classIds } },
    select: {
      id: true,
      title: true,
      description: true,
      instructions: true,
      dueAt: true,
      totalPoints: true,
      allowText: true,
      allowFile: true,
      documents: {
        select: { document: { select: { id: true, title: true, fileUrl: true } } },
      },
      submissions: {
        where: { studentId },
        select: {
          status: true,
          textAnswer: true,
          fileUrl: true,
          fileName: true,
          score: true,
          feedback: true,
          rubricScores: { select: { criterion: true, level: true } },
        },
        take: 1,
      },
    },
  });
  if (!a) return null;

  return {
    id: a.id,
    title: a.title,
    description: a.description,
    instructions: a.instructions,
    dueAt: a.dueAt?.toISOString() ?? null,
    totalPoints: a.totalPoints,
    allowText: a.allowText,
    allowFile: a.allowFile,
    documents: a.documents.map((d) => d.document),
    submission: a.submissions[0] ?? null,
  };
}

export type LatestReport = {
  reportTitle: string;
  generatedAt: string;
  className: string | null;
};

/** ProgressReportLog gần nhất của con (cho /ket-qua). */
export async function getLatestProgressReport(
  studentId: string,
): Promise<LatestReport | null> {
  const r = await db.progressReportLog.findFirst({
    where: { studentId },
    orderBy: { generatedAt: "desc" },
    select: {
      reportTitle: true,
      generatedAt: true,
      class: { select: { name: true } },
    },
  });
  if (!r) return null;
  return {
    reportTitle: r.reportTitle,
    generatedAt: r.generatedAt.toISOString(),
    className: r.class?.name ?? null,
  };
}
