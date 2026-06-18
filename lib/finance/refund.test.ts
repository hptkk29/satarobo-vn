import { describe, it, expect } from "vitest";
import { computeRefund } from "@/lib/finance/refund";

describe("computeRefund — PRORATE_SESSION (mặc định)", () => {
  it("rút giữa khóa: hoàn theo buổi còn lại", () => {
    // 10tr, học 4/10 buổi → earned 4tr, đã đóng 10tr → hoàn 6tr.
    const r = computeRefund({
      finalPrice: 10_000_000,
      confirmedPaid: 10_000_000,
      sessionsTotal: 10,
      sessionsUsed: 4,
    });
    expect(r.earned).toBe(4_000_000);
    expect(r.refundable).toBe(6_000_000);
  });

  it("đã đóng một phần: hoàn = đã đóng − earned, không âm", () => {
    // học 8/10 → earned 8tr; mới đóng 5tr → hoàn 0 (không âm).
    const r = computeRefund({
      finalPrice: 10_000_000,
      confirmedPaid: 5_000_000,
      sessionsTotal: 10,
      sessionsUsed: 8,
    });
    expect(r.earned).toBe(8_000_000);
    expect(r.refundable).toBe(0);
  });

  it("chưa học buổi nào → hoàn toàn bộ đã đóng", () => {
    const r = computeRefund({
      finalPrice: 10_000_000,
      confirmedPaid: 10_000_000,
      sessionsTotal: 10,
      sessionsUsed: 0,
    });
    expect(r.refundable).toBe(10_000_000);
  });

  it("tổng buổi = 0 → earned = finalPrice (không chia 0)", () => {
    const r = computeRefund({
      finalPrice: 10_000_000,
      confirmedPaid: 10_000_000,
      sessionsTotal: 0,
      sessionsUsed: 0,
    });
    expect(r.earned).toBe(10_000_000);
    expect(r.refundable).toBe(0);
  });

  it("clamp used > total", () => {
    const r = computeRefund({
      finalPrice: 9_000_000,
      confirmedPaid: 9_000_000,
      sessionsTotal: 9,
      sessionsUsed: 99,
    });
    expect(r.earned).toBe(9_000_000);
    expect(r.refundable).toBe(0);
  });
});

describe("computeRefund — FULL / NONE", () => {
  it("FULL hoàn hết đã đóng", () => {
    expect(
      computeRefund({ finalPrice: 1, confirmedPaid: 5_000_000, sessionsTotal: 10, sessionsUsed: 9, policy: "FULL" }).refundable,
    ).toBe(5_000_000);
  });
  it("NONE không hoàn", () => {
    expect(
      computeRefund({ finalPrice: 1, confirmedPaid: 5_000_000, sessionsTotal: 10, sessionsUsed: 0, policy: "NONE" }).refundable,
    ).toBe(0);
  });
});
