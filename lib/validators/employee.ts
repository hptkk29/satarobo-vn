import { z } from "zod";

export const DepartmentEnum = z.enum([
  "BAN_GIAM_DOC",
  "DAO_TAO",
  "MARKETING",
  "KINH_DOANH",
  "IT",
  "HANH_CHANH_NHAN_SU",
  "KE_TOAN",
]);

export const GenderEnum = z.enum(["MALE", "FEMALE", "OTHER"]);

export const ContractTypeEnum = z.enum([
  "FULLTIME",
  "PARTTIME",
  "INTERN",
  "FREELANCE",
]);

// Helper: convert empty string → null, preserve type
const nullableStr = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const nullableEmail = z
  .union([z.string().email(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const nullableUrl = z
  .union([z.string().url(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : v));

const nullableDate = z
  .union([z.coerce.date(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? null : (v as Date)));

const nullableInt = (min: number, max: number) =>
  z
    .union([z.coerce.number().int().min(min).max(max), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : (v as number)));

export const employeeCreateSchema = z.object({
  employeeCode: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[A-Za-z0-9.-]+$/, "Mã NV chỉ chứa chữ, số, dấu chấm/gạch"),
  fullName: z.string().min(2).max(120),
  jobTitle: z.string().min(2).max(200),
  department: DepartmentEnum,
  avatarUrl: nullableUrl,
  email: nullableEmail,
  joinedAt: nullableDate,
  bio: nullableStr,
  isActive: z.coerce.boolean().default(true),
  isPublic: z.coerce.boolean().default(false),
  displayOrder: z.coerce.number().int().default(0),

  // Tier 2
  phone: nullableStr,
  dateOfBirth: nullableDate,
  gender: GenderEnum.nullable().optional(),
  contractType: ContractTypeEnum.nullable().optional(),
  salaryRank: nullableInt(1, 9),
  salaryLevel: nullableInt(1, 5),

  centerId: nullableStr,
  managerId: nullableStr,

  isCEO: z.coerce.boolean().default(false),
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeeUpdateSchema = employeeCreateSchema.partial();
