// @vitest-environment node
// Cổng agent Đợt 1 — phần THUẦN dùng chung: phân trang, bản đồ cơ sở, luật chức danh, lớp của
// khoá, ngày giờ. Test không cần DB; mỗi ca canh một luật có tên trong chú thích mã nguồn.
import { describe, it, expect } from "vitest";
import { catTrang, giaiMaConTro, kiemConTro, maHoaConTro, GIOI_HAN_MAC_DINH } from "./trang";
import { centerIdTrongPhamVi, dungBanDo, maCoSoCua } from "./ban-do-co-so";
import { chonChucDanh, laVaiCuaNguoi } from "./danh-muc/vai-nguoi";
import { lopTuChuoi, maKhoa } from "./danh-muc/lay-khoa-hoc";
import { maKenh } from "./danh-muc/lay-kenh";
import { congNgay, dauNgayTuChuoi, laNgayHopLe, laThangHopLe, ngayCuaCotDate, soNgayGiua } from "../gateway/thoi-gian";

describe("[AG-TR] phân trang", () => {
  const ds = Array.from({ length: 7 }, (_, i) => i);
  it("[AG-TR-01] con trỏ mã hoá rồi giải mã ra đúng vị trí", () => {
    expect(giaiMaConTro(maHoaConTro(0))).toBe(0);
    expect(giaiMaConTro(maHoaConTro(4213))).toBe(4213);
  });
  it("[AG-TR-02] con trỏ hỏng/lạ ⇒ null và `kiemConTro` báo TÊN trường, không giá trị", () => {
    for (const x of ["", "!!!", "abc", Buffer.from('{"o":-1}').toString("base64url"), Buffer.from('{"o":1.5}').toString("base64url"), Buffer.from('{"o":"3"}').toString("base64url"), Buffer.from("[]").toString("base64url"), Buffer.from('{"o":99999999}').toString("base64url")]) {
      expect(giaiMaConTro(x), x).toBeNull();
    }
    expect(kiemConTro({ con_tro: "!!!" })).toEqual(["con_tro"]);
    expect(kiemConTro({})).toEqual([]);
  });
  it("[AG-TR-03] đi hết các trang bằng `tiep_theo` ra đủ và đúng thứ tự; trang cuối trả null", () => {
    const gom: number[] = [];
    let conTro: string | undefined;
    let vong = 0;
    do {
      const t = catTrang(ds, { gioi_han: 3, con_tro: conTro }, { maxRowsPerCall: 500 });
      gom.push(...t.duLieu);
      conTro = t.tiepTheo ?? undefined;
      vong++;
    } while (conTro && vong < 10);
    expect(gom).toEqual(ds);
    expect(vong).toBe(3);
  });
  it("[AG-TR-04] trần cổng `maxRowsPerCall` thắng `gioi_han` (không để bước 12 từ chối cả lượt)", () => {
    const t = catTrang(ds, { gioi_han: 500 }, { maxRowsPerCall: 2 });
    expect(t.duLieu).toEqual([0, 1]);
    expect(t.tiepTheo).not.toBeNull();
  });
  it("[AG-TR-05] không khai `gioi_han` ⇒ mặc định 200 (spec §7.2)", () => {
    const lon = Array.from({ length: 250 }, (_, i) => i);
    expect(catTrang(lon, {}, { maxRowsPerCall: 500 }).duLieu).toHaveLength(GIOI_HAN_MAC_DINH);
  });
  it("[AG-TR-06] danh sách vừa khít một trang ⇒ tiep_theo = null (không trỏ vào trang rỗng)", () => {
    expect(catTrang(ds, { gioi_han: 7 }, { maxRowsPerCall: 500 }).tiepTheo).toBeNull();
  });
});

describe("[AG-BD] bản đồ mã cơ sở", () => {
  const ban = dungBanDo([
    { id: "ou-ho", code: "HO", type: "HO", centerId: null },
    { id: "ou-1", code: "CS1", type: "CENTER", centerId: "c1" },
    { id: "ou-2", code: "CS2", type: "CENTER", centerId: "c2" },
  ]);
  it("[AG-BD-01] centerId → mã; phạm vi → centerId (HO không có centerId)", () => {
    expect(maCoSoCua(ban, "c2", "khong_xac_dinh")).toBe("CS2");
    expect(centerIdTrongPhamVi(ban, ["HO", "CS1"])).toEqual(["c1"]);
  });
  it("[AG-BD-02] NULL phải được NÓI RÕ nghĩa: 'hoi_so' → HO, 'khong_xac_dinh' → null (loại dòng)", () => {
    expect(maCoSoCua(ban, null, "hoi_so")).toBe("HO");
    expect(maCoSoCua(ban, null, "khong_xac_dinh")).toBeNull();
  });
  it("[AG-BD-03] centerId không nối được cây ⇒ null (không đoán là HO)", () => {
    expect(maCoSoCua(ban, "c-la", "hoi_so")).toBeNull();
    expect(maCoSoCua(ban, "c-la", "khong_xac_dinh")).toBeNull();
  });
});

