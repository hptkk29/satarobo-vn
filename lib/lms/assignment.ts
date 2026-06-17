// lib/lms/assignment.ts — R3-08: bài tập/quiz (6 loại nội dung + nộp LATE).
// R7-14: + auto-giao bài (HomeworkAssignment) khi buổi "Hoàn tất" theo exam gắn lesson.
import type { AssignmentSubmission, SubmissionStatus } from "@prisma/client";
import { db } from "@/lib/db";

/** C8.1 — 6 loại nội dung bài tập (registry; model dùng text/file + kind CLASSWORK/HOMEWORK). */
export const ASSIGNMENT_CONTENT_TYPES = ["IMAGE", "VIDEO", "FILE", "QUIZ", "TEXT", "PROJECT"] as const;
export type AssignmentContentType = (typeof ASSIGNMENT_CONTENT_TYPES)[number];

export function isValidContentType(t: string): t is AssignmentContentType {
  return (ASSIGNMENT_CONTENT_TYPES as readonly string[]).includes(t);
}

/** C8.3 — nộp trễ nếu vượt hạn. THUẦN. (Không hạn → không bao giờ trễ.) */
export function isLateSubmission(dueAt: Date | null | undefined, submittedAt: Date): boolean {
  return dueAt != null && submittedAt > dueAt;
}

/** Nộp bài (text/file) → LATE nếu quá hạn, ngược lại SUBMITTED. Idempotent theo (bài, HS). */
export async function submitAssignment(input: {
  assignmentId: string;
  studentId: string;
  textAnswer?: string | null;
  fileUrl?: string | null;
  fileName?: string | null;
  now?: Date;
}): Promise<AssignmentSubmission> {
  const now = input.now ?? new Date();
  const assignment = await db.assignment.findUnique({
    where: { id: input.assignmentId },
    select: { dueAt: true },
  });
  const status: SubmissionStatus = isLateSubmission(assignment?.dueAt, now) ? "LATE" : "SUBMITTED";

  const existing = await db.assignmentSubmission.findFirst({
    where: { assignmentId: input.assignmentId, studentId: input.studentId },
  });
  const data = {
    textAnswer: input.textAnswer ?? null,
    fileUrl: input.fileUrl ?? null,
    fileName: input.fileName ?? null,
    submittedAt: now,
    status,
  };
  return existing
    ? db.assignmentSubmission.update({ where: { id: existing.id }, data })
    : db.assignmentSubmission.create({ data: { assignmentId: input.assignmentId, studentId: input.studentId, ...data } });
}

// ════════════════════════════════════════════════════════════════════════════
// R7-14 — Auto-giao bài (HomeworkAssignment) khi GV "Hoàn tất buổi".
//
// Nguồn bài = Exam PUBLISHED gắn Lesson của buổi (ClassSession.lessonId hoặc
// ClassSessionPlan.lessonId — R7-06). Giao cho mọi HV ĐANG HỌC (KHÔNG gồm PAUSED)
// tại thời điểm buổi hoàn tất → HV vào lớp SAU không bị back-assign (edge §6).
// IDEMPOTENT qua unique (classSessionId, examId, studentId) + createMany
// skipDuplicates → replay event / bấm 2 lần không giao trùng (AC2).
// ════════════════════════════════════════════════════════════════════════════

export type AssignMode = "NOW" | "DEFER" | "CUSTOM_DUE";

// HV "đang học" cho mục đích giao bài: KHÔNG gồm PAUSED (bảo lưu → không nhận bài mới).
const HOMEWORK_ACTIVE_STATUS = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

/** THUẦN — hạn nộp theo mode: CUSTOM_DUE dùng hạn chọn; NOW = hôm nay + defaultDueDays. */
export function computeHomeworkDueAt(opts: {
  assignMode: AssignMode;
  now: Date;
  defaultDueDays: number | null;
  customDueAt?: Date | null;
}): Date | null {
  if (opts.assignMode === "CUSTOM_DUE") return opts.customDueAt ?? null;
  if (opts.defaultDueDays == null) return null; // exam không cấu hình hạn → không hạn
  const d = new Date(opts.now);
  d.setDate(d.getDate() + opts.defaultDueDays);
  return d;
}

