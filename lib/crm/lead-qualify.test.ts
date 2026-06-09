// R1-04 — helper thuần: normalizePhone, canQualify (C4.2), commissionSource (C4.4).
import { describe, it, expect } from "vitest";
import { normalizePhone, canQualify, determineCommissionSource } from "@/lib/crm/lead-qualify";

describe("[R1-04] phone + commissionSource (thuần)", () => {
  it("normalizePhone giữ chữ số", () => {
    expect(normalizePhone("090 123 4567")).toBe("0901234567");
    expect(normalizePhone("+84 90-123-4567")).toBe("84901234567");
  });

  it("[R1-04-C4.2] canQualify: có SĐT hợp lệ → true; thiếu → false", () => {
    expect(canQualify("0901234567")).toBe(true);
    expect(canQualify("123")).toBe(false);
    expect(canQualify("")).toBe(false);
    expect(canQualify(null)).toBe(false);
  });

  it("[R1-04-C4.4] determineCommissionSource", () => {
    expect(determineCommissionSource({ isReferral: true })).toBe("REFERRAL");
    expect(determineCommissionSource({ isSaleSelf: true })).toBe("SALE_SELF");
    expect(determineCommissionSource({})).toBe("MARKETING_ADMIN");
  });
});