describe("[AG-VN] chức danh = vai của NGƯỜI", () => {
  it("[AG-VN-01] loại vai quan hệ (Phụ huynh) và vai dịch vụ AGENT_*; giữ vai người", () => {
    expect(laVaiCuaNguoi("PARENT")).toBe(false);
    expect(laVaiCuaNguoi("AGENT_CHI_DOC")).toBe(false);
    for (const v of ["SUPER_ADMIN", "GIAM_DOC", "CENTER_SALES_CSM", "TEACHER"]) expect(laVaiCuaNguoi(v)).toBe(true);
  });
  it("[AG-VN-02] vai neo ĐÚNG đơn vị làm việc thắng vai neo Hội sở", () => {
    const vai = [
      { code: "HO_MARKETING", orgUnitId: "ou-ho" },
      { code: "TEACHER", orgUnitId: "ou-1" },
    ];
    expect(chonChucDanh(vai, "ou-1")).toBe("TEACHER");
  });
  it("[AG-VN-03] cùng chỗ neo ⇒ theo thứ tự nghề (quản lý trước, SUPER_ADMIN cuối)", () => {
    expect(
      chonChucDanh(
        [
          { code: "SUPER_ADMIN", orgUnitId: "ou-ho" },
          { code: "GIAM_DOC", orgUnitId: "ou-ho" },
        ],
        "ou-ho",
      ),
    ).toBe("GIAM_DOC");
    expect(
      chonChucDanh(
        [
          { code: "TEACHER", orgUnitId: "ou-1" },
          { code: "CENTER_MANAGER", orgUnitId: "ou-1" },
        ],
        "ou-1",
      ),
    ).toBe("CENTER_MANAGER");
  });
  it("[AG-VN-04] chỉ có vai không phải của người, hoặc không vai nào ⇒ chuỗi rỗng", () => {
    expect(chonChucDanh([{ code: "AGENT_CHI_DOC", orgUnitId: "ou-ho" }], "ou-ho")).toBe("");
    expect(chonChucDanh([], null)).toBe("");
  });
  it("[AG-VN-05] vai lạ (chưa có trong thứ tự) vẫn chọn được, ổn định theo mã", () => {
    expect(chonChucDanh([{ code: "ZZ_MOI", orgUnitId: "x" }, { code: "AA_MOI", orgUnitId: "x" }], null)).toBe("AA_MOI");
  });
});

describe("[AG-KH] khoá học", () => {
  it("[AG-KH-01] 'Lớp a – b' → dải lớp; 'Lớp n' → [n]; liệt kê → đúng các số", () => {
    expect(lopTuChuoi("Lớp 3 – 8")).toEqual([3, 4, 5, 6, 7, 8]);
    expect(lopTuChuoi("Lớp 1 - 2")).toEqual([1, 2]);
    expect(lopTuChuoi("Lớp 5")).toEqual([5]);
    expect(lopTuChuoi("Lớp 6 đến 7")).toEqual([6, 7]);
    expect(lopTuChuoi("lớp 1, 2")).toEqual([1, 2]);
  });
  it("[AG-KH-02] dạng tuổi / trống / dữ liệu lạ ⇒ [] (không đoán tuổi → lớp)", () => {
    for (const x of [null, undefined, "", "6-8 tuổi", "Lớp 8 – 3", "Lớp 0 – 2", "Lớp 13", "Mọi lứa tuổi"]) {
      expect(lopTuChuoi(x), String(x)).toEqual([]);
    }
  });
  it("[AG-KH-03] mã khoá: có `code` thì dùng, trống thì slug", () => {
    expect(maKhoa({ code: "SATA3", slug: "sata-3" })).toBe("SATA3");
    expect(maKhoa({ code: "  ", slug: "sata-3" })).toBe("sata-3");
    expect(maKhoa({ code: null, slug: "sata-3" })).toBe("sata-3");
  });
  it("[AG-KH-04] mã kênh = enum viết thường (suy ngược được, khớp mẫu xưởng)", () => {
    expect(maKenh("ZALO_CA_NHAN")).toBe("zalo_ca_nhan");
    expect(maKenh("MESSENGER")).toBe("messenger");
  });
});

describe("[AG-TG] ngày giờ của hợp đồng", () => {
  it("[AG-TG-01] ngày hợp lệ phải CÓ THẬT trên lịch", () => {
    expect(laNgayHopLe("2026-02-28")).toBe(true);
    expect(laNgayHopLe("2028-02-29")).toBe(true);
    for (const x of ["2026-02-30", "2026-13-01", "2026-9-01", "26-09-01", "2026-09-01T00:00"]) expect(laNgayHopLe(x), x).toBe(false);
  });
  it("[AG-TG-02] tháng hợp lệ 01–12", () => {
    expect(laThangHopLe("2026-09")).toBe(true);
    for (const x of ["2026-00", "2026-13", "2026-9", "2026-09-01"]) expect(laThangHopLe(x), x).toBe(false);
  });
  it("[AG-TG-03] đầu ngày VN = 17:00Z hôm trước; cột Date đọc phần UTC", () => {
    expect(dauNgayTuChuoi("2026-09-26").toISOString()).toBe("2026-09-25T17:00:00.000Z");
    expect(ngayCuaCotDate(new Date("2026-09-26T00:00:00Z"))).toBe("2026-09-26");
  });
  it("[AG-TG-04] cộng/trừ ngày qua ranh tháng/năm; đếm ngày giữa hai mốc", () => {
    expect(congNgay("2026-12-31", 1)).toBe("2027-01-01");
    expect(congNgay("2026-03-01", -1)).toBe("2026-02-28");
    expect(soNgayGiua("2026-09-01", "2026-09-30")).toBe(29);
    expect(soNgayGiua("2026-09-30", "2026-09-01")).toBe(-29);
  });
});
