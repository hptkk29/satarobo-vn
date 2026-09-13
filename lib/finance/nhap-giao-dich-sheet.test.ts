// lib/finance/nhap-giao-dich-sheet.test.ts — NHẬP GIAO DỊCH CŨ từ sheet đăng ký.
//
// Nguồn: `Satarobo - Danh sách đăng ký.xlsx` (9 sheet). Mục tiêu của chủ dự án: học viên
// đã đóng tiền trước khi lên hệ thống không được hiện NỢ ở cổng phụ huynh.
//
// ⚠️ MỌI CA DƯỚI ĐÂY LÀ SỐ ĐO THẬT TỪ FILE, không phải ví dụ bịa. Fixture tròn trịa là
// fixture không kiểm được gì.
//
// Bốn cái bẫy đo được, mỗi cái là một đường mất tiền hoặc đếm đôi:
//
//  (1) 12 DÒNG TỔNG ôm 1.382.987.666đ — 62% tổng tiền của cả file. Chúng không có tên,
//      không mã, không tình trạng; chỉ có một ô tiền. `Tháng 52026!d16 = 30.322.000đ`
//      đúng bằng tổng 6 dòng phía trên nó. Nhập nhầm là thổi doanh thu gấp 2,7 lần.
//
//  (2) SHEET "Tháng 62026" CHỨA TRỌN "Tháng 52026" — 6/6 dòng có mã khớp cả mã lẫn tiền.
//      Nhập cả hai là cộng đôi 30.322.000đ tiền thật.
//
//  (3) MÃ HỌC VIÊN KHÔNG NHẤT QUÁN trong chính file: `CS1.HV.0031` và `CS1.HV0031`
//      (thiếu dấu chấm) là cùng một em. So chuỗi thô là tách một em thành hai.
//
//  (4) MỘT HỌC VIÊN CÓ NHIỀU ĐỢT — đo được 21 em đóng 2 đợt, 3 em đóng 3 đợt
//      (`CS1.HV.0043` đóng 3.320.000 tháng 8 rồi 4.320.000 tháng 9, ghi chú "Học phí đợt
//      1"/"đợt 2"). Gộp phải CỘNG DỒN; ghi đè là xoá mất tiền của đợt trước.
import { describe, it, expect } from "vitest";
import {
  chuanMaHV,
  chuanSdtSheet,
  laDongTong,
  docDongGiaoDich,
  gopTheoHocVien,
  sheetChuaTronSheet,
} from "./nhap-giao-dich-sheet";

describe("[NGD-01] chuẩn hoá mã học viên", () => {
  it("mã thiếu dấu chấm và mã đủ chấm là MỘT (ca thật trong file)", () => {
    expect(chuanMaHV("CS1.HV0031")).toBe("CS1.HV.0031");
    expect(chuanMaHV("CS1.HV.0031")).toBe("CS1.HV.0031");
    expect(chuanMaHV("cs1.hv.31")).toBe("CS1.HV.0031");
  });

  it("đệm 0 cho đủ 4 chữ số — CS1.HV.31 và CS1.HV.0031 là một", () => {
    expect(chuanMaHV("CS1.HV.31")).toBe(chuanMaHV("CS1.HV.0031"));
  });

  it("ô trống / rác → null, KHÔNG bịa mã", () => {
    expect(chuanMaHV(null)).toBeNull();
    expect(chuanMaHV("   ")).toBeNull();
    // Ca thật: `Tháng 72026 CS1!d78` có chữ "NHẬP TAB THÁNG 8" nằm ở cột mã.
    expect(chuanMaHV("NHẬP TAB THÁNG 8")).toBeNull();
  });
});

