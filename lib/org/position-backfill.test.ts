/**
 * TS-12 (phần THUẦN) — US-11: hồ sơ nhân sự → Vị trí + Phân công.
 *
 * Thứ đáng test ở đây KHÔNG phải "có ghi được vào DB không" mà là **luật không đoán**:
 * ai vào danh sách chờ xử lý tay, ai không, và vì sao. Đó là logic thuần, nên test thuần.
 */
import { describe, it, expect } from "vitest";
import {
  chuanHoaChucDanh,
  inBanDoiChieu,
  khoaViTri,
  lapKeHoach,
  type HoSoNhanSu,
} from "@/lib/org/position-backfill";

const NGAY_CHAY = new Date("2026-08-11T00:00:00.000Z");
const ORG = new Set(["cs1", "cs2", "dt"]);
const CENTER_TO_ORG = new Map([
  ["co-so-nguyen-huu-tho", "cs1"],
  ["co-so-hoang-dieu", "cs2"],
]);

function ns(over: Partial<HoSoNhanSu> & { employeeCode: string }): HoSoNhanSu {
  return {
    id: `id-${over.employeeCode}`,
    fullName: `Người ${over.employeeCode}`,
    jobTitle: "Giáo viên",
    orgUnitId: "cs1",
    centerId: null,
    joinedAt: new Date("2025-03-01T00:00:00.000Z"),
    userId: `u-${over.employeeCode}`,
    ...over,
  };
}

const lap = (nhanSu: HoSoNhanSu[], extra: Partial<Parameters<typeof lapKeHoach>[0]> = {}) =>
  lapKeHoach({
    nhanSu,
    orgUnitIds: ORG,
    centerToOrg: CENTER_TO_ORG,
    ngayChay: NGAY_CHAY,
    ...extra,
  });

