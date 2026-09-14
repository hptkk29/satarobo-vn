// lib/crm/chinh-sach-hoa-hong.test.ts — CHÍNH SÁCH HOA HỒNG CẤU HÌNH ĐƯỢC.
//
// Chủ dự án 14/09/2026: "lấy chính sách hoa hồng từ các văn bản công văn để đưa vào…
// phải để làm sao cho chính sách hoa hồng cũng được admin hệ thống setting 1 cách linh
// hoạt ở trong cấu hình vận hành luôn, chia từng role, từng loại đơn hàng rõ ràng cho
// từng chính sách hoa hồng riêng, và có thể thêm hoặc bớt các chính sách, thêm bớt các
// role nhận hoa hồng riêng chứ không khoá cứng… làm sao sau khi bàn giao thì dev không
// cần phải đụng gì nhiều nữa."
//
// ─────────────────────────────────────────────────────────────────────────────
// VÌ SAO KHÔNG DÙNG LẠI `lib/crm/commission.ts`
//
// File đó khoá cứng BỐN tầng bằng union TypeScript:
//   `export type CommissionTier = "QC" | "SALE_ADMIN" | "SALE" | "QL_TT"`
// Thêm một vai nhận hoa hồng = sửa union = dev phải code = đúng cái chủ dự án bảo bỏ.
//
// Và bốn tầng đó KHÔNG mô tả nổi chính sách thật. Đọc SR.QD.208 (bản 01/03/2026):
//
//   PL04 · Điều 1 — TVV 4% học viên MỚI · Sale Admin Hội sở 1% · TVV 1% TÁI TỤC
//   PL08 · Điều 3 — Quản lý TT: 2% học viên mới · 1% tái tục
//   PL08 · Điều 4 — chuyển trung tâm: TVV cũ 1% · QL cũ 1% · GV đã dạy 2% (một lần)
//   PL04(2) · Điều 2 — Marketing Hội sở 1% · Sale Admin 1% · GIÁO VIÊN tiếp nhận 1%
//   PL05 — BÁN THIẾT BỊ: Robot Beta 100.000đ/bộ · thiết bị khác 50.000đ  ← KHÔNG phải %
//   PL04 · Điều 2 + PL08 · Điều 2 — THƯỞNG DANH HIỆU theo ngưỡng doanh thu tháng,
//     số tiền cố định, 5 bậc, ngưỡng KHÁC NHAU giữa TVV và Quản lý
//
// Tức có BỐN trục biến thiên — (vai nhận) × (sự kiện) × (loại đơn) × (cách tính) — và
// hai cách tính không phải phần trăm. Một mảng bốn phần tử không chứa nổi.
//
// ─────────────────────────────────────────────────────────────────────────────
// TRẦN TỔNG PHẢI TÍNH THEO SỰ KIỆN, KHÔNG PHẢI CỘNG TẤT CẢ
//
// `commission.ts` cộng cả bốn tầng rồi so với `crm.commissionMaxTotalRate`. Với chính
// sách thật, cộng tất cả là cộng cả "học viên mới" (9%) lẫn "tái tục" (2%) vào một rổ —
// ra 11% và báo vượt trần, trong khi KHÔNG có đồng học phí nào chịu cả hai. Đây là lỗi
// sẽ xuất hiện ngay ngày nhập đủ chính sách công văn, nên nó có ca riêng ở [CSH-04].
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect } from "vitest";
import {
  CHINH_SACH_MAC_DINH,
  kiemChinhSach,
  tinhHoaHongDon,
  tinhThuongBac,
  tongTiLeTheoSuKien,
  type ChinhSachHoaHong,
} from "./chinh-sach-hoa-hong";

const cs = (x: Partial<ChinhSachHoaHong>): ChinhSachHoaHong => ({
  ma: "TEST",
  ten: "Test",
  vaiNhan: "SALES_CSM",
  suKien: "HOC_VIEN_MOI",
  loaiDon: "TAT_CA",
  kieuTinh: "PHAN_TRAM",
  giaTri: 0.04,
  bat: true,
  ...x,
});

