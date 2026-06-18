import { db } from "@/lib/db";

export interface StudentProgress {
  studentId: string;
  classId: string;

  // Attendance — derived from past sessions (date <= now) + Attendance rows.
  // ClassSession has no "status" field; we treat any session whose date has
  // already passed as a held session for tracking purposes.
  totalSessions: number;
  attendedSessions: number;
  attendanceRate: number; // %

  // Lesson coverage from sessions in this class
  totalLessons: number;
  coveredLessons: number;
  lessonCoverageRate: number; // %

  // Assignments
  totalAssignments: number;
  submittedAssignments: number;
  gradedAssignments: number;
  averageScore: number | null; // scaled 0-10
  submissionRate: number; // %

  // Exams (E3)
  examAttempts: number;
  passedExams: number;
}

// Active enrollment statuses (D5 + legacy ACTIVE).
const ACTIVE_ENROLLMENT_STATUSES = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

export async function getStudentProgress(
  studentId: string,
  classId: string,
): Promise<StudentProgress> {
  const now = new Date();

  // 1) Sessions (past = "held")
  const sessions = await db.classSession.findMany({
    where: { classId, date: { lte: now } },
    select: { id: true, lessonId: true },
  });
  const totalSessions = sessions.length;

  const attendances =
    totalSessions > 0
      ? await db.attendance.findMany({
          where: {
            sessionId: { in: sessions.map((s) => s.id) },
            studentId,
          },
          select: { status: true, makeupStatus: true },
        })
      : [];
  // P1-1: thống nhất với lib/students/progress — buổi tính có mặt = PRESENT/LATE
  // HOẶC vắng đã học bù (makeupStatus MADE_UP). Tránh lệch chuyên cần giữa các trang.
  const attendedSessions = attendances.filter(
    (a) =>
      a.status === "PRESENT" || a.status === "LATE" || a.makeupStatus === "MADE_UP",
  ).length;
  const attendanceRate =
    totalSessions > 0
      ? Math.round((attendedSessions / totalSessions) * 100)
      : 0;

  // 2) Lesson coverage from active curriculum of this class's course
  const cls = await db.class.findUnique({
    where: { id: classId },
    select: { courseId: true },
  });
  let totalLessons = 0;
  if (cls?.courseId) {
    const activeCurriculum = await db.curriculum.findFirst({
      where: { courseId: cls.courseId, isActive: true },
      orderBy: { version: "desc" },
      select: { _count: { select: { lessons: true } } },
    });
    totalLessons = activeCurriculum?._count.lessons ?? 0;
  }
  const coveredLessonIds = new Set(
    sessions.filter((s) => s.lessonId).map((s) => s.lessonId as string),
  );
  const coveredLessons = coveredLessonIds.size;
  const lessonCoverageRate =
    totalLessons > 0
      ? Math.round((coveredLessons / totalLessons) * 100)
      : 0;

  // 3) Assignments
  const submissions = await db.assignmentSubmission.findMany({
    where: {
      studentId,
      assignment: { classId },
    },
    select: {
      status: true,
      score: true,
      assignment: { select: { totalPoints: true } },
    },
  });
  const totalAssignments = submissions.length;
  const submittedAssignments = submissions.filter(
    (s) =>
      s.status === "SUBMITTED" ||
      s.status === "LATE" ||
      s.status === "GRADED",
  ).length;
  const gradedSubs = submissions.filter(
    (s) => s.status === "GRADED" && s.score !== null,
  );
  const gradedAssignments = gradedSubs.length;
  const averageScore =
    gradedAssignments > 0
      ? gradedSubs.reduce(
          (sum, s) =>
            sum +
            ((s.score as number) /
              (s.assignment.totalPoints || 1)) *
              10,
          0,
        ) / gradedAssignments
      : null;
  const submissionRate =
    totalAssignments > 0
      ? Math.round((submittedAssignments / totalAssignments) * 100)
      : 0;

  // 4) Exam attempts
  const attempts = await db.examAttempt.findMany({
    where: {
      studentId,
      exam: { classId },
      status: { in: ["SUBMITTED", "GRADED", "REVIEWED"] },
    },
    select: { passed: true },
  });
  const examAttempts = attempts.length;
  const passedExams = attempts.filter((a) => a.passed === true).length;

  return {
    studentId,
    classId,
    totalSessions,
    attendedSessions,
    attendanceRate,
    totalLessons,
    coveredLessons,
    lessonCoverageRate,
    totalAssignments,
    submittedAssignments,
    gradedAssignments,
    averageScore:
      averageScore !== null ? Math.round(averageScore * 10) / 10 : null,
    submissionRate,
    examAttempts,
    passedExams,
  };
}

