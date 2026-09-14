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
  /**
   * Dòng hàng này mua cho CON NÀO — đơn nhiều con (15/09/2026).
   *
   * ⚠️ Chỉ là Ý ĐỊNH của client cho tới khi `createOrderManualAction` tra lại qua
   * `scopedDb` và gác `passesScope`. Một `studentId` lọt vào đây là một quan hệ TIỀN
   * (“khoản này của con nào”), nên không bao giờ được tin thẳng — cùng lý do với
   * `centerId`, xem chú thích ở đó.
   */
  studentId: z.string().min(1).optional().nullable(),
  /**
   * GIẢM GIÁ CỦA RIÊNG DÒNG NÀY (15/09/2026 — "tách riêng theo từng dòng").
   *
   * Người bán gõ MỘT trong hai: số tiền (`discountAmount`) hoặc phần trăm
   * (`discountPercent`). Server tính lại bằng `lib/orders/giam-gia-dong.ts` và KHÔNG
   * tin số client gửi — đây là tiền, và cả hai vế của phép trừ đều do client khai.
   *
   * ⚠️ Giảm giá KHÔNG được biểu diễn bằng cách hạ `unitPrice`. `lib/orders/price-guard.ts`
   * so `unitPrice` với giá niêm yết để phát hiện đơn bán lệch; hạ đơn giá là làm mù
   * cổng đó (xem mục (c) ở đầu tệp ấy).
   */
  discountAmount: z.number().int().min(0).default(0),
  discountPercent: z.number().int().min(1).max(100).optional().nullable(),
  /** Giải trình của RIÊNG dòng — bắt buộc khi dòng đó có giảm (refine bên dưới). */
  discountReason: z.string().max(1000).optional().nullable(),
  // Metadata cho COURSE_ENROLLMENT (chứa courseId vì Enrollment chưa tồn tại)
  /**
   * Json tự do — nhưng HAI khoá dưới đây có nghĩa và phải đúng khuôn:
   * `coachFormat` (hình thức lớp, SR.QD.219 Điều 5) và `soBuoi`.
   *
   * ⚠️ Siết KIỂU ở đây KHÔNG làm GIÁ TRỊ đáng tin — `coachFormat` vẫn là thứ client tự
   * khai, và không có gì trên server suy ngược ra được (model `Class` không có cột hình
   * thức lớp). Đó chính là lý do hình thức lớp KHÔNG được đi vào `giaNiemYet` của cổng
   * soát giá; xem đầu `lib/orders/hinh-thuc-lop.ts`.
   *
   * ⚠️ Và nó CHỈ phủ đường `createOrderManualAction`. Ba đường tạo OrderItem còn lại
   * (`lib/crm/backfill-order.ts`, `lib/finance/ghi-giao-dich-cu.ts`, convert) ghi thẳng
   * bằng Prisma, không qua schema này.
   */
  metadata: z
    .record(z.string(), z.unknown())
    .refine(
      (m) =>
        m.coachFormat === undefined ||
        (typeof m.coachFormat === "string" &&
          ["GROUP", "ONE_ON_ONE", "ONE_ON_TWO", "ONE_ON_FOUR"].includes(m.coachFormat)),
      { message: "Hình thức lớp không hợp lệ" },
    )
    .refine(
      (m) =>
        m.soBuoi === undefined ||
        (typeof m.soBuoi === "number" && Number.isInteger(m.soBuoi) && m.soBuoi > 0 && m.soBuoi <= 500),
      { message: "Số buổi phải là số nguyên từ 1 đến 500" },
    )
    .optional()
    .nullable(),
})
  // Cơ chế DUYỆT giảm giá đã gỡ 14/09/2026 — GIẢI TRÌNH thì GIỮ, và nay nó theo DÒNG.
  // Hai em được giảm vì hai lý do khác nhau là ca thường, không phải ngoại lệ; một ô
  // giải trình dùng chung không nói được điều đó.
  .refine(
    (it) =>
      !((it.discountPercent ?? 0) > 0 || it.discountAmount > 0) ||
      !!it.discountReason?.trim(),
    { message: "Dòng có giảm giá thì phải nhập giải trình", path: ["discountReason"] },
  )
  // Gõ CẢ HAI kiểu trên cùng một dòng là mơ hồ — và mơ hồ về tiền thì phải nổ, không
  // được chọn hộ một kiểu rồi vứt kiểu kia.
  .refine((it) => !((it.discountPercent ?? 0) > 0 && it.discountAmount > 0), {
    message: "Mỗi dòng chỉ khai giảm giá theo MỘT kiểu: số tiền hoặc phần trăm",
    path: ["discountAmount"],
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
  centerId: z.string().min(1).optional().nullable(),
  paymentMethodId: z.string().min(1),

  // Items (v1 = 1 item required, schema allows up to 20)
  items: z.array(orderItemSchema).min(1, "Phải có ít nhất 1 sản phẩm").max(20),

  // ── GIẢM GIÁ CẤP ĐƠN: ĐÃ ĐÓNG [15/09/2026] ─────────────────────────────────
  //
  // Chủ dự án chốt giảm giá khai theo TỪNG DÒNG. Ba trường dưới GIỮ LẠI trong schema
  // cố ý, nhưng chỉ để **TỪ CHỐI cho ra tiếng** (refine ở cuối): bỏ hẳn khỏi schema
  // thì Zod lặng lẽ bỏ qua khoá lạ, và một người gọi cũ gửi `discountAmount: 500000`
  // sẽ thấy đơn tạo thành công với giá NGUYÊN — mất 500.000đ mà không lỗi nào báo.
  // Cột `Order.discountAmount` vẫn còn và vẫn là TỔNG, nhưng nay chỉ có một nguồn
  // sinh ra nó: Σ các dòng (`lib/orders/giam-gia-dong.ts`).
  discountAmount: z.number().int().min(0).default(0),
  discountPercent: z.number().int().min(1).max(100).optional().nullable(),
  discountReason: z.string().max(1000).optional().nullable(),
  shippingFee: z.number().int().min(0).default(0),

  // Notes
  customerNote: z.string().max(2000).optional().nullable(),
  internalNote: z.string().max(2000).optional().nullable(),
})
  // Giảm giá CẤP ĐƠN bị từ chối cho ra tiếng — xem chú thích ở ba trường trên.
  .refine((d) => !((d.discountPercent ?? 0) > 0 || d.discountAmount > 0), {
    message:
      "Giảm giá nay khai theo TỪNG DÒNG, không khai ở cấp đơn — đặt vào items[].discountAmount / discountPercent",
    path: ["discountAmount"],
  });

export const orderStatusChangeSchema = z.object({
  toStatus: z.nativeEnum(OrderStatus),
  reason: z.string().max(500).optional().nullable(),
});

export type OrderCreateManualInput = z.infer<typeof orderCreateManualSchema>;
