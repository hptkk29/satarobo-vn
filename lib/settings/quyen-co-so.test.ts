// Ca [QCoSo-*] — AI SỬA ĐƯỢC CẤU HÌNH CỦA CƠ SỞ NÀO. Thuần, không DB.
//
// ⚠️ Luật này có HAI chỗ dùng và chúng phải KHÔNG ĐƯỢC LỆCH:
//   · cổng GHI      `setCenterSetting` / `clearCenterSetting` — từ chối ghi sai cơ sở;
//   · màn Cấu hình  `docCaiRiengTheoCoSo` — bày đúng cơ sở người ta sửa được.
//
// Lệch theo chiều màn bày THỪA thì không ai thấy cho tới lúc bấm Lưu: ô hiện ra MỞ, gõ số,
// bấm, rồi nhận "Không có quyền sửa cấu hình cơ sở này" (luật 12). Nên cả hai gọi cùng một
// hàm, và bộ này canh chính hàm ấy.
import { describe, it, expect } from "vitest";
import {
  laQuanLyCoSo,
  coSoSuaDuoc,
  trongPhamVi,
  VAI_QUAN_LY_CO_SO,
  type ActorCoSo,
} from "./quyen-co-so";

const CS1 = "ou_cs1";
const CS2 = "ou_cs2";
const HO = "ou_ho";

const qlCs1: ActorCoSo = {
  isSuperAdmin: false,
  orgRoles: [{ orgUnitId: CS1, roleCode: "CENTER_MANAGER" }],
};
const ketoanCs1: ActorCoSo = {
  isSuperAdmin: false,
  orgRoles: [{ orgUnitId: CS1, roleCode: "CENTER_ACCOUNTANT" }],
};
const superAdmin: ActorCoSo = { isSuperAdmin: true, orgRoles: [] };

describe("[QCoSo-01] quản lý cơ sở: ĐÚNG cơ sở mình, không hơn", () => {
  it("sửa được cơ sở mình", () => {
    expect(laQuanLyCoSo(qlCs1, CS1)).toBe(true);
  });

  it("KHÔNG sửa được cơ sở khác", () => {
    expect(laQuanLyCoSo(qlCs1, CS2)).toBe(false);
  });

  it("vai KHÁC tại cùng cơ sở thì không sửa được", () => {
    // Kế toán cơ sở đứng đúng chỗ nhưng không phải vai quản lý — đây là chỗ một phép kiểm
    // viết ẩu ("có vai nào tại cơ sở này không") sẽ sai.
    expect(laQuanLyCoSo(ketoanCs1, CS1)).toBe(false);
  });

  it("không vai nào thì không sửa được gì", () => {
    expect(laQuanLyCoSo({ isSuperAdmin: false, orgRoles: [] }, CS1)).toBe(false);
  });
});

describe("[QCoSo-02] vai neo tại HO KHÔNG kéo theo cơ sở con", () => {
  it("quản lý neo tại HO không sửa được cấu hình CS1", () => {
    // ⚠️ Đây là hành vi CÓ CHỦ ĐÍCH của `setCenterSetting` từ R6-A: so khớp CHÍNH XÁC
    // `orgUnitId`, không theo cây con. Đổi nó là NỚI QUYỀN, phải hỏi — nhất là sau lượt
    // 11/08 đảo hình cây, khi `getSubtreeCenterIds(HO)` bắt đầu trả đủ danh sách cơ sở.
    const qlHo: ActorCoSo = {
      isSuperAdmin: false,
      orgRoles: [{ orgUnitId: HO, roleCode: "CENTER_MANAGER" }],
    };
    expect(laQuanLyCoSo(qlHo, CS1)).toBe(false);
    expect(coSoSuaDuoc(qlHo)).toEqual([HO]);
  });
});

describe("[QCoSo-03] phạm vi — fail-closed, và `TAT_CA` là một GIÁ TRỊ", () => {
  it("Quản trị tối cao ⇒ `TAT_CA`", () => {
    expect(coSoSuaDuoc(superAdmin)).toBe("TAT_CA");
  });

  it("quản lý hai cơ sở (kiêm nhiệm) ⇒ đủ hai, không trùng", () => {
    const kiem: ActorCoSo = {
      isSuperAdmin: false,
      orgRoles: [
        { orgUnitId: CS1, roleCode: "CENTER_MANAGER" },
        { orgUnitId: CS2, roleCode: "CENTER_MANAGER" },
        // Vai thứ hai tại CS1 — kiêm nhiệm thật có hình dạng này, và một bản cài đặt quên
        // khử trùng sẽ trả CS1 hai lần rồi màn vẽ hai hàng cho cùng một cơ sở.
        { orgUnitId: CS1, roleCode: "SUPER_ADMIN" },
      ],
    };
    expect(coSoSuaDuoc(kiem)).toEqual([CS1, CS2]);
  });

  it("không quản lý cơ sở nào ⇒ `[]`, KHÔNG phải `TAT_CA`", () => {
    // Mặc định của SCOPE phải fail-closed. Rơi về "tất cả" ở đây là bày cấu hình mọi cơ sở
    // cho người không quản lý cơ sở nào — và nó trông y hệt lúc chạy đúng.
    expect(coSoSuaDuoc(ketoanCs1)).toEqual([]);
  });
});

describe("[QCoSo-04] `trongPhamVi` đọc đúng cả hai nhánh", () => {
  it("`TAT_CA` chứa mọi đơn vị", () => {
    expect(trongPhamVi("TAT_CA", CS2)).toBe(true);
  });

  it("danh sách chỉ chứa thứ trong nó", () => {
    expect(trongPhamVi([CS1], CS1)).toBe(true);
    expect(trongPhamVi([CS1], CS2)).toBe(false);
  });

  it("danh sách RỖNG không chứa gì — đối chứng của nhánh trên", () => {
    expect(trongPhamVi([], CS1)).toBe(false);
  });
});

describe("[QCoSo-05] danh sách vai là một quyết định, không phải chi tiết cài đặt", () => {
  it("đúng HAI vai sửa được cấu hình cơ sở", () => {
    // Thêm vai vào đây là cho thêm người đổi tham số TIỀN của một cơ sở (trần số đợt, trần
    // ưu đãi, làm tròn, hạn QR). Ca này đỏ để việc đó phải được viết ra, không làm tiện tay.
    expect([...VAI_QUAN_LY_CO_SO].sort()).toEqual(["CENTER_MANAGER", "SUPER_ADMIN"]);
  });
});
