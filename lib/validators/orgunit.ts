// lib/validators/orgunit.ts — Zod schema cho OrgUnit (ticket A0-01). Source of truth type.
import { z } from "zod";
import { ORG_UNIT_TYPES } from "@/lib/org/types";
import { ORG_CODE_RE, normalizeCode } from "@/lib/org/orgunit-rules";

const nullableStr = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v == null || v === "" ? null : v));

export const orgUnitCreateSchema = z
  .object({
    type: z.enum(ORG_UNIT_TYPES),
    code: z
      .string()
      .transform(normalizeCode)
      .refine((c) => ORG_CODE_RE.test(c), {
        message: "Mã đơn vị chỉ gồm 2–20 ký tự A–Z, 0–9 hoặc gạch dưới.",
      }),
    name: z.string().trim().min(1, "Tên đơn vị không được để trống.").max(200),
    parentId: nullableStr,
    address: nullableStr,
    centerId: nullableStr,
  })
  .refine((v) => !(v.centerId != null && v.type !== "CENTER"), {
    message: "Chỉ đơn vị loại CENTER mới được gắn centerId.",
    path: ["centerId"],
  })
  .refine((v) => !(v.type === "ROOT" && v.parentId != null), {
    message: "ROOT không được có đơn vị cha.",
    path: ["parentId"],
  })
  .refine((v) => !(v.type !== "ROOT" && v.parentId == null), {
    message: "Đơn vị không phải ROOT bắt buộc có đơn vị cha.",
    path: ["parentId"],
  });

export type OrgUnitCreateInput = z.infer<typeof orgUnitCreateSchema>;

export const orgUnitUpdateSchema = orgUnitCreateSchema;
