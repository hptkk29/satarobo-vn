/**
 * R6-G2 — Chống race tiền/convert: 2 convert song song → 1 bộ; double-confirm idempotent.
 * Postgres LOCAL (.env.test).
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb, seedOrg } from "../_helpers/seed";
import { convertLeadToEnrollment, ConvertError } from "../../../lib/crm/convert-lead";
import { confirmOrderPayment } from "../../../lib/finance/debt";

const ACTOR = { id: "csm", name: "Tư vấn" };

async function setup() {
  await db.center.create({ data: { code: "CS1", name: "CS1", slug: "cs1-g2", address: "a", city: "" } });
  await seedOrg(["HO", "CS1"]);
  const cs1 = (await db.center.findFirst({ where: { code: "CS1" }, select: { id: true } }))!.id;
  const course = await db.course.create({ data: { name: "Sata 1", slug: "sata-1-g2" } });
  const klass = await db.class.create({ data: { name: "Lớp A", courseId: course.id, centerId: cs1 } });
  const lead = await db.lead.create({
    data: { parentName: "Chị Lan", phone: "0901234567", centerId: cs1, status: "AWAITING_DECISION" },
  });
  return { cs1, course, klass, lead };
}

test.describe("[R6-G2] Chống race tiền/convert", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[R6-G2-T6-01] 2 convert SONG SONG cùng lead → đúng 1 bộ (student/order)", async () => {
    const { course, klass, lead } = await setup();
    const call = () =>
      convertLeadToEnrollment(ACTOR, {
        leadId: lead.id,
        classId: klass.id,
        courseId: course.id,
        parentEmail: "ph-g2@test.local",
        amount: 5_000_000,
      });

    const results = await Promise.allSettled([call(), call()]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1); // chỉ 1 lượt thành công
    expect(failed).toHaveLength(1);
    if (failed[0].status === "rejected") {
      expect(failed[0].reason).toBeInstanceOf(ConvertError);
      expect((failed[0].reason as ConvertError).code).toBe("ALREADY_ENROLLED");
    }

    // đúng 1 bộ trong DB.
    expect(await db.student.count()).toBe(1);
    expect(await db.order.count()).toBe(1);
    expect((await db.lead.findUnique({ where: { id: lead.id } }))!.status).toBe("ENROLLED");
  });

  test("[R6-G2-T6-02] convert lần 2 (tuần tự) → ALREADY_ENROLLED, không tạo thêm bộ", async () => {
    const { course, klass, lead } = await setup();
    await convertLeadToEnrollment(ACTOR, {
      leadId: lead.id, classId: klass.id, courseId: course.id, parentEmail: "ph2@test.local", amount: 1,
    });
    await expect(
      convertLeadToEnrollment(ACTOR, {
        leadId: lead.id, classId: klass.id, courseId: course.id, parentEmail: "ph2@test.local", amount: 1,
      }),
    ).rejects.toThrow(/chốt/);
    expect(await db.student.count()).toBe(1);
  });

  test("[R6-G2-T6-03] double-confirm thanh toán idempotent → 1 lần đổi trạng thái", async () => {
    await db.center.create({ data: { code: "CS9", name: "CS9", slug: "cs9-g2", address: "a", city: "" } });
    const order = await db.order.create({
      data: { code: "ORD-G2-1", type: "COURSE", customerName: "PH", customerPhone: "0900000000", totalAmount: 1_000_000, status: "PENDING_PAYMENT" },
    });
    const first = await confirmOrderPayment(ACTOR, order.id, "thu tiền");
    const second = await confirmOrderPayment(ACTOR, order.id, "thu tiền lần 2");
    expect(first.alreadyConfirmed).toBe(false);
    expect(second.alreadyConfirmed).toBe(true); // idempotent
    // chỉ 1 audit STATUS_CHANGE cho order này.
    const logs = await db.auditLog.count({
      where: { module: "finance", entityType: "Order", entityId: order.id, action: "STATUS_CHANGE" },
    });
    expect(logs).toBe(1);
  });
});