describe("[CSH-01] tính hoa hồng một đơn — theo % học phí thực thu", () => {
  it("ví dụ NGUYÊN VĂN công văn: học phí 6.000.000 → TVV 240.000 + Sale Admin 60.000", () => {
    // SR.QD.208 PL04 Điều 1, ví dụ minh hoạ: "Học viên A đóng học phí 6.000.000 đồng…
    // Hoa hồng TVV = 4% x 6.000.000 = 240.000 đồng · Sale Admin = 1% x 6.000.000 = 60.000".
    const dong = tinhHoaHongDon(
      { soTien: 6_000_000, suKien: "HOC_VIEN_MOI", loaiDon: "COURSE" },
      [
        cs({ ma: "TVV_MOI", vaiNhan: "SALES_CSM", giaTri: 0.04 }),
        cs({ ma: "ADMIN_MOI", vaiNhan: "HO_SALE_ADMIN", giaTri: 0.01 }),
      ],
    );
    expect(dong).toHaveLength(2);
    expect(dong[0]).toMatchObject({ ma: "TVV_MOI", vaiNhan: "SALES_CSM", soTien: 240_000 });
    expect(dong[1]).toMatchObject({ ma: "ADMIN_MOI", soTien: 60_000 });
  });

  it("ví dụ công văn PL08: học viên mới 8.000.000 → Quản lý TT 160.000", () => {
    const dong = tinhHoaHongDon({ soTien: 8_000_000, suKien: "HOC_VIEN_MOI", loaiDon: "COURSE" }, [
      cs({ ma: "QL_MOI", vaiNhan: "CENTER_MANAGER", giaTri: 0.02 }),
    ]);
    expect(dong[0]!.soTien).toBe(160_000);
  });

  it("TÁI TỤC dùng chính sách khác: 7.000.000 → Quản lý TT 70.000 (1%)", () => {
    // Cùng công văn, cùng vai, KHÁC sự kiện ⇒ khác tỉ lệ. Đây là trục mà 4 tầng cũ không có.
    const ds = [
      cs({ ma: "QL_MOI", vaiNhan: "CENTER_MANAGER", suKien: "HOC_VIEN_MOI", giaTri: 0.02 }),
      cs({ ma: "QL_TT", vaiNhan: "CENTER_MANAGER", suKien: "TAI_TUC", giaTri: 0.01 }),
    ];
    const dong = tinhHoaHongDon({ soTien: 7_000_000, suKien: "TAI_TUC", loaiDon: "COURSE" }, ds);
    expect(dong).toHaveLength(1);
    expect(dong[0]).toMatchObject({ ma: "QL_TT", soTien: 70_000 });
  });

  it("chính sách TẮT thì không sinh dòng nào", () => {
    const dong = tinhHoaHongDon({ soTien: 6_000_000, suKien: "HOC_VIEN_MOI", loaiDon: "COURSE" }, [
      cs({ ma: "TAT", bat: false }),
    ]);
    expect(dong).toHaveLength(0);
  });

  it("lọc theo LOẠI ĐƠN — chính sách khoá học không ăn vào đơn sản phẩm", () => {
    const ds = [
      cs({ ma: "KHOA", loaiDon: "COURSE", giaTri: 0.04 }),
      cs({ ma: "MOI_LOAI", loaiDon: "TAT_CA", giaTri: 0.01 }),
    ];
    const dong = tinhHoaHongDon({ soTien: 1_000_000, suKien: "HOC_VIEN_MOI", loaiDon: "PRODUCT" }, ds);
    expect(dong.map((d) => d.ma)).toEqual(["MOI_LOAI"]);
  });
});

describe("[CSH-02] SỐ TIỀN CỐ ĐỊNH — bán thiết bị (PL05), không phải phần trăm", () => {
  it("Robot Beta 100.000đ/bộ, bất kể giá bán", () => {
    // PL05: "Bộ sản phẩm Robot Beta | 100.000 đồng". Tính theo % là ra số khác hẳn —
    // đây đúng là lý do `kieuTinh` phải là một trục, không phải mặc định ngầm.
    const ds = [
      cs({
        ma: "TB_BETA",
        suKien: "BAN_THIET_BI",
        loaiDon: "PRODUCT",
        kieuTinh: "SO_TIEN_CO_DINH",
        giaTri: 100_000,
      }),
    ];
    for (const giaBan of [1_000_000, 9_000_000]) {
      const dong = tinhHoaHongDon(
        { soTien: giaBan, suKien: "BAN_THIET_BI", loaiDon: "PRODUCT" },
        ds,
      );
      expect(dong[0]!.soTien).toBe(100_000);
    }
  });

  it("số tiền cố định NHÂN SỐ LƯỢNG khi đơn có nhiều bộ", () => {
    const ds = [
      cs({
        ma: "TB_KHAC",
        suKien: "BAN_THIET_BI",
        loaiDon: "PRODUCT",
        kieuTinh: "SO_TIEN_CO_DINH",
        giaTri: 50_000,
      }),
    ];
    const dong = tinhHoaHongDon(
      { soTien: 3_000_000, soLuong: 3, suKien: "BAN_THIET_BI", loaiDon: "PRODUCT" },
      ds,
    );
    expect(dong[0]!.soTien).toBe(150_000);
  });

  it("KHÔNG có số lượng → coi như 1, không phải 0", () => {
    const ds = [
      cs({ ma: "X", kieuTinh: "SO_TIEN_CO_DINH", giaTri: 50_000, suKien: "BAN_THIET_BI" }),
    ];
    expect(
      tinhHoaHongDon({ soTien: 1, suKien: "BAN_THIET_BI", loaiDon: "TAT_CA" }, ds)[0]!.soTien,
    ).toBe(50_000);
  });
});

