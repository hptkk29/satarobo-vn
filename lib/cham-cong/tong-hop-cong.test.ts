/**
 * lib/cham-cong/tong-hop-cong.test.ts — phép GỘP dùng chung (admin × site GV) và bộ số
 * của màn "Bảng công" (mục 1, bộ chốt 15/09/2026).
 *
 * ⚠️ Mọi ngày ở đây là ngày TUYỆT ĐỐI và không hàm nào đọc đồng hồ — luật 19. "Hôm nay"
 * vào qua đối số `homNay`, nên cấy được cả hai phía ranh giới.
 */
import { describe, expect, it } from "vitest";
import { gopNgayCong, type NgayCongGop } from "./tong-hop-cong";
import { tomTatCongThang } from "./bang-cong-gv";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d));

/** Một ngày công "rỗng". Ca test chỉ đè đúng cột nó nói về — phần còn lại không được lẫn vào. */
function ngay(p: Partial<NgayCongGop> & { workDate: Date }): NgayCongGop {
  return {
    dayType: "WORK",
    templateCode: "HC",
    overrideUnits: null,
    dayCreditEarned: 0,
    dayCreditExpected: 0,
    leaveUnits: 0,
    holidayPaidUnits: 0,
    hourCredit: 0,
    workedMinutes: 0,
    expectedMinutes: 0,
    lateMinutes: 0,
    earlyLeaveMinutes: 0,
    flags: [],
    absenceStatus: null,
    pairs: null,
    ...p,
  };
}

/** Một cặp vào–ra ĐÃ ĐÓNG, đúng hình dạng engine ghi. */
const CAP_DONG = [{ open: false, inId: "i1", outId: "o1" }];
/** Mới quét vào, chưa quét ra. */
const CAP_HO = [{ open: true, inId: "i1" }];

/** Đối số cố định của một tháng 9/2026 đã trôi qua trọn vẹn. */
const THANG_9 = {
  kyKhoa: "2026-09",
  dauThang: "2026-09-01",
  cuoiThang: "2026-09-30",
  homNay: "2026-10-05",
  congChuan: 24 as number | null,
  kyTrangThai: "OPEN" as const,
  kyChotLuc: null,
  don: { choDuyet: 0, daDuyetChinhCong: 0, tuChoi: 0 },
};

describe("gopNgayCong", () => {
  it("công thực nhận: overrideUnits THẮNG dayCreditEarned", () => {
    const g = gopNgayCong([
      ngay({ workDate: utc(2026, 9, 1), dayCreditEarned: 1 }),
      ngay({ workDate: utc(2026, 9, 2), dayCreditEarned: 1, overrideUnits: 0.5 }),
    ]);
    expect(g.units).toBe(1.5);
    expect(g.overrideDays).toBe(1);
  });

  it("ngayCoCa đếm NGÀY LÀM VIỆC có kế hoạch — ngày nghỉ không vào mẫu số", () => {
    const g = gopNgayCong([
      ngay({ workDate: utc(2026, 9, 1), dayCreditExpected: 1 }),
      ngay({ workDate: utc(2026, 9, 2), dayCreditExpected: 0.5 }),
      ngay({ workDate: utc(2026, 9, 3), dayType: "LEAVE", dayCreditExpected: 0 }),
      ngay({ workDate: utc(2026, 9, 4), dayType: "WEEKLY_OFF", dayCreditExpected: 0 }),
    ]);
    // 2 NGÀY, không phải 1,5 công. Đây chính là chỗ `noiQuy.caQuyDinh` đo khác.
    expect(g.ngayCoCa).toBe(2);
    expect(g.expectedUnits).toBe(1.5);
  });

  it("đi muộn / về sớm: đếm CẢ số lần LẪN số phút", () => {
    const g = gopNgayCong([
      ngay({ workDate: utc(2026, 9, 1), lateMinutes: 3 }),
      ngay({ workDate: utc(2026, 9, 2), lateMinutes: 90, earlyLeaveMinutes: 10 }),
      ngay({ workDate: utc(2026, 9, 3) }),
    ]);
    expect(g.lateCount).toBe(2);
    expect(g.latePhut).toBe(93); // 2 lần × 3′ ≠ 2 lần × 90′ — bày một vế là ép người đọc suy
    expect(g.earlyLeaveCount).toBe(1);
    expect(g.earlyLeavePhut).toBe(10);
  });

  it("ngày có vấn đề: KHONG_CO_LUOT chỉ tính cho ngày LÀM VIỆC", () => {
    const g = gopNgayCong([
      ngay({ workDate: utc(2026, 9, 1), flags: ["KHONG_CO_LUOT"] }),
      // Ngày nghỉ không có lượt quét là chuyện bình thường — đếm nó là dựng báo động giả.
      ngay({ workDate: utc(2026, 9, 2), dayType: "LEAVE", flags: ["KHONG_CO_LUOT"] }),
    ]);
    expect(g.missingTapDays).toBe(1);
    expect(g.flaggedDays).toBe(2); // cờ vẫn là cờ ở cả hai ngày
  });

  it("danh sách rỗng ⇒ mọi số là 0, không phải NaN", () => {
    const g = gopNgayCong([]);
    expect(g.units).toBe(0);
    expect(g.ngayCoCa).toBe(0);
    expect(g.unitsByDay).toEqual({});
  });
});

