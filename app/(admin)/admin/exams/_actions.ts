"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { z } from "zod";
import {
  examSchema,
  ExamStatusEnum,
  type ExamInput,
} from "@/lib/validators/exam";
import {
  QuestionTypeEnum,
  QuestionDifficultyEnum,
} from "@/lib/validators/question";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER", "TEACHER"] as const;

async function requireRole(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return { ok: false, error: "Không có quyền quản lý đề thi" };
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
// Exam CRUD
// ──────────────────────────────────────────────────────────────────────────

export async function createExam(
  input: ExamInput,
): Promise<Result<{ examId: string }>> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = examSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  if (data.examCode) {
    const dup = await db.exam.findUnique({
      where: { examCode: data.examCode },
      select: { id: true },
    });
    if (dup) return { ok: false, error: `Mã đề "${data.examCode}" đã tồn tại` };
  }

  const createdById = await resolveEmployeeId(gate.userId);

  try {
    const e = await db.exam.create({
      data: { ...data, createdById },
      select: { id: true },
    });
    revalidatePath("/exams");
    return { ok: true, data: { examId: e.id } };
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
}

export async function createExamAndRedirect(input: ExamInput) {
  const res = await createExam(input);
  if (!res.ok) return res;
  redirect(`/exams/${res.data!.examId}/builder`);
}

export async function updateExam(
  id: string,
  input: ExamInput,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = examSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const current = await db.exam.findUnique({
    where: { id },
    select: { examCode: true },
  });
  if (!current) return { ok: false, error: "Đề thi không tồn tại" };

  if (data.examCode && data.examCode !== current.examCode) {
    const dup = await db.exam.findUnique({
      where: { examCode: data.examCode },
      select: { id: true },
    });
    if (dup && dup.id !== id) {
      return { ok: false, error: `Mã đề "${data.examCode}" đã tồn tại` };
    }
  }

  try {
    await db.exam.update({ where: { id }, data });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath("/exams");
  revalidatePath(`/exams/${id}/builder`);
  return { ok: true };
}

export async function deleteExam(id: string): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const attempts = await db.examAttempt.count({ where: { examId: id } });
  if (attempts > 0) {
    return {
      ok: false,
      error: `Đề thi có ${attempts} lần làm bài — không thể xoá. Đổi sang ARCHIVED thay vì xoá.`,
    };
  }

  try {
    await db.exam.delete({ where: { id } });
  } catch (err) {
    return {
      ok: false,
      error: `Không xoá được: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/exams");
  return { ok: true };
}

export async function deleteExamAndRedirect(id: string): Promise<Result> {
  const res = await deleteExam(id);
  if (!res.ok) return res;
  redirect("/exams");
}

// ──────────────────────────────────────────────────────────────────────────
// ExamQuestion management
// ──────────────────────────────────────────────────────────────────────────

const AddQuestionSchema = z.object({
  examId: z.string().min(1),
  questionId: z.string().min(1),
  points: z.coerce.number().min(0).default(1),
});

export async function addQuestionToExam(
  input: z.infer<typeof AddQuestionSchema>,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = AddQuestionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { examId, questionId, points } = parsed.data;

  const existing = await db.examQuestion.findUnique({
    where: { examId_questionId: { examId, questionId } },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "Câu hỏi đã có trong đề" };

  try {
    const count = await db.examQuestion.count({ where: { examId } });
    await db.examQuestion.create({
      data: { examId, questionId, order: count + 1, points },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath(`/exams/${examId}/builder`);
  return { ok: true };
}

export async function removeQuestionFromExam(
  examQuestionId: string,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const eq = await db.examQuestion.findUnique({
    where: { id: examQuestionId },
    select: { examId: true, order: true },
  });
  if (!eq) return { ok: false, error: "Không tìm thấy bản ghi" };

  try {
    await db.$transaction(async (tx) => {
      await tx.examQuestion.delete({ where: { id: examQuestionId } });
      // Renumber: bring higher orders down by 1 to keep dense sequence
      const higher = await tx.examQuestion.findMany({
        where: { examId: eq.examId, order: { gt: eq.order } },
        orderBy: { order: "asc" },
        select: { id: true, order: true },
      });
      // 2-pass to dodge the unique (examId, order) constraint
      for (let i = 0; i < higher.length; i++) {
        await tx.examQuestion.update({
          where: { id: higher[i].id },
          data: { order: -(higher[i].order) },
        });
      }
      for (let i = 0; i < higher.length; i++) {
        await tx.examQuestion.update({
          where: { id: higher[i].id },
          data: { order: higher[i].order - 1 },
        });
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath(`/exams/${eq.examId}/builder`);
  return { ok: true };
}

export async function updateExamQuestionPoints(
  examQuestionId: string,
  points: number,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;
  if (!Number.isFinite(points) || points < 0) {
    return { ok: false, error: "Điểm phải >= 0" };
  }

  try {
    const eq = await db.examQuestion.update({
      where: { id: examQuestionId },
      data: { points },
      select: { examId: true },
    });
    revalidatePath(`/exams/${eq.examId}/builder`);
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  return { ok: true };
}

// Reorder questions inside an exam (2-pass to avoid unique conflict).
export async function reorderExamQuestions({
  examId,
  examQuestionIds,
}: {
  examId: string;
  examQuestionIds: string[];
}): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  if (!Array.isArray(examQuestionIds) || examQuestionIds.length === 0) {
    return { ok: false, error: "Danh sách rỗng" };
  }

  const found = await db.examQuestion.findMany({
    where: { id: { in: examQuestionIds }, examId },
    select: { id: true },
  });
  if (found.length !== examQuestionIds.length) {
    return { ok: false, error: "Có câu hỏi không thuộc đề thi này" };
  }

  try {
    await db.$transaction(async (tx) => {
      for (let i = 0; i < examQuestionIds.length; i++) {
        await tx.examQuestion.update({
          where: { id: examQuestionIds[i] },
          data: { order: -(i + 1) },
        });
      }
      for (let i = 0; i < examQuestionIds.length; i++) {
        await tx.examQuestion.update({
          where: { id: examQuestionIds[i] },
          data: { order: i + 1 },
        });
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: `Reorder thất bại: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath(`/exams/${examId}/builder`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Auto-generate exam questions from filter (random over-fetch + shuffle)
// ──────────────────────────────────────────────────────────────────────────

const AutoGenSchema = z.object({
  examId: z.string().min(1),
  lessonId: z.string().nullable().optional(),
  type: QuestionTypeEnum.nullable().optional(),
  difficulty: QuestionDifficultyEnum.nullable().optional(),
  tags: z.array(z.string()).default([]),
  count: z.coerce.number().int().min(1).max(100),
  defaultPoints: z.coerce.number().min(0).default(1),
});

export async function autoGenerateExamQuestions(
  input: z.infer<typeof AutoGenSchema>,
): Promise<Result<{ added: number }>> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = AutoGenSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { examId, count, defaultPoints } = parsed.data;

  const existing = await db.examQuestion.findMany({
    where: { examId },
    select: { questionId: true },
  });
  const existingIds = existing.map((e) => e.questionId);

  const where: Record<string, unknown> = { isPublic: true };
  if (parsed.data.lessonId) where.lessonId = parsed.data.lessonId;
  if (parsed.data.type) where.type = parsed.data.type;
  if (parsed.data.difficulty) where.difficulty = parsed.data.difficulty;
  if (parsed.data.tags.length > 0) where.tags = { hasSome: parsed.data.tags };
  if (existingIds.length > 0) where.id = { notIn: existingIds };

  const candidates = await db.question.findMany({
    where,
    select: { id: true },
    take: count * 3,
  });

  if (candidates.length === 0) {
    return { ok: false, error: "Không có câu hỏi nào khớp filter" };
  }

  // Fisher-Yates shuffle
  const shuffled = [...candidates];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const picked = shuffled.slice(0, count);

  const startOrder = existing.length;
  try {
    await db.examQuestion.createMany({
      data: picked.map((q, idx) => ({
        examId,
        questionId: q.id,
        order: startOrder + idx + 1,
        points: defaultPoints,
      })),
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath(`/exams/${examId}/builder`);
  return { ok: true, data: { added: picked.length } };
}

// ──────────────────────────────────────────────────────────────────────────
// Grade attempt
// ──────────────────────────────────────────────────────────────────────────

export async function gradeAttempt(attemptId: string): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const attempt = await db.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: {
        include: {
          examQuestion: {
            include: {
              question: { include: { choices: true } },
            },
          },
        },
      },
      exam: { select: { id: true, passingScore: true } },
    },
  });
  if (!attempt) return { ok: false, error: "Không tìm thấy bài làm" };
  if (attempt.status === "IN_PROGRESS") {
    return { ok: false, error: "Bài làm chưa được nộp (IN_PROGRESS)" };
  }

  const graderEmployeeId = await resolveEmployeeId(gate.userId);

  let totalScore = 0;
  try {
    await db.$transaction(async (tx) => {
      for (const ans of attempt.answers) {
        const q = ans.examQuestion.question;
        let isCorrect: boolean | null = ans.isCorrect;
        let score: number = ans.score ?? 0;

        if (q.type === "MULTIPLE_CHOICE" || q.type === "TRUE_FALSE") {
          const correctIds = q.choices
            .filter((c) => c.isCorrect)
            .map((c) => c.id)
            .sort();
          const selectedIds = [...ans.selectedChoiceIds].sort();
          isCorrect =
            correctIds.length > 0 &&
            correctIds.length === selectedIds.length &&
            correctIds.every((id, i) => id === selectedIds[i]);
          score = isCorrect ? ans.examQuestion.points : 0;
        } else if (q.type === "SHORT_ANSWER") {
          const correct = (q.correctAnswer ?? "").trim().toLowerCase();
          const submitted = (ans.textAnswer ?? "").trim().toLowerCase();
          isCorrect = correct.length > 0 && correct === submitted;
          score = isCorrect ? ans.examQuestion.points : 0;
        }
        // ESSAY / CODE: keep existing isCorrect + score (manual grading)

        await tx.examAnswer.update({
          where: { id: ans.id },
          data: { isCorrect, score },
        });
        totalScore += score;
      }

      await tx.examAttempt.update({
        where: { id: attemptId },
        data: {
          status: "GRADED",
          totalScore,
          passed: totalScore >= attempt.exam.passingScore,
          gradedAt: new Date(),
          gradedById: graderEmployeeId,
        },
      });
    });
  } catch (err) {
    return {
      ok: false,
      error: `Chấm bài thất bại: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath("/exams");
  revalidatePath(`/exams/${attempt.exam.id}/attempts`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Manual grade for a single answer (ESSAY / CODE / override auto-grade)
// ──────────────────────────────────────────────────────────────────────────

const ManualGradeSchema = z.object({
  examAnswerId: z.string().min(1),
  isCorrect: z.boolean().nullable(),
  score: z.coerce.number().min(0),
  graderNote: z.string().nullable().optional(),
});

export async function manualGradeAnswer(
  input: z.infer<typeof ManualGradeSchema>,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = ManualGradeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const ans = await db.examAnswer.findUnique({
    where: { id: parsed.data.examAnswerId },
    select: { examQuestion: { select: { points: true } }, attemptId: true },
  });
  if (!ans) return { ok: false, error: "Không tìm thấy bài trả lời" };
  if (parsed.data.score > ans.examQuestion.points) {
    return {
      ok: false,
      error: `Điểm vượt quá điểm tối đa của câu (${ans.examQuestion.points})`,
    };
  }

  try {
    await db.examAnswer.update({
      where: { id: parsed.data.examAnswerId },
      data: {
        isCorrect: parsed.data.isCorrect,
        score: parsed.data.score,
        graderNote: parsed.data.graderNote?.trim() || null,
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  // Caller is expected to recompute totals via gradeAttempt or refresh.
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Quick status change (DRAFT → PUBLISHED → CLOSED → ARCHIVED)
// ──────────────────────────────────────────────────────────────────────────

const ChangeStatusSchema = z.object({
  examId: z.string().min(1),
  status: ExamStatusEnum,
});

export async function changeExamStatus(
  input: z.infer<typeof ChangeStatusSchema>,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = ChangeStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  try {
    await db.exam.update({
      where: { id: parsed.data.examId },
      data: { status: parsed.data.status },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/exams");
  revalidatePath(`/exams/${parsed.data.examId}/builder`);
  return { ok: true };
}
