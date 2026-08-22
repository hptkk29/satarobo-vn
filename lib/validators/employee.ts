import { z } from "zod";

export const DepartmentEnum = z.enum([
  "BAN_GIAM_DOC",
  "DAO_TAO",
  "MARKETING",
  "KINH_DOANH",
  "IT",
  "HANH_CHANH_NHAN_SU",
  "KE_TOAN",
  // Phase 4.7 extension
  "TUYEN_SINH",
  "GIAO_VU",
  "GIANG_DAY",
]);

export const GenderEnum = z.enum(["MALE", "FEMALE", "OTHER"]);

export const ContractTypeEnum = z.enum([
  "FULLTIME",
  "PARTTIME",
  "INTERN",
  "FREELANCE",
  // Phase 4.7 extension — Vietnam labor law
  "THU_VIEC",
  "CHINH_THUC_XAC_DINH",
  "CHINH_THUC_KHONG_XAC_DINH",
]);

export const EmploymentStatusEnum = z.enum([
  "ACTIVE",
  "ON_LEAVE",
  "RESIGNED",
  "TERMINATED",
]);

// Helper: convert empty string → null, preserve type
const nullableStr = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === "" || v === undefined || v === null ? null : v));

const nullableEmail = z
  .union([z.string().email(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined || v === null ? null : v));

const nullableUrl = z
  .union([z.string().url(), z.literal(""), z.null()])
  .optional()
  .transform((v) => (v === "" || v === undefined || v === null ? null : v));

const nullableDate = z
  .union([z.null(), z.literal(""), z.coerce.date()])
  .optional()
  .transform((v) => (v === "" || v === undefined || v === null ? null : (v as Date)));

const nullableInt = (min: number, max: number) =>
  z
    .union([z.null(), z.literal(""), z.coerce.number().int().min(min).max(max)])
    .optional()
    .transform((v) => (v === "" || v === undefined || v === null ? null : (v as number)));

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
  orgUnitId: nullableStr, // PR-C: đơn vị (OrgUnit) — nguồn chính; centerId suy ra (HO→null)
  managerId: nullableStr,

  // Phase 4.7 extension — additional Tier 2 fields
  endDate: nullableDate,
  // VND là số nguyên (H5/COL2) → làm tròn về Int.
  bhxhBase: z
    .union([z.null(), z.literal(""), z.coerce.number().nonnegative()])
    .optional()
    .transform((v) =>
      v === "" || v === undefined || v === null ? null : Math.round(v as number),
    ),
  address: nullableStr,
  emergencyContact: nullableStr,
  notes: nullableStr,

  // Phase C1 — extended HR fields
  nationalId: nullableStr,
  status: EmploymentStatusEnum.default("ACTIVE"),
  subjects: z.array(z.string().trim().min(1)).default([]),
  certifications: z.array(z.string().trim().min(1)).default([]),

  isCEO: z.coerce.boolean().default(false),
});

export type EmployeeCreateInput = z.infer<typeof employeeCreateSchema>;

export const employeeUpdateSchema = employeeCreateSchema.partial();
