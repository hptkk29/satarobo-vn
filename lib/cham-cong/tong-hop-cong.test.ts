/**
 * lib/cham-cong/tong-hop-cong.test.ts — phép GỘP dùng chung (admin × site GV).
 *
 * ⚠️ Mọi ngày ở đây là ngày TUYỆT ĐỐI và hàm dưới KHÔNG đọc đồng hồ — luật 19. Nếu có ngày
 * nào phải so với "hôm nay" thì nó phải vào qua đối số, không vào qua `new Date()`.
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
    ...p,
  };
}

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

  it("ngayDaLam đếm bằng CHỨNG CỨ CÓ MẶT, không đếm bằng công", () => {
    const g = gopNgayCong([
      ngay({ workDate: utc(2026, 9, 1), workedMinutes: 480, dayCreditEarned: 1 }),
      // Ghi đè công cho một ngày KHÔNG đi làm: vẫn phải là 0 ngày đã làm, kẻo thẻ này
      // biến thành thẻ đếm công thứ hai và người xem tưởng mình có mặt.
      ngay({ workDate: utc(2026, 9, 2), workedMinutes: 0, overrideUnits: 1 }),
    ]);
    expect(g.ngayDaLam).toBe(1);
    expect(g.units).toBe(2);
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

describe("tomTatCongThang", () => {
  // ⚠️ HAI ngày phép CÓ lương, MỘT ngày KHÔNG lương — cố ý LỆCH nhau.
  // Bản đầu của fixture này để 1–1, và lượt cấy "đảo hai nhóm phép" ra XANH: đảo 1 với 1
  // cho lại đúng hai con số cũ. Ca test không chạm tới nhánh đang canh thì nó không canh gì
  // (luật 8, tầng sâu — sửa FIXTURE, không sửa phép cấy).
  const bonNgay: NgayCongGop[] = [
    ngay({ workDate: utc(2026, 9, 1), dayType: "HOLIDAY", holidayPaidUnits: 1 }),
    ngay({ workDate: utc(2026, 9, 2), dayType: "WEEKLY_OFF" }),
    ngay({ workDate: utc(2026, 9, 3), dayType: "LEAVE", leaveUnits: 1 }),
    ngay({ workDate: utc(2026, 9, 4), dayType: "LEAVE", leaveUnits: 0.5 }),
    ngay({ workDate: utc(2026, 9, 5), dayType: "LEAVE", leaveUnits: 0 }),
  ];

  it("NGÀY NGHỈ là ngày nghỉ CỦA NGƯỜI NÀY, tách đúng bốn nhóm", () => {
    const t = tomTatCongThang({ ngay: bonNgay, congChuan: 24, kyDaChot: false });
    expect(t.ngayNghi).toBe(5);
    expect(t.nhomNghi.map((n) => [n.khoa, n.soNgay])).toEqual([
      ["phep-co-luong", 2],
      ["phep-khong-luong", 1],
      ["le", 1],
      ["nghi-tuan", 1],
    ]);
  });

  it("nhóm nghỉ có 0 ngày thì KHÔNG hiện — đừng bày một hàng số 0", () => {
    const t = tomTatCongThang({
      ngay: [ngay({ workDate: utc(2026, 9, 1), dayType: "HOLIDAY" })],
      congChuan: null,
      kyDaChot: false,
    });
    expect(t.nhomNghi).toEqual([{ khoa: "le", nhan: "Nghỉ lễ", soNgay: 1 }]);
  });

  it("congChuan null đi thẳng ra null — KHÔNG hoá thành 0", () => {
    // Mẫu số bịa thì mọi tỷ lệ đọc từ nó đều sai. Trang in "—" khi thấy null.
    const t = tomTatCongThang({ ngay: bonNgay, congChuan: null, kyDaChot: true });
    expect(t.congChuan).toBeNull();
  });

  it("TẠM TÍNH đọc từ TRẠNG THÁI KỲ, không từ tháng", () => {
    expect(tomTatCongThang({ ngay: [], congChuan: 24, kyDaChot: false }).tamTinh).toBe(true);
    expect(tomTatCongThang({ ngay: [], congChuan: 24, kyDaChot: true }).tamTinh).toBe(false);
  });

  it("thiếu lượt ra gộp cả RA_KHONG_CO_VAO — cùng một việc phải đi nộp đơn", () => {
    const t = tomTatCongThang({
      ngay: [
        ngay({ workDate: utc(2026, 9, 1), flags: ["THIEU_LUOT_RA"] }),
        ngay({ workDate: utc(2026, 9, 2), flags: ["RA_KHONG_CO_VAO"] }),
        ngay({ workDate: utc(2026, 9, 3), flags: ["DI_MUON"] }),
      ],
      congChuan: null,
      kyDaChot: false,
    });
    expect(t.thieuLuotRa).toBe(2);
  });
});
