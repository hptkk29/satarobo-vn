import { z } from "zod";

export const InventoryCategoryEnum = z.enum([
  "MAINBOARD",
  "SENSOR",
  "MOTOR",
  "BATTERY",
  "MECHANICAL",
  "WIRE",
  "TOOL",
  "CONSUMABLE",
  "ROBOSIM",
  "OTHER",
]);

const nullableStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const s = v.trim();
    return s.length > 0 ? s : null;
  });

const tagsClean = z
  .array(z.string())
  .default([])
  .transform((arr) =>
    Array.from(
      new Set(
        arr
          .map((s) => s.trim())
          .filter((s) => s.length > 0),
      ),
    ),
  );

const nullableFloat = z
  .union([z.coerce.number(), z.null(), z.literal("")])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    return Number.isFinite(v) ? (v as number) : null;
  });

const nullableUrl = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined) return null;
    const s = v.trim();
    if (!s) return null;
    try {
      new URL(s);
      return s;
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "URL không hợp lệ",
      });
      return z.NEVER;
    }
  });

// ─── Phase F2 — movement schemas ─────────────────────────────────────────

export const StockMovementTypeEnum = z.enum([
  "RECEIPT",
  "ISSUE",
  "TRANSFER_OUT",
  "TRANSFER_IN",
]);

const positiveInt = z.coerce.number().int().min(1, "Số lượng phải >= 1");

const nullableFloatNonNeg = z
  .union([z.coerce.number(), z.null(), z.literal("")])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = v as number;
    return Number.isFinite(n) && n >= 0 ? n : null;
  });

export const receiptSchema = z.object({
  itemId: z.string().trim().min(1, "Thiếu mặt hàng"),
  centerId: z.string().trim().min(1, "Thiếu cơ sở"),
  quantity: positiveInt,
  unitPrice: nullableFloatNonNeg,
  referenceNote: nullableStr,
  notes: nullableStr,
});

export const issueSchema = z.object({
  itemId: z.string().trim().min(1, "Thiếu mặt hàng"),
  centerId: z.string().trim().min(1, "Thiếu cơ sở"),
  quantity: positiveInt,
  referenceType: nullableStr,
  referenceId: nullableStr,
  referenceNote: nullableStr,
  notes: nullableStr,
});

export const transferSchema = z
  .object({
    itemId: z.string().trim().min(1, "Thiếu mặt hàng"),
    fromCenterId: z.string().trim().min(1, "Thiếu cơ sở nguồn"),
    toCenterId: z.string().trim().min(1, "Thiếu cơ sở đích"),
    quantity: positiveInt,
    notes: nullableStr,
  })
  .refine((d) => d.fromCenterId !== d.toCenterId, {
    message: "Cơ sở đích trùng cơ sở nguồn",
    path: ["toCenterId"],
  });

export const adjustmentSchema = z.object({
  itemId: z.string().trim().min(1, "Thiếu mặt hàng"),
  centerId: z.string().trim().min(1, "Thiếu cơ sở"),
  newQuantity: z.coerce.number().int().min(0, "Số lượng mới phải >= 0"),
  reason: z
    .string()
    .trim()
    .min(5, "Lý do tối thiểu 5 ký tự")
    .max(500, "Lý do tối đa 500 ký tự"),
});

export type ReceiptInput = z.infer<typeof receiptSchema>;
export type IssueInput = z.infer<typeof issueSchema>;
export type TransferInput = z.infer<typeof transferSchema>;
export type AdjustmentInput = z.infer<typeof adjustmentSchema>;

export const inventoryItemSchema = z.object({
  itemCode: z
    .string()
    .trim()
    .min(1, "Mã hàng bắt buộc")
    .max(80),
  name: z.string().trim().min(1, "Tên hàng bắt buộc").max(200),
  description: nullableStr,
  category: InventoryCategoryEnum.default("OTHER"),
  unit: z.string().trim().min(1).max(40).default("Cái"),
  pricePerUnit: nullableFloat,
  supplier: nullableStr,
  defaultMinThreshold: z.coerce.number().int().min(0).default(5),
  imageUrl: nullableUrl,
  tags: tagsClean,
  isActive: z.coerce.boolean().default(true),
  notes: nullableStr,
});

export type InventoryItemInput = z.infer<typeof inventoryItemSchema>;