describe("[NGD-02] chuẩn hoá số điện thoại", () => {
  it("số có dấu cách vẫn ra đúng (ca thật: '078 3264020')", () => {
    expect(chuanSdtSheet("078 3264020")).toBe("0783264020");
  });

  it("KHÔNG làm mất số 0 đầu — bài học đã trả giá ở lượt nhập lead", () => {
    expect(chuanSdtSheet("0905499860")).toBe("0905499860");
    expect(chuanSdtSheet(905499860)).toBe("0905499860");
  });

  it("dạng 84… quy về 0…", () => {
    expect(chuanSdtSheet("84905499860")).toBe("0905499860");
  });

  it("ô trống → null", () => {
    expect(chuanSdtSheet(null)).toBeNull();
    expect(chuanSdtSheet("—")).toBeNull();
  });
});

describe("[NGD-03] loại DÒNG TỔNG — 62% tiền của file nằm ở đây", () => {
  it("dòng chỉ có tiền, không tên/mã/tình trạng → là dòng tổng", () => {
    expect(
      laDongTong({ maHV: null, hoTen: null, tinhTrang: "", hocPhi: 30_322_000 }),
    ).toBe(true);
  });

  it("dòng giao dịch thật → KHÔNG phải dòng tổng", () => {
    expect(
      laDongTong({
        maHV: "CS2.HV.0001",
        hoTen: "LÊ NGUYỄN TUẤN KIỆT",
        tinhTrang: "Đã thanh toán",
        hocPhi: 3_986_000,
      }),
    ).toBe(false);
  });

  it("dòng có mã nhưng tiền 0 → cũng loại (ca thật: CS2.HV.0046/0047 ở Tháng 82026 CS2)", () => {
    expect(
      laDongTong({ maHV: "CS2.HV.0046", hoTen: null, tinhTrang: "", hocPhi: 0 }),
    ).toBe(true);
  });

  it("có tên mà thiếu tình trạng → VẪN loại, vì không biết đã thu hay chưa", () => {
    // Fail-closed: thà bỏ sót một dòng để người nhập thấy, còn hơn ghi một khoản
    // tiền mà không ai biết nó đã vào tài khoản chưa.
    expect(
      laDongTong({ maHV: "CS1.HV.0009", hoTen: "AI ĐÓ", tinhTrang: "", hocPhi: 1_000_000 }),
    ).toBe(true);
  });
});

describe("[NGD-04] đọc một dòng", () => {
  const dong = {
    "MÃ HỌC VIÊN": "CS1.HV0043",
    "Họ và Tên học viên": "Nguyễn Công Hoàng Khải",
    "Số điện thoại": "0932014686",
    "Học phí": 3_320_000,
    "Tình trạng": "Đã thanh toán",
    "Ghi chú": "Học phí đợt 1",
    Ngày: new Date("2026-08-01T00:00:00.000Z"),
    "Khoá học đăng ký": "Sata 4",
    "Cơ sở": "CS1: N.Hữu Thọ",
  };

  it("lấy đủ trường và chuẩn hoá mã", () => {
    const g = docDongGiaoDich(dong, "Tháng 82026 CS1", 2);
    expect(g).not.toBeNull();
    expect(g!.maHV).toBe("CS1.HV.0043");
    expect(g!.hocPhi).toBe(3_320_000);
    expect(g!.sdt).toBe("0932014686");
    expect(g!.sheet).toBe("Tháng 82026 CS1");
    expect(g!.dong).toBe(2);
  });

  it("dòng tổng → null", () => {
    expect(docDongGiaoDich({ "Học phí": 104_760_000 }, "Tháng 82026 CS1", 25)).toBeNull();
  });

  it("cột 'Cơ sở' ở sheet Tháng 62026 mang nhãn 'minh' — vẫn đọc được", () => {
    // Đo thật: header sheet Tháng 62026 có ô bị gõ nhầm thành "minh" ở vị trí Cơ sở.
    const g = docDongGiaoDich(
      { ...dong, "Cơ sở": undefined, minh: "CS2: Hoàng Diệu" },
      "Tháng 62026",
      2,
    );
    expect(g!.coSo).toBe("CS2: Hoàng Diệu");
  });
});

