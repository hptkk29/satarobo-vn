import { z } from "zod";

const nullableStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const s = v.trim();
    return s.length > 0 ? s : null;
  });

const stringArrayClean = z
  .array(z.string())
  .default([])
  .transform((arr) => arr.map((s) => s.trim()).filter((s) => s.length > 0));

export const curriculumSchema = z.object({
  courseId: z.string().trim().min(1, "Chọn khoá học"),
  name: z.string().trim().min(1, "Tên giáo trình bắt buộc").max(200),
  version: z.coerce.number().int().min(1, "Version >= 1").default(1),
  description: nullableStr,
  isActive: z.coerce.boolean().default(true),
});

export type CurriculumInput = z.infer<typeof curriculumSchema>;

export const lessonSchema = z.object({
  curriculumId: z.string().trim().min(1),
  title: z.string().trim().min(1, "Tiêu đề bài học bắt buộc").max(200),
  order: z.coerce.number().int().min(1, "Số bài >= 1"),
  description: nullableStr,
  content: nullableStr,
  duration: z.coerce.number().int().min(15, "Thời lượng tối thiểu 15 phút").default(90),
  objectives: stringArrayClean,
  materials: stringArrayClean,
  notes: nullableStr,
});

export type LessonInput = z.infer<typeof lessonSchema>;
