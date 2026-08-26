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
  // O2 — email dùng gửi xác nhận/biên nhận.
  // AUTH-SĐT P5: KHÔNG còn bắt buộc. Xác nhận/nhắc nợ nay đi Zalo ZNS theo
  // `customerPhone` (đằng nào cũng bắt buộc), email chỉ là kênh dự phòng — giữ
  // bắt buộc thì mọi khách không có email lại không lên được đơn.
  customerEmail: z
    .string()
    .email("Email không hợp lệ")
    .optional()
    .or(z.literal(""))
    .nullable()
    .transform((v) => (v ? v.toLowerCase() : null)),
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
  // N-2 · quyết định B4 (24/08/2026) — MỘT ĐƠN – MỘT CON. Con nào của phiếu `leadId` sinh
  // ra đơn này. Bỏ trống được: phiếu đúng 1 con thì server tự suy, phiếu nhiều con mà
  // không chọn thì đơn nằm ở nhóm "chưa quy được về con" (KHÔNG đoán — xem
  // `lib/orders/lead-child-link.ts`). Quyền sở hữu con do server kiểm, không tin client.
  leadChildId: z.string().min(1).optional().nullable(),
  centerId: z.string().min(1).optional().nullable(),
  paymentMethodId: z.string().min(1),

  // Items (v1 = 1 item required, schema allows up to 20)
  items: z.array(orderItemSchema).min(1, "Phải có ít nhất 1 sản phẩm").max(20),

  // Pricing manual (computed final at server)
  discountAmount: z.number().int().min(0).default(0),
  // BGĐ 31/07 — nhập giảm giá theo % (1..100); server tự quy ra discountAmount.
  discountPercent: z.number().int().min(1).max(100).optional().nullable(),
  // BGĐ 31/07 — giải trình giảm giá: BẮT BUỘC khi giảm tay > 0 (refine bên dưới).
  discountReason: z.string().max(1000).optional().nullable(),
  shippingFee: z.number().int().min(0).default(0),

  // Notes
  customerNote: z.string().max(2000).optional().nullable(),
  internalNote: z.string().max(2000).optional().nullable(),
})
  // BGĐ 31/07 — MỌI giảm giá đều do nhân viên nhập tay (% hoặc số tiền) nên
  // LUÔN phải có giải trình. Hệ mã khuyến mãi đã gỡ 03/08 theo chốt chủ dự án:
  // giảm theo %/số tiền linh động hơn, không phải tạo mã cho từng đợt.
  .refine(
    (d) =>
      !((d.discountPercent ?? 0) > 0 || d.discountAmount > 0) ||
      !!d.discountReason?.trim(),
    { message: "Nhập giải trình giảm giá", path: ["discountReason"] },
  );

export const orderStatusChangeSchema = z.object({
  toStatus: z.nativeEnum(OrderStatus),
  reason: z.string().max(500).optional().nullable(),
});

export type OrderCreateManualInput = z.infer<typeof orderCreateManualSchema>;