describe("[NGD-05] phát hiện sheet chứa trọn sheet khác", () => {
  const t5 = [
    { maHV: "CS2.HV.0001", hocPhi: 3_986_000 },
    { maHV: "CS2.HV.0002", hocPhi: 8_640_000 },
    { maHV: "CS1.HV.0001", hocPhi: 3_808_000 },
  ];

  it("T6 chứa trọn T5 → báo trùng, kèm SỐ TIỀN sẽ cộng đôi (ca thật)", () => {
    const t6 = [...t5, { maHV: "CS1.HV.0009", hocPhi: 5_000_000 }];
    const r = sheetChuaTronSheet(t5, t6);
    expect(r.chuaTron).toBe(true);
    expect(r.soDongTrung).toBe(3);
    expect(r.tienCongDoi).toBe(16_434_000);
  });

  it("chỉ trùng một phần → KHÔNG coi là chứa trọn (phải để người xem quyết)", () => {
    const t6 = [{ maHV: "CS2.HV.0001", hocPhi: 3_986_000 }];
    const r = sheetChuaTronSheet(t5, t6);
    expect(r.chuaTron).toBe(false);
    expect(r.soDongTrung).toBe(1);
  });

  it("cùng mã nhưng KHÁC tiền → không phải trùng, là đợt đóng khác", () => {
    // `CS1.HV.0043` đóng 3.320.000 rồi 4.320.000 — hai giao dịch thật, không được gộp.
    const a = [{ maHV: "CS1.HV.0043", hocPhi: 3_320_000 }];
    const b = [{ maHV: "CS1.HV.0043", hocPhi: 4_320_000 }];
    expect(sheetChuaTronSheet(a, b).soDongTrung).toBe(0);
  });
});

describe("[NGD-06] gộp theo học viên — CỘNG DỒN, không ghi đè", () => {
  const gd = (maHV: string, hocPhi: number, ghiChu = "") => ({
    sheet: "x",
    dong: 1,
    maHV,
    hoTen: "AI ĐÓ",
    sdt: "0900000000",
    hocPhi,
    ngay: null,
    khoa: null,
    coSo: null,
    tinhTrang: "Đã thanh toán",
    ghiChu,
  });

  it("ba đợt của một em cộng lại, giữ nguyên từng đợt để soi lại", () => {
    const r = gopTheoHocVien([
      gd("CS1.HV.0043", 3_320_000, "Học phí đợt 1"),
      gd("CS1.HV.0043", 4_320_000, "Học phí đợt 2"),
      gd("CS1.HV.0043", 1_000_000, "bù"),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]!.tongTien).toBe(8_640_000);
    expect(r[0]!.soDot).toBe(3);
    expect(r[0]!.giaoDich).toHaveLength(3);
  });

  it("hai em khác nhau không lẫn vào nhau", () => {
    const r = gopTheoHocVien([gd("CS1.HV.0001", 1_000), gd("CS1.HV.0002", 2_000)]);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.tongTien).sort((a, b) => a - b)).toEqual([1_000, 2_000]);
  });

  it("em KHÔNG có mã gộp theo SĐT + tên, và được đánh dấu là cần người xem", () => {
    const khongMa = { ...gd("", 5_000_000), maHV: null };
    const r = gopTheoHocVien([khongMa, khongMa]);
    expect(r).toHaveLength(1);
    expect(r[0]!.maHV).toBeNull();
    expect(r[0]!.canNguoiXem).toBe(true);
    expect(r[0]!.tongTien).toBe(10_000_000);
  });

  it("em có mã thì KHÔNG cần người xem", () => {
    expect(gopTheoHocVien([gd("CS1.HV.0001", 1_000)])[0]!.canNguoiXem).toBe(false);
  });

  it("thứ tự đầu vào không đổi kết quả (ổn định)", () => {
    const a = gopTheoHocVien([gd("CS1.HV.0002", 2), gd("CS1.HV.0001", 1)]);
    const b = gopTheoHocVien([gd("CS1.HV.0001", 1), gd("CS1.HV.0002", 2)]);
    expect(a.map((x) => x.maHV)).toEqual(b.map((x) => x.maHV));
  });
});
