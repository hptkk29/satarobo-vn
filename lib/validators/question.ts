import { z } from "zod";

export const QuestionTypeEnum = z.enum([
  "MULTIPLE_CHOICE",
  "TRUE_FALSE",
  "SHORT_ANSWER",
  "ESSAY",
  "CODE",
]);

export const QuestionDifficultyEnum = z.enum([
  "EASY",
  "MEDIUM",
  "HARD",
  "EXPERT",
]);

const nullableStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const s = v.trim();
    return s.length > 0 ? s : null;
  });

const tagsClean = z
  .array(z.string())
  .default([])
  .transform((arr) =>
    Array.from(
      new Set(
        arr
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      ),
    ),
  );

export const choiceSchema = z.object({
  order: z.coerce.number().int().min(1).max(6),
  text: z.string().trim().min(1, "Nội dung lựa chọn không được trống"),
  isCorrect: z.coerce.boolean().default(false),
});

export const questionSchema = z
  .object({
    questionCode: nullableStr,
    type: QuestionTypeEnum,
    text: z.string().trim().min(1, "Đề bài bắt buộc"),
    explanation: nullableStr,
    difficulty: QuestionDifficultyEnum.default("MEDIUM"),
    tags: tagsClean,
    lessonId: nullableStr,
    correctAnswer: nullableStr,
    choices: z.array(choiceSchema).default([]),
    isPublic: z.coerce.boolean().default(true),
    notes: nullableStr,
  })
  .superRefine((d, ctx) => {
    if (d.type === "MULTIPLE_CHOICE") {
      if (d.choices.length < 2 || d.choices.length > 6) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "Trắc nghiệm cần 2 đến 6 lựa chọn",
        });
      }
      if (!d.choices.some((c) => c.isCorrect)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "Cần ít nhất 1 đáp án đúng",
        });
      }
    } else if (d.type === "TRUE_FALSE") {
      if (d.choices.length !== 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "Đúng/Sai cần đúng 2 lựa chọn",
        });
      }
      const correctCount = d.choices.filter((c) => c.isCorrect).length;
      if (correctCount !== 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["choices"],
          message: "Đúng/Sai cần đúng 1 đáp án đúng",
        });
      }
    } else if (d.type === "SHORT_ANSWER") {
      if (!d.correctAnswer || !d.correctAnswer.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["correctAnswer"],
          message: "Trả lời ngắn cần đáp án mong đợi",
        });
      }
    }
    // ESSAY + CODE: correctAnswer optional
  });

export type QuestionInput = z.infer<typeof questionSchema>;
export type ChoiceInput = z.infer<typeof choiceSchema>;
