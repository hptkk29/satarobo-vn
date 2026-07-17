import { describe, it, expect } from "vitest";
import { formatVndPlain } from "@/lib/format/money";

describe("formatVndPlain", () => {
  it("mặc định có khoảng trắng trước đ", () => {
    expect(formatVndPlain(1000000)).toBe("1.000.000 đ");
    expect(formatVndPlain(0)).toBe("0 đ");
  });
  it("withSpace=false → dính đ (giữ đúng site template cũ)", () => {
    expect(formatVndPlain(1500000, false)).toBe("1.500.000đ");
  });
});
