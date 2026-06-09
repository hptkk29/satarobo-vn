// R2-06 — computeDebt + paidOf (THUẦN). Pure.
import { describe, it, expect } from "vitest";
import { computeDebt, paidOf } from "@/lib/finance/debt";

describe("[R2-06] debt calc (C6.1)", () => {
  it("công nợ = total - paid (không âm)", () => {
    expect(computeDebt(5_000_000, 2_000_000)).toBe(3_000_000);
    expect(computeDebt(5_000_000, 5_000_000)).toBe(0);
    expect(computeDebt(5_000_000, 6_000_000)).toBe(0); // không âm
  });
  it("paidOf theo status", () => {
    expect(paidOf({ status: "CONFIRMED", totalAmount: 100 })).toBe(100);
    expect(paidOf({ status: "COMPLETED", totalAmount: 100 })).toBe(100);
    expect(paidOf({ status: "PENDING_PAYMENT", totalAmount: 100 })).toBe(0);
  });
});