export interface ClassStudentProgress {
  student: {
    id: string;
    name: string;
    avatarUrl: string | null;
    parentPhone: string | null;
    studentCode: string | null;
  };
  enrollmentId: string;
  progress: StudentProgress;
}

export async function getClassProgress(
  classId: string,
  // P0-3: chỉ KÈM SĐT phụ huynh khi caller có quyền xem PII (mặc định KHÔNG).
  // Caller PHẢI truyền canViewParentContact(session.user). Khi false, parentPhone
  // luôn null trong kết quả → KHÔNG gửi xuống client cho GV.
  includeParentContact = false,
): Promise<ClassStudentProgress[]> {
  const enrollments = await db.enrollment.findMany({
    where: {
      classId,
      status: { in: [...ACTIVE_ENROLLMENT_STATUSES] },
      deletedAt: null, // FIX-C3
    },
    select: {
      id: true,
      student: {
        select: {
          id: true,
          name: true,
          avatarUrl: true,
          parentPhone: true,
          studentCode: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return Promise.all(
    enrollments.map(async (e) => ({
      enrollmentId: e.id,
      student: {
        ...e.student,
        parentPhone: includeParentContact ? e.student.parentPhone : null,
      },
      progress: await getStudentProgress(e.student.id, classId),
    })),
  );
}

// =============================================================================
// Phase T2.1 — Gradebook (ma trận điểm) + Lộ trình giáo trình
// =============================================================================

export interface GradebookLesson {
  id: string;
  order: number;
  title: string;
  taught: boolean;
  sessionDate: string | null;
}

export interface GradebookColumn {
  id: string;
  kind: "exam" | "assignment";
  title: string;
  totalPoints: number;
}

export interface GradebookCell {
  score: number | null; // điểm thô (theo thang totalPoints của cột)
  status: string; // exam: AttemptStatus | "—" · assignment: SubmissionStatus
  passed: boolean | null;
}

export interface GradebookRow {
  studentId: string;
  name: string;
  studentCode: string | null;
  cells: Record<string, GradebookCell>; // key = column.id
}

export interface ClassGradebook {
  lessons: GradebookLesson[];
  totalLessons: number;
  coveredLessons: number;
  lessonCoverageRate: number;
  columns: GradebookColumn[];
  rows: GradebookRow[];
}

// Exam/Assignment đã giao = đang mở hoặc đã đóng (không tính DRAFT/ARCHIVED).
const GIVEN_EXAM_STATUSES = ["PUBLISHED", "CLOSED"] as const;
const GIVEN_ASSIGNMENT_STATUSES = ["PUBLISHED", "CLOSED"] as const;

export async function getClassGradebook(
  classId: string,
): Promise<ClassGradebook> {
  const now = new Date();

  const cls = await db.class.findUnique({
    where: { id: classId },
    select: { courseId: true },
  });

  // 1) Lộ trình giáo trình: lesson của curriculum active + buổi đã dạy.
  let lessonsRaw: { id: string; order: number; title: string }[] = [];
  if (cls?.courseId) {
    const curriculum = await db.curriculum.findFirst({
      where: { courseId: cls.courseId, isActive: true },
      orderBy: { version: "desc" },
      select: {
        lessons: {
          select: { id: true, order: true, title: true },
          orderBy: { order: "asc" },
        },
      },
    });
    lessonsRaw = curriculum?.lessons ?? [];
  }

  const sessions = await db.classSession.findMany({
    where: { classId, lessonId: { not: null }, date: { lte: now } },
    select: { lessonId: true, date: true },
    orderBy: { date: "desc" },
  });
  const taughtDate = new Map<string, Date>();
  for (const s of sessions) {
    if (s.lessonId && !taughtDate.has(s.lessonId)) taughtDate.set(s.lessonId, s.date);
  }

  const lessons: GradebookLesson[] = lessonsRaw.map((l) => ({
    id: l.id,
    order: l.order,
    title: l.title,
    taught: taughtDate.has(l.id),
    sessionDate: taughtDate.get(l.id)?.toISOString() ?? null,
  }));
  const coveredLessons = lessons.filter((l) => l.taught).length;
  const totalLessons = lessons.length;
  const lessonCoverageRate =
    totalLessons > 0 ? Math.round((coveredLessons / totalLessons) * 100) : 0;

  // 2) Cột: exam + assignment đã giao cho lớp.
  const [exams, assignments, enrollments] = await Promise.all([
    db.exam.findMany({
      where: { classId, status: { in: [...GIVEN_EXAM_STATUSES] } },
      select: { id: true, title: true, totalPoints: true },
      orderBy: { createdAt: "asc" },
    }),
    db.assignment.findMany({
      where: { classId, status: { in: [...GIVEN_ASSIGNMENT_STATUSES] } },
      select: { id: true, title: true, totalPoints: true },
      orderBy: { assignedAt: "asc" },
    }),
    db.enrollment.findMany({
      where: { classId, status: { in: [...ACTIVE_ENROLLMENT_STATUSES] }, deletedAt: null }, // FIX-C3
      select: {
        student: { select: { id: true, name: true, studentCode: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  const columns: GradebookColumn[] = [
    ...exams.map((e) => ({
      id: `exam:${e.id}`,
      kind: "exam" as const,
      title: e.title,
      totalPoints: e.totalPoints,
    })),
    ...assignments.map((a) => ({
      id: `assignment:${a.id}`,
      kind: "assignment" as const,
      title: a.title,
      totalPoints: a.totalPoints,
    })),
  ];

  const studentIds = enrollments.map((e) => e.student.id);
  const examIds = exams.map((e) => e.id);
  const assignmentIds = assignments.map((a) => a.id);

  const [attempts, submissions] = await Promise.all([
    examIds.length && studentIds.length
      ? db.examAttempt.findMany({
          where: { examId: { in: examIds }, studentId: { in: studentIds } },
          select: {
            examId: true,
            studentId: true,
            totalScore: true,
            status: true,
            passed: true,
          },
        })
      : Promise.resolve([]),
    assignmentIds.length && studentIds.length
      ? db.assignmentSubmission.findMany({
          where: {
            assignmentId: { in: assignmentIds },
            studentId: { in: studentIds },
          },
          select: {
            assignmentId: true,
            studentId: true,
            score: true,
            status: true,
          },
        })
      : Promise.resolve([]),
  ]);

  const attemptKey = (s: string, e: string) => `${s}|${e}`;
  const attemptMap = new Map(
    attempts.map((a) => [attemptKey(a.studentId, a.examId), a]),
  );
  const subMap = new Map(
    submissions.map((s) => [attemptKey(s.studentId, s.assignmentId), s]),
  );

  const rows: GradebookRow[] = enrollments.map((e) => {
    const st = e.student;
    const cells: Record<string, GradebookCell> = {};
    for (const exam of exams) {
      const a = attemptMap.get(attemptKey(st.id, exam.id));
      cells[`exam:${exam.id}`] = {
        score: a?.totalScore ?? null,
        status: a?.status ?? "—",
        passed: a?.passed ?? null,
      };
    }
    for (const asg of assignments) {
      const s = subMap.get(attemptKey(st.id, asg.id));
      cells[`assignment:${asg.id}`] = {
        score: s?.score ?? null,
        status: s?.status ?? "NOT_SUBMITTED",
        passed: null,
      };
    }
    return { studentId: st.id, name: st.name, studentCode: st.studentCode, cells };
  });

  return {
    lessons,
    totalLessons,
    coveredLessons,
    lessonCoverageRate,
    columns,
    rows,
  };
}
