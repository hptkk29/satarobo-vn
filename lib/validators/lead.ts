import { z } from 'zod'
import { LeadChildTrialStatus } from '@prisma/client'
import { phoneVn } from '@/lib/validators/phone'
import { parseContractValue } from '@/lib/lead/contract-value'

// AUTH-SĐT P1 — regex riêng đã bị gỡ; nguồn duy nhất là `PHONE_VN_RE` trong
// `lib/phone.ts`. Re-export để call-site cũ còn import được.
export { PHONE_VN_RE as PHONE_VN } from '@/lib/phone'

// Helpers — convert empty string → null, preserve type (R7-01 LeadChild).
const nullableStr = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v === '' || v === undefined || v === null ? null : v))

const nullableInt = (min: number, max: number) =>
  z
    .union([z.null(), z.literal(''), z.coerce.number().int().min(min).max(max)])
    .optional()
    .transform((v) => (v === '' || v === undefined || v === null ? null : (v as number)))

// DOB: chấp nhận Date hoặc date string; '' → null; KHÔNG cho ngày tương lai.
const nullablePastDate = z
  .union([z.null(), z.literal(''), z.coerce.date()])
  .optional()
  .transform((v) => (v === '' || v === undefined || v === null ? null : (v as Date)))
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
  // BGĐ 31/07 — mã giới thiệu từ link `?ref=<code>` (affiliate). Mã sai → bỏ qua.
  ref: z.string().max(32).optional(),
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
  // G-01 — lớp con ĐANG HỌC tại trung tâm (tham chiếu Class). Không ràng FK cứng,
  // cùng kiểu với hai ô ngay trên; lớp bị xoá thì giao diện hiện "—".
  classId: nullableStr,
  note: nullableStr,
  // G-06 — GIÁ TRỊ HỢP ĐỒNG ĐÃ KÝ (VND). 🔴 KHÔNG phải doanh thu: doanh thu lấy từ
  // `Payment` đã xác nhận (quyết định B3). Luật đọc/chặn nằm ở một chỗ duy nhất
  // (`lib/lead/contract-value.ts`) để ô nhập, API và file nhập liệu cùng một hành vi.
  //
  // `z.unknown()` chứ không `z.coerce.number()`: form gửi chuỗi "5.000.000 đ" (người
  // ta gõ y như trên hợp đồng) mà `coerce` sẽ ra NaN rồi rơi về null — nuốt mất lượt
  // nhập trong khi người nhập tưởng đã lưu.
  contractValue: z.unknown().optional().transform((v, ctx) => {
    const r = parseContractValue(v)
    if (!r.ok) {
      ctx.addIssue({ code: 'custom', message: r.message })
      return z.NEVER
    }
    return r.value
  }),
  trialStatus: z.nativeEnum(LeadChildTrialStatus).default(LeadChildTrialStatus.NONE),
})

export type LeadCreateInput = z.infer<typeof leadCreateSchema>
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>
export type LeadChildInput = z.infer<typeof leadChildSchema>
