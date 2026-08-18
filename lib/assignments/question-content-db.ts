// lib/assignments/question-content-db.ts — ánh xạ ContentQuestion ↔ bảng Question (server-only).
//
// Parity site GV 18/08. Chiều LƯU: zod → validate → clean → serialize thành dữ liệu
// tạo Question (+Choice). Chiều ĐỌC: hàng Question (kể cả hàng cũ soạn trước parity
// bằng admin question-bank / kho GV 2-loại) → ContentQuestion cho editor + preview.
//
// Quy ước cột (2-phase, KHÔNG đổi nghĩa cột cũ):
//   MULTIPLE_CHOICE → choices; meta.ui phân biệt "single" (radio) / "multiple" (checkbox).
//   TRUE_FALSE      → 2 choices "Đúng"/"Sai", đúng 1 isCorrect (quy ước admin sẵn có).
//   SHORT_ANSWER    → correctAnswer = đáp án gợi ý (có thể trống).
//   ESSAY / CODE    → correctAnswer = đáp án mẫu (CODE cũ đọc như essay).
//   FILL_BLANK      → meta.answers (nguồn sự thật); correctAnswer = join " | " để màn cũ đọc được.
//   MATCHING        → meta.pairs. ORDERING → meta.items. (correctAnswer để null.)
import { z } from "zod";
import type { Prisma, QuestionType } from "@prisma/client";
import {
  cleanQuestion,
  countBlanks,
  validateQuestion,
  type ContentQuestion,
} from "@/lib/assignments/question-content";

/* ------------------------------- Zod (server) ------------------------------ */

const idSchema = z.string().min(1).max(64);
const questionText = z
  .string()
  .trim()
  .min(1, "Chưa nhập nội dung câu hỏi")
  .max(2000, "Nội dung câu hỏi tối đa 2000 ký tự");
// Ô đáp án cho phép chuỗi rỗng (cleanQuestion sẽ bỏ) — chỉ chặn quá dài.
const optionText = z.string().max(500, "Đáp án tối đa 500 ký tự");
const pairText = z.string().max(300, "Nội dung mỗi vế tối đa 300 ký tự");

export const contentQuestionSchema = z.discriminatedUnion("type", [
  z.object({
    id: idSchema,
    type: z.literal("single"),
    question: questionText,
    options: z.array(optionText).min(2).max(10),
    correctIndex: z.number().int().min(0).max(9),
  }),
  z.object({
    id: idSchema,
    type: z.literal("multiple"),
    question: questionText,
    options: z.array(optionText).min(2).max(10),
    correctIndices: z.array(z.number().int().min(0).max(9)).min(1).max(10),
  }),
  z.object({
    id: idSchema,
    type: z.literal("boolean"),
    question: questionText,
    correct: z.boolean(),
  }),
  z.object({
    id: idSchema,
    type: z.literal("fill"),
    question: questionText,
    answers: z.array(z.string().max(200)).min(1).max(10),
  }),
  z.object({
    id: idSchema,
    type: z.literal("short"),
    question: questionText,
    sampleAnswer: z.string().trim().max(2000).optional(),
  }),
  z.object({
    id: idSchema,
    type: z.literal("essay"),
    question: questionText,
    sampleAnswer: z.string().trim().max(2000).optional(),
  }),
  z.object({
    id: idSchema,
    type: z.literal("matching"),
    question: questionText,
    pairs: z.array(z.object({ left: pairText, right: pairText })).min(2).max(10),
  }),
  z.object({
    id: idSchema,
    type: z.literal("ordering"),
    question: questionText,
    items: z.array(pairText).min(2).max(10),
  }),
]);

export const contentQuestionsSchema = z
  .array(contentQuestionSchema)
  .min(1, "Hãy thêm ít nhất một câu hỏi")
  .max(50, "Một đầu bài tối đa 50 câu hỏi");

/* ------------------------------ Serialize (lưu) ---------------------------- */

