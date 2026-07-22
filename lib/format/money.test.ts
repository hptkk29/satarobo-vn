import { describe, it, expect } from "vitest";
import { formatVndPlain, formatVndCompact } from "@/lib/format/money";

describe("formatVndPlain", () => {
  it("mặc định có khoảng trắng trước đ", () => {
    expect(formatVndPlain(1000000)).toBe("1.000.000 đ");
    expect(formatVndPlain(0)).toBe("0 đ");
  });
  it("withSpace=false → dính đ (giữ đúng site template cũ)", () => {
    expect(formatVndPlain(1500000, false)).toBe("1.500.000đ");
  });
});

describe("formatVndCompact", () => {
  it("rút gọn theo tr/tỷ/k cho trục biểu đồ", () => {
    expect(formatVndCompact(10_000_000)).toBe("10tr");
    expect(formatVndCompact(7_500_000)).toBe("7,5tr");
    expect(formatVndCompact(1_500_000_000)).toBe("1,5 tỷ");
    expect(formatVndCompact(900_000)).toBe("900k");
    expect(formatVndCompact(500)).toBe("500");
    expect(formatVndCompact(0)).toBe("0");
  });
});
