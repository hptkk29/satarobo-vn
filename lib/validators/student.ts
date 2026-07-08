import { z } from "zod";

export const StudentStatusEnum = z.enum([
  "ACTIVE",
  "PAUSED",
  "GRADUATED",
  "INACTIVE",
]);

export const BloodTypeEnum = z.enum([
  "A_POS",
  "A_NEG",
  "B_POS",
  "B_NEG",
  "O_POS",
  "O_NEG",
  "AB_POS",
  "AB_NEG",
  "UNKNOWN",
]);

export const GenderEnum = z.enum(["MALE", "FEMALE", "OTHER"]);

// Helper transforms — turn empty strings into null so optional Prisma columns
// don't receive '' values.
const nullableStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const s = v.trim();
    return s.length > 0 ? s : null;
  });

const nullableEmail = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (!v) return null;
    const s = v.trim();
    if (s === "") return null;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Email không hợp lệ" });
      return z.NEVER;
    }
    return s;
  });

const nullableDate = z
  .union([z.coerce.date(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const nullableGrade = z
  .union([z.coerce.number().int().min(1).max(12), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined || v === null ? null : v));

export const studentCreateSchema = z.object({
  name: z.string().trim().min(1, "Họ tên học viên bắt buộc").max(120),
  studentCode: nullableStr,
  dateOfBirth: nullableDate,
  gender: z
    .union([GenderEnum, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : v)),
  phone: nullableStr,
  email: nullableEmail,
  avatarUrl: nullableStr,

  currentGrade: nullableGrade,
  school: nullableStr,

  // Parent — required at write time even though DB column is nullable
  // (legacy rows from before D1 may have NULL parentName / parentPhone).
  parentName: z.string().trim().min(1, "Họ tên phụ huynh bắt buộc"),
  parentPhone: z.string().trim().min(1, "SĐT phụ huynh bắt buộc"),
  parentEmail: nullableEmail,
  parentRelation: nullableStr,
  // #15 (câu 32) — CCCD phụ huynh (CHỈ phụ huynh, KHÔNG lưu CCCD học viên). PII nhạy
  // cảm: hiển thị mask + break-glass ở màn thanh toán. Nhập tại form học viên.
  parentNationalId: nullableStr,
  parent2Name: nullableStr,
  parent2Phone: nullableStr,
  parent2Relation: nullableStr,

  address: nullableStr,
  ward: nullableStr,
  district: nullableStr,
  city: nullableStr,

  bloodType: z
    .union([BloodTypeEnum, z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : v)),
  allergies: z.array(z.string().trim().min(1)).default([]),
  healthNotes: nullableStr,

  enrollmentDate: nullableDate,
  preferredCenterId: nullableStr,
  // PR-C: OrgUnit là nguồn chính cho picker; centerId/preferredCenterId suy ra (dual-write).
  preferredOrgUnitId: nullableStr,
  notes: nullableStr,
  status: StudentStatusEnum.default("ACTIVE"),

  // Existing legacy fields — keep for compat (kept in schema, can still be edited)
  centerId: nullableStr,
  orgUnitId: nullableStr,
});

export type StudentCreateInput = z.infer<typeof studentCreateSchema>;

export const studentUpdateSchema = studentCreateSchema.partial();
export type StudentUpdateInput = z.infer<typeof studentUpdateSchema>;
