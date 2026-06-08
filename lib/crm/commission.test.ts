// R1-10 — commission engine (tiền). Pure, coverage cao.
import { describe, it, expect } from "vitest";
import {
  computeCommission,
  computeClawback,
  validateRates,
  CommissionError,
  DEFAULT_RATES,
} from "@/lib/crm/commission";

const recipients = { QC: "qc", SALE_ADMIN: "adm", SALE: "sale", QL_TT: "tt" };

describe("[R1-10] commission engine", () => {
  it("[R1-10-C10.1] 4 tầng đúng % (QC1/Admin1/Sale4/TT2) trên doanh thu 10tr", () => {
    const lines = computeCommission({ revenue: 10_000_000, isRenewal: false, recipients });
    const byTier = Object.fromEntries(lines.map((l) => [l.tier, l.amount]));
    expect(byTier).toEqual({ QC: 100_000, SALE_ADMIN: 100_000, SALE: 400_000, QL_TT: 200_000 });
  });

  it("[R1-10-C10.2] Σ rate > 8% → từ chối", () => {
    expect(() => validateRates({ SALE: 0.07 })).toThrow(CommissionError); // 0.01+0.01+0.07+0.02=0.11
    expect(() => validateRates(DEFAULT_RATES)).not.toThrow(); // đúng 8%
  });

  it("[R1-10-C10.3] tái tục → KHÔNG có hoa hồng 4 tầng", () => {
    expect(computeCommission({ revenue: 10_000_000, isRenewal: true, recipients })).toEqual([]);
  });

  it("[R1-10-C10.4] refund → clawback dòng âm theo tỉ lệ", () => {
    const orig = computeCommission({ revenue: 10_000_000, isRenewal: false, recipients });
    const claw = computeClawback(orig, 1); // hoàn 100%
    expect(claw.every((l) => l.amount < 0 && l.isClawback)).toBe(true);
    const saleClaw = claw.find((l) => l.tier === "SALE");
    expect(saleClaw?.amount).toBe(-400_000);
    // hoàn 50%
    expect(computeClawback(orig, 0.5).find((l) => l.tier === "SALE")?.amount).toBe(-200_000);
  });

  it("[R1-10-C10.5] đổi sale giữa chừng → người chốt cuối hưởng tầng Sale", () => {
    const lines = computeCommission({
      revenue: 10_000_000, isRenewal: false,
      recipients: { ...recipients, SALE: "sale-cuoi" },
    });
    expect(lines.find((l) => l.tier === "SALE")?.recipientId).toBe("sale-cuoi");
  });

  it("chỉ sinh dòng cho tầng có recipient; revenue<=0 → rỗng", () => {
    expect(computeCommission({ revenue: 10_000_000, isRenewal: false, recipients: { SALE: "s" } })).toHaveLength(1);
    expect(computeCommission({ revenue: 0, isRenewal: false, recipients })).toEqual([]);
  });
});
