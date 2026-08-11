/**
 * Bất biến KHO ẢNH LỚP (chủ dự án chốt 11/08):
 *   Marketing + Giáo vụ GÓP ảnh vào kho của lớp — GIÁO VIÊN mới là người chọn ảnh
 *   trong kho gửi cho phụ huynh.
 *
 * Vì sao khoá bằng test: cả hai chiều đều là lỗi im lặng.
 *   thiếu `media:upload-draft` → 2 vai kia không đưa được ảnh vào kho (đúng hiện
 *     trạng trước 11/08: 0 dòng media:* nào cho HO_MARKETING/CENTER_CLASS_MANAGER);
 *   thừa `media:upload`/`media:approve` → ảnh của họ đi THẲNG tới phụ huynh, mất
 *     hẳn bước giáo viên kiểm — đúng thứ yêu cầu này sinh ra để tránh.
 * Ranh giới thi hành ở app/(admin)/admin/media/actions.ts (canStageToClass vs
 * canPublishToClass); test này khoá phần CẤP QUYỀN mà hai hàm đó dựa vào.
 */
import { describe, it, expect } from "vitest";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { PAGE_GATES } from "@/lib/auth/page-gates";
import { ROLE_SEED } from "../../prisma/seed-roles";

/** action → scopeType của 1 RoleDef trong seed v2. */
function permsOf(code: string): Map<string, string> {
  const role = ROLE_SEED.find((r) => r.code === code);
  expect(role, `seed-roles.ts phải có RoleDef "${code}"`).toBeDefined();
  return new Map(role!.perms.map((p) => [p.action, p.scopeType]));
}

const VAI_GOP_ANH = ["HO_MARKETING", "CENTER_CLASS_MANAGER"] as const;

describe("kho ảnh lớp — vai chỉ-góp-ảnh (v2 seed)", () => {
  it.each(VAI_GOP_ANH)(
    "%s: đưa được ảnh vào kho, KHÔNG đăng thẳng tới PH, KHÔNG duyệt",
    (code) => {
      const p = permsOf(code);
      // GLOBAL là bắt buộc với media:view — nó là action gác trang /media, mà cổng
      // cấp trang gọi checkAnyPermission KHÔNG kèm target nên scope CENTER trả false.
      expect(p.get("media:view")).toBe("GLOBAL");
      expect(p.get("media:upload-draft")).toBe("GLOBAL");
      expect(p.has("media:upload")).toBe(false);
      expect(p.has("media:approve")).toBe(false);
    },
  );

  it("vai góp ảnh vào được trang /media (menu ≡ gate)", () => {
    for (const code of VAI_GOP_ANH) {
      const p = permsOf(code);
      expect(
        PAGE_GATES["/media"].some((a) => p.get(a) === "GLOBAL"),
        `${code} phải giữ ít nhất 1 action GLOBAL trong PAGE_GATES["/media"]`,
      ).toBe(true);
    }
  });

  it("GIÁO VIÊN không được cấp media:upload-draft", () => {
    // GV đã vào kho được qua đường "phụ trách lớp" (teacherId/assistantId) trong
    // canPublishToClass. Cấp thêm action này = nới GV ra MỌI lớp cùng cơ sở.
    expect(permsOf("TEACHER").has("media:upload-draft")).toBe(false);
    expect(PERMISSIONS["media:upload-draft"]).not.toContain("TEACHER");
  });

  it("ĐÓNG TẬP: đúng 2 RoleDef giữ media:upload-draft", () => {
    // Assert theo TẬP chứ không theo từng vai — cấp nhầm cho vai thứ ba (vd
    // CENTER_SALES_CSM) sẽ đỏ ở đây thay vì lọt im lặng lên prod.
    const holders = ROLE_SEED.filter((r) =>
      r.perms.some((p) => p.action === "media:upload-draft"),
    ).map((r) => r.code);
    expect(holders.sort()).toEqual(["CENTER_CLASS_MANAGER", "HO_MARKETING"]);
  });
});

describe("kho ảnh lớp — ma trận v1 (đang chạy ở local/dev)", () => {
  it("MARKETING: góp ảnh + xem thư viện, không đăng thẳng, không duyệt", () => {
    expect([...PERMISSIONS["media:upload-draft"]].sort()).toEqual([
      "MARKETING",
      "SUPER_ADMIN",
    ]);
    expect(PERMISSIONS["media:view"]).toContain("MARKETING");
    expect(PERMISSIONS["media:upload"]).not.toContain("MARKETING");
    expect(PERMISSIONS["media:approve"]).not.toContain("MARKETING");
  });

  it("người duyệt ảnh vẫn là SUPER_ADMIN + quản lý cơ sở", () => {
    expect([...PERMISSIONS["media:approve"]].sort()).toEqual([
      "CENTER_MANAGER",
      "SUPER_ADMIN",
    ]);
  });
});