describe("[CSH-03] THƯỞNG THEO BẬC — ngưỡng doanh thu tháng (PL04 Điều 2 · PL08 Điều 2)", () => {
  const bacTVV = [
    { nguong: 110_000_000, thuong: 1_000_000, danhHieu: "SILVER" },
    { nguong: 150_000_000, thuong: 1_500_000, danhHieu: "GOLD" },
    { nguong: 200_000_000, thuong: 2_000_000, danhHieu: "PLATINUM" },
    { nguong: 250_000_000, thuong: 2_500_000, danhHieu: "TITANIUM" },
    { nguong: 300_000_000, thuong: 3_000_000, danhHieu: "DIAMOND" },
  ];

  it("ví dụ NGUYÊN VĂN công văn: doanh thu 155 triệu → GOLD 1.500.000", () => {
    // "TVV Nguyễn Văn C đạt doanh thu tháng 7 là 155 triệu đồng (vượt ngưỡng GOLD ≥ 150
    // triệu) … Thưởng danh hiệu GOLD: thêm 1.500.000 đồng".
    const r = tinhThuongBac(155_000_000, bacTVV);
    expect(r).toEqual({ thuong: 1_500_000, danhHieu: "GOLD" });
  });

  it("lấy bậc CAO NHẤT đạt được, không cộng dồn các bậc", () => {
    // "TVV nhận mức thưởng cao nhất đạt được" — cộng dồn 5 bậc là chi gấp 3,3 lần.
    expect(tinhThuongBac(320_000_000, bacTVV)).toEqual({
      thuong: 3_000_000,
      danhHieu: "DIAMOND",
    });
  });

  it("dưới ngưỡng thấp nhất → không thưởng, KHÔNG ném", () => {
    expect(tinhThuongBac(90_000_000, bacTVV)).toEqual({ thuong: 0, danhHieu: null });
  });

  it("đúng bằng ngưỡng thì ĐƯỢC (công văn ghi ≥)", () => {
    expect(tinhThuongBac(110_000_000, bacTVV).danhHieu).toBe("SILVER");
  });

  it("bậc khai lộn xộn vẫn ra đúng — không phụ thuộc thứ tự người nhập", () => {
    const loanXon = [...bacTVV].reverse();
    expect(tinhThuongBac(155_000_000, loanXon).danhHieu).toBe("GOLD");
  });

  it("Quản lý có bảng bậc RIÊNG: 420 triệu → PLATINUM 4.000.000", () => {
    // "Giám đốc Trung tâm CS1 đạt doanh thu tháng 8 là 420 triệu (vượt ngưỡng PLATINUM
    // ≥ 400 triệu) … Thưởng danh hiệu PLATINUM: 4.000.000 đồng". Ngưỡng khác TVV hoàn
    // toàn — đó là lý do bậc nằm TRÊN từng chính sách, không phải một bảng chung.
    const bacQL = [
      { nguong: 220_000_000, thuong: 2_000_000, danhHieu: "SILVER" },
      { nguong: 300_000_000, thuong: 3_000_000, danhHieu: "GOLD" },
      { nguong: 400_000_000, thuong: 4_000_000, danhHieu: "PLATINUM" },
      { nguong: 500_000_000, thuong: 5_000_000, danhHieu: "TITANIUM" },
      { nguong: 600_000_000, thuong: 6_000_000, danhHieu: "DIAMOND" },
    ];
    expect(tinhThuongBac(420_000_000, bacQL)).toEqual({
      thuong: 4_000_000,
      danhHieu: "PLATINUM",
    });
  });
});

