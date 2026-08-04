import { describe, it, expect } from "vitest";
import { discountFromPercent, needsDiscountApproval } from "./discount";

// BGĐ 31/07 — giảm giá: % → tiền, và quy tắc "khi nào cần duyệt".

describe("discountFromPercent", () => {
  it("quy % ra tiền, làm tròn", () => {
    expect(discountFromPercent(1_000_000, 10)).toBe(100_000);
    expect(discountFromPercent(3_333_333, 15)).toBe(500_000); // 499_999.95 → 500_000
  });

  it("clamp trong [0, tạm tính] — không âm, không vượt tổng", () => {
    expect(discountFromPercent(1_000_000, 0)).toBe(0);
    expect(discountFromPercent(1_000_000, -5)).toBe(0);
    expect(discountFromPercent(1_000_000, 100)).toBe(1_000_000);
    expect(discountFromPercent(1_000_000, 150)).toBe(1_000_000);
  });
});

describe("needsDiscountApproval", () => {
  // 03/08 — hệ mã khuyến mãi đã gỡ: KHÔNG còn ngoại lệ "giảm theo voucher thì
  // miễn duyệt". Mọi giảm giá đều do nhân viên nhập tay ⇒ đều phải QLCS duyệt.
  it("giảm giá > 0 → cần duyệt", () => {
    expect(needsDiscountApproval({ discountAmount: 200_000 })).toBe(true);
    expect(needsDiscountApproval({ discountAmount: 1 })).toBe(true);
  });

  it("không giảm → không cần duyệt", () => {
    expect(needsDiscountApproval({ discountAmount: 0 })).toBe(false);
  });
});
