import { z } from 'zod'
import { LeadChildTrialStatus } from '@prisma/client'
import { phoneVn } from '@/lib/validators/phone'

// AUTH-SĐT P1 — regex riêng đã bị gỡ; nguồn duy nhất là `PHONE_VN_RE` trong
// `lib/phone.ts`. Re-export để call-site cũ còn import được.
export { PHONE_VN_RE as PHONE_VN } from '@/lib/phone'

// Helpers — convert empty string → null, preserve type (R7-01 LeadChild).
const nullableStr = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : v))

const nullableInt = (min: number, max: number) =>
  z
    .union([z.coerce.number().int().min(min).max(max), z.literal(''), z.null()])
    .optional()
    .transform((v) => (v === '' || v === undefined ? null : (v as number)))

// DOB: chấp nhận Date hoặc date string; '' → null; KHÔNG cho ngày tương lai.
const nullablePastDate = z
  .union([z.coerce.date(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' || v === undefined ? null : (v as Date)))
  .refine((v) => v === null || v <= new Date(), {
    message: 'Ngày sinh không được ở tương lai',
  })

export const leadCreateSchema = z.object({
  parentName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự').max(100),
  childName: z.string().max(100).optional(),
  childAge: z.number().int().min(3).max(18).optional(),
  phone: phoneVn,
  email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
  centerId: z.string().min(1).optional(),
  orgUnitId: z.string().min(1).optional(), // PR-C: đơn vị (OrgUnit) — nguồn chính; centerId suy ra (HO→null)
  courseId: z.string().min(1).optional(),
  source: z.string().min(1),
  utmSource: z.string().max(100).optional(),
  utmMedium: z.string().max(100).optional(),
  utmCampaign: z.string().max(100).optional(),
  utmTerm: z.string().max(100).optional(),
  utmContent: z.string().max(100).optional(),
  fbclid: z.string().optional(),
  gclid: z.string().optional(),
  fbp: z.string().optional(),
  fbc: z.string().optional(),
  landingPage: z.string().url().optional(),
  referrer: z.string().optional(),
  eventId: z.string().min(8),
  consentMarketing: z.boolean().default(false),
  note: z.string().max(500).optional(),
  // Honeypot — bot sẽ fill, người thật để trống
  website: z.string().max(0).optional().or(z.literal('')),
  // Anti-bot — thời gian trên trang (giây), bot thường < 3s
  timeOnPage: z.number().int().min(0).optional(),
})

export const leadUpdateSchema = leadCreateSchema.partial().extend({
  status: z
    .enum([
      'NEW',
      'ASSIGNED',
      'CONTACTED',
      'NO_ANSWER',
      'CONSULTING',
      'TRIAL_SCHEDULED',
      'TRIAL_ATTENDED',
      'AWAITING_DECISION',
      'ENROLLED',
      'NURTURING',
      'LOST',
      'DUPLICATE',
      'DEMO_SCHEDULED',
      'TRIAL_IN_PROGRESS',
      'REGISTERED',
    ])
    .optional(),
  assignedToId: z.string().min(1).optional(),
})

// R7-01 — LeadChild (1 lead có nhiều con). Create/edit input.
export const leadChildSchema = z.object({
  fullName: z.string().trim().min(1, 'Họ tên con là bắt buộc'),
  dob: nullablePastDate,
  ageYears: nullableInt(1, 18),
  gender: nullableStr,
  schoolName: nullableStr,
  gradeLevel: nullableStr,
  interestedCourseId: nullableStr,
  interestedCenterId: nullableStr,
  note: nullableStr,
  trialStatus: z.nativeEnum(LeadChildTrialStatus).default(LeadChildTrialStatus.NONE),
})

export type LeadCreateInput = z.infer<typeof leadCreateSchema>
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>
export type LeadChildInput = z.infer<typeof leadChildSchema>
