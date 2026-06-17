"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireActiveStudent } from "@/lib/portal/session";

// =============================================================================
// PORTAL EXAM ACTIONS — Phase T2.3
// Học sinh làm bài thi qua "site con". Mọi action verify attempt/exam thuộc
// activeSite.studentId (con đang chọn). 1 attempt/exam/student (không retake).
// =============================================================================

const ACTIVE_ENROLLMENT = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

/** Hạn nộp = min(startedAt + durationMinutes, exam.closeAt). */
function attemptDeadline(
  startedAt: Date,
  durationMinutes: number,
  closeAt: Date | null,
): Date {
  const byDuration = new Date(startedAt.getTime() + durationMinutes * 60_000);
  if (closeAt && closeAt.getTime() < byDuration.getTime()) return closeAt;
  return byDuration;
}

/** HS có đang học lớp được giao đề này không. */
async function studentOwnsExam(
  studentId: string,
  examClassId: string | null,
): Promise<boolean> {
  if (!examClassId) return false;
  const enr = await db.enrollment.findFirst({
    where: {
      studentId,
      classId: examClassId,
      status: { in: [...ACTIVE_ENROLLMENT] },
      deletedAt: null, // FIX-C3
    },
    select: { id: true },
  });
  return !!enr;
}

export async function startAttempt(
  examId: string,
): Promise<ActionResult<{ attemptId: string }>> {
  const { studentId } = await requireActiveStudent();

  const exam = await db.exam.findUnique({
    where: { id: examId },
    select: {
      id: true,
      classId: true,
      status: true,
      openAt: true,
      closeAt: true,
      _count: { select: { examQuestions: true } },
    },
  });
  if (!exam) return { ok: false, error: "Không tìm thấy đề thi" };
  if (!(await studentOwnsExam(studentId, exam.classId))) {
    return { ok: false, error: "Đề thi không thuộc lớp của con" };
  }
  if (exam.status !== "PUBLISHED") {
    return { ok: false, error: "Đề thi chưa mở" };
  }
  if (exam._count.examQuestions === 0) {
    return { ok: false, error: "Đề thi chưa có câu hỏi" };
  }
  const now = Date.now();
  if (exam.openAt && exam.openAt.getTime() > now) {
    return { ok: false, error: "Chưa đến giờ mở đề" };
  }
  if (exam.closeAt && exam.closeAt.getTime() < now) {
    return { ok: false, error: "Đề thi đã đóng" };
  }

  const existing = await db.examAttempt.findUnique({
    where: { examId_studentId: { examId, studentId } },
    select: { id: true, status: true },
  });
  if (existing) {
    if (existing.status === "IN_PROGRESS") {
      return { ok: true, attemptId: existing.id };
    }
    return { ok: false, error: "Con đã làm bài thi này rồi" };
  }

  const created = await db.examAttempt.create({
    data: { examId, studentId, status: "IN_PROGRESS" },
    select: { id: true },
  });
  return { ok: true, attemptId: created.id };
}

export async function saveAnswer(input: {
  attemptId: string;
  examQuestionId: string;
  selectedChoiceIds?: string[];
  textAnswer?: string | null;
}): Promise<ActionResult> {
  const { studentId } = await requireActiveStudent();

  const attempt = await db.examAttempt.findUnique({
    where: { id: input.attemptId },
    select: {
      id: true,
      studentId: true,
      status: true,
      startedAt: true,
      exam: { select: { id: true, durationMinutes: true, closeAt: true } },
    },
  });
  if (!attempt || attempt.studentId !== studentId) {
    return { ok: false, error: "Không tìm thấy bài làm" };
  }
  if (attempt.status !== "IN_PROGRESS") {
    return { ok: false, error: "Bài làm đã nộp" };
  }
  const deadline = attemptDeadline(
    attempt.startedAt,
    attempt.exam.durationMinutes,
    attempt.exam.closeAt,
  );
  if (Date.now() > deadline.getTime()) {
    return { ok: false, error: "Đã hết giờ làm bài" };
  }

  // examQuestion phải thuộc đúng đề của attempt (chống chèn câu lạ).
  const eq = await db.examQuestion.findUnique({
    where: { id: input.examQuestionId },
    select: { id: true, examId: true },
  });
  if (!eq || eq.examId !== attempt.exam.id) {
    return { ok: false, error: "Câu hỏi không hợp lệ" };
  }

  const data = {
    selectedChoiceIds: input.selectedChoiceIds ?? [],
    textAnswer: input.textAnswer?.trim() || null,
  };
  await db.examAnswer.upsert({
    where: {
      attemptId_examQuestionId: {
        attemptId: input.attemptId,
        examQuestionId: input.examQuestionId,
      },
    },
    create: { attemptId: input.attemptId, examQuestionId: input.examQuestionId, ...data },
    update: data,
  });
  return { ok: true };
}

export async function submitAttempt(
  attemptId: string,
): Promise<ActionResult<{ graded: boolean }>> {
  const { studentId } = await requireActiveStudent();

  const attempt = await db.examAttempt.findUnique({
    where: { id: attemptId },
    include: {
      answers: {
        include: {
          examQuestion: {
            include: { question: { include: { choices: true } } },
          },
        },
      },
      exam: {
        select: {
          id: true,
          passingScore: true,
          examQuestions: {
            include: { question: { select: { type: true } } },
          },
        },
      },
    },
  });
  if (!attempt || attempt.studentId !== studentId) {
    return { ok: false, error: "Không tìm thấy bài làm" };
  }
  if (attempt.status !== "IN_PROGRESS") {
    return { ok: false, error: "Bài làm đã nộp" };
  }

  // Có câu tự luận (ESSAY/CODE) → chờ giáo viên chấm.
  const hasSubjective = attempt.exam.examQuestions.some(
    (eq) => eq.question.type === "ESSAY" || eq.question.type === "CODE",
  );

  let totalScore = 0;
  try {
    await db.$transaction(async (tx) => {
      for (const ans of attempt.answers) {
        const q = ans.examQuestion.question;
        // Mặc định cho ESSAY/CODE: chưa chấm (chờ giáo viên).
        let isCorrect: boolean | null = null;
        let score = 0;

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
        // ESSAY / CODE: giữ mặc định null/0 — giáo viên chấm tay sau.

        await tx.examAnswer.update({
          where: { id: ans.id },
          data: { isCorrect, score },
        });
        totalScore += score;
      }

      await tx.examAttempt.update({
        where: { id: attemptId },
        data: hasSubjective
          ? { status: "SUBMITTED", submittedAt: new Date() }
          : {
              status: "GRADED",
              submittedAt: new Date(),
              totalScore,
              passed: totalScore >= attempt.exam.passingScore,
              gradedAt: new Date(),
            },
      });
    });
  } catch (err) {
    return {
      ok: false,
      error: `Nộp bài thất bại: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath("/portal/bai-thi");
  revalidatePath("/portal/ket-qua");
  revalidatePath(`/exams/${attempt.exam.id}/attempts`);
  return { ok: true, graded: !hasSubjective };
}
