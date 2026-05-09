import { z } from "zod";

const phoneVN = z
  .string()
  .regex(/^(0|\+84)[3|5|7|8|9][0-9]{8}$/, "Số điện thoại Việt Nam không hợp lệ");

export const leadCreateSchema = z.object({
  parentName: z.string().min(2, "Họ tên tối thiểu 2 ký tự").max(100),
  phone: phoneVN,
  email: z.string().email("Email không hợp lệ").optional().or(z.literal("")),
  childName: z.string().max(100).optional(),
  childAge: z.number().int().min(5).max(20).optional(),
  centerId: z.string().cuid().optional(),
  courseId: z.string().cuid().optional(),
  source: z.string().max(50).optional(),
  utmSource: z.string().max(100).optional(),
  utmMedium: z.string().max(100).optional(),
  utmCampaign: z.string().max(100).optional(),
  utmContent: z.string().max(100).optional(),
  utmTerm: z.string().max(100).optional(),
  note: z.string().max(1000).optional(),
});

export const leadUpdateSchema = leadCreateSchema.partial().extend({
  status: z
    .enum(["NEW", "CONTACTED", "DEMO_SCHEDULED", "ENROLLED", "NURTURING", "LOST"])
    .optional(),
  assignedToId: z.string().cuid().optional(),
});

export type LeadCreateInput = z.infer<typeof leadCreateSchema>;
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;
