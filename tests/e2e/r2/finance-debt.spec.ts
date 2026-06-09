/**
 * R2-03/06 — confirm payment idempotent + overdue + parent relation (C1.1). PG LOCAL.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedUser } from "../../e2e/_helpers/seed";
import { testEmail } from "../../e2e/_helpers/fixtures";
import { confirmOrderPayment, getOverdueOrders } from "../../../lib/finance/debt";

const ACC = { id: "acc", name: "Kế toán" };

test.describe("[R2-03/06] Finance", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[R2-03-C3.3/C3.4] confirm payment → CONFIRMED, idempotent", async () => {
    const order = await db.order.create({
      data: { code: "INV-CS1-2026-9001", type: "COURSE", customerName: "A", customerPhone: "0900000001", totalAmount: 1_000_000, status: "PENDING_PAYMENT" },
    });
    const r1 = await confirmOrderPayment(ACC, order.id, "đã nhận tiền mặt");
    expect(r1.order.status).toBe("CONFIRMED");
    expect(r1.alreadyConfirmed).toBe(false);
    const r2 = await confirmOrderPayment(ACC, order.id); // gọi lại
    expect(r2.alreadyConfirmed).toBe(true);
    expect(await db.auditLog.count({ where: { entityType: "Order", entityId: order.id } })).toBe(1); // chỉ 1 lần ghi
  });

  test("[R2-06-C6.2] getOverdueOrders trả đơn quá hạn chưa thanh toán", async () => {
    await db.order.create({ data: { code: "INV-OLD", type: "COURSE", customerName: "A", customerPhone: "0900000002", status: "PENDING_PAYMENT", totalAmount: 1, createdAt: new Date("2020-01-01") } });
    await db.order.create({ data: { code: "INV-NEW", type: "COURSE", customerName: "B", customerPhone: "0900000003", status: "PENDING_PAYMENT", totalAmount: 1 } });
    await db.order.create({ data: { code: "INV-PAID", type: "COURSE", customerName: "C", customerPhone: "0900000004", status: "CONFIRMED", totalAmount: 1, createdAt: new Date("2020-01-01") } });
    const overdue = await getOverdueOrders({ olderThanDays: 7 });
    expect(overdue.map((o) => o.code)).toEqual(["INV-OLD"]); // chỉ đơn cũ chưa trả
  });

  test("[R2-01-C1.1/C1.3] 1 phụ huynh nhiều con (Student.parentUserId)", async () => {
    const parent = await seedUser({ email: testEmail("ph-multi"), role: "PARENT" });
    await db.student.create({ data: { name: "Bé A", parentUserId: parent.id } });
    await db.student.create({ data: { name: "Bé B", parentUserId: parent.id } });
    const children = await db.student.findMany({ where: { parentUserId: parent.id }, orderBy: { name: "asc" } });
    expect(children.map((c) => c.name)).toEqual(["Bé A", "Bé B"]);
  });
});
