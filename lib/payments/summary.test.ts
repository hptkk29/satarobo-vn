// lib/payments/summary.test.ts — K3 (PAY-DEDUP): tổng "đã nộp" đọc từ 1 nguồn,
// không cộng đôi khi có bút toán điều chỉnh (Payment auto cũ đã soft-delete).
import { describe, it, expect } from "vitest";
import { getLeadPaymentSummary } from "./summary";
import type { scopedDb } from "@/lib/db-scope";

type OrderRow = { totalAmount: number; payments: { amount: number }[] };
type Captured = { where?: Record<string, unknown>; select?: Record<string, unknown> };

/** sdb giả: trả fixture như DB sau khi filter — đồng thời bắt args để assert bộ lọc. */
function fakeSdb(orders: OrderRow[], captured: Captured = {}) {
  return {
    order: {
      findMany: async (args: { where: Record<string, unknown>; select: Record<string, unknown> }) => {
        captured.where = args.where;
        captured.select = args.select;
        return orders;
      },
    },
  } as unknown as ReturnType<typeof scopedDb>;
}

describe("getLeadPaymentSummary (K3 PAY-DEDUP)", () => {
  it("[K3-DoD] 1 đơn 10tr trả 2 đợt (6tr + 4tr RECORDED) → đã nộp 10tr, còn thiếu 0, đủ điều kiện chốt", async () => {
    const s = await getLeadPaymentSummary(
      fakeSdb([{ totalAmount: 10_000_000, payments: [{ amount: 6_000_000 }, { amount: 4_000_000 }] }]),
      "lead1",
    );
    expect(s).toEqual({
      paid: 10_000_000,
      total: 10_000_000,
      remaining: 0,
      recordedCount: 2,
      hasOrder: true,
      scholarshipFull: false,
      eligible: true,
    });
  });

  it("[K3-DoD] điều chỉnh đợt 1 (6tr→5tr): Payment auto cũ đã soft-delete, chỉ còn khoản mới → tổng 9tr, KHÔNG cộng đôi", async () => {
    // Sau recordInstallmentPlan lần 2, DB chỉ trả về khoản active: đợt1 mới 5tr + đợt2 4tr.
    const s = await getLeadPaymentSummary(
      fakeSdb([{ totalAmount: 10_000_000, payments: [{ amount: 5_000_000 }, { amount: 4_000_000 }] }]),
      "lead1",
    );
    expect(s.paid).toBe(9_000_000); // KHÔNG phải 15tr (6+5+4) — khoản cũ không được đếm
    expect(s.remaining).toBe(1_000_000);
    expect(s.recordedCount).toBe(2);
  });

  it("[K3-guard] query nested Payment PHẢI lọc saleStatus=RECORDED + deletedAt=null (chặn đếm khoản soft-deleted/chưa ghi nhận)", async () => {
    const captured: Captured = {};
    await getLeadPaymentSummary(fakeSdb([], captured), "lead1");
    expect(captured.where).toEqual({ leadId: "lead1", deletedAt: null });
    const paymentsSelect = (captured.select as { payments: { where: unknown } }).payments;
    expect(paymentsSelect.where).toEqual({ saleStatus: "RECORDED", deletedAt: null });
  });

  it("học bổng toàn phần: có đơn, tổng 0đ, chưa có khoản → vẫn eligible", async () => {
    const s = await getLeadPaymentSummary(fakeSdb([{ totalAmount: 0, payments: [] }]), "lead1");
    expect(s.scholarshipFull).toBe(true);
    expect(s.eligible).toBe(true);
    expect(s.paid).toBe(0);
  });

  it("chưa có đơn → KHÔNG coi là miễn phí, không eligible", async () => {
    const s = await getLeadPaymentSummary(fakeSdb([]), "lead1");
    expect(s.hasOrder).toBe(false);
    expect(s.scholarshipFull).toBe(false);
    expect(s.eligible).toBe(false);
  });

  it("nộp thừa (paid > total) → remaining kẹp 0, không âm", async () => {
    const s = await getLeadPaymentSummary(
      fakeSdb([{ totalAmount: 5_000_000, payments: [{ amount: 6_000_000 }] }]),
      "lead1",
    );
    expect(s.remaining).toBe(0);
  });
});
