// lib/lms/assignment.ts — R3-08: bài tập/quiz (6 loại nội dung + nộp LATE).
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
