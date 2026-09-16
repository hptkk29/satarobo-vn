/**
 * R1-08 — getFunnelCounts (C8.1) + metrics. PG LOCAL.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { assertTestDb } from "../../e2e/_helpers/seed";
import { getFunnelCounts } from "../../../lib/crm/funnel-query";
import { computeFunnelMetrics } from "../../../lib/crm/marketing-metrics";

test.describe("[R1-08] Funnel dashboard", () => {
  test.beforeEach(async () => {
    assertTestDb();
    await db.messengerConversation.deleteMany({});
    await db.lead.deleteMany({});
    await db.adsInsightDaily.deleteMany({});
  });

  test("[R1-08-C8.1] đếm funnel L1/L2/L3 + spend đúng số seed", async () => {
    // L1 = 3 hội thoại
    for (const psid of ["a", "b", "c"]) {
      await db.messengerConversation.create({ data: { pageId: "P", psid, firstMessageAt: new Date() } });
    }
    // L2 = 2 lead qualified (1 trong đó converted = L3)
    await db.lead.create({ data: { parentName: "A", phone: "0900000001", qualifiedAt: new Date() } });
    await db.lead.create({ data: { parentName: "B", phone: "0900000002", qualifiedAt: new Date(), convertedAt: new Date() } });
    // 1 lead chưa qualified (không tính L2)
    await db.lead.create({ data: { parentName: "C", phone: "0900000003" } });
    // spend
    await db.adsInsightDaily.create({ data: { date: new Date("2026-06-01"), channel: "facebook", spend: 1_000_000 } });
    // revenue = 2tr (đơn CONFIRMED) + 1 đơn DRAFT không tính
    await db.order.create({ data: { code: "ORD-1", type: "COURSE", customerName: "A", customerPhone: "0900000001", status: "CONFIRMED", totalAmount: 2_000_000 } });
    await db.order.create({ data: { code: "ORD-2", type: "COURSE", customerName: "B", customerPhone: "0900000002", status: "DRAFT", totalAmount: 9_000_000 } });

    const counts = await getFunnelCounts();
    expect(counts.l1).toBe(3);
    expect(counts.l2).toBe(2);
    expect(counts.l3).toBe(1);
    expect(counts.spend).toBe(1_000_000);
    expect(counts.revenue).toBe(2_000_000); // chỉ đơn CONFIRMED

    const m = computeFunnelMetrics(counts);
    expect(m.cpl).toBe(500_000); // 1tr/2
    expect(m.crL2L3).toBe(0.5); // 1/2
    expect(m.roas).toBe(2); // 2tr/1tr
  });

  test.afterEach(async () => {
    await db.order.deleteMany({});
  });
});
