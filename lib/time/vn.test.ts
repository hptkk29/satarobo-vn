import { describe, it, expect } from "vitest";
import {
  parseVnYmd,
  vnAddDays,
  vnDateAt,
  vnDateOnly,
  vnEndOfDay,
  vnParts,
  vnStartOfDay,
  vnWeekday,
  vnYmd,
} from "./vn";

describe("vnDateAt", () => {
  it("dựng đúng thời điểm UTC cho đồng hồ VN", () => {
    // 17h30 T7 20/06/2026 ở VN = 10:30Z cùng ngày.
    expect(vnDateAt(2026, 5, 20, 17, 30).toISOString()).toBe("2026-06-20T10:30:00.000Z");
    // Nửa đêm VN = 17:00Z hôm trước.
    expect(vnDateAt(2026, 5, 20).toISOString()).toBe("2026-06-19T17:00:00.000Z");
  });
});

describe("vnParts / vnWeekday / vnYmd", () => {
  it("đọc theo lịch VN, không theo TZ máy chạy", () => {
    // 2026-06-20T18:00:00Z = 01:00 CN 21/06 ở VN.
    const d = new Date("2026-06-20T18:00:00.000Z");
    expect(vnYmd(d)).toBe("2026-06-21");
    expect(vnWeekday(d)).toBe(0); // CN
    expect(vnParts(d)).toMatchObject({ year: 2026, month: 5, day: 21, hour: 1, minute: 0 });
  });

  it("round-trip: dựng rồi đọc lại ra đúng thứ + giờ", () => {
    const sat = vnDateAt(2026, 5, 20, 17, 30);
    expect(vnWeekday(sat)).toBe(6); // T7
    expect(vnYmd(sat)).toBe("2026-06-20");
    expect(vnParts(sat)).toMatchObject({ hour: 17, minute: 30 });
  });
});

describe("vnStartOfDay / vnEndOfDay / vnAddDays", () => {
  it("mốc đầu & cuối ngày VN bao trọn ngày đó", () => {
    const noon = vnDateAt(2026, 5, 20, 12, 0);
    expect(vnYmd(vnStartOfDay(noon))).toBe("2026-06-20");
    expect(vnYmd(vnEndOfDay(noon))).toBe("2026-06-20");
    expect(vnEndOfDay(noon).getTime() - vnStartOfDay(noon).getTime()).toBe(86_400_000 - 1);
  });

  it("cộng ngày giữ nguyên giờ VN và trả object MỚI", () => {
    const src = vnDateAt(2026, 5, 20, 17, 30);
    const next = vnAddDays(src, 7);
    expect(vnYmd(next)).toBe("2026-06-27");
    expect(vnParts(next)).toMatchObject({ hour: 17, minute: 30 });
    expect(src.toISOString()).toBe("2026-06-20T10:30:00.000Z"); // không bị mutate
  });
});

describe("vnDateOnly / parseVnYmd", () => {
  it("vnDateOnly trùng quy ước z.coerce.date('YYYY-MM-DD')", () => {
    const evening = vnDateAt(2026, 5, 20, 19, 0); // 19h T7 ở VN
    expect(vnDateOnly(evening).toISOString()).toBe("2026-06-20T00:00:00.000Z");
    expect(vnDateOnly(evening).getTime()).toBe(new Date("2026-06-20").getTime());
  });

  it("parseVnYmd đọc ô <input type=date> thành nửa đêm VN", () => {
    expect(parseVnYmd("2026-06-20")!.toISOString()).toBe("2026-06-19T17:00:00.000Z");
    expect(vnYmd(parseVnYmd("2026-06-20")!)).toBe("2026-06-20");
    expect(parseVnYmd("20/06/2026")).toBeNull();
    expect(parseVnYmd("")).toBeNull();
  });
});