describe("[CSH-04] TRẦN TỔNG tính THEO SỰ KIỆN — không cộng chung một rổ", () => {
  it("học viên mới cộng đúng 9% theo công văn", () => {
    // 4% TVV + 1% Sale Admin + 2% QL + 1% Marketing + 1% GV = 9%, đúng bằng trần đã nới.
    expect(tongTiLeTheoSuKien(CHINH_SACH_MAC_DINH, "HOC_VIEN_MOI", "COURSE")).toBeCloseTo(
      0.09,
      6,
    );
  });

  it("tái tục là RỔ KHÁC, chỉ 2%", () => {
    expect(tongTiLeTheoSuKien(CHINH_SACH_MAC_DINH, "TAI_TUC", "COURSE")).toBeCloseTo(0.02, 6);
  });

  it("cộng chung hai rổ sẽ ra 11% và báo vượt trần GIẢ — đó là lỗi phải tránh", () => {
    const moi = tongTiLeTheoSuKien(CHINH_SACH_MAC_DINH, "HOC_VIEN_MOI", "COURSE");
    const taiTuc = tongTiLeTheoSuKien(CHINH_SACH_MAC_DINH, "TAI_TUC", "COURSE");
    // Không có đồng học phí nào chịu CẢ HAI sự kiện, nên phép cộng này vô nghĩa về
    // nghiệp vụ. Ca này ghim lại con số để lần sau ai định cộng chung thì thấy ngay.
    expect(moi + taiTuc).toBeCloseTo(0.11, 6);
  });

  it("chính sách SỐ TIỀN CỐ ĐỊNH không tham gia phép cộng tỉ lệ", () => {
    const ds = [
      cs({ ma: "A", giaTri: 0.04 }),
      cs({ ma: "B", kieuTinh: "SO_TIEN_CO_DINH", giaTri: 100_000 }),
    ];
    expect(tongTiLeTheoSuKien(ds, "HOC_VIEN_MOI", "TAT_CA")).toBeCloseTo(0.04, 6);
  });
});

describe("[CSH-05] kiểm chính sách — chặn TRƯỚC khi lưu, không để lỗi thành tiền", () => {
  it("mã trùng → lỗi", () => {
    const loi = kiemChinhSach([cs({ ma: "X" }), cs({ ma: "X" })], { tranTongTiLe: 0.09 });
    expect(loi.some((l) => l.includes("trùng"))).toBe(true);
  });

  it("phần trăm ngoài 0..1 → lỗi (chống gõ 4 thay vì 0,04)", () => {
    // Gõ "4" ý là 4% mà hệ hiểu 400% thì một đơn 6tr chi 24tr hoa hồng.
    expect(kiemChinhSach([cs({ giaTri: 4 })], { tranTongTiLe: 0.09 }).length).toBeGreaterThan(0);
    expect(kiemChinhSach([cs({ giaTri: -0.01 })], { tranTongTiLe: 0.09 }).length).toBeGreaterThan(0);
  });

  it("số tiền cố định ÂM → lỗi", () => {
    const loi = kiemChinhSach(
      [cs({ kieuTinh: "SO_TIEN_CO_DINH", giaTri: -1000 })],
      { tranTongTiLe: 0.09 },
    );
    expect(loi.length).toBeGreaterThan(0);
  });

  it("THUONG_THEO_BAC mà không khai bậc → lỗi", () => {
    const loi = kiemChinhSach([cs({ kieuTinh: "THUONG_THEO_BAC", bac: [] })], {
      tranTongTiLe: 0.09,
    });
    expect(loi.some((l) => l.toLowerCase().includes("bậc"))).toBe(true);
  });

  it("vượt trần Ở MỘT SỰ KIỆN → lỗi, và lỗi nói rõ sự kiện nào", () => {
    const ds = [
      cs({ ma: "A", giaTri: 0.05 }),
      cs({ ma: "B", giaTri: 0.05 }),
      cs({ ma: "C", suKien: "TAI_TUC", giaTri: 0.01 }),
    ];
    const loi = kiemChinhSach(ds, { tranTongTiLe: 0.09 });
    expect(loi.some((l) => l.includes("HOC_VIEN_MOI") || l.includes("học viên mới"))).toBe(true);
    // Rổ tái tục chỉ 1% ⇒ KHÔNG được báo lỗi theo.
    expect(loi.some((l) => l.includes("TAI_TUC") || l.includes("tái tục"))).toBe(false);
  });

  it("bộ chính sách MẶC ĐỊNH theo công văn phải hợp lệ ở trần 9%", () => {
    // Nếu ca này đỏ thì hoặc công văn đổi, hoặc bộ mặc định gõ sai — cả hai đều phải
    // sửa chứ không phải nới trần cho xanh.
    expect(kiemChinhSach(CHINH_SACH_MAC_DINH, { tranTongTiLe: 0.09 })).toEqual([]);
  });

  it("danh sách RỖNG hợp lệ — tắt hết hoa hồng là một lựa chọn vận hành", () => {
    expect(kiemChinhSach([], { tranTongTiLe: 0.09 })).toEqual([]);
  });

  it("vai nhận là CHUỖI TỰ DO — thêm vai mới không cần sửa mã", () => {
    // Đây đúng là điều chủ dự án yêu cầu: "thêm bớt các role nhận hoa hồng riêng chứ
    // không khoá cứng". Ràng buộc duy nhất là không để trống.
    expect(kiemChinhSach([cs({ vaiNhan: "VAI_MOI_CHUA_TUNG_CO" })], { tranTongTiLe: 0.09 })).toEqual(
      [],
    );
    expect(kiemChinhSach([cs({ vaiNhan: "  " })], { tranTongTiLe: 0.09 }).length).toBeGreaterThan(0);
  });
});

