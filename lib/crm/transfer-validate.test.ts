// FL2-03 — unit cho validate bàn giao lead (chặn cơ sở/sale đích trùng nguồn).
import { describe, it, expect } from "vitest";
import { validateTransferTarget } from "@/lib/crm/transfer-validate";

describe("[FL2-03] validateTransferTarget", () => {
  it("đổi sang sale khác, cùng cơ sở → OK", () => {
    const r = validateTransferTarget({
      fromCenterId: "cs1",
      fromSaleId: "saleA",
      toCenterId: "cs1",
      toSaleId: "saleB",
    });
    expect(r.ok).toBe(true);
  });

  it("đổi cơ sở, để trống sale (chia theo chế độ) → OK", () => {
    const r = validateTransferTarget({
      fromCenterId: "cs1",
      fromSaleId: "saleA",
      toCenterId: "cs2",
      toSaleId: null,
    });
    expect(r.ok).toBe(true);
  });

  it("sale đích = sale nguồn → chặn SAME_SALE", () => {
    const r = validateTransferTarget({
      fromCenterId: "cs1",
      fromSaleId: "saleA",
      toCenterId: "cs1",
      toSaleId: "saleA",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SAME_SALE");
  });

  it("sale đích = sale nguồn dù đổi cơ sở → vẫn chặn SAME_SALE", () => {
    const r = validateTransferTarget({
      fromCenterId: "cs1",
      fromSaleId: "saleA",
      toCenterId: "cs2",
      toSaleId: "saleA",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("SAME_SALE");
  });

  it("không đổi cơ sở, không chọn sale → chặn NO_CHANGE", () => {
    const r = validateTransferTarget({
      fromCenterId: "cs1",
      fromSaleId: "saleA",
      toCenterId: "cs1",
      toSaleId: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NO_CHANGE");
  });

  it("toCenter rỗng (giữ nguyên) + không sale → NO_CHANGE", () => {
    const r = validateTransferTarget({
      fromCenterId: "cs1",
      fromSaleId: null,
      toCenterId: null,
      toSaleId: null,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("NO_CHANGE");
  });

  it("message lỗi là tiếng Việt", () => {
    const r = validateTransferTarget({
      fromCenterId: "cs1",
      fromSaleId: "saleA",
      toCenterId: "cs1",
      toSaleId: "saleA",
    });
    if (!r.ok) expect(r.error.message).toMatch(/sale/i);
  });
});
