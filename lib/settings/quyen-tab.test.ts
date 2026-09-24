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
  /**
   * SỔ TAB MỞ BẰNG QUYỀN RIÊNG — mỗi dòng là một quyết định đã ký, không phải một con số.
   *
   * ⚠️ Thêm dòng vào đây là NỚI QUYỀN. Ca này đỏ để bắt người thêm phải viết ra vì sao,
   * và người review đọc đúng một chỗ là thấy hết cửa đang mở.
   */
  const SO_TAB_QUYEN_RIENG: Readonly<Record<string, string>> = {
    // 24/09 — giao nick Zalo cho người: gác bằng `settings:view` là quản lý cơ sở KHÔNG
    // vào được, tức lấy lại đúng quyền vừa cấp cho họ.
    "nick-zalo": "zalocrm:manage-nick",
    // 22/09 (chủ dự án chốt) — trần số đợt / số ưu đãi thì Quản lý cơ sở tự chỉnh được.
    // KHÔNG nới `settings:view` cho họ: màn này có 100+ khoá gồm OTP, mẫu tin ZNS, khoá
    // VAPID, trần hoa hồng — nới nó là chữa một vấn đề bằng cách mở một vấn đề lớn hơn
    // (bài học `audit-logs:view`). Và GỠ `settings:view` khỏi vai này là quyết định CÓ
    // CHỮ KÝ 03/08/2026 (`lib/auth/rbac-intentional.ts`); quyền hẹp không đảo nó, nó mở
    // một cửa khác bên cạnh. Ghim ở `lib/settings/quyen-cau-hinh-co-so.test.ts`.
    tien: "settings:view-center",
  };

  it("KHÔNG tab nào mở bằng quyền riêng ngoài sổ trên", () => {
    // Ca này đỏ khi ai đó đổi quyền của một tab cấu hình toàn hệ thống sang thứ khác.
    // Đổi có chủ đích thì khai vào sổ — và chính việc phải khai là điểm của ca.
    const ngoai = Object.fromEntries(
      Object.entries(QUYEN_TAB).filter(([, q]) => q !== "settings:view"),
    );
    expect(ngoai).toEqual(SO_TAB_QUYEN_RIENG);
  });

  it("phần CÒN LẠI vẫn là `settings:view` — nới một tab không kéo theo tab nào", () => {
    // Vế đối chứng: ca trên một mình KHÔNG bắt được việc đổi HẾT các tab sang quyền hẹp
    // rồi khai đủ vào sổ. Ca này ghim số tab còn đóng.
    const conLai = Object.values(QUYEN_TAB).filter((q) => q === "settings:view");
    expect(conLai).toHaveLength(TAB_CAU_HINH.length - Object.keys(SO_TAB_QUYEN_RIENG).length);
  });
});
