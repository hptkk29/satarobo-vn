import { describe, expect, it } from "vitest";
import { chonMoc, MOC, mocBatDau, nhanThoiDiem } from "./_moc";

// Buổi 09:00 giờ VN ngày 26/08/2026. Cột `@db.Date` ⇒ Prisma trả UTC-midnight của ngày VN.
const NGAY = new Date("2026-08-26T00:00:00.000Z");

describe("mocBatDau — ghép cột `date` (UTC-midnight ngày VN) với chuỗi giờ VN", () => {
  it("09:00 giờ VN ngày 26/08 = 02:00Z cùng ngày", () => {
    expect(mocBatDau(NGAY, "09:00")?.toISOString()).toBe("2026-08-26T02:00:00.000Z");
  });

  it("00:00 giờ VN lùi sang 17:00Z NGÀY HÔM TRƯỚC — chỗ dễ lệch 1 ngày nhất", () => {
    expect(mocBatDau(NGAY, "00:00")?.toISOString()).toBe("2026-08-25T17:00:00.000Z");
  });

  it("23:59 giờ VN vẫn nằm trong ngày UTC 26/08", () => {
    expect(mocBatDau(NGAY, "23:59")?.toISOString()).toBe("2026-08-26T16:59:00.000Z");
  });

  it("giữ nguyên phút lẻ", () => {
    expect(mocBatDau(NGAY, "17:45")?.toISOString()).toBe("2026-08-26T10:45:00.000Z");
  });

  it("startTime hỏng → null (không đoán bừa)", () => {
    for (const xau of ["", "9:00", "24:00", "09:60", "09h00", "0900"]) {
      expect(mocBatDau(NGAY, xau)).toBeNull();
    }
  });
});

describe("chonMoc — cửa sổ nhắc", () => {
  it("mốc 1 ngày chỉ nhận 23h–25h, KHÔNG nhận 36h (bug #21: chuông phát trước 1,5 ngày)", () => {
    expect(chonMoc(24)?.ten).toBe("1-ngay");
    expect(chonMoc(23)?.ten).toBe("1-ngay");
    expect(chonMoc(24.99)?.ten).toBe("1-ngay");
    expect(chonMoc(25)).toBeUndefined();
    expect(chonMoc(36)).toBeUndefined();
    expect(chonMoc(22.9)).toBeUndefined();
  });

  it("mốc 2 giờ chỉ nhận 1,5h–2,5h", () => {
    expect(chonMoc(2)?.ten).toBe("2-gio");
    expect(chonMoc(1.5)?.ten).toBe("2-gio");
    expect(chonMoc(2.49)?.ten).toBe("2-gio");
    expect(chonMoc(2.5)).toBeUndefined();
    expect(chonMoc(1.4)).toBeUndefined();
  });

  it("buổi đã bắt đầu hoặc còn quá xa thì không nhắc", () => {
    expect(chonMoc(0)).toBeUndefined();
    expect(chonMoc(-3)).toBeUndefined();
    expect(chonMoc(48)).toBeUndefined();
  });

  it("bề rộng cửa sổ nằm giữa nhịp cron (1h) và trần 2h", () => {
    for (const m of MOC) {
      // ≥ nhịp cron 1h: hẹp hơn thì buổi lọt khe giữa hai lần chạy, không ai được nhắc.
      // ⚠️ Mốc "2 giờ" rộng ĐÚNG 1h = biên tối thiểu: nếu một lượt cron trễ vài phút so
      // với lượt trước thì buổi rơi vào đúng khe đó vẫn có thể trượt. Chấp nhận có chủ
      // đích — nới lên 2h thì chuông "sắp bắt đầu" phát từ 3,5 tiếng trước.
      expect(m.denGio - m.tuGio).toBeGreaterThanOrEqual(1);
      // ≤ 2h: `dedupeKey` vĩnh viễn ⇒ chuông phát ngay ở MÉP TRÊN của cửa sổ. Cửa sổ
      // 12h–36h của bản cũ chính là lỗi #21 (phát trước 1,5 ngày, in "ngày mai").
      expect(m.denGio - m.tuGio).toBeLessThanOrEqual(2);
    }
  });

  it("giữ đúng con số cửa sổ đã chốt", () => {
    expect(MOC.map((m) => [m.ten, m.tuGio, m.denGio])).toEqual([
      ["1-ngay", 23, 25],
      ["2-gio", 1.5, 2.5],
    ]);
  });
});

describe("nhanThoiDiem — in giờ/ngày theo đồng hồ VN", () => {
  it("mốc UTC được đọc lại thành giờ VN, không phải giờ máy chạy", () => {
    // 2026-08-25T17:00:00Z = 00:00 ngày 26/08 giờ VN.
    expect(nhanThoiDiem(new Date("2026-08-25T17:00:00.000Z"))).toEqual({
      gio: "00:00",
      ngay: "26/08",
    });
  });

  it("đệm 0 cho giờ và ngày một chữ số", () => {
    expect(nhanThoiDiem(new Date("2026-09-02T01:05:00.000Z"))).toEqual({
      gio: "08:05",
      ngay: "02/09",
    });
  });

  it("khớp vòng với mocBatDau", () => {
    const batDau = mocBatDau(NGAY, "09:00");
    expect(batDau).not.toBeNull();
    expect(nhanThoiDiem(batDau as Date)).toEqual({ gio: "09:00", ngay: "26/08" });
  });
});
