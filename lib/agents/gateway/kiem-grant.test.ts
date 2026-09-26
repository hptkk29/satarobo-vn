// @vitest-environment node
import { describe, it, expect } from "vitest";
import { chonScopeChoToken, quyetDinhGoi, tachChuoiScope, type GrantVao } from "./kiem-grant";

const NOW = new Date("2026-09-25T09:00:00+07:00"); // mốc cố định (luật 19)
const MAI = new Date("2026-09-26T09:00:00+07:00");
const HOM_QUA = new Date("2026-09-24T09:00:00+07:00");
const TAT_CA = ["CS1", "CS2"];

function g(p: Partial<GrantVao> = {}): GrantVao {
  return {
    congCu: "kinh_doanh.lay_leads",
    cheDo: "doc",
    coSo: ["CS1"],
    xemDuLieuGoc: false,
    hanMucNgay: null,
    trangThai: "ACTIVE",
    hetHan: MAI,
    ...p,
  };
}

function goi(p: Partial<Parameters<typeof quyetDinhGoi>[0]> = {}) {
  return quyetDinhGoi({
    scopesToken: ["kinh_doanh.lay_leads:doc"],
    grants: [g()],
    congCu: "kinh_doanh.lay_leads",
    cheDo: "doc",
    coSoYeuCau: null,
    tatCaMaCoSo: TAT_CA,
    now: NOW,
    ...p,
  });
}

describe("[AG-GR-01] bước 9 — phạm vi cơ sở (ca B5, B6)", () => {
  it("B6: cấp CS1, không truyền co_so → chỉ CS1", () => {
    expect(goi()).toEqual({ ok: true, phamViCoSo: ["CS1"], xemDuLieuGoc: false, hanMucNgay: null });
  });
  it("B5: cấp CS1, gọi CS2 → NGOAI_PHAM_VI_CO_SO (không phải trả rỗng)", () => {
    expect(goi({ coSoYeuCau: ["CS2"] })).toEqual({ ok: false, ma: "NGOAI_PHAM_VI_CO_SO" });
  });
  it("xin một phần trong và một phần ngoài → từ chối CẢ yêu cầu", () => {
    expect(goi({ coSoYeuCau: ["CS1", "CS2"] })).toEqual({ ok: false, ma: "NGOAI_PHAM_VI_CO_SO" });
  });
  it("'HO' trong grant = nhìn toàn hệ thống (BA Q-N9)", () => {
    const kq = goi({ grants: [g({ coSo: ["HO"] })] });
    expect(kq).toEqual({ ok: true, phamViCoSo: ["CS1", "CS2", "HO"], xemDuLieuGoc: false, hanMucNgay: null });
    expect(goi({ grants: [g({ coSo: ["HO"] })], coSoYeuCau: ["CS2"] })).toMatchObject({ ok: true, phamViCoSo: ["CS2"] });
  });
  it("grant có danh sách cơ sở rỗng → từ chối, không trả rỗng", () => {
    expect(goi({ grants: [g({ coSo: [] })] })).toEqual({ ok: false, ma: "NGOAI_PHAM_VI_CO_SO" });
  });
  it("hai grant cùng công cụ → hợp phạm vi; hạn mức lấy số NHỎ nhất", () => {
    const kq = goi({ grants: [g({ coSo: ["CS1"], hanMucNgay: 500 }), g({ coSo: ["CS2"], hanMucNgay: 200 })] });
    expect(kq).toEqual({ ok: true, phamViCoSo: ["CS1", "CS2"], xemDuLieuGoc: false, hanMucNgay: 200 });
  });
});

