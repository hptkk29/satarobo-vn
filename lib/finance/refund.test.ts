// W3-1 / LMS-9 — computeRefund (THUẦN). Pure: Σ confirmed − buổi đã học × đơn giá, clamp ≥0.
import { describe, it, expect } from "vitest";
import { computeRefund } from "@/lib/finance/refund";

describe("[W3-1] computeRefund", () => {
  it("đơn giá = round(finalPrice / sessionsTotal)", () => {
    expect(computeRefund({ paidConfirmed: 0, finalPrice: 9_000_000, sessionsTotal: 24, sessionsLearned: 0 }).unitPrice).toBe(375_000);
    // làm tròn
    expect(computeRefund({ paidConfirmed: 0, finalPrice: 1_000_000, sessionsTotal: 3, sessionsLearned: 0 }).unitPrice).toBe(333_333);
  });

  it("chưa học buổi nào → hoàn ≈ đã đóng", () => {
    const r = computeRefund({ paidConfirmed: 9_000_000, finalPrice: 9_000_000, sessionsTotal: 24, sessionsLearned: 0 });
    expect(r.proposedAmount).toBe(9_000_000);
  });

  it("học giữa khoá → hoàn = đã đóng − buổi học × đơn giá", () => {
    // 9tr / 24 buổi = 375k. Đã đóng 9tr, học 8 buổi → 9tr − 8×375k = 6tr.
    const r = computeRefund({ paidConfirmed: 9_000_000, finalPrice: 9_000_000, sessionsTotal: 24, sessionsLearned: 8 });
    expect(r.unitPrice).toBe(375_000);
    expect(r.proposedAmount).toBe(6_000_000);
  });

  it("học hết → hoàn 0", () => {
    const r = computeRefund({ paidConfirmed: 9_000_000, finalPrice: 9_000_000, sessionsTotal: 24, sessionsLearned: 24 });
    expect(r.proposedAmount).toBe(0);
  });

  it("clamp ≥ 0 (học quá số buổi / đóng thiếu)", () => {
    const r = computeRefund({ paidConfirmed: 1_000_000, finalPrice: 9_000_000, sessionsTotal: 24, sessionsLearned: 24 });
    expect(r.proposedAmount).toBe(0);
  });

  it("sessionsTotal = 0 → đơn giá 0, hoàn = đã đóng", () => {
    const r = computeRefund({ paidConfirmed: 2_000_000, finalPrice: 9_000_000, sessionsTotal: 0, sessionsLearned: 0 });
    expect(r.unitPrice).toBe(0);
    expect(r.proposedAmount).toBe(2_000_000);
  });
});