describe("[CSH-06] bộ MẶC ĐỊNH chép từ công văn — đủ mọi khoản đã ban hành", () => {
  it("có đủ 5 khoản hoa hồng học viên MỚI", () => {
    const moi = CHINH_SACH_MAC_DINH.filter(
      (c) => c.suKien === "HOC_VIEN_MOI" && c.kieuTinh === "PHAN_TRAM",
    );
    expect(moi.map((c) => c.vaiNhan).sort()).toEqual(
      ["CENTER_MANAGER", "HO_MARKETING", "HO_SALE_ADMIN", "SALES_CSM", "TEACHER"].sort(),
    );
  });

  it("có khoản TÁI TỤC cho cả TVV và Quản lý", () => {
    const tt = CHINH_SACH_MAC_DINH.filter((c) => c.suKien === "TAI_TUC");
    expect(tt.map((c) => c.vaiNhan).sort()).toEqual(["CENTER_MANAGER", "SALES_CSM"]);
  });

  it("có khoản BÁN THIẾT BỊ dạng số tiền cố định", () => {
    const tb = CHINH_SACH_MAC_DINH.filter((c) => c.suKien === "BAN_THIET_BI");
    expect(tb.length).toBeGreaterThanOrEqual(1);
    expect(tb.every((c) => c.kieuTinh === "SO_TIEN_CO_DINH")).toBe(true);
  });

  it("mọi chính sách đều ghi NGUỒN công văn — số tiền không được vô danh", () => {
    for (const c of CHINH_SACH_MAC_DINH) {
      expect(c.nguon, `${c.ma} thiếu nguồn`).toBeTruthy();
    }
  });

  it("mã chính sách là duy nhất", () => {
    const ma = CHINH_SACH_MAC_DINH.map((c) => c.ma);
    expect(new Set(ma).size).toBe(ma.length);
  });
});

describe("[CSH-07] số rác không thành tiền", () => {
  it("số tiền đơn âm / NaN → 0 đồng hoa hồng, không ném", () => {
    for (const v of [-1_000_000, Number.NaN, Infinity]) {
      const dong = tinhHoaHongDon({ soTien: v, suKien: "HOC_VIEN_MOI", loaiDon: "COURSE" }, [
        cs({ giaTri: 0.04 }),
      ]);
      expect(dong[0]!.soTien).toBe(0);
    }
  });

  it("làm tròn về ĐỒNG — không để số lẻ đi vào bảng lương", () => {
    const dong = tinhHoaHongDon({ soTien: 3_333_333, suKien: "HOC_VIEN_MOI", loaiDon: "COURSE" }, [
      cs({ giaTri: 0.04 }),
    ]);
    expect(Number.isInteger(dong[0]!.soTien)).toBe(true);
    expect(dong[0]!.soTien).toBe(133_333);
  });
});
