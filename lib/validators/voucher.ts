import { z } from "zod";
import { VoucherType, VoucherDiscountKind } from "@prisma/client";

const baseSchema = z.object({
  code: z
    .string()
    .min(3, "Mã tối thiểu 3 ký tự")
    .max(50, "Mã tối đa 50 ký tự")
    .regex(
      /^[A-Z][A-Z0-9_-]*$/,
      "Mã chỉ chứa A-Z, 0-9, _, - (bắt đầu bằng chữ)",
    ),
  name: z.string().min(1, "Tên không được rỗng").max(200),
  description: z.string().max(1000).nullable().optional(),
  type: z.nativeEnum(VoucherType),
  discountKind: z.nativeEnum(VoucherDiscountKind),

  discountPercent: z.number().int().min(1).max(100).nullable().optional(),
  discountAmount: z.number().int().min(1).nullable().optional(),
  maxDiscount: z.number().int().min(1).nullable().optional(),
  minOrderValue: z.number().int().min(0).default(0),

  quantity: z.number().int().min(1).nullable().optional(),
  usageLimitPerUser: z.number().int().min(1).default(1),

  validFrom: z.coerce.date(),
  validUntil: z.coerce.date(),
  isActive: z.boolean(),
});

function validateConditional(
  data: z.infer<typeof baseSchema>,
  ctx: z.RefinementCtx,
) {
  // PERCENT requires discountPercent, no discountAmount
  if (data.discountKind === VoucherDiscountKind.PERCENT) {
    if (!data.discountPercent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountPercent"],
        message: "Bắt buộc khi loại giảm = Theo %",
      });
    }
    if (data.discountAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountAmount"],
        message: "Để trống khi loại giảm = Theo %",
      });
    }
  }

  // FIXED requires discountAmount, no discountPercent/maxDiscount
  if (data.discountKind === VoucherDiscountKind.FIXED) {
    if (!data.discountAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountAmount"],
        message: "Bắt buộc khi loại giảm = Tiền cố định",
      });
    }
    if (data.discountPercent) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["discountPercent"],
        message: "Để trống khi loại giảm = Tiền cố định",
      });
    }
    if (data.maxDiscount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxDiscount"],
        message: "Không cần khi loại giảm = Tiền cố định",
      });
    }
  }

  if (data.validUntil <= data.validFrom) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["validUntil"],
      message: "Ngày kết thúc phải sau ngày bắt đầu",
    });
  }
}

export const voucherCreateSchema = baseSchema.superRefine(validateConditional);
export const voucherUpdateSchema = baseSchema.superRefine(validateConditional);

export type VoucherFormData = z.infer<typeof baseSchema>;

export const VOUCHER_TYPE_LABEL: Record<VoucherType, string> = {
  COURSE: "Khoá học",
  PACKAGE: "Gói combo",
  KIT_ROBOT: "Kit Robot",
  SENSOR: "Sensor",
  ALL: "Tất cả loại đơn",
};

export const VOUCHER_DISCOUNT_KIND_LABEL: Record<VoucherDiscountKind, string> =
  {
    PERCENT: "Theo %",
    FIXED: "Tiền cố định (VND)",
  };
