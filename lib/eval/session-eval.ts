// lib/eval/session-eval.ts — FL4-01: phiếu đánh giá BUỔI HỌC (SESSION_EVAL).
//
// GV điền phiếu động theo TỪNG HỌC SINH cho 1 buổi → lưu vào EvalResponse
// (roundId + classSessionId + studentId) + EvalAnswer. Dùng chung cơ chế cho
// lớp chính + lớp trải nghiệm (áp theo cơ sở/khóa của đợt, không phân biệt loại lớp).
//
// PURE (test được, không cần DB): isSessionEvalRoundApplicable, dedupeKeyForResponse.
// DB-backed: findApplicableSessionEvalRound, getSessionEvalState, saveSessionEvalResponses.
//
// CHỐNG TRÙNG (W0 để ngỏ — FL4-01 CHỐT app-level idempotency theo
// (roundId, classSessionId, studentId)): EvalResponse KHÔNG có unique DB cho bộ ba
// này (3 cột unique cũ enrollmentId/teacherId/parentUserId đều NULL cho SESSION_EVAL,
// nên Postgres coi mỗi dòng là khác nhau → không tự chặn). Vì vậy save chạy
// find-or-replace trong $transaction: đã có response (round×buổi×HS) thì THAY answers,
// chưa có thì tạo mới. Idempotent với lần lưu lặp; không sinh response trùng.
import type { EvaluationRoundStatus, EvalScope } from "@prisma/client";
import { db } from "@/lib/db";
import { isRoundOpen } from "@/lib/eval/rounds";
import {
  parseOptions,
  validateAnswers,
  type QuestionDef,
  type SubmittedAnswer,
} from "@/lib/eval/schema";

// ─── PURE — áp đợt SESSION_EVAL cho 1 buổi ───────────────────────────────────
export type SessionEvalRoundScope = {
  scope: EvalScope;
  status: EvaluationRoundStatus;
  opensAt: Date | null;
  closesAt: Date | null;
  centerId: string | null;
  courseId: string | null;
};

export type SessionClassScope = {
  centerId: string | null;
  courseId: string | null;
};

/**
 * PURE — đợt SESSION_EVAL có áp cho buổi (lớp) này không?
 * Áp khi: scope SESSION_EVAL + đang MỞ (status OPEN trong cửa sổ thời gian) +
 * cơ sở/khóa của đợt khớp lớp (đợt để trống cơ sở/khóa = áp toàn hệ thống → cả
 * lớp chính lẫn lớp trải nghiệm). Tính tại thời điểm GV mở phiếu (AC như R7-16).
 */
export function isSessionEvalRoundApplicable(
  round: SessionEvalRoundScope,
  cls: SessionClassScope,
  now: Date = new Date(),
): boolean {
  if (round.scope !== "SESSION_EVAL") return false;
  if (!isRoundOpen(round, now)) return false;
  if (round.centerId && round.centerId !== cls.centerId) return false;
  if (round.courseId && round.courseId !== cls.courseId) return false;
  return true;
}

/** PURE — khóa idempotency của 1 response SESSION_EVAL (round×buổi×HS). */
export function dedupeKeyForResponse(roundId: string, classSessionId: string, studentId: string): string {
  return `${roundId}|${classSessionId}|${studentId}`;
}

// ─── DB-backed ───────────────────────────────────────────────────────────────

export type SessionEvalFormState = {
  active: true;
  roundId: string;
  roundName: string;
  formId: string;
  formTitle: string;
  questions: QuestionDef[];
  /** đáp án đã lưu trước đó theo studentId (để GV mở lại sửa). */
  answersByStudent: Record<string, SubmittedAnswer[]>;
};

export type SessionEvalState = SessionEvalFormState | { active: false };

/**
 * Tìm đợt SESSION_EVAL đang áp cho buổi. Chọn đợt MỞ khớp cơ sở/khóa, ưu tiên
 * đợt cụ thể hơn (có cơ sở/khóa) rồi tới đợt mới nhất. Trả null nếu không có.
 */
export async function findApplicableSessionEvalRound(sessionId: string) {
  const sess = await db.classSession.findUnique({
    where: { id: sessionId },
    select: { id: true, class: { select: { centerId: true, courseId: true } } },
  });
  if (!sess) return null;

  const rounds = await db.evaluationRound.findMany({
    where: { scope: "SESSION_EVAL", status: "OPEN" },
    orderBy: { createdAt: "desc" },
    include: { form: { select: { id: true, title: true } } },
  });

  const cls: SessionClassScope = { centerId: sess.class.centerId, courseId: sess.class.courseId };
  const now = new Date();
  const matches = rounds.filter((r) =>
    isSessionEvalRoundApplicable(
      { scope: r.scope, status: r.status, opensAt: r.opensAt, closesAt: r.closesAt, centerId: r.centerId, courseId: r.courseId },
      cls,
      now,
    ),
  );
  if (matches.length === 0) return null;

  // Ưu tiên đợt cụ thể hơn (điểm = có centerId + có courseId), rồi mới nhất (đã sort desc).
  const specificity = (r: (typeof matches)[number]) => (r.centerId ? 1 : 0) + (r.courseId ? 1 : 0);
  matches.sort((a, b) => specificity(b) - specificity(a));
  return matches[0]!;
}

