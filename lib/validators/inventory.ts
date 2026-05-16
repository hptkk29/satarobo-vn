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
