import { describe, it, expect } from "vitest";
import { extractOrderCode, decideSepayAction, normalizeContent } from "./sepay";

// BGĐ 31/07 — khớp giao dịch ngân hàng (SePay) với đơn hàng.

const baseOrder = {
  id: "o1",
  code: "ORD-260521-000001",
  status: "PENDING_PAYMENT",
  totalAmount: 5_000_000,
  gatewayTxnId: null as string | null,
  discountApprovalStatus: null as string | null,
};

describe("extractOrderCode", () => {
  it("đọc được mã đơn dù ngân hàng xoá gạch nối / thêm chữ", () => {
    expect(extractOrderCode("ORD260521000001 NGUYEN VAN A 0901234567")).toBe(
      "ORD-260521-000001",
    );
    expect(extractOrderCode("CK tu 0901234567 ORD-260521-000001 hoc phi")).toBe(
      "ORD-260521-000001",
    );
    expect(extractOrderCode("ord260521000001")).toBe("ORD-260521-000001");
  });

  it("nội dung không có mã → null (đối soát tay)", () => {
    expect(extractOrderCode("CHUYEN TIEN HOC PHI BE AN")).toBeNull();
    expect(extractOrderCode("")).toBeNull();
    expect(extractOrderCode(null)).toBeNull();
  });

  it("normalizeContent bỏ dấu + ký tự lạ", () => {
    expect(normalizeContent("Học phí — Bé An")).toBe("HOCPHIBEAN");
  });
});

describe("decideSepayAction", () => {
  it("đủ tiền, đơn chờ thanh toán → CONFIRM", () => {
    const r = decideSepayAction({
      payload: { id: 1, transferType: "in", transferAmount: 5_000_000 },
      order: baseOrder,
    });
    expect(r).toEqual({ action: "CONFIRM", orderId: "o1", amount: 5_000_000 });
  });

  it("trả DƯ vẫn xác nhận (chuyển thừa không chặn giao dịch)", () => {
    const r = decideSepayAction({
      payload: { id: 1, transferType: "in", transferAmount: 6_000_000 },
      order: baseOrder,
    });
    expect(r.action).toBe("CONFIRM");
  });

  it("tiền RA → SKIP", () => {
    const r = decideSepayAction({
      payload: { id: 1, transferType: "out", transferAmount: 5_000_000 },
      order: baseOrder,
    });
    expect(r).toEqual({ action: "SKIP", reason: "Không phải giao dịch tiền vào" });
  });

  it("không khớp đơn → MANUAL (đối soát tay), không lỗi", () => {
    const r = decideSepayAction({
      payload: { id: 1, transferType: "in", transferAmount: 5_000_000 },
      order: null,
    });
    expect(r.action).toBe("MANUAL");
  });

  it("cùng gatewayTxnId → SKIP (idempotent khi SePay gửi lại)", () => {
    const r = decideSepayAction({
      payload: { id: 77, transferType: "in", transferAmount: 5_000_000 },
      order: { ...baseOrder, gatewayTxnId: "77" },
    });
    expect(r).toEqual({ action: "SKIP", reason: "Giao dịch đã được xử lý" });
  });

  it("đơn đã CONFIRMED → SKIP", () => {
    const r = decideSepayAction({
      payload: { id: 1, transferType: "in", transferAmount: 5_000_000 },
      order: { ...baseOrder, status: "CONFIRMED" },
    });
    expect(r.action).toBe("SKIP");
  });

  it("giảm giá chưa duyệt → MANUAL (không vòng qua khâu duyệt)", () => {
    const r = decideSepayAction({
      payload: { id: 1, transferType: "in", transferAmount: 5_000_000 },
      order: { ...baseOrder, discountApprovalStatus: "PENDING_APPROVAL" },
    });
    expect(r.action).toBe("MANUAL");
  });

  it("trả THIẾU → MANUAL (người thật quyết định)", () => {
    const r = decideSepayAction({
      payload: { id: 1, transferType: "in", transferAmount: 2_000_000 },
      order: baseOrder,
    });
    expect(r.action).toBe("MANUAL");
  });
});
