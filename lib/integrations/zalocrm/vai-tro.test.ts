// lib/integrations/zalocrm/vai-tro.test.ts — S1 · ánh xạ vai Sata → vai ZaloCRM.
//
// Vì sao bảng ánh xạ này phải có test riêng dù chỉ là một `Record`: nó là thứ quyết
// định người mở màn Zalo CRM bước vào fork với tư cách `admin` (đọc mọi hội thoại của
// org) hay `member` (chỉ nick mình). Sai một dòng ở đây thì Sata KHÔNG báo lỗi gì —
// cửa mở ra bên kia mới rộng ra, và bên kia không có lưới nào của repo này canh.
import { describe, it, expect } from "vitest";
import { maVaiCuaNguoiDung, vaiZaloCrm, VAI_ZALOCRM } from "./vai-tro";

describe("[ZC-SSO-07] ánh xạ vai Sata → vai ZaloCRM", () => {
  it("SUPER_ADMIN / CENTER_MANAGER / CENTER_CLASS_MANAGER ⇒ 'admin'", () => {
    expect(vaiZaloCrm(["SUPER_ADMIN"])).toBe("admin");
    expect(vaiZaloCrm(["CENTER_MANAGER"])).toBe("admin");
    expect(vaiZaloCrm(["CENTER_CLASS_MANAGER"])).toBe("admin");
  });

  it("Sale ⇒ 'member' — cả mã v1 (SALES_CSM) lẫn mã v2 (CENTER_SALES_CSM)", () => {
    // Hai hệ tên chạy song song: `User.role` là enum `Role` (v1, SALES_CSM), còn
    // `UserOrgRole.role.code` là RoleDef (v2, CENTER_SALES_CSM). Máy local chạy v1,
    // prod chạy v2 — khai thiếu một vế là Sale vào được ở một môi trường và bị từ chối
    // ở môi trường kia, đúng loại lệch không tái hiện được.
    expect(vaiZaloCrm(["SALES_CSM"])).toBe("member");
    expect(vaiZaloCrm(["CENTER_SALES_CSM"])).toBe("member");
  });

  it("vai khác ⇒ null (fail-closed: KHÔNG ký token)", () => {
    for (const ma of [
      "TEACHER",
      "ASSISTANT_TEACHER",
      "CENTER_ACCOUNTANT",
      "HO_ACCOUNTANT",
      "HO_HR",
      "CENTER_HR",
      "HO_MARKETING",
      "HO_SALE", // chốt 9.7 — Hội sở KHÔNG dùng trục Zalo cá nhân
      "TRAINING",
      "AUDITOR",
      "PARENT",
      "VAI_KHONG_TON_TAI",
    ]) {
      expect(vaiZaloCrm([ma]), `${ma} không được ánh xạ sang vai ZaloCRM`).toBeNull();
    }
    expect(vaiZaloCrm([])).toBeNull();
  });

  it("'admin' THẮNG khi giữ nhiều vai cùng lúc — không phụ thuộc thứ tự mảng", () => {
    // Kiêm nhiệm là chuyện thật (QLCS kiêm tư vấn). Lấy vai đầu tiên khớp thì kết quả
    // đổi theo thứ tự dòng `UserOrgRole` trong DB — tức cùng một người, hai lần mở
    // trang ra hai quyền khác nhau.
    expect(vaiZaloCrm(["CENTER_SALES_CSM", "CENTER_MANAGER"])).toBe("admin");
    expect(vaiZaloCrm(["CENTER_MANAGER", "CENTER_SALES_CSM"])).toBe("admin");
  });

  it("bảng chỉ có đúng hai giá trị đích — 'owner' của fork KHÔNG bao giờ được cấp", () => {
    // Fork có vai `owner` (toàn quyền tổ chức, đổi được cấu hình + xoá org). Sata không
    // ánh xạ ai sang đó: chủ tổ chức bên fork do người vận hành tạo tay một lần.
    expect(new Set(Object.values(VAI_ZALOCRM))).toEqual(new Set(["admin", "member"]));
  });

  it("mã vai rỗng / null / trùng lặp không làm lệch kết quả", () => {
    expect(vaiZaloCrm(["", "  ", "SALES_CSM", "SALES_CSM"])).toBe("member");
    expect(vaiZaloCrm(["", "   "])).toBeNull();
  });
});

describe("[ZC-SSO-08] maVaiCuaNguoiDung — gom mã vai từ CẢ HAI hệ (v1 session + v2 actor)", () => {
  it("gộp User.role, User.roles[] và orgRoles[].roleCode, bỏ trùng", () => {
    const ma = maVaiCuaNguoiDung({
      role: "SALES_CSM",
      roles: ["SALES_CSM", "TEACHER"],
      orgRoles: [{ roleCode: "CENTER_SALES_CSM" }, { roleCode: "CENTER_SALES_CSM" }],
    });
    expect(new Set(ma)).toEqual(new Set(["SALES_CSM", "TEACHER", "CENTER_SALES_CSM"]));
  });

  it("thiếu trường nào cũng không ném — Actor dựng tay hay thiếu orgRoles", () => {
    expect(maVaiCuaNguoiDung({})).toEqual([]);
    expect(maVaiCuaNguoiDung({ role: null, roles: null, orgRoles: null })).toEqual([]);
    expect(maVaiCuaNguoiDung({ role: "SUPER_ADMIN" })).toEqual(["SUPER_ADMIN"]);
  });

  it("người chỉ có vai ở DB (v2) vẫn ra vai ZaloCRM đúng dù session.role là vai khác", () => {
    // Ca thật: tài khoản gốc mang `role = SALES_CSM` nhưng được nâng lên QLCS bằng
    // `UserOrgRole`. Đọc mỗi session là cấp nhầm `member` cho một quản lý cơ sở.
    const ma = maVaiCuaNguoiDung({
      role: "SALES_CSM",
      orgRoles: [{ roleCode: "CENTER_MANAGER" }],
    });
    expect(vaiZaloCrm(ma)).toBe("admin");
  });
});
