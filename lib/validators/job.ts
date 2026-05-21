import { z } from 'zod'

export const JobStatusEnum = z.enum(['DRAFT', 'OPEN', 'CLOSED', 'ON_HOLD'])
export const ExperienceLevelEnum = z.enum(['ENTRY', 'JUNIOR', 'MID', 'SENIOR', 'EXPERT'])

const stringArray = z.array(z.string().trim().min(1)).default([])

const optionalEmail = z
  .union([z.literal(''), z.string().email('Email không hợp lệ')])
  .nullable()
  .optional()
  .transform((v) => (v === '' || v == null ? null : v))

const optionalString = z
  .union([z.literal(''), z.string()])
  .nullable()
  .optional()
  .transform((v) => (v === '' || v == null ? null : v))

export const jobCreateSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(100)
    .regex(/^[a-z0-9-]+$/, 'Slug chỉ chứa chữ thường, số và dấu gạch'),
  title: z.string().min(5).max(200),
  department: z.string().min(1, 'Chọn phòng ban'),
  location: z.string().min(1, 'Chọn địa điểm'),
  type: z.string().min(1, 'Chọn hình thức'),
  description: z.string().min(50).max(20000),
  workingHours: optionalString,
  experienceLevel: ExperienceLevelEnum.nullable().optional(),
  responsibilities: stringArray,
  requirements: stringArray,
  benefits: stringArray,
  salaryMin: z.coerce.number().int().min(0).optional().nullable(),
  salaryMax: z.coerce.number().int().min(0).optional().nullable(),
  salaryNote: z.string().max(200).optional().nullable(),
  status: JobStatusEnum.default('DRAFT'),
  openings: z.coerce.number().int().min(1).default(1),
  closesAt: z.coerce.date().optional().nullable(),
  contactEmail: optionalEmail,
  contactPhone: optionalString,
})

export type JobCreateInput = z.infer<typeof jobCreateSchema>

export const jobUpdateSchema = jobCreateSchema.partial().extend({
  id: z.string().min(1),
})
