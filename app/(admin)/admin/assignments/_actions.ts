"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { z } from "zod";
import {
  assignmentSchema,
  type AssignmentInput,
} from "@/lib/validators/assignment";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { RUBRIC_CRITERION_KEYS, RUBRIC_LEVEL_KEYS, rubricToScore } from "@/lib/rubric/criteria";
import { enqueueEmail } from "@/lib/email/queue";
import type { RubricCriterion, RubricLevel } from "@prisma/client";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireRole(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "assignments:create")) {
    return { ok: false, error: "Không có quyền quản lý bài tập" };
  }
  return { ok: true, userId: session.user.id ?? "" };
}

async function resolveEmployeeId(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const u = await db.user.findUnique({
      where: { id: userId },
      select: { employeeId: true },
    });
    return u?.employeeId ?? null;
  } catch {
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Assignment CRUD
// ──────────────────────────────────────────────────────────────────────────

export async function createAssignment(
  input: AssignmentInput,
): Promise<Result<{ assignmentId: string }>> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const createdById = await resolveEmployeeId(gate.userId);

  try {
    const a = await db.assignment.create({
      data: { ...data, createdById },
      select: { id: true },
    });
    revalidatePath("/assignments");
    return { ok: true, data: { assignmentId: a.id } };
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
}

export async function createAssignmentAndRedirect(input: AssignmentInput) {
  const res = await createAssignment(input);
  if (!res.ok) return res;
  redirect(`/assignments/${res.data!.assignmentId}/edit`);
}

export async function updateAssignment(
  id: string,
  input: AssignmentInput,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = assignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  try {
    await db.assignment.update({ where: { id }, data: parsed.data });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/assignments");
  revalidatePath(`/assignments/${id}/edit`);
  return { ok: true };
}

export async function deleteAssignment(id: string): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const submitted = await db.assignmentSubmission.count({
    where: {
      assignmentId: id,
      status: { in: ["SUBMITTED", "LATE", "GRADED"] },
    },
  });
  if (submitted > 0) {
    return {
      ok: false,
      error: `Có ${submitted} HS đã nộp — không thể xoá. Đổi sang ARCHIVED thay vì xoá.`,
    };
  }

  try {
    // AssignmentDocument auto-cascades; AssignmentSubmission needs manual cleanup
    // (it's RESTRICT-on-delete to protect graded history; here we cleared above).
    await db.$transaction([
      db.assignmentSubmission.deleteMany({ where: { assignmentId: id } }),
      db.assignment.delete({ where: { id } }),
    ]);
  } catch (err) {
    return {
      ok: false,
      error: `Không xoá được: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/assignments");
  return { ok: true };
}

export async function deleteAssignmentAndRedirect(id: string): Promise<Result> {
  const res = await deleteAssignment(id);
  if (!res.ok) return res;
  redirect("/assignments");
}

// ──────────────────────────────────────────────────────────────────────────
// Attach / Detach Document
// ──────────────────────────────────────────────────────────────────────────

const AttachSchema = z.object({
  assignmentId: z.string().min(1),
  documentId: z.string().min(1),
});

export async function attachDocument(
  input: z.infer<typeof AttachSchema>,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = AttachSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Tham số không hợp lệ" };
  const { assignmentId, documentId } = parsed.data;

  const existing = await db.assignmentDocument.findUnique({
    where: { assignmentId_documentId: { assignmentId, documentId } },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "Tài liệu đã đính kèm" };

  try {
    await db.assignmentDocument.create({ data: { assignmentId, documentId } });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath(`/assignments/${assignmentId}/edit`);
  return { ok: true };
}

export async function detachDocument(
  assignmentDocumentId: string,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const ad = await db.assignmentDocument.findUnique({
    where: { id: assignmentDocumentId },
    select: { assignmentId: true },
  });
  if (!ad) return { ok: false, error: "Không tìm thấy bản ghi" };

  try {
    await db.assignmentDocument.delete({ where: { id: assignmentDocumentId } });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath(`/assignments/${ad.assignmentId}/edit`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Publish: auto-create AssignmentSubmission for every enrolled student
// ──────────────────────────────────────────────────────────────────────────

export async function publishAssignment(
  assignmentId: string,
): Promise<Result<{ created: number }>> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, classId: true, status: true },
  });
  if (!assignment) return { ok: false, error: "Không tìm thấy bài tập" };
  if (assignment.status !== "DRAFT") {
    return {
      ok: false,
      error: `Chỉ DRAFT mới publish được (hiện: ${assignment.status})`,
    };
  }

  const enrollments = await db.enrollment.findMany({
    where: {
      classId: assignment.classId,
      status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
    },
    select: { studentId: true },
  });
  if (enrollments.length === 0) {
    return {
      ok: false,
      error:
        "Lớp chưa có HS active (CONFIRMED/STUDYING/ACTIVE). Đăng ký HS vào lớp trước.",
    };
  }

  try {
    await db.$transaction([
      db.assignmentSubmission.createMany({
        data: enrollments.map((e) => ({
          assignmentId,
          studentId: e.studentId,
          status: "NOT_SUBMITTED" as const,
        })),
        skipDuplicates: true,
      }),
      db.assignment.update({
        where: { id: assignmentId },
        data: { status: "PUBLISHED" },
      }),
    ]);
  } catch (err) {
    return {
      ok: false,
      error: `Publish thất bại: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/assignments");
  revalidatePath(`/assignments/${assignmentId}/edit`);
  return { ok: true, data: { created: enrollments.length } };
}

// ──────────────────────────────────────────────────────────────────────────
// Status change (DRAFT → PUBLISHED handled separately; this covers
// CLOSED / ARCHIVED transitions plus reopening to DRAFT if no submissions).
// ──────────────────────────────────────────────────────────────────────────

const ChangeStatusSchema = z.object({
  assignmentId: z.string().min(1),
  status: z.enum(["CLOSED", "ARCHIVED"]),
});

export async function changeAssignmentStatus(
  input: z.infer<typeof ChangeStatusSchema>,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = ChangeStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Tham số không hợp lệ" };

  try {
    await db.assignment.update({
      where: { id: parsed.data.assignmentId },
      data: { status: parsed.data.status },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/assignments");
  revalidatePath(`/assignments/${parsed.data.assignmentId}/edit`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Record submission (admin enters HS submission manually from Zalo/offline)
// ──────────────────────────────────────────────────────────────────────────

const RecordSubmissionSchema = z.object({
  submissionId: z.string().min(1),
  textAnswer: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  fileName: z.string().nullable().optional(),
  fileSize: z.coerce.number().int().nullable().optional(),
  mimeType: z.string().nullable().optional(),
});

export async function recordSubmission(
  input: z.infer<typeof RecordSubmissionSchema>,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = RecordSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const textAnswer = data.textAnswer?.trim() || null;
  const fileUrl = data.fileUrl?.trim() || null;
  if (!textAnswer && !fileUrl) {
    return { ok: false, error: "Cần ít nhất 1 trong textAnswer hoặc file" };
  }

  const submission = await db.assignmentSubmission.findUnique({
    where: { id: data.submissionId },
    include: { assignment: { select: { dueAt: true } } },
  });
  if (!submission) return { ok: false, error: "Không tìm thấy submission" };

  const now = new Date();
  const isLate =
    submission.assignment.dueAt && now > submission.assignment.dueAt;

  try {
    await db.assignmentSubmission.update({
      where: { id: data.submissionId },
      data: {
        textAnswer,
        fileUrl,
        fileName: data.fileName?.trim() || null,
        fileSize: data.fileSize ?? null,
        mimeType: data.mimeType?.trim() || null,
        submittedAt: now,
        status: isLate ? "LATE" : "SUBMITTED",
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath(`/assignments/${submission.assignmentId}/edit`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Grade submission
// ──────────────────────────────────────────────────────────────────────────

const GradeSchema = z.object({
  submissionId: z.string().min(1),
  score: z.coerce.number().min(0, "Điểm >= 0"),
  feedback: z.string().nullable().optional(),
});

export async function gradeSubmission(
  input: z.infer<typeof GradeSchema>,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = GradeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const submission = await db.assignmentSubmission.findUnique({
    where: { id: data.submissionId },
    include: { assignment: { select: { totalPoints: true } } },
  });
  if (!submission) return { ok: false, error: "Không tìm thấy submission" };
  if (submission.status === "NOT_SUBMITTED") {
    return { ok: false, error: "HS chưa nộp — không thể chấm" };
  }
  if (data.score > submission.assignment.totalPoints) {
    return {
      ok: false,
      error: `Điểm vượt totalPoints (${submission.assignment.totalPoints})`,
    };
  }

  const graderEmployeeId = await resolveEmployeeId(gate.userId);

  try {
    await db.assignmentSubmission.update({
      where: { id: data.submissionId },
      data: {
        score: data.score,
        feedback: data.feedback?.trim() || null,
        status: "GRADED",
        gradedAt: new Date(),
        gradedById: graderEmployeeId,
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath(`/assignments/${submission.assignmentId}/edit`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Cụm C3 — Chấm bài theo rubric robotics (6 tiêu chí, nhận xét BẮT BUỘC)
// ──────────────────────────────────────────────────────────────────────────

const RubricGradeSchema = z.object({
  submissionId: z.string().min(1),
  scores: z
    .array(
      z.object({
        criterion: z.enum(RUBRIC_CRITERION_KEYS as [string, ...string[]]),
        level: z.enum(RUBRIC_LEVEL_KEYS as [string, ...string[]]),
      }),
    )
    .length(RUBRIC_CRITERION_KEYS.length, "Phải chấm đủ 6 tiêu chí"),
  feedback: z.string().trim().min(5, "Nhận xét là bắt buộc (tối thiểu 5 ký tự)"),
  sendEmail: z.boolean().optional(),
});

export async function gradeSubmissionRubric(
  input: z.infer<typeof RubricGradeSchema>,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = RubricGradeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  // Mỗi tiêu chí chỉ chấm 1 lần.
  const seen = new Set(data.scores.map((s) => s.criterion));
  if (seen.size !== RUBRIC_CRITERION_KEYS.length) {
    return { ok: false, error: "Tiêu chí bị trùng hoặc thiếu" };
  }

  const submission = await db.assignmentSubmission.findUnique({
    where: { id: data.submissionId },
    include: {
      assignment: { select: { title: true } },
      student: { select: { name: true, parentUser: { select: { email: true, name: true } } } },
    },
  });
  if (!submission) return { ok: false, error: "Không tìm thấy submission" };
  if (submission.status === "NOT_SUBMITTED") {
    return { ok: false, error: "HS chưa nộp — không thể chấm" };
  }

  const score = rubricToScore(
    data.scores.map((s) => ({ criterion: s.criterion as RubricCriterion, level: s.level as RubricLevel })),
  );
  const graderEmployeeId = await resolveEmployeeId(gate.userId);

  try {
    await db.$transaction(async (tx) => {
      await tx.submissionRubricScore.deleteMany({ where: { submissionId: data.submissionId } });
      await tx.submissionRubricScore.createMany({
        data: data.scores.map((s) => ({
          submissionId: data.submissionId,
          criterion: s.criterion as RubricCriterion,
          level: s.level as RubricLevel,
        })),
      });
      await tx.assignmentSubmission.update({
        where: { id: data.submissionId },
        data: {
          score: score ?? undefined,
          feedback: data.feedback,
          status: "GRADED",
          gradedAt: new Date(),
          gradedById: graderEmployeeId,
        },
      });
    });
  } catch (err) {
    return { ok: false, error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}` };
  }

  // Email tuỳ chọn cho phụ huynh (A2 — chỉ enqueue, không gửi ngay).
  if (data.sendEmail && submission.student.parentUser?.email) {
    await enqueueEmail({
      to: submission.student.parentUser.email,
      toName: submission.student.parentUser.name ?? undefined,
      subject: `Kết quả chấm bài: ${submission.assignment.title} — ${submission.student.name}`,
      bodyText: `Bài "${submission.assignment.title}" của bé ${submission.student.name} đã được chấm.\nĐiểm: ${score ?? "—"}/10.\nNhận xét: ${data.feedback}\nXem chi tiết rubric tại cổng học viên.`,
      context: { type: "RUBRIC_GRADED", id: data.submissionId },
    }).catch(() => {});
  }

  revalidatePath(`/assignments/${submission.assignmentId}/edit`);
  return { ok: true };
}
