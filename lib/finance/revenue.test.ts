import { describe, expect, it } from "vitest";
import { grossRevenueOf, netRevenueOf, revenueWhere } from "./revenue";

const row = (
  id: string,
  amount: number,
  accountantStatus: string,
  adjustmentOfId: string | null = null,
) => ({ id, amount, accountantStatus, adjustmentOfId });

describe("§B.6.0 — thực thu THUẦN", () => {
  it("[B0-01] bản gốc đã bị điều chỉnh KHÔNG được cộng thêm", () => {
    // p1 thu 1.000.000, sau đó kế toán điều chỉnh thành 800.000 (p2 trỏ về p1).
    // Cộng cả hai = 1.800.000 — đúng cái lỗi mà 3 màn cũ đang mắc.
    const rows = [row("p1", 1_000_000, "CONFIRMED"), row("p2", 800_000, "ADJUSTED", "p1")];
    expect(netRevenueOf(rows)).toBe(800_000);
  });

  it("[B0-02] REFUNDED CỘNG vào (amount đã âm sẵn) — không trừ hai lần", () => {
    // Đường hoàn tiền ghi amount ÂM. Ai đó "sửa cho chắc" bằng `- Math.abs(amount)` sẽ
    // trừ hai lần và doanh thu tụt gấp đôi số hoàn.
    const rows = [row("p1", 1_000_000, "CONFIRMED"), row("p2", -300_000, "REFUNDED")];
    expect(netRevenueOf(rows)).toBe(700_000);
  });

  it("[B0-03] bản ADJUSTED không có gốc trong tập vẫn được cộng", () => {
    expect(netRevenueOf([row("p2", 800_000, "ADJUSTED", "p1")])).toBe(800_000);
  });

  it("[B0-04] gộp ≠ thuần, và khoảng cách chính là thứ phải giải thích cho người dùng", () => {
    const rows = [
      row("p1", 1_000_000, "CONFIRMED"),
      row("p2", 800_000, "ADJUSTED", "p1"),
      row("p3", -300_000, "REFUNDED"),
    ];
    expect(grossRevenueOf(rows)).toBe(1_000_000); // số 3 màn cũ đang hiện
    expect(netRevenueOf(rows)).toBe(500_000); // số mới
  });

  it("[B0-05] revenueWhere dùng mốc NỬA MỞ và loại soft-delete", () => {
    const from = new Date("2026-08-01T00:00:00Z");
    const to = new Date("2026-09-01T00:00:00Z");
    const w = revenueWhere({ centerIds: ["c1"], dateFrom: from, dateToExclusive: to });
    expect(w.deletedAt).toBeNull();
    expect(w.paidDate).toEqual({ gte: from, lt: to });
    expect(w.accountantStatus).toEqual({ in: ["CONFIRMED", "ADJUSTED", "REFUNDED"] });
    expect(w.centerId).toEqual({ in: ["c1"] });
  });

  it("[B0-06] centerIds null ⇒ KHÔNG chèn mệnh đề cơ sở", () => {
    // `null` ở đây nghĩa "caller đã giao với tầm nhìn actor rồi". Nếu hàm tự đoán thêm
    // thì có hai nơi quyết định phạm vi, và chúng sẽ lệch nhau.
    const w = revenueWhere({
      centerIds: null,
      dateFrom: new Date(0),
      dateToExclusive: new Date(1),
    });
    expect("centerId" in w).toBe(false);
  });
});
