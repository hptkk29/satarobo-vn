import { describe, it, expect } from "vitest";
import { computeSessionDates, expandHolidaySet, ymdLocal } from "./schedule";

// 2026-06-01 là Thứ 2.
const MON = new Date(2026, 5, 1);

describe("computeSessionDates", () => {
  it("lịch T2/T4, 4 buổi, không nghỉ → đúng 4 ngày T2/T4 liên tiếp", () => {
    const dates = computeSessionDates({ from: MON, scheduleDays: [1, 3], count: 4, holidays: new Set() });
    expect(dates.map(ymdLocal)).toEqual(["2026-06-01", "2026-06-03", "2026-06-08", "2026-06-10"]);
  });

  it("buổi trùng ngày nghỉ → DỜI sang buổi kế, tổng vẫn đủ 4", () => {
    // Nghỉ 2026-06-03 (T4 buổi 2) → buổi đó dời sang T2 kế (08/06), đẩy lùi phần sau.
    const holidays = new Set(["2026-06-03"]);
    const dates = computeSessionDates({ from: MON, scheduleDays: [1, 3], count: 4, holidays });
    expect(dates).toHaveLength(4);
    expect(dates.map(ymdLocal)).toEqual(["2026-06-01", "2026-06-08", "2026-06-10", "2026-06-15"]);
    expect(dates.map(ymdLocal)).not.toContain("2026-06-03");
  });

  it("scheduleDays rỗng → []", () => {
    expect(computeSessionDates({ from: MON, scheduleDays: [], count: 3, holidays: new Set() })).toEqual([]);
  });

  it("count 0 → []", () => {
    expect(computeSessionDates({ from: MON, scheduleDays: [1], count: 0, holidays: new Set() })).toEqual([]);
  });
});

describe("expandHolidaySet", () => {
  it("khoảng nghỉ date..endDate mở rộng thành từng ngày", () => {
    const set = expandHolidaySet([{ date: new Date(2026, 5, 1), endDate: new Date(2026, 5, 3) }]);
    expect([...set].sort()).toEqual(["2026-06-01", "2026-06-02", "2026-06-03"]);
  });
  it("nghỉ 1 ngày (endDate null)", () => {
    const set = expandHolidaySet([{ date: new Date(2026, 5, 10), endDate: null }]);
    expect([...set]).toEqual(["2026-06-10"]);
  });
});
