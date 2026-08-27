// lib/crm/commission-run.test.ts — dịch sổ `Payment` sang bút toán hoa hồng (THUẦN).
//
// Đây là chỗ dễ sai âm thầm nhất của cả đợt: nếu đọc nhầm cột ngày hay nhầm người
// hưởng thì con số vẫn "hợp lý" và không ai phát hiện. Nên nó được test riêng, tách
// khỏi phép nhân tỉ lệ.
import { describe, it, expect } from "vitest";
import { mapButToanHoaHong, type HangThanhToanHoaHong } from "./commission-run";

const NGAY_GOC = new Date("2026-08-10T09:00:00+07:00");
const NGAY_HOAN = new Date("2026-09-05T09:00:00+07:00");

function hang(patch: Partial<HangThanhToanHoaHong> = {}): HangThanhToanHoaHong {
  return {
    id: "p1",
    amount: 5_000_000,
    accountantStatus: "CONFIRMED",
    adjustmentOfId: null,
    paidDate: NGAY_GOC,
    adjustmentOf: null,
    enrollment: { renewedFromEnrollmentId: null },
    order: { leadId: "lead-1", lead: { convertedById: "u-sale", adminId: "u-admin" } },
    ...patch,
  };
}

describe("mapButToanHoaHong — người hưởng", () => {
  it("tầng SALE = Lead.convertedById (NGƯỜI CHỐT CUỐI), không phải người chăm", () => {
    // C10.5/B5: đổi sale giữa chừng → người chốt cuối hưởng 100% tầng Sale.
    // `convertedById` được ghi đúng lúc convert nên nó CHÍNH LÀ người chốt cuối;
    // `assignedToId` là người đang chăm và có thể đã đổi sau đó.
    const [bt] = mapButToanHoaHong([hang()]);
    expect(bt!.recipients.SALE).toBe("u-sale");
  });

  it("tầng SALE_ADMIN = Lead.adminId", () => {
    const [bt] = mapButToanHoaHong([hang()]);
    expect(bt!.recipients.SALE_ADMIN).toBe("u-admin");
  });

  it("tầng QC và QL_TT KHÔNG có người hưởng — hệ thống chưa có nguồn dữ liệu", () => {
    // Cố ý để trống: kho KHÔNG có cột nào chỉ ra "user QC phụ trách" hay "quản lý
    // của cơ sở" (Center.managerName là CHUỖI TÊN, OrgUnit không có managerId).
    // Bịa ra một người là trả tiền thật cho người sai. Engine bỏ qua tầng thiếu
    // người ⇒ 3% pool nằm im chờ BGĐ chốt, thay vì chảy nhầm chỗ.
    const [bt] = mapButToanHoaHong([hang()]);
    expect(bt!.recipients.QC).toBeUndefined();
    expect(bt!.recipients.QL_TT).toBeUndefined();
  });

  it("đơn không gắn lead (khách vãng lai) → không có người hưởng nào", () => {
    const [bt] = mapButToanHoaHong([hang({ order: { leadId: null, lead: null } })]);
    expect(bt!.recipients).toEqual({});
    expect(bt!.leadId).toBeNull();
  });

  it("lead chưa có convertedById → tầng SALE bỏ trống, KHÔNG rơi về người nhập phiếu", () => {
    const [bt] = mapButToanHoaHong([
      hang({ order: { leadId: "lead-1", lead: { convertedById: null, adminId: "u-admin" } } }),
    ]);
    expect(bt!.recipients.SALE).toBeUndefined();
    expect(bt!.recipients.SALE_ADMIN).toBe("u-admin");
  });
});