describe("tomTatCongThang — phạm vi (ràng buộc 2)", () => {
  it("tháng ĐANG CHẠY: nói rõ tính tới hôm nay và còn ngày chưa tới", () => {
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [],
      homNay: "2026-09-15",
    });
    expect(t.tinhToiNgay).toBe("2026-09-15");
    expect(t.gomNgayTuongLai).toBe(true);
  });

  it("tháng ĐÃ QUA: không còn 'tính tới', và không còn ngày tương lai", () => {
    const t = tomTatCongThang({ ...THANG_9, ngay: [] });
    expect(t.tinhToiNgay).toBeNull();
    expect(t.gomNgayTuongLai).toBe(false);
  });

  it("ngày CUỐI tháng: đã trọn tháng, không còn ngày chưa tới", () => {
    // Ranh giới: `homNay` = cuối tháng ⇒ vẫn "đang chạy" nhưng KHÔNG còn ngày tương lai.
    const t = tomTatCongThang({ ...THANG_9, ngay: [], homNay: "2026-09-30" });
    expect(t.tinhToiNgay).toBe("2026-09-30");
    expect(t.gomNgayTuongLai).toBe(false);
  });
});

describe("tomTatCongThang — năm số đầu trang", () => {
  it("ngayDaCham đếm ngày CÓ DẤU, không đếm ngày đủ giờ", () => {
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [
        // quét đủ
        ngay({ workDate: utc(2026, 9, 1), dayCreditExpected: 1, workedMinutes: 480 }),
        // quét vào, QUÊN quét ra ⇒ workedMinutes = 0 nhưng VẪN là đã có dấu
        ngay({
          workDate: utc(2026, 9, 2),
          dayCreditExpected: 1,
          workedMinutes: 0,
          flags: ["THIEU_LUOT_RA"],
        }),
        // không quét lượt nào
        ngay({
          workDate: utc(2026, 9, 3),
          dayCreditExpected: 1,
          flags: ["KHONG_CO_LUOT"],
        }),
      ],
    });
    expect(t.ngayDaCham).toBe(2);
    expect(t.ngayCoCa).toBe(3);
  });

  it("ngayCanXuLy đếm NGÀY, không đếm CỜ — một ngày nhiều cờ vẫn là một ngày", () => {
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [
        ngay({ workDate: utc(2026, 9, 1), flags: ["DI_MUON", "VE_SOM", "SAI_NOI_LAM"] }),
        ngay({ workDate: utc(2026, 9, 2), flags: ["KHONG_CO_LUOT"] }),
        // THIEU_GIO CỐ Ý không nằm trong tập "cần xử lý" — người đi làm không tự xử lý
        // được nó bằng một cái đơn.
        ngay({ workDate: utc(2026, 9, 3), flags: ["THIEU_GIO"] }),
      ],
    });
    expect(t.ngayCanXuLy).toBe(2);
  });

  it("congChuan null đi thẳng ra null — KHÔNG hoá thành 0", () => {
    // Mẫu số bịa thì mọi tỷ lệ đọc từ nó đều sai. Trang in "—" khi thấy null.
    const t = tomTatCongThang({ ...THANG_9, ngay: [], congChuan: null });
    expect(t.congChuan).toBeNull();
  });

  it("trạng thái kỳ đi thẳng ra, kể cả khi CHƯA LẬP", () => {
    expect(tomTatCongThang({ ...THANG_9, ngay: [], kyTrangThai: null }).kyTrangThai).toBeNull();
    const chot = tomTatCongThang({
      ...THANG_9,
      ngay: [],
      kyTrangThai: "LOCKED",
      kyChotLuc: utc(2026, 10, 3),
    });
    expect(chot.kyTrangThai).toBe("LOCKED");
    expect(chot.kyChotLuc).toEqual(utc(2026, 10, 3));
  });
});

