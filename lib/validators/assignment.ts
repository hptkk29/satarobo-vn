import { z } from "zod";

export const AssignmentStatusEnum = z.enum([
  "DRAFT",
  "PUBLISHED",
  "CLOSED",
  "ARCHIVED",
]);

export const SubmissionStatusEnum = z.enum([
  "NOT_SUBMITTED",
  "SUBMITTED",
  "LATE",
  "GRADED",
]);

const nullableStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const s = v.trim();
    return s.length > 0 ? s : null;
  });

const nullableDate = z
  .union([z.null(), z.literal(""), z.coerce.date()])
  .optional()
  .transform((v) => (v === "" || v === undefined || v === null ? null : v));

export const assignmentSchema = z
  .object({
    title: z.string().trim().min(1, "Tiêu đề bắt buộc").max(200),
    description: z.string().trim().min(1, "Mô tả bắt buộc"),
    instructions: nullableStr,
    // P-new — loại bài: trên lớp / về nhà.
    kind: z.enum(["CLASSWORK", "HOMEWORK"]).default("CLASSWORK"),
    classId: z.string().trim().min(1, "Chọn lớp"),
    lessonId: nullableStr,
    totalPoints: z.coerce.number().min(0.1, "Tổng điểm > 0").default(10),
    dueAt: nullableDate,
    allowText: z.coerce.boolean().default(true),
    allowFile: z.coerce.boolean().default(true),
    status: AssignmentStatusEnum.default("DRAFT"),
  })
  .refine((d) => d.allowText || d.allowFile, {
    message: "Cần cho phép ít nhất 1 trong text/file",
    path: ["allowText"],
  });

export type AssignmentInput = z.infer<typeof assignmentSchema>;
