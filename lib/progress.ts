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
          select: { status: true },
        })
      : [];
  const attendedSessions = attendances.filter(
    (a) => a.status === "PRESENT" || a.status === "LATE",
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
): Promise<ClassStudentProgress[]> {
  const enrollments = await db.enrollment.findMany({
    where: {
      classId,
      status: { in: [...ACTIVE_ENROLLMENT_STATUSES] },
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
      student: e.student,
      progress: await getStudentProgress(e.student.id, classId),
    })),
  );
}
