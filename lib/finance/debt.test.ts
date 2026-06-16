// R2-06 — computeDebt + paidOf (THUẦN). Pure.
// R7-04 — computeEnrollmentDebt + overdueBucket + reminder-day decision (THUẦN).
import { describe, it, expect } from "vitest";
import {
  computeDebt,
  paidOf,
  computeEnrollmentDebt,
  overdueBucket,
  effectiveReminderDays,
  isReminderDue,
} from "@/lib/finance/debt";

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

describe("[R7-04] computeEnrollmentDebt (AC6)", () => {
  it("finalPrice - Σ confirmed", () => {
    expect(computeEnrollmentDebt(9_000_000, [{ amount: 5_000_000 }])).toBe(4_000_000);
    expect(
      computeEnrollmentDebt(9_000_000, [{ amount: 5_000_000 }, { amount: 4_000_000 }]),
    ).toBe(0);
  });
  it("đóng thừa → ÂM (trả raw, không clamp)", () => {
    expect(computeEnrollmentDebt(9_000_000, [{ amount: 10_000_000 }])).toBe(-1_000_000);
  });
  it("finalPrice null → 0; không có khoản → finalPrice", () => {
    expect(computeEnrollmentDebt(null, [{ amount: 1_000 }])).toBe(-1_000);
    expect(computeEnrollmentDebt(9_000_000, [])).toBe(9_000_000);
  });
});

describe("[R7-04] overdueBucket (công nợ đa chiều)", () => {
  const due = new Date("2026-06-15T00:00:00Z");
  const at = (d: string) => new Date(d + "T00:00:00Z");
  it("chưa tới hạn / null → none", () => {
    expect(overdueBucket(due, at("2026-06-15"))).toBe("none"); // đúng hạn (0 ngày)
    expect(overdueBucket(due, at("2026-06-10"))).toBe("none"); // trước hạn
    expect(overdueBucket(null, at("2026-06-30"))).toBe("none");
  });
  it("biên 1-7 / 8-30 / >30", () => {
    expect(overdueBucket(due, at("2026-06-16"))).toBe("1-7"); // +1
    expect(overdueBucket(due, at("2026-06-22"))).toBe("1-7"); // +7
    expect(overdueBucket(due, at("2026-06-23"))).toBe("8-30"); // +8
    expect(overdueBucket(due, at("2026-07-15"))).toBe("8-30"); // +30
    expect(overdueBucket(due, at("2026-07-16"))).toBe(">30"); // +31
  });
});

describe("[R7-04] reminder-day decision (AC4 / C4,C5)", () => {
  const due = new Date("2026-06-15T00:00:00Z");
  const at = (d: string) => new Date(d + "T00:00:00Z");

  it("effectiveReminderDays: override → fallback default 14", () => {
    expect(effectiveReminderDays(7, 14)).toBe(7);
    expect(effectiveReminderDays(null, 14)).toBe(14);
    expect(effectiveReminderDays(0, 14)).toBe(0); // 0 hợp lệ — nhắc đúng ngày hạn
  });

  it("X=7: D-8 chưa nhắc, từ D-7 trở đi đã đến hạn", () => {
    expect(isReminderDue(due, 7, at("2026-06-07"))).toBe(false); // D-8
    expect(isReminderDue(due, 7, at("2026-06-08"))).toBe(true); // D-7
    expect(isReminderDue(due, 7, at("2026-06-09"))).toBe(true); // D-6 (anti-spam ở tầng lastReminderAt)
  });

  it("reminderDays null → dùng default 14: nhắc từ D-14", () => {
    const days = effectiveReminderDays(null, 14);
    expect(isReminderDue(due, days, at("2026-05-31"))).toBe(false); // D-15
    expect(isReminderDue(due, days, at("2026-06-01"))).toBe(true); // D-14
  });

  it("ngày nhắc ≤ hôm nay (X lớn hơn khoảng cách) → nhắc ngay (C5)", () => {
    // dueDate +3 ngày, X=14 → remindFrom đã ở quá khứ → nhắc ngay.
    const dueSoon = at("2026-06-18");
    expect(isReminderDue(dueSoon, 14, at("2026-06-15"))).toBe(true);
  });
});
