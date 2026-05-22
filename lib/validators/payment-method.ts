import { z } from "zod";
import { PaymentMethodType } from "@prisma/client";

const baseSchema = z.object({
  code: z
    .string()
    .min(1, "Mã không được rỗng")
    .max(50, "Mã tối đa 50 ký tự")
    .regex(/^[A-Z][A-Z0-9_]*$/, "Mã chỉ chứa A-Z, 0-9, _ (bắt đầu bằng chữ)"),
  name: z.string().min(1, "Tên không được rỗng").max(200),
  type: z.nativeEnum(PaymentMethodType),
  description: z.string().max(1000).nullable().optional(),
  image: z
    .string()
    .url("URL hình ảnh không hợp lệ")
    .nullable()
    .optional()
    .or(z.literal("")),

  canBuyCourse: z.boolean(),
  canBuyPackage: z.boolean(),
  canBuyExam: z.boolean(),
  canBuyProduct: z.boolean(),
  canDeposit: z.boolean(),

  bankName: z.string().max(100).nullable().optional(),
  bankBranch: z.string().max(200).nullable().optional(),
  bankAccountNumber: z.string().max(50).nullable().optional(),
  bankAccountName: z.string().max(200).nullable().optional(),

  gatewayConfig: z.string().nullable().optional(), // raw JSON string

  displayOrder: z.number().int().min(0).max(9999),
  isActive: z.boolean(),
});

function validateConditional(
  data: z.infer<typeof baseSchema>,
  ctx: z.RefinementCtx,
) {
  if (data.type === PaymentMethodType.BANK_TRANSFER) {
    if (!data.bankAccountNumber?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankAccountNumber"],
        message: "Bắt buộc khi loại = Chuyển khoản ngân hàng",
      });
    }
    if (!data.bankAccountName?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["bankAccountName"],
        message: "Bắt buộc khi loại = Chuyển khoản ngân hàng",
      });
    }
  }

  if (data.gatewayConfig?.trim()) {
    try {
      JSON.parse(data.gatewayConfig);
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["gatewayConfig"],
        message: "JSON không hợp lệ",
      });
    }
  }
}

export const paymentMethodCreateSchema =
  baseSchema.superRefine(validateConditional);
export const paymentMethodUpdateSchema =
  baseSchema.superRefine(validateConditional);

export type PaymentMethodFormData = z.infer<typeof baseSchema>;