describe("[US-11] lapKeHoach — đường thuận", () => {
  it("hai người CÙNG chức danh + CÙNG đơn vị ⇒ MỘT vị trí, hai phân công", () => {
    const kh = lap([ns({ employeeCode: "A1" }), ns({ employeeCode: "A2" })]);
    expect(kh.viTri).toHaveLength(1);
    expect(kh.viTri[0].nguoiGiu).toEqual(["A1", "A2"]);
    expect(kh.phanCong).toHaveLength(2);
    expect(kh.choXuLyTay).toEqual([]);
  });

  it("cùng chức danh nhưng KHÁC đơn vị ⇒ HAI vị trí (vị trí thuộc về đơn vị)", () => {
    const kh = lap([
      ns({ employeeCode: "A1", orgUnitId: "cs1" }),
      ns({ employeeCode: "A2", orgUnitId: "cs2" }),
    ]);
    expect(kh.viTri).toHaveLength(2);
  });

  it("chức danh lệch khoảng trắng/hoa-thường ⇒ vẫn là MỘT vị trí", () => {
    const kh = lap([
      ns({ employeeCode: "A1", jobTitle: "Giáo viên" }),
      ns({ employeeCode: "A2", jobTitle: "  giáo   VIÊN " }),
    ]);
    expect(kh.viTri).toHaveLength(1);
    // Tên hiển thị lấy bản gặp TRƯỚC (đã sắp theo mã NS) — không phải bản viết hoa lung tung.
    expect(kh.viTri[0].title).toBe("Giáo viên");
  });

  it("hồ sơ chỉ có centerId ⇒ bắc cầu sang OrgUnit, KHÔNG vào danh sách chờ", () => {
    const kh = lap([
      ns({ employeeCode: "A1", orgUnitId: null, centerId: "co-so-hoang-dieu" }),
    ]);
    expect(kh.choXuLyTay).toEqual([]);
    expect(kh.viTri[0].orgUnitId).toBe("cs2");
  });

  it("bản kế hoạch ỔN ĐỊNH giữa hai lần chạy (người duyệt so được hai bản)", () => {
    const a = lap([ns({ employeeCode: "B2" }), ns({ employeeCode: "A1" })]);
    const b = lap([ns({ employeeCode: "A1" }), ns({ employeeCode: "B2" })]);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("[US-11 AC3] KHÔNG ĐOÁN — ai rơi vào danh sách chờ xử lý tay", () => {
  it("không cơ sở, không đơn vị ⇒ chờ tay, và KHÔNG bị nhét vào đơn vị nào", () => {
    const kh = lap([ns({ employeeCode: "A1", orgUnitId: null, centerId: null })]);
    expect(kh.choXuLyTay).toHaveLength(1);
    expect(kh.choXuLyTay[0].lyDo).toBe("THIEU_DON_VI");
    expect(kh.viTri).toEqual([]);
    expect(kh.phanCong).toEqual([]);
  });

  it("centerId không ánh xạ được ⇒ chờ tay, nêu ĐÚNG mã center không khớp", () => {
    const kh = lap([ns({ employeeCode: "A1", orgUnitId: null, centerId: "co-so-la" })]);
    expect(kh.choXuLyTay[0].lyDo).toBe("THIEU_DON_VI");
    expect(kh.choXuLyTay[0].chiTiet).toContain("co-so-la");
  });

  it("orgUnitId trỏ đơn vị đã xoá ⇒ chờ tay (KHÁC với thiếu đơn vị — lý do riêng)", () => {
    const kh = lap([ns({ employeeCode: "A1", orgUnitId: "da-xoa" })]);
    expect(kh.choXuLyTay[0].lyDo).toBe("DON_VI_KHONG_TON_TAI");
  });

  it("chức danh rỗng / chỉ khoảng trắng ⇒ chờ tay, không lấy phòng ban làm tên vị trí", () => {
    for (const jobTitle of ["", "   ", null]) {
      const kh = lap([ns({ employeeCode: "A1", jobTitle })]);
      expect(kh.choXuLyTay[0].lyDo).toBe("THIEU_CHUC_DANH");
      expect(kh.viTri).toEqual([]);
    }
  });

  it("chưa có tài khoản ⇒ VỊ TRÍ vẫn tạo, PHÂN CÔNG thì không (không có ai để gán)", () => {
    const kh = lap([ns({ employeeCode: "A1", userId: null })]);
    expect(kh.viTri).toHaveLength(1);
    expect(kh.phanCong).toEqual([]);
    expect(kh.choXuLyTay[0].lyDo).toBe("THIEU_TAI_KHOAN");
  });
});

describe("[US-11] ngày hiệu lực", () => {
  it("joinedAt hợp lệ ⇒ dùng đúng ngày đó", () => {
    const kh = lap([ns({ employeeCode: "A1", joinedAt: new Date("2025-03-01T00:00:00.000Z") })]);
    expect(kh.phanCong[0].effectiveFrom.toISOString().slice(0, 10)).toBe("2025-03-01");
    expect(kh.phanCong[0].ngayVaoLamKhongDungDuoc).toBe(false);
  });

  it("joinedAt = epoch 1970 (rác import cũ) ⇒ lấy ngày chạy VÀ đánh cờ để bản đối chiếu nói ra", () => {
    // Dữ liệu thật có hồ sơ mang 1970-01-01. Ghi thẳng vào sổ tổ chức là bịa một sự thật.
    const kh = lap([ns({ employeeCode: "A1", joinedAt: new Date("1970-01-01T00:00:00.000Z") })]);
    expect(kh.phanCong[0].effectiveFrom).toEqual(NGAY_CHAY);
    expect(kh.phanCong[0].ngayVaoLamKhongDungDuoc).toBe(true);
  });

  it("joinedAt trống hoặc ở TƯƠNG LAI ⇒ cũng lấy ngày chạy", () => {
    for (const joinedAt of [null, new Date("2030-01-01T00:00:00.000Z")]) {
      const kh = lap([ns({ employeeCode: "A1", joinedAt })]);
      expect(kh.phanCong[0].effectiveFrom).toEqual(NGAY_CHAY);
      expect(kh.phanCong[0].ngayVaoLamKhongDungDuoc).toBe(true);
    }
  });
});

describe("[US-11] bộ vai — backfill KHÔNG được tự phát quyền", () => {
  const vaiDangGiu = [
    { userId: "u-A1", orgUnitId: "cs1", roleId: "r-teacher", roleCode: "TEACHER" },
    // Vai ở đơn vị KHÁC — không được kéo theo.
    { userId: "u-A1", orgUnitId: "cs2", roleId: "r-cm", roleCode: "CENTER_MANAGER" },
  ];

  it("mặc định: vị trí KHÔNG mang vai nào", () => {
    const kh = lap([ns({ employeeCode: "A1" })], { vaiDangGiu });
    expect(kh.viTri[0].roleIds).toEqual([]);
  });

  it("--gan-vai: chỉ lấy vai người đó ĐANG giữ TẠI CHÍNH đơn vị đó (giao, không phải hợp)", () => {
    const kh = lap([ns({ employeeCode: "A1", orgUnitId: "cs1" })], {
      vaiDangGiu,
      ganVai: true,
    });
    expect(kh.viTri[0].roleIds).toEqual(["r-teacher"]);
  });

  it("--gan-vai: hai người cùng vị trí ⇒ bộ vai là HỢP của họ, không nhân bản", () => {
    const kh = lap([ns({ employeeCode: "A1" }), ns({ employeeCode: "A2" })], {
      ganVai: true,
      vaiDangGiu: [
        { userId: "u-A1", orgUnitId: "cs1", roleId: "r-teacher", roleCode: "TEACHER" },
        { userId: "u-A2", orgUnitId: "cs1", roleId: "r-teacher", roleCode: "TEACHER" },
        { userId: "u-A2", orgUnitId: "cs1", roleId: "r-train", roleCode: "TRAINING" },
      ],
    });
    expect(kh.viTri[0].roleIds.sort()).toEqual(["r-teacher", "r-train"]);
  });
});

describe("[US-11 AC2] bản đối chiếu — duyệt được bằng mắt", () => {
  const kh = lap([
    ns({ employeeCode: "A1" }),
    ns({ employeeCode: "A2", orgUnitId: null, centerId: null }),
    ns({ employeeCode: "A3", joinedAt: new Date("1970-01-01T00:00:00.000Z") }),
  ]);
  const md = inBanDoiChieu(kh, {
    tenDonVi: new Map([["cs1", "CS1 · Cơ sở 1"]]),
    ganVai: false,
  });

  it("liệt kê TỪNG NGƯỜI, không chỉ số tổng", () => {
    expect(md).toContain("A1");
    expect(md).toContain("A2");
    expect(md).toContain("A3");
    expect(md).toContain("CS1 · Cơ sở 1");
  });

  it("người thiếu dữ liệu nằm ở mục riêng, kèm lý do", () => {
    expect(md).toContain("Chờ xử lý tay");
    expect(md).toContain("Thiếu đơn vị");
  });

  it("cảnh báo ngày vào làm không dùng được hiện ra ngay trên dòng đó", () => {
    const dong = md.split("\n").find((l) => l.startsWith("| A3 "));
    expect(dong).toContain("⚠️");
  });

  it("nói rõ có gắn vai hay không — người duyệt phải biết bản này có phát quyền không", () => {
    expect(md).toContain("**KHÔNG gắn**");
    expect(
      inBanDoiChieu(kh, { tenDonVi: new Map(), ganVai: true }),
    ).toContain("**CÓ gắn**");
  });
});

describe("[US-11] tiện ích", () => {
  it("chuanHoaChucDanh gộp khoảng trắng + trim", () => {
    expect(chuanHoaChucDanh("  Giáo   viên \n robot ")).toBe("Giáo viên robot");
    expect(chuanHoaChucDanh(null)).toBe("");
  });

  it("khoaViTri không phân biệt hoa/thường", () => {
    expect(khoaViTri("cs1", "Giáo Viên")).toBe(khoaViTri("cs1", "giáo viên"));
  });
});
