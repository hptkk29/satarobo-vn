// Số phải thu NGAY quyết định CẢ số tiền in trên QR LẪN ngưỡng đối khớp của
// webhook SePay. Sai ở đây = khách trả đúng vẫn bị xếp "trả thiếu → xử lý tay",
// tức luồng tự xác nhận coi như không tồn tại với người đóng 2 đợt.
import { describe, it, expect } from "vitest";
import { computeDueNow } from "./due-now";

const noPlan = { installments: [] };

describe("computeDueNow — đơn KHÔNG chia đợt", () => {
  it("chưa thu gì → thu toàn bộ đơn", () => {
    expect(computeDueNow({ totalAmount: 5_000_000, paidAmount: 0, ...noPlan })).toEqual({
      amount: 5_000_000,
      label: "Toàn bộ đơn",
      soDot: null,
    });
  });

  it("đã thu một phần → chỉ còn phần thiếu", () => {
    expect(computeDueNow({ totalAmount: 5_000_000, paidAmount: 2_000_000, ...noPlan })).toEqual({
      amount: 3_000_000,
      label: "Còn thiếu",
      soDot: null,
    });
  });

  it("đã thu đủ/thừa → 0đ, không âm", () => {
    expect(computeDueNow({ totalAmount: 5_000_000, paidAmount: 6_000_000, ...noPlan }).amount).toBe(0);
  });
});

describe("computeDueNow — đơn CHIA 2 ĐỢT (ca gãy trước bản vá)", () => {
  const plan = [
    { soDot: 1, amount: 3_000_000, status: "PENDING" },
    { soDot: 2, amount: 2_000_000, status: "PENDING" },
  ];

  it("chưa đóng đợt nào → QR thu ĐỢT 1, không phải tổng đơn", () => {
    expect(
      computeDueNow({ totalAmount: 5_000_000, paidAmount: 0, installments: plan }),
    ).toEqual({ amount: 3_000_000, label: "Đợt 1", soDot: 1 });
  });

  it("đóng xong đợt 1 → chuyển sang thu đợt 2", () => {
    const after = [{ ...plan[0]!, status: "PAID" }, plan[1]!];
    expect(
      computeDueNow({ totalAmount: 5_000_000, paidAmount: 3_000_000, installments: after }),
    ).toEqual({ amount: 2_000_000, label: "Đợt 2", soDot: 2 });
  });

  it("đóng xong cả 2 đợt → hết nợ", () => {
    const done = plan.map((p) => ({ ...p, status: "PAID" }));
    expect(
      computeDueNow({ totalAmount: 5_000_000, paidAmount: 5_000_000, installments: done }).amount,
    ).toBe(0);
  });

  it("thứ tự đợt trong mảng lộn xộn vẫn lấy đúng đợt sớm nhất", () => {
    expect(
      computeDueNow({ totalAmount: 5_000_000, paidAmount: 0, installments: [plan[1]!, plan[0]!] }).soDot,
    ).toBe(1);
  });

  it("kế hoạch CHỜ DUYỆT → không dùng, quay về thu toàn bộ đơn", () => {
    // Chưa duyệt mà cho quét QR đóng đợt 1 là mở đường lách duyệt trả góp.
    expect(
      computeDueNow({
        totalAmount: 5_000_000,
        paidAmount: 0,
        installments: plan,
        installmentApprovalStatus: "PENDING_APPROVAL",
      }),
    ).toEqual({ amount: 5_000_000, label: "Toàn bộ đơn", soDot: null });
  });

  it("kế hoạch ĐÃ DUYỆT → dùng bình thường", () => {
    expect(
      computeDueNow({
        totalAmount: 5_000_000,
        paidAmount: 0,
        installments: plan,
        installmentApprovalStatus: "APPROVED",
      }).soDot,
    ).toBe(1);
  });

  it("đợt 0đ (đóng đủ 1 lần, dot2 = 0) bị bỏ qua, không sinh QR 0đ", () => {
    const oneShot = [
      { soDot: 1, amount: 5_000_000, status: "PAID" },
      { soDot: 2, amount: 0, status: "PENDING" },
    ];
    expect(
      computeDueNow({ totalAmount: 5_000_000, paidAmount: 5_000_000, installments: oneShot }),
    ).toEqual({ amount: 0, label: "Còn thiếu", soDot: null });
  });
});
