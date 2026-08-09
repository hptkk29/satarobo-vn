// lib/validators/user-group.ts — US-03 (Nền Hệ thống P0): validator UserGroup + grant GROUP.
// Hợp đồng đông cứng (thiết kế duyệt 09/08/2026, test viết TRƯỚC — luật #5):
//   - Grant GROUP ở P0 CHỈ nhận dataScope ALL | OWN. UNIT_ONLY/UNIT_AND_BELOW bị chặn
//     với LỖI RÕ CHỮ ngay write path: mapping nhóm→đơn vị chưa tồn tại tới P1, engine
//     (lib/permissions/can.ts) sẽ trả false IM LẶNG — cấm tạo grant "trông như hoạt động".
//   - ALLOW ⇒ fieldMask BẮT BUỘC rỗng (mask chỉ dành cho DENY cấp trường — BA §2.5;
//     engine US-02 bỏ qua row ALLOW+mask kèm warn, đây là cú chặn cứng hứa ở đó).
//   - reason BẮT BUỘC 5..500 (audit — RbacAuditLog).
//   - permissionKey chỉ check "có chữ" ở đây; tồn tại + isActive đối chiếu
//     PermissionDescriptor (DB) ở Server Action — KHÔNG dùng ALL_ACTIONS v1 vì registry
//     có key khai trước (chat) nằm ngoài matrix v1.
import { z } from "zod";

/** "" / "   " / null / undefined → null; còn lại trim (pattern nullableStr của repo). */
const nullableStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v === null || v === undefined) return null;
    const s = v.trim();
    return s.length > 0 ? s : null;
  });

/** dataScope hợp lệ cho grant GROUP ở P0 — UI select đọc từ đây (1 nguồn). */
export const GROUP_GRANT_DATA_SCOPES = ["ALL", "OWN"] as const;

export const userGroupCreateSchema = z.object({
  name: z
    .string("Nhập tên nhóm")
    .trim()
    .min(1, "Tên nhóm không được để trống")
    .max(100, "Tên nhóm tối đa 100 ký tự"),
  description: nullableStr,
});

/** Sửa nhóm dùng cùng shape tạo (name + description) — tách alias để call-site rõ nghĩa. */
export const userGroupUpdateSchema = userGroupCreateSchema;

/** Thêm thành viên — userId cuid, chỉ cần "có chữ" (tồn tại/active check ở action). */
export const groupMemberAddSchema = z.object({
  userId: z.string("Chọn người dùng").trim().min(1, "Chọn người dùng để thêm vào nhóm"),
});

export const groupGrantCreateSchema = z
  .object({
    permissionKey: z
      .string("Chọn permission key")
      .trim()
      .min(1, "Chọn permission key cho grant"),
    effect: z.enum(["ALLOW", "DENY"], {
      error: "Effect chỉ nhận ALLOW hoặc DENY",
    }),
    // Refine 1 — dataScope P0 chỉ ALL | OWN: lỗi phải TỰ GIẢI THÍCH cho người cấp quyền
    // (không phải enum error câm). UNIT_ONLY/UNIT_AND_BELOW cần mapping nhóm→đơn vị (P1).
    dataScope: z.enum(GROUP_GRANT_DATA_SCOPES, {
      error:
        "Grant nhóm ở P0 chỉ nhận dataScope ALL hoặc OWN — UNIT_ONLY/UNIT_AND_BELOW " +
        "chưa có mapping nhóm→đơn vị (P1), engine sẽ từ chối im lặng nên bị chặn ngay tại đây",
    }),
    fieldMask: z
      .array(z.string().trim().min(1, "Tên trường trong fieldMask không được rỗng"))
      .max(30, "fieldMask tối đa 30 trường")
      .default([]),
    // Refine 3 — reason bắt buộc (audit RbacAuditLog), 5..500 sau trim.
    reason: z
      .string("Nhập lý do cấp/chặn quyền (bắt buộc — audit)")
      .trim()
      .min(5, "Lý do tối thiểu 5 ký tự (audit yêu cầu lý do thật, không gõ chống chế)")
      .max(500, "Lý do tối đa 500 ký tự"),
  })
  // Refine 2 — fieldMask CHỈ dành cho DENY cấp trường: ALLOW ⇒ fieldMask phải rỗng
  // (chặn cứng ở write path — engine US-02 chỉ warn + bỏ qua row ALLOW+mask).
  .superRefine((d, ctx) => {
    if (d.effect === "ALLOW" && d.fieldMask.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["fieldMask"],
        message:
          "fieldMask chỉ dành cho DENY cấp trường (che trường, không chặn action) — " +
          "grant ALLOW phải để fieldMask rỗng",
      });
    }
  });

export type UserGroupCreateInput = z.infer<typeof userGroupCreateSchema>;
export type GroupMemberAddInput = z.infer<typeof groupMemberAddSchema>;
export type GroupGrantCreateInput = z.infer<typeof groupGrantCreateSchema>;