export type AssignHomeworkResult = {
  created: number;
  examCount: number;
  studentCount: number;
  /** true = không giao gì (DEFER / không có exam / không HV active). */
  skipped: boolean;
};

/**
 * Giao bài cho 1 buổi đã dạy. Dùng chung cho handler `session.taught` (NOW/CUSTOM_DUE)
 * và nút "Giao bài" thủ công khi GV chọn DEFER. Idempotent + tự notify PH (dedupeKey).
 */
export async function assignHomeworkForSession(opts: {
  sessionId: string;
  assignMode?: AssignMode;
  customDueAt?: Date | null;
  assignedById?: string | null;
  now?: Date;
}): Promise<AssignHomeworkResult> {
  const assignMode: AssignMode = opts.assignMode ?? "NOW";
  const now = opts.now ?? new Date();
  const empty: AssignHomeworkResult = { created: 0, examCount: 0, studentCount: 0, skipped: true };

  // DEFER → chưa giao; chờ GV bấm "Giao bài" (gọi lại hàm này với NOW/CUSTOM_DUE).
  if (assignMode === "DEFER") return empty;

  const session = await db.classSession.findUnique({
    where: { id: opts.sessionId },
    select: {
      id: true,
      classId: true,
      lessonId: true,
      plan: { select: { lessonId: true } },
      class: { select: { name: true, centerId: true } },
    },
  });
  if (!session) return empty;

  // Lesson của buổi: ưu tiên lessonId trực tiếp, fallback ClassSessionPlan (R7-06).
  const lessonId = session.lessonId ?? session.plan?.lessonId ?? null;
  if (!lessonId) return empty; // buổi không gắn lesson → hoàn tất bình thường, không giao gì

  // Exam PUBLISHED gắn lesson; loại exam của lớp khác (giữ exam dùng chung classId=null).
  const exams = await db.exam.findMany({
    where: {
      lessonId,
      status: "PUBLISHED",
      OR: [{ classId: null }, { classId: session.classId }],
    },
    select: { id: true, title: true, defaultDueDays: true },
  });
  if (exams.length === 0) return empty;

  const enrollments = await db.enrollment.findMany({
    where: { classId: session.classId, status: { in: [...HOMEWORK_ACTIVE_STATUS] } },
    select: { studentId: true, student: { select: { name: true, centerId: true } } },
  });
  if (enrollments.length === 0) {
    return { created: 0, examCount: exams.length, studentCount: 0, skipped: true };
  }

  const rows = exams.flatMap((exam) => {
    const dueAt = computeHomeworkDueAt({
      assignMode,
      now,
      defaultDueDays: exam.defaultDueDays,
      customDueAt: opts.customDueAt ?? null,
    });
    return enrollments.map((e) => ({
      classSessionId: session.id,
      examId: exam.id,
      studentId: e.studentId,
      dueAt,
      assignMode,
      assignedById: opts.assignedById ?? null,
    }));
  });

  // Idempotency: unique (classSessionId, examId, studentId) — skipDuplicates → replay-safe.
  const res = await db.homeworkAssignment.createMany({ data: rows, skipDuplicates: true });

  // Notify PH bài mới (idempotent theo buổi × HV). Không lộ nội dung — chỉ tổng quan.
  const examWord = exams.length > 1 ? `${exams.length} bài` : "1 bài";
  for (const e of enrollments) {
    await db.notification.upsert({
      where: { dedupeKey: `homework.assigned:${session.id}:${e.studentId}` },
      create: {
        title: "Bài tập mới",
        body: `Con ${e.student?.name ?? ""} có ${examWord} kiểm tra/bài tập mới của lớp ${session.class?.name ?? ""}.`,
        audience: "STUDENT",
        studentId: e.studentId,
        classId: session.classId,
        centerId: e.student?.centerId ?? session.class?.centerId ?? null,
        createdByName: "Hệ thống",
        dedupeKey: `homework.assigned:${session.id}:${e.studentId}`,
      },
      update: {},
    });
  }

  return { created: res.count, examCount: exams.length, studentCount: enrollments.length, skipped: false };
}