describe("mapButToanHoaHong — ngày nào quyết định cái gì", () => {
  it("bút toán thu: KỲ và TỈ LỆ cùng lấy theo paidDate", () => {
    const [bt] = mapButToanHoaHong([hang()]);
    expect(bt!.paidDate).toEqual(NGAY_GOC);
    expect(bt!.rateDate).toEqual(NGAY_GOC);
    expect(bt!.refundOfPaymentId).toBeNull();
  });

  it("bút toán HOÀN: KỲ theo ngày hoàn, TỈ LỆ theo ngày khoản gốc", () => {
    // `refundPayment()` ghi bản âm với paidDate = now (ngày hoàn) và adjustmentOfId
    // trỏ về gốc. Lấy nhầm ngày ở đây là hoặc sửa sổ kỳ đã chốt, hoặc thu hồi sai %.
    const [bt] = mapButToanHoaHong([
      hang({
        id: "r1",
        amount: -5_000_000,
        accountantStatus: "REFUNDED",
        adjustmentOfId: "p1",
        paidDate: NGAY_HOAN,
        adjustmentOf: { paidDate: NGAY_GOC },
      }),
    ]);
    expect(bt!.paidDate).toEqual(NGAY_HOAN); // kỳ 2026-09
    expect(bt!.rateDate).toEqual(NGAY_GOC); // tỉ lệ tháng 8
    expect(bt!.refundOfPaymentId).toBe("p1");
    expect(bt!.amount).toBe(-5_000_000);
  });

  it("bút toán hoàn mất dấu khoản gốc → tỉ lệ lùi về ngày hoàn (không nổ)", () => {
    // `adjustmentOf` là quan hệ SetNull: xoá mềm khoản gốc là mất đường trỏ ngược.
    // Vẫn phải thu hồi được, chỉ là áp tỉ lệ của kỳ hoàn.
    const [bt] = mapButToanHoaHong([
      hang({ id: "r1", amount: -5_000_000, accountantStatus: "REFUNDED", adjustmentOfId: null, paidDate: NGAY_HOAN, adjustmentOf: null }),
    ]);
    expect(bt!.rateDate).toEqual(NGAY_HOAN);
    expect(bt!.refundOfPaymentId).toBeNull();
  });

  it("bản ĐIỀU CHỈNH (ADJUSTED) giữ ngày của gốc ⇒ ở lại đúng kỳ gốc", () => {
    // `adjustPayment()` chép `paidDate` của gốc sang bản mới — nên điều chỉnh KHÔNG
    // nhảy kỳ. `WHERE_THUC_THU` đã loại bản gốc, nên ở đây chỉ còn bản đúng.
    const [bt] = mapButToanHoaHong([
      hang({ id: "a1", amount: 4_000_000, accountantStatus: "ADJUSTED", adjustmentOfId: "p1", adjustmentOf: { paidDate: NGAY_GOC } }),
    ]);
    expect(bt!.paidDate).toEqual(NGAY_GOC);
    expect(bt!.rateDate).toEqual(NGAY_GOC);
    // Bản điều chỉnh KHÔNG phải khoản hoàn — không được đánh dấu thu hồi.
    expect(bt!.refundOfPaymentId).toBeNull();
    expect(bt!.amount).toBe(4_000_000);
  });
});

describe("mapButToanHoaHong — tái tục", () => {
  it("ghi danh có renewedFromEnrollmentId → đánh dấu tái tục (C10.3: không hưởng)", () => {
    const [bt] = mapButToanHoaHong([hang({ enrollment: { renewedFromEnrollmentId: "enr-cu" } })]);
    expect(bt!.isRenewal).toBe(true);
  });

  it("khoản chưa gắn ghi danh → KHÔNG coi là tái tục (không có bằng chứng)", () => {
    const [bt] = mapButToanHoaHong([hang({ enrollment: null })]);
    expect(bt!.isRenewal).toBe(false);
  });
});

describe("mapButToanHoaHong — lớp chắn trạng thái kế toán", () => {
  it("loại bản GỐC đã bị một bản ADJUSTED thay thế (chống cộng đôi)", () => {
    // Đúng luật `butToanThucThu`: gốc `p1` bị `a1` thay ⇒ chỉ `a1` được tính.
    // Bỏ lớp này là doanh thu VÀ hoa hồng cùng phồng.
    const rows = [
      hang({ id: "p1", amount: 5_000_000, accountantStatus: "CONFIRMED" }),
      hang({ id: "a1", amount: 4_000_000, accountantStatus: "ADJUSTED", adjustmentOfId: "p1", adjustmentOf: { paidDate: NGAY_GOC } }),
    ];
    const ids = mapButToanHoaHong(rows).map((b) => b.paymentId);
    expect(ids).toEqual(["a1"]);
  });

  it("loại PENDING và REJECTED — chưa/không phải tiền thật", () => {
    const rows = [
      hang({ id: "p-pending", accountantStatus: "PENDING" }),
      hang({ id: "p-rejected", accountantStatus: "REJECTED" }),
      hang({ id: "p-ok", accountantStatus: "CONFIRMED" }),
    ];
    expect(mapButToanHoaHong(rows).map((b) => b.paymentId)).toEqual(["p-ok"]);
  });
});
