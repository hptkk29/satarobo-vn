/**
 * R6-E1 — Học phí đóng đủ HOẶC 2 đợt (atomic) + công nợ. Postgres LOCAL (.env.test).
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import {
  recordInstallmentPlan,
  markInstallmentPaid,
  getOrderInstallments,
} from "../../../lib/orders/installments";
import { computeDebt } from "../../../lib/finance/debt";

let seq = 0;
async function makeOrder(total: number) {
  seq += 1;
  return db.order.create({
    data: {
      code: `ORD-E1-${seq}`,
      type: "COURSE",
      customerName: "PH Test",
      customerPhone: "0900000000",
      totalAmount: total,
      status: "PENDING_PAYMENT",
    },
  });
}

test.describe("[R6-E1] Học phí 2 đợt + công nợ", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[R6-E1-T1-01] 2 đợt tổng khớp → tạo 2 installment, còn nợ đợt 2", async () => {
    const order = await makeOrder(10_000_000);
    const res = await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 6_000_000,
      dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-07-01"),
      actorId: "acc-1",
    });
    expect(res.ok).toBe(true);

    const insts = await getOrderInstallments(order.id);
    expect(insts).toHaveLength(2);
    expect(insts[0].status).toBe("PAID");
    expect(insts[1].status).toBe("PENDING");

    const after = await db.order.findUnique({ where: { id: order.id }, select: { status: true } });
    expect(after!.status).toBe("PENDING_PAYMENT"); // chưa đủ → còn nợ
    expect(computeDebt(10_000_000, 6_000_000)).toBe(4_000_000);
  });

  test("[R6-E1-T2-01] tổng 2 đợt LỆCH học phí → từ chối", async () => {
    const order = await makeOrder(10_000_000);
    const res = await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 6_000_000,
      dot2Amount: 3_000_000, // tổng 9M ≠ 10M
      dot2DueDate: new Date("2026-07-01"),
      actorId: "acc-1",
    });
    expect(res.ok).toBe(false);
    expect(res.error).toContain("Tổng 2 đợt");
    // atomic: không tạo installment nào.
    expect(await getOrderInstallments(order.id)).toHaveLength(0);
  });

  test("[R6-E1-T1-02] đóng đủ 1 lần (dot2=0) → CONFIRMED, hết nợ", async () => {
    const order = await makeOrder(8_000_000);
    const res = await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 8_000_000,
      dot2Amount: 0,
      dot2DueDate: null,
      actorId: "acc-1",
    });
    expect(res.ok).toBe(true);
    const insts = await getOrderInstallments(order.id);
    expect(insts).toHaveLength(1);
    const after = await db.order.findUnique({ where: { id: order.id }, select: { status: true } });
    expect(after!.status).toBe("CONFIRMED");
  });

  test("[R6-E1-T6-01] đóng nốt đợt 2 → Order CONFIRMED (recompute atomic)", async () => {
    const order = await makeOrder(10_000_000);
    await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: 6_000_000,
      dot2Amount: 4_000_000,
      dot2DueDate: new Date("2026-07-01"),
      actorId: "acc-1",
    });
    const insts = await getOrderInstallments(order.id);
    const dot2 = insts.find((i) => i.soDot === 2)!;
    const res = await markInstallmentPaid(dot2.id, "acc-1");
    expect(res.ok).toBe(true);
    const after = await db.order.findUnique({ where: { id: order.id }, select: { status: true } });
    expect(after!.status).toBe("CONFIRMED");
  });

  test("[R6-E1-T2-02] số tiền âm → từ chối", async () => {
    const order = await makeOrder(5_000_000);
    const res = await recordInstallmentPlan({
      orderId: order.id,
      dot1Amount: -1,
      dot2Amount: 5_000_001,
      dot2DueDate: new Date("2026-07-01"),
      actorId: "acc-1",
    });
    expect(res.ok).toBe(false);
  });
});
