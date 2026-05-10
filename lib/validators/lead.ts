import { z } from 'zod'

export const PHONE_VN = /^(0|\+84)[3|5|7|8|9][0-9]{8}$/

export const leadCreateSchema = z.object({
  parentName: z.string().min(2, 'Họ tên tối thiểu 2 ký tự').max(100),
  childName: z.string().max(100).optional(),
  childAge: z.number().int().min(3).max(18).optional(),
  phone: z.string().regex(PHONE_VN, 'SĐT không hợp lệ'),
  email: z.string().email('Email không hợp lệ').optional().or(z.literal('')),
  centerId: z.string().min(1).optional(),
  courseId: z.string().cuid().optional(),
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
    .enum(['NEW', 'CONTACTED', 'DEMO_SCHEDULED', 'ENROLLED', 'NURTURING', 'LOST'])
    .optional(),
  assignedToId: z.string().cuid().optional(),
})

export type LeadCreateInput = z.infer<typeof leadCreateSchema>
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>
