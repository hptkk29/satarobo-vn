import { describe, it, expect } from "vitest";
import { formatDateVN, formatDateDMY, formatDateTimeVN } from "./date";

// Noon-UTC → cùng ngày lịch trên mọi TZ thực tế (UTC-8..UTC+9) nên assert
// date-only ổn định, không phụ thuộc TZ máy CI.
const NOON_UTC = "2026-03-14T12:00:00Z";

describe("format/date", () => {
  it("formatDateVN = dd/M/yyyy vi-VN", () => {
    expect(formatDateVN(NOON_UTC)).toBe("14/3/2026");
  });

  it("formatDateDMY = dd/MM/yyyy (2 chữ số)", () => {
    expect(formatDateDMY(NOON_UTC)).toBe("14/03/2026");
  });

  it("nhận Date | string | number, giữ y hệt inline cũ", () => {
    const d = new Date(NOON_UTC);
    // Contract behavior-preserving: helper === biểu thức inline nó thay thế.
    expect(formatDateVN(d)).toBe(d.toLocaleDateString("vi-VN"));
    expect(formatDateVN(d.getTime())).toBe(new Date(d.getTime()).toLocaleDateString("vi-VN"));
    expect(formatDateDMY(d)).toBe(
      d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" }),
    );
    expect(formatDateTimeVN(d)).toBe(d.toLocaleString("vi-VN"));
  });
});
