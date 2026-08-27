// R1-10 — commission engine (tiền). Pure, coverage cao.
import { describe, it, expect } from "vitest";
import {
  computeCommission,
  computeClawback,
  validateRates,
  chiaDeuTien,
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

// ─────────────────────────────────────────────────────────────────────────────
// 27/08/2026 — MỘT TẦNG CÓ THỂ CÓ NHIỀU NGƯỜI HƯỞNG (QC phụ trách cơ sở).
//
// Quy tắc đã chốt: nhiều người ⇒ CHIA ĐỀU, tổng của tầng KHÔNG đổi. Đây là lựa
// chọn an toàn về tiền: sai dữ liệu nhập tay thì tệ nhất là chia nhầm người, chứ
// không bao giờ trả VƯỢT tỉ lệ tầng (mà vượt là phá trần 8% trong tiền thật, dù
// `validateRates` không hề kêu vì nó chỉ canh CẤU HÌNH tỉ lệ).
describe("chia đều một tầng cho nhiều người hưởng", () => {
  it("hai QC → mỗi người một nửa, TỔNG vẫn đúng 1%", () => {
    const lines = computeCommission({
      revenue: 10_000_000,
      isRenewal: false,
      recipients: { QC: ["qc-a", "qc-b"] },
    });
    expect(lines.map((l) => [l.recipientId, l.amount])).toEqual([
      ["qc-a", 50_000],
      ["qc-b", 50_000],
    ]);
    expect(lines.reduce((s, l) => s + l.amount, 0)).toBe(100_000);
  });

  it("chia lẻ đồng: TỔNG khớp TUYỆT ĐỐI với một người hưởng duy nhất", () => {
    // 1% của 1.000.001đ = 10.000đ; chia 3 = 3.334 + 3.333 + 3.333. Chia rồi làm tròn
    // từng phần (3.333 × 3 = 9.999) là mỗi kỳ hụt vài đồng, và hụt mãi mãi.
    const mot = computeCommission({
      revenue: 1_000_001,
      isRenewal: false,
      recipients: { QC: "qc-a" },
    });
    const ba = computeCommission({
      revenue: 1_000_001,
      isRenewal: false,
      recipients: { QC: ["qc-a", "qc-b", "qc-c"] },
    });
    expect(ba.reduce((s, l) => s + l.amount, 0)).toBe(mot[0]!.amount);
    expect(ba.map((l) => l.amount)).toEqual([3_334, 3_333, 3_333]);
  });

  it("mảng RỖNG = chưa khai người hưởng ⇒ KHÔNG sinh dòng (tiền treo, không gán bừa)", () => {
    const lines = computeCommission({
      revenue: 10_000_000,
      isRenewal: false,
      recipients: { QC: [], QL_TT: [], SALE: "s" },
    });
    expect(lines.map((l) => l.tier)).toEqual(["SALE"]);
  });

  it("thu hồi khi hoàn tiền: dòng âm là ẢNH GƯƠNG của từng phần đã chia", () => {
    const goc = computeCommission({
      revenue: 1_000_001,
      isRenewal: false,
      recipients: { QC: ["qc-a", "qc-b", "qc-c"] },
    });
    const claw = computeClawback(goc, 1);
    expect(claw.map((l) => l.amount)).toEqual([-3_334, -3_333, -3_333]);
    // Hoàn sạch ⇒ hoa hồng về đúng 0, không lệch 1đ do làm tròn hai lần.
    expect(goc.reduce((s, l) => s + l.amount, 0) + claw.reduce((s, l) => s + l.amount, 0)).toBe(0);
  });

  it("một chuỗi (không phải mảng) vẫn chạy y như cũ — không phá call-site sẵn có", () => {
    const lines = computeCommission({ revenue: 10_000_000, isRenewal: false, recipients });
    expect(lines).toHaveLength(4);
  });
});

describe("chiaDeuTien — bất biến của phép chia", () => {
  it("tổng các phần LUÔN bằng tổng đầu vào (kể cả số âm và số lẻ)", () => {
    for (const tong of [0, 1, 7, 100_000, 1_000_001, -7, -100_001]) {
      for (const n of [1, 2, 3, 5, 7]) {
        const ids = Array.from({ length: n }, (_, i) => `u-${i}`);
        const phan = chiaDeuTien(tong, ids);
        expect(phan.reduce((s, p) => s + p.amount, 0)).toBe(tong);
        expect(phan).toHaveLength(n);
      }
    }
  });

  it("TẤT ĐỊNH — thứ tự đầu vào không đổi kết quả; trùng id chỉ tính một suất", () => {
    expect(chiaDeuTien(10, ["b", "a"])).toEqual(chiaDeuTien(10, ["a", "b"]));
    expect(chiaDeuTien(10, ["a", "a"])).toEqual([{ recipientId: "a", amount: 10 }]);
  });

  it("không có ai → không sinh phần nào", () => {
    expect(chiaDeuTien(100, [])).toEqual([]);
  });
});
