// R7-04 — payment 2 tầng: kiểm thử các guard fail-fast (return TRƯỚC khi chạm DB):
// amount > 0; reject/adjust/refund BẮT BUỘC reason. Phần chạm DB (record/confirm flow)
// phủ ở e2e (tests/e2e/r7) — ở đây chỉ test nhánh validate thuần.
import { describe, it, expect } from "vitest";
import {
  recordPayment,
  rejectPayment,
  adjustPayment,
  refundPayment,
} from "@/lib/finance/payment";

describe("[R7-04] recordPayment guard (AC1)", () => {
  it("amount ≤ 0 → fail trước khi ghi DB", async () => {
    const r0 = await recordPayment({
      orderId: "o1",
      amount: 0,
      method: "CASH",
      paidDate: new Date(),
      recordedById: "u1",
      centerId: null,
    });
    expect(r0.ok).toBe(false);
    if (!r0.ok) expect(r0.error).toMatch(/lớn hơn 0/);

    const rNeg = await recordPayment({
      orderId: "o1",
      amount: -5,
      method: "CASH",
      paidDate: new Date(),
      recordedById: "u1",
      centerId: null,
    });
    expect(rNeg.ok).toBe(false);
  });
});

describe("[R7-04] reject/adjust/refund yêu cầu reason (AC3 / C3)", () => {
  it("rejectPayment reason rỗng → fail", async () => {
    const r = await rejectPayment({ paymentId: "p1", confirmedById: "u1", reason: "   " });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Lý do/);
  });

  it("adjustPayment reason rỗng → fail", async () => {
    const r = await adjustPayment({ paymentId: "p1", confirmedById: "u1", reason: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Lý do/);
  });

  it("refundPayment reason rỗng → fail", async () => {
    const r = await refundPayment({ paymentId: "p1", confirmedById: "u1", reason: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Lý do/);
  });
});
