// lib/lms/report-card.ts — R7-15: Học bạ ReportCard (phần đụng DB).
//
// Logic THUẦN (máy trạng thái / số liệu pure / snapshot / T5 scope) ở
// ./report-card-core (an toàn import client). File này thêm phần đọc DB và
// RE-EXPORT toàn bộ core để call-site server chỉ cần 1 import.
import "server-only";
import { db } from "@/lib/db";
import { attendanceSummary } from "@/lib/attendance/summary";
import {
  computeAttendanceRate,
  computeAssignmentSummary,
  computeExamAverage,
  latestSkillLevels,
  parsePublishedSnapshot,
  type AssignmentSubmissionLite,
  type ExamAttemptLite,
  type ReportCardMetrics,
  type PublishedReportCardView,
} from "@/lib/lms/report-card-core";

export * from "@/lib/lms/report-card-core";

const EXAM_DONE_STATUSES = ["SUBMITTED", "GRADED", "REVIEWED"] as const;

/** Số liệu LIVE cho 1 enrollment (chuyên cần từ R7-08 + bài tập từ ExamAttempt). */
export async function computeReportCardMetrics(enrollmentId: string): Promise<ReportCardMetrics> {
  const enr = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { studentId: true, classId: true },
  });
  const att = await attendanceSummary(enrollmentId);

  let attempts: ExamAttemptLite[] = [];
  let submissions: AssignmentSubmissionLite[] = [];
  let skills: { skill: string; level: string; assessedAt: string }[] = [];
  if (enr) {
    const rows = await db.examAttempt.findMany({
      where: {
        studentId: enr.studentId,
        exam: { classId: enr.classId },
        status: { in: [...EXAM_DONE_STATUSES] },
      },
      select: { totalScore: true, passed: true, exam: { select: { totalPoints: true } } },
    });
    attempts = rows.map((r) => ({
      totalScore: r.totalScore,
      totalPoints: r.exam.totalPoints,
      passed: r.passed,
    }));

    // LMS-13 (W4-a): bài tập của học viên trong lớp (qua Assignment.classId).
    const subRows = await db.assignmentSubmission.findMany({
      where: { studentId: enr.studentId, assignment: { classId: enr.classId } },
      select: { status: true, score: true, assignment: { select: { totalPoints: true } } },
    });
    submissions = subRows.map((s) => ({
      status: s.status,
      score: s.score,
      totalPoints: s.assignment.totalPoints,
    }));

    // LMS-13 (W4-a): kỹ năng robot — bản đánh giá mới nhất mỗi kỹ năng.
    const skillRows = await db.studentSkillAssessment.findMany({
      where: { studentId: enr.studentId },
      select: { skill: true, level: true, assessedAt: true },
    });
    skills = skillRows.map((r) => ({
      skill: r.skill,
      level: r.level,
      assessedAt: r.assessedAt.toISOString(),
    }));
  }

  return {
    attendance: { ...att, rate: computeAttendanceRate(att) },
    exams: computeExamAverage(attempts),
    assignments: computeAssignmentSummary(submissions),
    skills: latestSkillLevels(skills),
    computedAt: new Date().toISOString(),
  };
}

// ── Ngữ cảnh enrollment + tiêu chí ────────────────────────────────────────────
export interface EnrollmentContext {
  enrollmentId: string;
  classId: string;
  centerId: string | null;
  teacherId: string | null;
  courseId: string;
  studentId: string;
  className: string;
  studentName: string;
  studentCode: string | null;
  courseName: string;
}

export async function getEnrollmentContext(enrollmentId: string): Promise<EnrollmentContext | null> {
  const enr = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    select: {
      id: true,
      classId: true,
      courseId: true,
      studentId: true,
      student: { select: { name: true, studentCode: true } },
      class: { select: { name: true, centerId: true, teacherId: true } },
      course: { select: { name: true } },
    },
  });
  if (!enr) return null;
  return {
    enrollmentId: enr.id,
    classId: enr.classId,
    centerId: enr.class.centerId,
    teacherId: enr.class.teacherId,
    courseId: enr.courseId,
    studentId: enr.studentId,
    className: enr.class.name,
    studentName: enr.student.name,
    studentCode: enr.student.studentCode,
    courseName: enr.course.name,
  };
}

export interface CriterionView {
  id: string;
  name: string;
  order: number;
}

/** Tiêu chí năng lực ACTIVE của 1 khoá (Đào tạo cấu hình). */
export async function getCourseCriteria(courseId: string): Promise<CriterionView[]> {
  return db.reportCardCriterion.findMany({
    where: { courseId, active: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, order: true },
  });
}

// ── Đọc học bạ ĐÃ PHÁT HÀNH (portal — chỉ PUBLISHED, đọc từ snapshot) ─────────

/** Tất cả học bạ ĐÃ PHÁT HÀNH của 1 học viên (đọc snapshot — KHÔNG tính lại live). */
export async function getPublishedReportCards(studentId: string): Promise<PublishedReportCardView[]> {
  const enrollments = await db.enrollment.findMany({
    where: { studentId },
    select: { id: true },
  });
  const ids = enrollments.map((e) => e.id);
  if (ids.length === 0) return [];

  const cards = await db.reportCard.findMany({
    where: { enrollmentId: { in: ids }, status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
    select: { id: true, enrollmentId: true, publishedSnapshot: true },
  });
  return cards
    .map((c) => parsePublishedSnapshot(c.id, c.enrollmentId, c.publishedSnapshot))
    .filter((x): x is PublishedReportCardView => x !== null);
}

/**
 * 1 học bạ ĐÃ PHÁT HÀNH theo id + studentId chủ sở hữu (cho PDF portal — chống IDOR).
 * RECALLED/khác PUBLISHED → null (PH tải sẽ 404, đúng edge "thu hồi khi đang xem").
 */
export async function getPublishedReportCardForStudent(
  reportCardId: string,
  studentId: string,
): Promise<PublishedReportCardView | null> {
  const card = await db.reportCard.findFirst({
    where: { id: reportCardId, status: "PUBLISHED" },
    select: { id: true, enrollmentId: true, publishedSnapshot: true },
  });
  if (!card) return null;

  const enr = await db.enrollment.findUnique({
    where: { id: card.enrollmentId },
    select: { studentId: true },
  });
  if (!enr || enr.studentId !== studentId) return null;

  return parsePublishedSnapshot(card.id, card.enrollmentId, card.publishedSnapshot);
}
