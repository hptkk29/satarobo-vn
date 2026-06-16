import { z } from "zod";

export const ClassStatusEnum = z.enum([
  "PLANNED",
  "RECRUITING",
  "PENDING_APPROVAL", // set TỰ ĐỘNG khi sale "Gửi duyệt" — không chọn tay ở form
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
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
  .union([z.coerce.date(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const timeField = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined) return null;
    const s = v.trim();
    if (!s) return null;
    if (!/^\d{2}:\d{2}$/.test(s)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Định dạng giờ HH:mm",
      });
      return z.NEVER;
    }
    return s;
  });

export const classCreateSchema = z
  .object({
    name: z.string().trim().min(1, "Tên lớp bắt buộc").max(200),
    classCode: nullableStr,
    description: nullableStr,

    courseId: z.string().trim().min(1, "Chọn khoá học"),
    // PR-C: orgUnitId là nguồn chính (đơn vị); centerId suy ra từ org (HO→null) để dual-write.
    centerId: nullableStr,
    orgUnitId: nullableStr,
    classGroupId: nullableStr,
    roomId: nullableStr,
    teacherId: nullableStr,
    assistantId: nullableStr,

    startDate: nullableDate,
    endDate: nullableDate,
    scheduleDays: z
      .array(z.coerce.number().int().min(0).max(6))
      .default([])
      .transform((arr) => Array.from(new Set(arr)).sort((a, b) => a - b)),
    startTime: timeField,
    endTime: timeField,

    maxStudents: z.coerce.number().int().min(1, "Tối thiểu 1").default(20),
    minStudents: z.coerce.number().int().min(1, "Tối thiểu 1").default(5),

    status: ClassStatusEnum.default("PLANNED"),
    notes: nullableStr,
    // Legacy free-text schedule kept for back-compat; not edited by form.
    schedule: nullableStr,
  })
  .refine(
    (d) => !d.assistantId || !d.teacherId || d.assistantId !== d.teacherId,
    { message: "GV phụ không được trùng GV chính", path: ["assistantId"] },
  )
  .refine(
    (d) => !d.endDate || !d.startDate || d.endDate >= d.startDate,
    { message: "Ngày kết thúc phải >= ngày khai giảng", path: ["endDate"] },
  )
  .refine((d) => d.minStudents <= d.maxStudents, {
    message: "Số HS tối thiểu phải <= tối đa",
    path: ["minStudents"],
  });

export type ClassCreateInput = z.infer<typeof classCreateSchema>;
