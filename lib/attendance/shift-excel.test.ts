import { describe, it, expect } from "vitest";
import { shiftsToCell, parseShiftCell, parseDateCell } from "./shift-excel";

describe("shift-excel round-trip", () => {
  it("shiftsToCell theo thứ tự ca chuẩn", () => {
    expect(shiftsToCell(["CA_TOI", "CA_SANG"])).toBe("Sáng, Tối");
    expect(shiftsToCell([])).toBe("");
  });

  it("parseShiftCell đọc lại đúng ô đã export", () => {
    const cell = shiftsToCell(["CA_SANG", "CA_CHIEU"]);
    const r = parseShiftCell(cell);
    expect("shifts" in r && r.shifts).toEqual(["CA_SANG", "CA_CHIEU"]);
  });

  it("parseShiftCell chấp nhận biến thể không dấu / enum", () => {
    expect(parseShiftCell("sang, chieu")).toEqual({ shifts: ["CA_SANG", "CA_CHIEU"] });
    expect(parseShiftCell("CA_TOI")).toEqual({ shifts: ["CA_TOI"] });
  });

  it("parseShiftCell rỗng = nghỉ cả ngày", () => {
    expect(parseShiftCell("")).toEqual({ shifts: [] });
    expect(parseShiftCell(null)).toEqual({ shifts: [] });
  });

  it("parseShiftCell ca sai → lỗi", () => {
    const r = parseShiftCell("Trưa");
    expect("error" in r).toBe(true);
  });

  it("parseShiftCell loại trùng", () => {
    expect(parseShiftCell("Sáng, Sáng")).toEqual({ shifts: ["CA_SANG"] });
  });

  it("parseDateCell hợp lệ / sai", () => {
    expect(parseDateCell("2026-06-15")).toEqual({ date: "2026-06-15" });
    expect("error" in parseDateCell("15/06/2026")).toBe(true);
    expect("error" in parseDateCell("2026-13-40")).toBe(true);
  });
});