/** Dữ liệu tạo 1 hàng Question (+ choices) từ 1 ContentQuestion. */
export interface SerializedQuestion {
  type: QuestionType;
  text: string;
  correctAnswer: string | null;
  meta: Prisma.InputJsonValue | undefined;
  choices: { order: number; text: string; isCorrect: boolean }[];
}

export function serializeContentQuestion(q: ContentQuestion): SerializedQuestion {
  switch (q.type) {
    case "single":
      return {
        type: "MULTIPLE_CHOICE",
        text: q.question,
        correctAnswer: null,
        meta: { ui: "single" },
        choices: q.options.map((text, i) => ({
          order: i + 1,
          text,
          isCorrect: i === q.correctIndex,
        })),
      };
    case "multiple":
      return {
        type: "MULTIPLE_CHOICE",
        text: q.question,
        correctAnswer: null,
        meta: { ui: "multiple" },
        choices: q.options.map((text, i) => ({
          order: i + 1,
          text,
          isCorrect: q.correctIndices.includes(i),
        })),
      };
    case "boolean":
      return {
        type: "TRUE_FALSE",
        text: q.question,
        correctAnswer: null,
        meta: undefined,
        choices: [
          { order: 1, text: "Đúng", isCorrect: q.correct },
          { order: 2, text: "Sai", isCorrect: !q.correct },
        ],
      };
    case "fill":
      return {
        type: "FILL_BLANK",
        text: q.question,
        correctAnswer: q.answers.join(" | "),
        meta: { answers: q.answers },
        choices: [],
      };
    case "short":
      return {
        type: "SHORT_ANSWER",
        text: q.question,
        correctAnswer: q.sampleAnswer?.trim() || null,
        meta: undefined,
        choices: [],
      };
    case "essay":
      return {
        type: "ESSAY",
        text: q.question,
        correctAnswer: q.sampleAnswer?.trim() || null,
        meta: undefined,
        choices: [],
      };
    case "matching":
      return {
        type: "MATCHING",
        text: q.question,
        correctAnswer: null,
        meta: { pairs: q.pairs.map((p) => ({ left: p.left, right: p.right })) },
        choices: [],
      };
    case "ordering":
      return {
        type: "ORDERING",
        text: q.question,
        correctAnswer: null,
        meta: { items: [...q.items] },
        choices: [],
      };
  }
}

/**
 * Đường LƯU chuẩn cho cả kho GV lẫn thư viện admin: parse (zod) → validate
 * (thông điệp VI đúng nguồn) → clean (bỏ ô trống, chuẩn hoá chỉ số) → validate
 * lại bản đã clean → serialize. Trả lỗi đầu tiên gặp được.
 */
export function prepareQuestionsForSave(
  input: unknown,
):
  | { ok: true; questions: SerializedQuestion[] }
  | { ok: false; error: string } {
  const parsed = contentQuestionsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Câu hỏi không hợp lệ" };
  }
  const cleaned: ContentQuestion[] = [];
  for (let i = 0; i < parsed.data.length; i++) {
    const raw = parsed.data[i];
    const err = validateQuestion(raw, i + 1);
    if (err) return { ok: false, error: err };
    const c = cleanQuestion(raw);
    const err2 = validateQuestion(c, i + 1);
    if (err2) return { ok: false, error: err2 };
    cleaned.push(c);
  }
  return { ok: true, questions: cleaned.map(serializeContentQuestion) };
}

/* ------------------------------ Deserialize (đọc) -------------------------- */