/**
 * Trạng thái phiếu SESSION_EVAL cho 1 buổi: câu hỏi của form + đáp án đã lưu theo HS.
 * KHÔNG gate — caller (server action) phải gate quyền GV/Admin trước.
 */
export async function getSessionEvalState(sessionId: string): Promise<SessionEvalState> {
  const round = await findApplicableSessionEvalRound(sessionId);
  if (!round) return { active: false };

  const form = await db.evalForm.findUnique({
    where: { id: round.form.id },
    include: { questions: { orderBy: { order: "asc" } } },
  });
  if (!form) return { active: false };

  const questions: QuestionDef[] = form.questions.map((q) => ({
    id: q.id,
    type: q.type,
    label: q.label,
    options: q.type === "RADIO" || q.type === "CHECKBOX" ? parseOptions(q.options) : null,
    required: q.required,
  }));

  // Đáp án đã lưu trước đó (round×buổi) theo HS — để mở lại sửa.
  const prior = await db.evalResponse.findMany({
    where: { roundId: round.id, classSessionId: sessionId, studentId: { not: null } },
    select: {
      studentId: true,
      answers: { select: { questionId: true, valueNumber: true, valueOptions: true, valueText: true } },
    },
  });
  const answersByStudent: Record<string, SubmittedAnswer[]> = {};
  for (const r of prior) {
    if (!r.studentId) continue;
    answersByStudent[r.studentId] = r.answers.map((a) => ({
      questionId: a.questionId,
      valueNumber: a.valueNumber,
      valueOptions: parseOptions(a.valueOptions),
      valueText: a.valueText,
    }));
  }

  return {
    active: true,
    roundId: round.id,
    roundName: round.name,
    formId: form.id,
    formTitle: form.title,
    questions,
    answersByStudent,
  };
}

export type StudentEvalSubmission = {
  studentId: string;
  answers: SubmittedAnswer[];
};

export type SaveSessionEvalResult =
  | { ok: true; saved: number }
  | { ok: false; error: string; studentId?: string; questionId?: string };

/**
 * Lưu phiếu SESSION_EVAL cho nhiều HS của 1 buổi. Validate từng HS qua validateAnswers
 * (dùng chung engine), rồi find-or-replace EvalResponse(round×buổi×HS) trong 1 transaction
 * → idempotent, không sinh response trùng. KHÔNG gate — caller phải gate trước.
 */
export async function saveSessionEvalResponses(
  roundId: string,
  classSessionId: string,
  questions: QuestionDef[],
  submissions: StudentEvalSubmission[],
): Promise<SaveSessionEvalResult> {
  // Validate trước (ngoài transaction) để không mở tx khi dữ liệu sai.
  const normalizedByStudent = new Map<string, ReturnType<typeof validateAnswers>>();
  for (const sub of submissions) {
    const v = validateAnswers(questions, sub.answers);
    if (!v.ok) return { ok: false, error: v.error, studentId: sub.studentId, questionId: v.questionId };
    normalizedByStudent.set(sub.studentId, v);
  }

  let saved = 0;
  await db.$transaction(async (tx) => {
    for (const sub of submissions) {
      const v = normalizedByStudent.get(sub.studentId);
      if (!v || !v.ok) continue;
      const answerData = v.normalized.map((a) => ({
        questionId: a.questionId,
        valueNumber: a.valueNumber,
        valueOptions: a.valueOptions ?? undefined,
        valueText: a.valueText,
      }));

      // find-or-replace theo (round×buổi×HS) — app-level idempotency (không có unique DB).
      const existing = await tx.evalResponse.findFirst({
        where: { roundId, classSessionId, studentId: sub.studentId },
        select: { id: true },
      });
      if (existing) {
        await tx.evalAnswer.deleteMany({ where: { responseId: existing.id } });
        await tx.evalResponse.update({
          where: { id: existing.id },
          data: { submittedAt: new Date(), answers: { create: answerData } },
        });
      } else {
        await tx.evalResponse.create({
          data: { roundId, classSessionId, studentId: sub.studentId, answers: { create: answerData } },
        });
      }
      saved += 1;
    }
  });

  return { ok: true, saved };
}
