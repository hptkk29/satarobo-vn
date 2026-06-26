// lib/eval/session-eval.ts — FL4-01 / FL4(R4): phiếu đánh giá BUỔI HỌC (SESSION_EVAL).
//
// GV điền phiếu động theo TỪNG HỌC SINH cho 1 buổi → lưu vào EvalResponse
// (roundId + classSessionId|trialClassSessionId + studentId) + EvalAnswer. Dùng chung
// cơ chế cho lớp chính (ClassSession) + lớp trải nghiệm (TrialClassSession — FL4 R4).
//
// PURE (test được, không cần DB): isSessionEvalRoundApplicable, dedupeKeyForResponse.
// DB-backed: find*Round, get*State, save*Responses (class + trial).
//
// CHỐNG TRÙNG (app-level idempotency theo (roundId, sessionRef, studentId)): EvalResponse
// KHÔNG có unique DB cho bộ ba này (3 cột unique cũ đều NULL cho SESSION_EVAL). Vì vậy save
// chạy find-or-replace trong $transaction: đã có response thì THAY answers, chưa có thì tạo mới.
import type { EvaluationRoundStatus, EvalScope, Prisma } from "@prisma/client";
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
 * Áp khi: scope SESSION_EVAL + đang MỞ + cơ sở/khóa của đợt khớp lớp (đợt để trống
 * cơ sở/khóa = áp toàn hệ thống → cả lớp chính lẫn lớp trải nghiệm). Lớp trải nghiệm
 * không có khóa (courseId=null) → chỉ khớp đợt không ràng buộc khóa.
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
export function dedupeKeyForResponse(roundId: string, sessionRefId: string, studentId: string): string {
  return `${roundId}|${sessionRefId}|${studentId}`;
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

type RoundWithForm = Prisma.EvaluationRoundGetPayload<{
  include: { form: { select: { id: true; title: true } } };
}>;

/** Chọn đợt MỞ khớp scope lớp (ưu tiên đợt cụ thể hơn rồi mới nhất). */
async function pickApplicableRound(cls: SessionClassScope): Promise<RoundWithForm | null> {
  const rounds = await db.evaluationRound.findMany({
    where: { scope: "SESSION_EVAL", status: "OPEN" },
    orderBy: { createdAt: "desc" },
    include: { form: { select: { id: true, title: true } } },
  });
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
  const specificity = (r: RoundWithForm) => (r.centerId ? 1 : 0) + (r.courseId ? 1 : 0);
  matches.sort((a, b) => specificity(b) - specificity(a));
  return matches[0]!;
}

/** Tìm đợt SESSION_EVAL đang áp cho buổi LỚP CHÍNH (ClassSession). */
export async function findApplicableSessionEvalRound(sessionId: string): Promise<RoundWithForm | null> {
  const sess = await db.classSession.findUnique({
    where: { id: sessionId },
    select: { id: true, class: { select: { centerId: true, courseId: true } } },
  });
  if (!sess) return null;
  return pickApplicableRound({ centerId: sess.class.centerId, courseId: sess.class.courseId });
}

/** FL4 (R4) — đợt SESSION_EVAL đang áp cho buổi LỚP TRẢI NGHIỆM (TrialClassSession). */
export async function findApplicableTrialSessionEvalRound(
  trialSessionId: string,
): Promise<RoundWithForm | null> {
  const sess = await db.trialClassSession.findUnique({
    where: { id: trialSessionId },
    select: { id: true, trialClass: { select: { centerId: true } } },
  });
  if (!sess) return null;
  // Lớp trải nghiệm không gắn khóa (courseId=null) → khớp đợt theo cơ sở/toàn hệ thống.
  return pickApplicableRound({ centerId: sess.trialClass.centerId, courseId: null });
}

/** Dựng state từ 1 đợt + điều kiện tìm đáp án đã lưu (round×buổi×HS). */
async function buildState(
  round: RoundWithForm,
  priorWhere: Prisma.EvalResponseWhereInput,
): Promise<SessionEvalState> {
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
    groupLabel: q.groupLabel,
    allowCustomText: q.allowCustomText,
  }));

  const prior = await db.evalResponse.findMany({
    where: priorWhere,
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

/**
 * Trạng thái phiếu SESSION_EVAL cho 1 buổi LỚP CHÍNH. KHÔNG gate — caller phải gate trước.
 */
export async function getSessionEvalState(sessionId: string): Promise<SessionEvalState> {
  const round = await findApplicableSessionEvalRound(sessionId);
  if (!round) return { active: false };
  return buildState(round, { roundId: round.id, classSessionId: sessionId, studentId: { not: null } });
}

/** FL4 (R4) — trạng thái phiếu SESSION_EVAL cho 1 buổi LỚP TRẢI NGHIỆM. KHÔNG gate. */
export async function getTrialSessionEvalState(trialSessionId: string): Promise<SessionEvalState> {
  const round = await findApplicableTrialSessionEvalRound(trialSessionId);
  if (!round) return { active: false };
  return buildState(round, {
    roundId: round.id,
    trialClassSessionId: trialSessionId,
    studentId: { not: null },
  });
}

export type StudentEvalSubmission = {
  studentId: string;
  answers: SubmittedAnswer[];
};

export type SaveSessionEvalResult =
  | { ok: true; saved: number }
  | { ok: false; error: string; studentId?: string; questionId?: string };

/** Tham chiếu buổi: ĐÚNG 1 trong 2 (lớp chính | lớp trải nghiệm). */
type SessionRefData = { classSessionId: string } | { trialClassSessionId: string };

/**
 * Lưu phiếu SESSION_EVAL cho nhiều HS của 1 buổi (lớp chính HOẶC lớp trải nghiệm).
 * find-or-replace EvalResponse(round×buổi×HS) trong 1 transaction → idempotent.
 */
async function saveResponsesCore(
  roundId: string,
  ref: SessionRefData,
  questions: QuestionDef[],
  submissions: StudentEvalSubmission[],
): Promise<SaveSessionEvalResult> {
  const normalizedByStudent = new Map<string, ReturnType<typeof validateAnswers>>();
  for (const sub of submissions) {
    const v = validateAnswers(questions, sub.answers);
    if (!v.ok) return { ok: false, error: v.error, studentId: sub.studentId, questionId: v.questionId };
    normalizedByStudent.set(sub.studentId, v);
  }

  const classSessionId = "classSessionId" in ref ? ref.classSessionId : undefined;
  const trialClassSessionId = "trialClassSessionId" in ref ? ref.trialClassSessionId : undefined;

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

      const existing = await tx.evalResponse.findFirst({
        where: { roundId, classSessionId, trialClassSessionId, studentId: sub.studentId },
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
          data: { roundId, classSessionId, trialClassSessionId, studentId: sub.studentId, answers: { create: answerData } },
        });
      }
      saved += 1;
    }
  });

  return { ok: true, saved };
}

/** Lưu phiếu SESSION_EVAL cho buổi LỚP CHÍNH. KHÔNG gate — caller phải gate trước. */
export async function saveSessionEvalResponses(
  roundId: string,
  classSessionId: string,
  questions: QuestionDef[],
  submissions: StudentEvalSubmission[],
): Promise<SaveSessionEvalResult> {
  return saveResponsesCore(roundId, { classSessionId }, questions, submissions);
}

/** FL4 (R4) — lưu phiếu SESSION_EVAL cho buổi LỚP TRẢI NGHIỆM. KHÔNG gate. */
export async function saveTrialSessionEvalResponses(
  roundId: string,
  trialClassSessionId: string,
  questions: QuestionDef[],
  submissions: StudentEvalSubmission[],
): Promise<SaveSessionEvalResult> {
  return saveResponsesCore(roundId, { trialClassSessionId }, questions, submissions);
}