describe("tomTatCongThang — chi tiết", () => {
  it("NGÀY NGHỈ tách đúng BA nhóm: phép (P) · theo ca (X) · lễ", () => {
    // ⚠️ Số LỆCH nhau ở ba nhóm — cố ý. Bản đầu của fixture này để 1–1–1, và lượt cấy
    // "đảo hai nhóm" ra XANH: đảo 1 với 1 cho lại đúng hai con số cũ. Ca test không chạm
    // tới nhánh đang canh thì nó không canh gì (luật 8, tầng sâu).
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [
        ngay({ workDate: utc(2026, 9, 1), dayType: "LEAVE", leaveUnits: 1 }),
        ngay({ workDate: utc(2026, 9, 2), dayType: "LEAVE", leaveUnits: 0 }),
        ngay({ workDate: utc(2026, 9, 3), dayType: "LEAVE", leaveUnits: 1 }),
        ngay({ workDate: utc(2026, 9, 5), dayType: "WEEKLY_OFF" }),
        ngay({ workDate: utc(2026, 9, 6), dayType: "WEEKLY_OFF" }),
        ngay({ workDate: utc(2026, 9, 2), dayType: "HOLIDAY" }),
      ],
    });
    expect([t.nghiPhep, t.nghiTuan, t.nghiLe]).toEqual([3, 2, 1]);
  });

  it("nghỉ phép tách tiếp CÓ LƯƠNG / KHÔNG LƯƠNG, và hai vế phải cộng lại bằng tổng", () => {
    // 2 có lương / 1 không — LỆCH nhau, kẻo đảo hai nhóm vẫn ra đúng số cũ (luật 8 tầng sâu).
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [
        ngay({ workDate: utc(2026, 9, 1), dayType: "LEAVE", leaveUnits: 1 }),
        ngay({ workDate: utc(2026, 9, 2), dayType: "LEAVE", leaveUnits: 0.5 }),
        ngay({ workDate: utc(2026, 9, 3), dayType: "LEAVE", leaveUnits: 0 }),
      ],
    });
    expect(t.nghiPhepCoLuong).toBe(2);
    expect(t.nghiPhepKhongLuong).toBe(1);
    expect(t.nghiPhepCoLuong + t.nghiPhepKhongLuong).toBe(t.nghiPhep);
  });

  it("công tác: đếm ngày mã NG, và tách riêng ngày ĐỦ CẶP vào/ra", () => {
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [
        ngay({ workDate: utc(2026, 9, 1), templateCode: "NG", pairs: CAP_DONG }),
        ngay({ workDate: utc(2026, 9, 2), templateCode: "NG", pairs: CAP_HO }),
        ngay({ workDate: utc(2026, 9, 3), templateCode: "NG", pairs: null }),
        // Ngày thường CÓ đủ cặp vẫn KHÔNG phải ngày công tác.
        ngay({ workDate: utc(2026, 9, 4), templateCode: "HC", pairs: CAP_DONG }),
      ],
    });
    expect(t.congTacNgay).toBe(3);
    expect(t.congTacDuCap).toBe(1);
  });

  it("'tự chỉnh' LUÔN là null — đường ấy không tồn tại, và null nói đúng điều đó", () => {
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [ngay({ workDate: utc(2026, 9, 1), overrideUnits: 1 })],
      don: { choDuyet: 2, daDuyetChinhCong: 1, tuChoi: 3 },
    });
    expect(t.tuChinh).toBeNull(); // "—", KHÔNG phải 0
    expect(t.ghiDeCong).toBe(1);
    expect(t.donChinhDaDuyet).toBe(1);
    expect(t.donChoDuyet).toBe(2);
    expect(t.donTuChoi).toBe(3);
  });

  it("không đọc được đơn ⇒ mọi số đơn là null, không phải 0", () => {
    const t = tomTatCongThang({ ...THANG_9, ngay: [], don: null });
    expect([t.donChoDuyet, t.donTuChoi, t.donChinhDaDuyet]).toEqual([null, null, null]);
  });

  // ══ HAI NHÃN ĐÃ TỪNG SAI — ghim lại để không sai lần nữa ══════════════════════════════
  //
  // Chủ dự án 15/09: *"Sửa luôn hai nhãn sai đang có: 'Ngày nghỉ = 2' đang đếm ngày lễ."*
  // Ngày lễ KHÔNG phải ngày người ta xin nghỉ — gộp chung là biến một ngày công ty cho nghỉ
  // thành một ngày trừ vào phép của họ. Ca này canh đúng vế ấy, ở tầng SỐ chứ không ở nhãn:
  // nhãn có thể viết lại, nhưng số phải tách sẵn thì nhãn mới có gì để nói.
  it("ngày lễ KHÔNG rơi vào nghỉ phép — ba loại nghỉ tách hẳn nhau", () => {
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [
        ngay({ workDate: utc(2026, 9, 2), dayType: "HOLIDAY" }), // Quốc khánh
        ngay({ workDate: utc(2026, 9, 3), dayType: "HOLIDAY" }), // lễ nối
        ngay({ workDate: utc(2026, 9, 6), dayType: "WEEKLY_OFF", templateCode: "X" }),
        ngay({ workDate: utc(2026, 9, 7), dayType: "LEAVE", leaveUnits: 1 }),
      ],
    });
    expect(t.nghiLe).toBe(2);
    expect(t.nghiTuan).toBe(1);
    // ⭐ Đây là con số đã sai: nó phải là 1 (một ngày xin nghỉ), KHÔNG phải 3 hay 4.
    expect(t.nghiPhep).toBe(1);
    expect(t.nghiPhepCoLuong).toBe(1);
    expect(t.nghiPhepKhongLuong).toBe(0);
  });

  it("nghỉ phép KHÔNG LƯƠNG vẫn là nghỉ phép, chỉ khác ở vế có lương", () => {
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [
        ngay({ workDate: utc(2026, 9, 7), dayType: "LEAVE", leaveUnits: 1 }),
        ngay({ workDate: utc(2026, 9, 8), dayType: "LEAVE", leaveUnits: 0 }),
      ],
    });
    expect(t.nghiPhep).toBe(2);
    expect(t.nghiPhepCoLuong).toBe(1);
    expect(t.nghiPhepKhongLuong).toBe(1);
  });

  // ══ HAI SỐ MỚI của bố cục 4 ô + khối gấp (chốt 15/09) ═════════════════════════════════
  it("phutKeHoach cộng theo KẾ HOẠCH, độc lập với giờ làm thật", () => {
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [
        // Làm THIẾU so với kế hoạch.
        ngay({ workDate: utc(2026, 9, 1), expectedMinutes: 480, workedMinutes: 400 }),
        // Làm VƯỢT kế hoạch — hai vế phải đi riêng, không vế nào kẹp vế nào.
        ngay({ workDate: utc(2026, 9, 2), expectedMinutes: 480, workedMinutes: 530 }),
      ],
    });
    expect(t.phutKeHoach).toBe(960);
    expect(t.phutLam).toBe(930);
  });

  it("chuaCham = ngày CÓ CA trừ ngày đã có dấu; ngày nghỉ không vào mẫu số", () => {
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [
        // có ca + có dấu
        ngay({ workDate: utc(2026, 9, 1), dayCreditExpected: 1, workedMinutes: 480 }),
        // có ca + KHÔNG dấu nào
        ngay({
          workDate: utc(2026, 9, 2),
          dayCreditExpected: 1,
          flags: ["KHONG_CO_LUOT"],
        }),
        ngay({
          workDate: utc(2026, 9, 3),
          dayCreditExpected: 1,
          flags: ["KHONG_CO_LUOT"],
        }),
        // nghỉ phép: KHÔNG phải "chưa chấm" — không có gì để chấm.
        ngay({ workDate: utc(2026, 9, 4), dayType: "LEAVE", leaveUnits: 1 }),
      ],
    });
    expect(t.ngayCoCa).toBe(3);
    expect(t.ngayDaCham).toBe(1);
    expect(t.chuaCham).toBe(2);
  });

  it("quét vào quên quét ra vẫn là ĐÃ CHẤM ⇒ chuaCham = 0, không phải 1", () => {
    // Ranh giới dễ sai nhất: ngày ấy `workedMinutes = 0` nhưng nó mang `THIEU_LUOT_RA`
    // chứ không mang `KHONG_CO_LUOT`. Đếm bằng giờ làm sẽ xếp nó vào "chưa chấm" và người
    // ta đi tìm nhầm việc — họ cần nộp đơn bổ sung giờ ra, không phải đi quét lại.
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [
        ngay({
          workDate: utc(2026, 9, 1),
          dayCreditExpected: 1,
          workedMinutes: 0,
          flags: ["THIEU_LUOT_RA"],
        }),
      ],
    });
    expect(t.ngayCoCa).toBe(1);
    expect(t.chuaCham).toBe(0);
    expect(t.thieuLuotNgay).toBe(1);
  });

  it("thiếu lượt gộp cả RA_KHONG_CO_VAO — cùng một việc phải đi nộp đơn", () => {
    const t = tomTatCongThang({
      ...THANG_9,
      ngay: [
        ngay({ workDate: utc(2026, 9, 1), flags: ["THIEU_LUOT_RA"] }),
        ngay({ workDate: utc(2026, 9, 2), flags: ["RA_KHONG_CO_VAO"] }),
        ngay({ workDate: utc(2026, 9, 3), flags: ["DI_MUON"] }),
      ],
    });
    expect(t.thieuLuotNgay).toBe(2);
  });
});
