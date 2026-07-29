import { z } from "zod";
import { OrderType, OrderStatus, OrderItemType } from "@prisma/client";
import { phoneVn } from "@/lib/validators/phone";

// AUTH-SĐT P1 — regex riêng đã gỡ; nguồn duy nhất ở `lib/phone.ts`.
export { PHONE_VN_RE as PHONE_VN } from "@/lib/phone";



const orderItemSchema = z.object({
  type: z.nativeEnum(OrderItemType),
  itemName: z.string().min(1).max(300),
  itemDescription: z.string().max(1000).optional().nullable(),
  quantity: z.number().int().min(1).max(99),
  unitPrice: z.number().int().min(0),
  // Polymorphic refs (one will be set depending on type)
  packageId: z.string().min(1).optional().nullable(),
  examAttemptId: z.string().min(1).optional().nullable(),
  productId: z.string().min(1).optional().nullable(),
  // Metadata cho COURSE_ENROLLMENT (chứa courseId vì Enrollment chưa tồn tại)
  metadata: z.record(z.string(), z.unknown()).optional().nullable(),
});

export const orderCreateManualSchema = z.object({
  type: z.nativeEnum(OrderType),
  status: z.nativeEnum(OrderStatus).default("PENDING_PAYMENT"),

  // Customer snapshot
  customerName: z.string().min(2).max(200),
  customerPhone: phoneVn,
  // O2 — email bắt buộc cho đơn thủ công (dùng gửi xác nhận/biên nhận).
  customerEmail: z.string().email("Email không hợp lệ"),
  // O2 — CCCD/CMND người mua (snapshot trên đơn): 9 hoặc 12 chữ số, optional.
  customerCccd: z
    .string()
    .regex(/^\d{9}$|^\d{12}$/, "CCCD phải gồm 9 hoặc 12 chữ số")
    .optional()
    .or(z.literal(""))
    .nullable(),
  customerAddress: z.string().max(500).optional().nullable(),
  customerWard: z.string().max(100).optional().nullable(),
  customerCity: z.string().max(100).optional().nullable(),

  // Optional links
  studentId: z.string().min(1).optional().nullable(),
  leadId: z.string().min(1).optional().nullable(),
  centerId: z.string().min(1).optional().nullable(),
  paymentMethodId: z.string().min(1),

  // Items (v1 = 1 item required, schema allows up to 20)
  items: z.array(orderItemSchema).min(1, "Phải có ít nhất 1 sản phẩm").max(20),

  // Pricing manual (computed final at server)
  discountAmount: z.number().int().min(0).default(0),
  shippingFee: z.number().int().min(0).default(0),
  voucherCode: z.string().max(50).optional().nullable(),

  // Notes
  customerNote: z.string().max(2000).optional().nullable(),
  internalNote: z.string().max(2000).optional().nullable(),
});

export const orderStatusChangeSchema = z.object({
  toStatus: z.nativeEnum(OrderStatus),
  reason: z.string().max(500).optional().nullable(),
});

export type OrderCreateManualInput = z.infer<typeof orderCreateManualSchema>;
