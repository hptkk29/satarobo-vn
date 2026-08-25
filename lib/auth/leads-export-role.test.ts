/**
 * A-03-3 / [L-A7] — `leads:export` KHÔNG đến từ bất kỳ vai nào, nhưng KHOÁ vẫn ở lại.
 *
 * Hai vế phải đi cùng nhau, và mỗi vế hỏng theo một kiểu khác nhau:
 *
 * - **Vế "không vai nào có"**: nếu còn một vai thường giữ khoá này thì việc bật/tắt quyền
 *   xuất cho từng quản lý (A-03-1, làm qua nhóm `/admin/user-groups`) trở thành trang trí —
 *   người đó vẫn xuất được nhờ vai.
 * - **Vế "khoá vẫn ở lại"**: `ALL_ACTIONS = Object.keys(PERMISSIONS)` → `ACTION_REGISTRY`
 *   → `buildActor` lọc grant theo `validActions` (`lib/auth/actor.ts:367-371`). Xoá khoá =
 *   **mọi grant mang khoá đó bị vứt IM LẶNG**, đúng lớp sự cố 114 tài khoản PARENT. Thêm
 *   nữa `lib/validators/permission-grant.ts:6` dùng `z.enum(ALL_ACTIONS)` ⇒ khoá biến mất
 *   khỏi cả dropdown lẫn Zod, còn `PermissionGrant.permissionKey` là FK `onDelete: Restrict`.
 *
 * ⚠️ **`SUPER_ADMIN` cố ý ở lại trong ma trận v1** — và điều đó KHÔNG mâu thuẫn với
 * "không đến từ vai": ma trận v1 phải phủ SUPER_ADMIN cho MỌI action để khớp nhánh bypass
 * của `can()` v2 (`lib/auth/permissions.test.ts:313-318` ghim điều này; v1 tại `:781` là
 * tra bảng thuần, KHÔNG có bypass). Nhóm được xuất theo quyết định 24/08 vốn là
 * **CENTER_MANAGER + SUPER_ADMIN**, trong đó CENTER_MANAGER nhận qua NHÓM chứ không qua vai.
 * Đặt `[]` ở đây sẽ làm đỏ 2 test đang xanh và không đổi được gì về mặt an toàn.
 */
import { describe, it, expect } from "vitest";
import { PERMISSIONS, ALL_ACTIONS } from "@/lib/auth/permissions";
import { ACTION_REGISTRY } from "@/lib/auth/action-registry";
import { ROLE_SEED } from "../../prisma/seed-roles";

const KHOA = "leads:export";

describe("[A-03-3 · L-A7] leads:export — ma trận v1", () => {
  it("không vai THƯỜNG nào giữ (chỉ còn SUPER_ADMIN, vốn bypass mọi thứ ở v2)", () => {
    const vaiThuong = PERMISSIONS[KHOA].filter((r) => r !== "SUPER_ADMIN");
    expect(vaiThuong).toEqual([]);
  });

  it("CENTER_MANAGER / MARKETING không còn tự có quyền xuất từ vai", () => {
    expect(PERMISSIONS[KHOA]).not.toContain("CENTER_MANAGER");
    expect(PERMISSIONS[KHOA]).not.toContain("MARKETING");
  });

  it("KHOÁ vẫn ở lại PERMISSIONS / ALL_ACTIONS / ACTION_REGISTRY (xoá = vứt grant im lặng)", () => {
    expect(Object.keys(PERMISSIONS)).toContain(KHOA);
    expect(ALL_ACTIONS).toContain(KHOA);
    expect(ACTION_REGISTRY).toContain(KHOA);
  });
});

describe("[A-03-3 · L-A7] leads:export — seed RoleDef (v2, thứ prod enforce)", () => {
  it("KHÔNG RoleDef nào còn khai leads:export (kể cả HO_MARKETING và CENTER_MANAGER)", () => {
    const conGiu = ROLE_SEED.filter((r) => r.perms.some((p) => p.action === KHOA)).map((r) => r.code);
    expect(conGiu).toEqual([]);
  });

  it("mốc đối chứng: seed vẫn còn các khoá lead KHÁC (không phải xoá nhầm cả cụm)", () => {
    const coViewAll = ROLE_SEED.filter((r) => r.perms.some((p) => p.action === "leads:view-all"));
    expect(coViewAll.length).toBeGreaterThan(0);
  });
});

/**
 * OQ-7 (chốt 24/08/2026, PRD §6.10) — mở `roles:assign` cho Nhân sự Hội sở.
 *
 * 🔴 Đây là quyền CẤP QUYỀN. Seed nó mà chưa có 3 rào R1/R2/R3 trong
 * `lib/auth/rbac-service.ts` thì HR tự gán được cho chính mình gần như mọi vai.
 * Test này chỉ ghim phần seed; rào nằm ở file khác và phải lên CÙNG đợt.
 */
describe("[§6.10 · OQ-7] HO_HR có roles:assign", () => {
  const hoHr = ROLE_SEED.find((r) => r.code === "HO_HR");

  it("RoleDef HO_HR tồn tại", () => {
    expect(hoHr).toBeDefined();
  });

  it("HO_HR mang roles:assign, scope GLOBAL (call-site gọi trần — scope hẹp = khoá trang)", () => {
    const p = hoHr?.perms.find((x) => x.action === "roles:assign");
    expect(p).toBeDefined();
    // `app/(admin)/admin/users/[id]/org-roles/page.tsx:20` gọi checkPermission("roles:assign")
    // KHÔNG truyền target ⇒ scope non-GLOBAL luôn trả false (lib/auth/rbac-scope.test.ts).
    expect(p?.scopeType).toBe("GLOBAL");
  });

  it("KHÔNG nới thêm cho vai khác: chỉ SUPER_ADMIN và HO_HR giữ roles:assign", () => {
    const co = ROLE_SEED.filter((r) => r.perms.some((p) => p.action === "roles:assign")).map((r) => r.code);
    expect([...co].sort()).toEqual(["HO_HR", "SUPER_ADMIN"]);
  });

  it("HO_HR KHÔNG kèm roles:manage (tạo/sửa định nghĩa vai vẫn chỉ SUPER_ADMIN)", () => {
    expect(hoHr?.perms.some((p) => p.action === "roles:manage")).toBe(false);
  });
});
