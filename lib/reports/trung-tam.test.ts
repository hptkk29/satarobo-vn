// R7-17 — Báo cáo trung tâm (tài chính + hài lòng + tái tục). Pure, không cần DB.
import { describe, it, expect } from "vitest";
import {
  monthKeyVN,
  receivableOf,
  summarizeFinance,
  revenueByMonth,
  revenueByCenter,
  summarizeSatisfaction,
  summarizeRetention,
  type PaymentRecord,
  type EnrollmentRecord,
} from "@/lib/reports/trung-tam";

describe("[R7-17] monthKeyVN", () => {
  it("gom theo giờ VN (UTC+7) — 23:30Z 31/01 → tháng 02", () => {
    expect(monthKeyVN(new Date("2026-01-31T23:30:00Z"))).toBe("2026-02");
  });
  it("giữa tháng giữ nguyên", () => {
    expect(monthKeyVN(new Date("2026-03-15T03:00:00Z"))).toBe("2026-03");
  });
});

describe("[R7-17] receivableOf", () => {
  it("ưu tiên finalPrice, fallback tuition, rồi 0", () => {
    expect(receivableOf({ finalPrice: 5_000_000, tuition: 9_000_000 })).toBe(5_000_000);
    expect(receivableOf({ finalPrice: null, tuition: 9_000_000 })).toBe(9_000_000);
    expect(receivableOf({ finalPrice: null, tuition: null })).toBe(0);
  });
});

const pay = (
  centerId: string | null,
  amount: number,
  accountantStatus: string,
  paidDate: string,
): PaymentRecord => ({ centerId, amount, accountantStatus, paidDate: new Date(paidDate) });

const enr = (
  studentId: string,
  centerId: string | null,
  finalPrice: number | null,
  tuition: number | null = null,
): EnrollmentRecord => ({
  studentId,
  centerId,
  finalPrice,
  tuition,
  enrolledAt: new Date("2026-01-10T00:00:00Z"),
});

describe("[R7-17] summarizeFinance", () => {
  it("tách confirmed/pending/refunded + công nợ clamp ≥ 0", () => {
    const payments = [
      pay("c1", 5_000_000, "CONFIRMED", "2026-01-05T02:00:00Z"),
      pay("c1", 3_000_000, "CONFIRMED", "2026-02-05T02:00:00Z"),
      pay("c1", 2_000_000, "PENDING", "2026-02-06T02:00:00Z"),
      pay("c1", 1_000_000, "REFUNDED", "2026-02-07T02:00:00Z"),
      pay("c1", 9_999, "REJECTED", "2026-02-08T02:00:00Z"),
    ];
    const enrollments = [enr("s1", "c1", 7_000_000), enr("s2", "c1", 6_000_000)];
    const f = summarizeFinance(payments, enrollments);
    expect(f.confirmedRevenue).toBe(8_000_000);
    expect(f.pendingRevenue).toBe(2_000_000);
    expect(f.refundedAmount).toBe(1_000_000);
    expect(f.confirmedCount).toBe(2);
    expect(f.totalReceivable).toBe(13_000_000);
    expect(f.debt).toBe(5_000_000); // 13tr - 8tr
  });

  it("kỳ rỗng → tất cả 0 (không lỗi)", () => {
    const f = summarizeFinance([], []);
    expect(f).toEqual({
      confirmedRevenue: 0,
      pendingRevenue: 0,
      refundedAmount: 0,
      totalReceivable: 0,
      debt: 0,
      confirmedCount: 0,
    });
  });

  it("debt clamp ≥ 0 khi thu nhiều hơn phải thu", () => {
    const f = summarizeFinance([pay("c1", 10_000_000, "CONFIRMED", "2026-01-05T02:00:00Z")], [
      enr("s1", "c1", 6_000_000),
    ]);
    expect(f.debt).toBe(0);
  });
});

