"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { questionSchema, type QuestionInput } from "@/lib/validators/question";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

async function requireRole(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "questions:author")) {
    return { ok: false, error: "Không có quyền quản lý câu hỏi" };
  }
  return { ok: true, userId: session.user.id ?? "" };
}

async function resolveAuthorEmployeeId(userId: string): Promise<string | null> {
  if (!userId) return null;
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { employeeId: true },
    });
    return user?.employeeId ?? null;
  } catch {
    return null;
  }
}

// Normalize choices so the order numbers are dense (1..N) regardless of UI gaps.
function normalizeChoices(input: QuestionInput["choices"]) {
  return input.map((c, i) => ({
    order: i + 1,
    text: c.text,
    isCorrect: c.isCorrect,
  }));
}

export async function createQuestion(
  input: QuestionInput,
): Promise<Result<{ questionId: string }>> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  if (data.questionCode) {
    const dup = await db.question.findUnique({
      where: { questionCode: data.questionCode },
      select: { id: true },
    });
    if (dup) return { ok: false, error: `Mã câu hỏi "${data.questionCode}" đã tồn tại` };
  }

  const authorEmployeeId = await resolveAuthorEmployeeId(gate.userId);
  const choices =
    data.type === "MULTIPLE_CHOICE" || data.type === "TRUE_FALSE"
      ? normalizeChoices(data.choices)
      : [];

  try {
    const q = await db.$transaction(async (tx) => {
      const created = await tx.question.create({
        data: {
          questionCode: data.questionCode,
          type: data.type,
          text: data.text,
          explanation: data.explanation,
          difficulty: data.difficulty,
          tags: data.tags,
          lessonId: data.lessonId,
          correctAnswer:
            data.type === "MULTIPLE_CHOICE" || data.type === "TRUE_FALSE"
              ? null
              : data.correctAnswer,
          isPublic: data.isPublic,
          notes: data.notes,
          authorId: authorEmployeeId,
        },
        select: { id: true },
      });

      if (choices.length > 0) {
        await tx.choice.createMany({
          data: choices.map((c) => ({ questionId: created.id, ...c })),
        });
      }

      return created;
    });

    revalidatePath("/questions");
    return { ok: true, data: { questionId: q.id } };
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
}

export async function createQuestionAndRedirect(input: QuestionInput) {
  const res = await createQuestion(input);
  if (!res.ok) return res;
  redirect(`/questions/${res.data!.questionId}/edit`);
}

export async function updateQuestion(
  id: string,
  input: QuestionInput,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = questionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const current = await db.question.findUnique({
    where: { id },
    select: { questionCode: true },
  });
  if (!current) return { ok: false, error: "Câu hỏi không tồn tại" };

  if (data.questionCode && data.questionCode !== current.questionCode) {
    const dup = await db.question.findUnique({
      where: { questionCode: data.questionCode },
      select: { id: true },
    });
    if (dup && dup.id !== id) {
      return { ok: false, error: `Mã câu hỏi "${data.questionCode}" đã tồn tại` };
    }
  }

  const choices =
    data.type === "MULTIPLE_CHOICE" || data.type === "TRUE_FALSE"
      ? normalizeChoices(data.choices)
      : [];

  try {
    await db.$transaction(async (tx) => {
      // Replace choices: delete-then-recreate is simpler than diffing.
      await tx.choice.deleteMany({ where: { questionId: id } });
      await tx.question.update({
        where: { id },
        data: {
          questionCode: data.questionCode,
          type: data.type,
          text: data.text,
          explanation: data.explanation,
          difficulty: data.difficulty,
          tags: data.tags,
          lessonId: data.lessonId,
          correctAnswer:
            data.type === "MULTIPLE_CHOICE" || data.type === "TRUE_FALSE"
              ? null
              : data.correctAnswer,
          isPublic: data.isPublic,
          notes: data.notes,
        },
      });
      if (choices.length > 0) {
        await tx.choice.createMany({
          data: choices.map((c) => ({ questionId: id, ...c })),
        });
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath("/questions");
  revalidatePath(`/questions/${id}/edit`);
  return { ok: true };
}

export async function deleteQuestion(id: string): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  try {
    await db.question.delete({ where: { id } });
  } catch (err) {
    return {
      ok: false,
      error: `Không xoá được: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/questions");
  return { ok: true };
}

export async function deleteQuestionAndRedirect(id: string): Promise<Result> {
  const res = await deleteQuestion(id);
  if (!res.ok) return res;
  redirect("/questions");
}