describe("[AG-GR-02] bước 6 — scope token + grant còn hiệu lực (ca B4, X4)", () => {
  it("B4: token không có scope công cụ này → 404 CONG_CU_KHONG_TON_TAI", () => {
    expect(goi({ scopesToken: ["danh_muc.lay_co_so:doc"] })).toEqual({ ok: false, ma: "CONG_CU_KHONG_TON_TAI" });
  });
  it("[AG-GR-02b] token còn sống nhưng grant đã THU HỒI → từ chối (scope token chỉ là trần trên)", () => {
    expect(goi({ grants: [g({ trangThai: "REVOKED" })] })).toEqual({ ok: false, ma: "CONG_CU_KHONG_TON_TAI" });
  });
  it("[AG-GR-02c] grant hết hạn 1 giây trước → từ chối, KHÔNG cần cron nào đổi trạng thái (luật cứng #8)", () => {
    const vuaHet = new Date(NOW.getTime() - 1000);
    expect(goi({ grants: [g({ hetHan: vuaHet, trangThai: "ACTIVE" })] })).toEqual({ ok: false, ma: "CONG_CU_KHONG_TON_TAI" });
  });
  it("hết hạn ĐÚNG thời điểm now → coi như hết (so chặt `>`)", () => {
    expect(goi({ grants: [g({ hetHan: NOW })] })).toEqual({ ok: false, ma: "CONG_CU_KHONG_TON_TAI" });
  });
  it("grant chờ duyệt / tạm khoá / bị từ chối → không có hiệu lực", () => {
    for (const trangThai of ["PENDING", "SUSPENDED", "REJECTED"]) {
      expect(goi({ grants: [g({ trangThai })] })).toMatchObject({ ok: false });
    }
  });
  it("có grant nhưng token KHÔNG mang scope (xin hẹp lúc cấp) → 404", () => {
    expect(goi({ scopesToken: [] })).toEqual({ ok: false, ma: "CONG_CU_KHONG_TON_TAI" });
  });
  it("biết công cụ ở chế độ đọc nhưng gọi chế độ ghi → 403 KHONG_DU_QUYEN", () => {
    expect(goi({ cheDo: "ghi_nhap" })).toEqual({ ok: false, ma: "KHONG_DU_QUYEN" });
  });
  it("grant của công cụ KHÁC không mở công cụ này", () => {
    expect(goi({ grants: [g({ congCu: "danh_muc.lay_co_so" })] })).toEqual({ ok: false, ma: "CONG_CU_KHONG_TON_TAI" });
  });
  it("xem dữ liệu gốc chỉ bật khi grant CÒN HIỆU LỰC có cờ đó", () => {
    expect(goi({ grants: [g({ xemDuLieuGoc: true })] })).toMatchObject({ ok: true, xemDuLieuGoc: true });
    expect(goi({ grants: [g(), g({ xemDuLieuGoc: true, hetHan: HOM_QUA })] })).toMatchObject({ ok: true, xemDuLieuGoc: false });
  });
});

describe("[AG-GR-03] chọn scope cho token mới (spec §4.2)", () => {
  const grants = [g(), g({ congCu: "danh_muc.lay_co_so" }), g({ congCu: "marketing.lay_chi_phi_ads", trangThai: "REVOKED" })];
  it("không xin gì → mọi scope đang được cấp (bỏ grant đã thu hồi)", () => {
    expect(chonScopeChoToken([], grants, NOW)).toEqual({
      ok: true,
      scopes: ["danh_muc.lay_co_so:doc", "kinh_doanh.lay_leads:doc"],
    });
  });
  it("xin hẹp hơn → đúng phần xin", () => {
    expect(chonScopeChoToken(["danh_muc.lay_co_so:doc"], grants, NOW)).toEqual({ ok: true, scopes: ["danh_muc.lay_co_so:doc"] });
  });
  it("xin quá quyền → từ chối cả yêu cầu, liệt kê phần thừa (không âm thầm cắt bớt)", () => {
    expect(chonScopeChoToken(["danh_muc.lay_co_so:doc", "marketing.lay_chi_phi_ads:doc"], grants, NOW)).toEqual({
      ok: false,
      thua: ["marketing.lay_chi_phi_ads:doc"],
    });
  });
  it("không có grant nào còn hiệu lực → từ chối", () => {
    expect(chonScopeChoToken([], [g({ hetHan: HOM_QUA })], NOW)).toEqual({ ok: false, thua: [] });
  });
});

describe("[AG-GR-04] tách chuỗi scope", () => {
  it("tách theo khoảng trắng, bỏ trùng", () => {
    expect(tachChuoiScope("a.b:doc  c.d:doc a.b:doc")).toEqual(["a.b:doc", "c.d:doc"]);
    expect(tachChuoiScope("")).toEqual([]);
    expect(tachChuoiScope(null)).toEqual([]);
  });
  it("phần tử sai khuôn hoặc chế độ lạ → null (từ chối cả chuỗi)", () => {
    expect(tachChuoiScope("a.b:doc *:doc")).toBeNull();
    expect(tachChuoiScope("a.b:xoa")).toBeNull();
    expect(tachChuoiScope("a.b")).toBeNull();
  });
});