/** Hàng Question tối thiểu để dựng lại ContentQuestion (select ở caller). */
export interface QuestionRowForContent {
  id: string;
  type: QuestionType;
  text: string;
  correctAnswer: string | null;
  meta: unknown;
  choices: { order: number; text: string; isCorrect: boolean }[];
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");

const isPairArray = (v: unknown): v is { left: string; right: string }[] =>
  Array.isArray(v) &&
  v.every(
    (x) =>
      typeof x === "object" &&
      x !== null &&
      typeof (x as { left?: unknown }).left === "string" &&
      typeof (x as { right?: unknown }).right === "string",
  );

const metaOf = (row: QuestionRowForContent): Record<string, unknown> =>
  typeof row.meta === "object" && row.meta !== null && !Array.isArray(row.meta)
    ? (row.meta as Record<string, unknown>)
    : {};

const TRUE_LABELS = new Set(["đúng", "dung", "true", "co", "có"]);
const FALSE_LABELS = new Set(["sai", "false", "không", "khong"]);

/**
 * Dựng lại ContentQuestion từ hàng Question. Hàng cũ soạn trước parity vẫn đọc
 * được: MULTIPLE_CHOICE không meta → suy radio/checkbox từ số đáp án đúng;
 * TRUE_FALSE nhãn lạ → đọc như trắc nghiệm 1 đáp án; CODE → đọc như tự luận.
 */
export function deserializeQuestionRow(row: QuestionRowForContent): ContentQuestion {
  const meta = metaOf(row);
  const sorted = [...row.choices].sort((a, b) => a.order - b.order);

  switch (row.type) {
    case "MULTIPLE_CHOICE": {
      const options = sorted.map((c) => c.text);
      const correctIdx = sorted
        .map((c, i) => (c.isCorrect ? i : -1))
        .filter((i) => i >= 0);
      const ui =
        meta.ui === "single" || meta.ui === "multiple"
          ? meta.ui
          : correctIdx.length === 1
            ? "single"
            : "multiple";
      if (ui === "single") {
        return {
          id: row.id,
          type: "single",
          question: row.text,
          options,
          correctIndex: Math.max(0, correctIdx[0] ?? 0),
        };
      }
      return {
        id: row.id,
        type: "multiple",
        question: row.text,
        options,
        correctIndices: correctIdx,
      };
    }
    case "TRUE_FALSE": {
      const norm = (s: string) => s.trim().toLowerCase();
      const looksBoolean =
        sorted.length === 2 &&
        sorted.some((c) => TRUE_LABELS.has(norm(c.text))) &&
        sorted.some((c) => FALSE_LABELS.has(norm(c.text)));
      if (looksBoolean) {
        const correctChoice = sorted.find((c) => c.isCorrect);
        return {
          id: row.id,
          type: "boolean",
          question: row.text,
          correct: correctChoice ? TRUE_LABELS.has(norm(correctChoice.text)) : true,
        };
      }
      // Nhãn tuỳ biến ("Có"/"Chưa chắc"...) — đọc như trắc nghiệm 1 đáp án.
      return {
        id: row.id,
        type: "single",
        question: row.text,
        options: sorted.map((c) => c.text),
        correctIndex: Math.max(
          0,
          sorted.findIndex((c) => c.isCorrect),
        ),
      };
    }
    case "SHORT_ANSWER":
      return {
        id: row.id,
        type: "short",
        question: row.text,
        sampleAnswer: row.correctAnswer ?? undefined,
      };
    case "ESSAY":
    case "CODE":
      return {
        id: row.id,
        type: "essay",
        question: row.text,
        sampleAnswer: row.correctAnswer ?? undefined,
      };
    case "FILL_BLANK": {
      const answers = isStringArray(meta.answers)
        ? meta.answers
        : (row.correctAnswer ?? "").split(" | ").filter(Boolean);
      const count = countBlanks(row.text);
      return {
        id: row.id,
        type: "fill",
        question: row.text,
        answers: Array.from({ length: count }, (_, i) => answers[i] ?? ""),
      };
    }
    case "MATCHING": {
      if (isPairArray(meta.pairs) && meta.pairs.length >= 2) {
        return {
          id: row.id,
          type: "matching",
          question: row.text,
          pairs: meta.pairs.map((p) => ({ left: p.left, right: p.right })),
        };
      }
      // meta hỏng/thiếu — không dựng lại được cặp, đọc như tự luận để không vỡ UI.
      return { id: row.id, type: "essay", question: row.text };
    }
    case "ORDERING": {
      if (isStringArray(meta.items) && meta.items.length >= 2) {
        return {
          id: row.id,
          type: "ordering",
          question: row.text,
          items: [...meta.items],
        };
      }
      return { id: row.id, type: "essay", question: row.text };
    }
  }
}
