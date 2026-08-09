// US-03 (Nền Hệ thống P0) — validator UserGroup + grant GROUP · VIẾT TRƯỚC hiện thực (luật #5).
//
// Hợp đồng đông cứng (thiết kế duyệt 09/08/2026):
// - Grant GROUP ở P0 CHỈ nhận dataScope ALL | OWN — UNIT_ONLY/UNIT_AND_BELOW bị chặn
//   với LỖI RÕ CHỮ (mapping group→center chưa tồn tại tới P1; engine trả false im lặng
//   nên phải chặn ngay ở write path, không cho tạo grant "trông như hoạt động").
// - ALLOW ⇒ fieldMask BẮT BUỘC rỗng (mask chỉ dành cho DENY cấp trường — BA §2.5;
//   engine US-02 đã bỏ qua row ALLOW+mask kèm warn, đây là cú chặn cứng hứa ở đó).
// - reason BẮT BUỘC (audit — RbacAuditLog).
// - name nhóm: 1..100 ký tự sau trim.
//
// File này ĐỎ (Cannot find module) cho tới khi lib/validators/user-group.ts tồn tại.
import { describe, it, expect } from "vitest";
import {
  userGroupCreateSchema,
  groupGrantCreateSchema,
} from "@/lib/validators/user-group";

/** Input grant hợp lệ làm nền — từng case override đúng 1 chiều. */
const validGrant = {
  permissionKey: "students:view-all",
  effect: "DENY",
  dataScope: "ALL",
  fieldMask: ["parentPhone"],
  reason: "TS-02: che SĐT phụ huynh cho nhóm CSKH tạm thời",
};

function messagesOf(result: { success: boolean; error?: { issues: { message: string }[] } }): string {
  if (result.success || !result.error) return "";
  return result.error.issues.map((i) => i.message).join(" · ");
}

describe("US-03 · groupGrantCreateSchema — luật ALLOW/DENY × fieldMask", () => {
  it("DENY + ALL + fieldMask ['parentPhone'] → pass (DENY cấp trường của TS-02)", () => {
    const r = groupGrantCreateSchema.safeParse(validGrant);
    expect(r.success).toBe(true);
  });

  it("DENY + ALL + fieldMask rỗng → pass (DENY toàn action — AC2)", () => {
    const r = groupGrantCreateSchema.safeParse({ ...validGrant, fieldMask: [] });
    expect(r.success).toBe(true);
  });

  it("ALLOW + fieldMask khác rỗng → reject, lỗi nói rõ mask chỉ dành cho DENY", () => {
    const r = groupGrantCreateSchema.safeParse({ ...validGrant, effect: "ALLOW" });
    expect(r.success).toBe(false);
    expect(messagesOf(r)).toMatch(/DENY/);
  });

  it("ALLOW + fieldMask rỗng → pass (grant editor cấp cả ALLOW — SUPER_ADMIN only ở action)", () => {
    const r = groupGrantCreateSchema.safeParse({
      ...validGrant,
      effect: "ALLOW",
      fieldMask: [],
    });
    expect(r.success).toBe(true);
  });
});

describe("US-03 · groupGrantCreateSchema — dataScope P0 chỉ ALL | OWN", () => {
  for (const scope of ["UNIT_ONLY", "UNIT_AND_BELOW"] as const) {
    it(`dataScope ${scope} → reject với lỗi RÕ CHỮ nêu ALL/OWN (không phải enum error câm)`, () => {
      const r = groupGrantCreateSchema.safeParse({ ...validGrant, dataScope: scope });
      expect(r.success).toBe(false);
      // Lỗi phải tự giải thích được cho người cấp quyền: nêu 2 scope được phép.
      const msg = messagesOf(r);
      expect(msg).toMatch(/ALL/);
      expect(msg).toMatch(/OWN/);
    });
  }

  it("dataScope OWN → pass", () => {
    const r = groupGrantCreateSchema.safeParse({
      ...validGrant,
      dataScope: "OWN",
      fieldMask: [],
    });
    expect(r.success).toBe(true);
  });
});

describe("US-03 · groupGrantCreateSchema — reason bắt buộc (audit)", () => {
  it("thiếu reason → reject", () => {
    const { reason: _bo, ...khongReason } = validGrant;
    const r = groupGrantCreateSchema.safeParse(khongReason);
    expect(r.success).toBe(false);
  });

  it("reason rỗng/toàn khoảng trắng → reject", () => {
    expect(groupGrantCreateSchema.safeParse({ ...validGrant, reason: "" }).success).toBe(false);
    expect(groupGrantCreateSchema.safeParse({ ...validGrant, reason: "   " }).success).toBe(false);
  });
});

describe("US-03 · userGroupCreateSchema — name 1..100", () => {
  it("name hợp lệ (+description optional) → pass", () => {
    expect(userGroupCreateSchema.safeParse({ name: "Nhóm CSKH hè 2026" }).success).toBe(true);
    expect(
      userGroupCreateSchema.safeParse({
        name: "A".repeat(100),
        description: "grant ad-hoc không sửa vai chuẩn",
      }).success,
    ).toBe(true);
  });

  it("name rỗng / toàn khoảng trắng → reject", () => {
    expect(userGroupCreateSchema.safeParse({ name: "" }).success).toBe(false);
    expect(userGroupCreateSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("name quá 100 ký tự → reject", () => {
    expect(userGroupCreateSchema.safeParse({ name: "A".repeat(101) }).success).toBe(false);
  });
});