describe("[R7-17] revenueByMonth", () => {
  it("gom theo tháng VN, sort tăng dần, chỉ confirmed/pending", () => {
    const rows = revenueByMonth([
      pay("c1", 5_000_000, "CONFIRMED", "2026-01-05T02:00:00Z"),
      pay("c1", 3_000_000, "CONFIRMED", "2026-02-05T02:00:00Z"),
      pay("c1", 1_000_000, "PENDING", "2026-02-06T02:00:00Z"),
      pay("c1", 2_000_000, "CONFIRMED", "2026-01-31T23:30:00Z"), // → tháng 02 VN
    ]);
    expect(rows).toEqual([
      { month: "2026-01", confirmed: 5_000_000, pending: 0 },
      { month: "2026-02", confirmed: 5_000_000, pending: 1_000_000 },
    ]);
  });
});

describe("[R7-17] revenueByCenter", () => {
  it("doanh thu + công nợ theo cơ sở, sort confirmed giảm dần", () => {
    const payments = [
      pay("c1", 4_000_000, "CONFIRMED", "2026-01-05T02:00:00Z"),
      pay("c2", 9_000_000, "CONFIRMED", "2026-01-05T02:00:00Z"),
      pay("c2", 1_000_000, "PENDING", "2026-01-06T02:00:00Z"),
    ];
    const enrollments = [
      enr("s1", "c1", 6_000_000),
      enr("s2", "c2", 9_000_000),
      enr("s3", "c2", 2_000_000),
    ];
    const rows = revenueByCenter(payments, enrollments);
    expect(rows.map((r) => r.centerId)).toEqual(["c2", "c1"]); // c2 confirmed cao hơn
    const c1 = rows.find((r) => r.centerId === "c1")!;
    const c2 = rows.find((r) => r.centerId === "c2")!;
    expect(c1).toMatchObject({ confirmed: 4_000_000, receivable: 6_000_000, debt: 2_000_000 });
    expect(c2).toMatchObject({ confirmed: 9_000_000, pending: 1_000_000, receivable: 11_000_000, debt: 2_000_000 });
  });

  it("centerId null → gom vào '—'", () => {
    const rows = revenueByCenter([pay(null, 1_000_000, "CONFIRMED", "2026-01-05T02:00:00Z")], []);
    expect(rows[0]?.centerId).toBe("—");
  });
});

describe("[R7-17] summarizeSatisfaction", () => {
  it("trung bình + phân bố + tỉ lệ hài lòng (sao 4-5)", () => {
    const s = summarizeSatisfaction([
      { valueNumber: 5 },
      { valueNumber: 4 },
      { valueNumber: 4 },
      { valueNumber: 2 },
      { valueNumber: null }, // bỏ qua
    ]);
    expect(s.count).toBe(4);
    expect(s.average).toBe((5 + 4 + 4 + 2) / 4); // 3.75
    expect(s.distribution).toEqual({ 1: 0, 2: 1, 3: 0, 4: 2, 5: 1 });
    expect(s.positiveRate).toBe(3 / 4);
  });

  it("rỗng → average 0, count 0 (không chia 0)", () => {
    const s = summarizeSatisfaction([]);
    expect(s.average).toBe(0);
    expect(s.count).toBe(0);
    expect(s.positiveRate).toBe(0);
  });
});

describe("[R7-17] summarizeRetention", () => {
  it("đếm học viên tái tục (≥2 lượt) + tỉ lệ", () => {
    const r = summarizeRetention([
      { studentId: "s1" },
      { studentId: "s1" }, // tái tục
      { studentId: "s2" },
      { studentId: "s3" },
      { studentId: "s3" },
      { studentId: "s3" }, // 3 lượt, vẫn đếm 1 returning
    ]);
    expect(r.totalStudents).toBe(3);
    expect(r.returningStudents).toBe(2); // s1, s3
    expect(r.totalEnrollments).toBe(6);
    expect(r.retentionRate).toBe(2 / 3);
  });

  it("rỗng → 0 (không chia 0)", () => {
    expect(summarizeRetention([])).toEqual({
      totalStudents: 0,
      returningStudents: 0,
      totalEnrollments: 0,
      retentionRate: 0,
    });
  });
});
