// Ca [QT-*] — QUYỀN MỞ TỪNG TAB của màn Cấu hình vận hành.
//
// 🔴 VÌ SAO CÓ: trước 24/09 cả màn gác bằng đúng `settings:view`, mà quyền đó chỉ Quản
// trị tối cao có — ma trận v1 khai `["SUPER_ADMIN"]`, và `seed-roles.ts` KHÔNG có dòng
// nào cấp nó, nên trên prod (RBAC v2 đọc từ DB) không vai nào khác mở được. Chủ dự án
// chốt quản lý cơ sở phải vào được NHỮNG PHẦN THUỘC CƠ SỞ, nên mỗi tab nay một quyền.
//
// Cái dễ hỏng CÂM ở đây: thêm tab mới mà quên khai quyền. `Record` ĐỦ khiến `tsc` bắt
// được, nhưng `tsc` không bắt được việc khai NHẦM một quyền quá rộng — đó là việc của
// ca [QT-03].
import { describe, expect, it } from "vitest";
import { TAB_CAU_HINH, QUYEN_TAB, type TabId } from "./nhan-van-hanh";

describe("[QT-01] mọi tab đều khai quyền, không tab nào rơi ra ngoài", () => {
  it("số khoá của bảng quyền bằng đúng số tab", () => {
    expect(Object.keys(QUYEN_TAB).sort()).toEqual([...TAB_CAU_HINH].map((t) => t.id).sort());
  });

  it("không khoá nào rỗng", () => {
    for (const [id, q] of Object.entries(QUYEN_TAB)) {
      expect(q, `tab ${id} khai quyền rỗng`).toBeTruthy();
    }
  });
});

describe("[QT-02] tab Nick Zalo CRM mở bằng quyền RIÊNG, không phải settings:view", () => {
  it("dùng `zalocrm:manage-nick`", () => {
    // Đây là cả lý do đợt này tồn tại: gác bằng `settings:view` là quản lý cơ sở KHÔNG
    // vào được, tức lấy lại đúng quyền vừa cấp cho họ.
    expect(QUYEN_TAB["nick-zalo" as TabId]).toBe("zalocrm:manage-nick");
  });

  it("tab này CÓ trong danh sách tab", () => {
    expect([...TAB_CAU_HINH].map((t) => t.id)).toContain("nick-zalo");
  });
});

describe("[QT-03] nới quyền một tab KHÔNG được kéo theo tab khác", () => {
  it("đúng MỘT tab dùng quyền ngoài `settings:view`", () => {
    // Ca này đỏ khi ai đó đổi quyền của một tab cấu hình toàn hệ thống sang thứ rộng hơn.
    // Đổi có chủ đích thì sửa con số ở đây — và chính việc phải sửa nó là điểm của ca.
    const ngoai = Object.entries(QUYEN_TAB).filter(([, q]) => q !== "settings:view");
    expect(ngoai.map(([id]) => id)).toEqual(["nick-zalo"]);
  });
});
