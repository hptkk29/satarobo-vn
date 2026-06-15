/**
 * R7-01 — Lead có N con (LeadChild) + guard chuyển trạng thái sang REGISTERED.
 * Postgres LOCAL (.env.test).
 *
 * - Tạo 1 lead + N LeadChild (quan hệ 1-N + cascade khi xoá lead).
 * - canTransitionLeadStatus: NEW→REGISTERED chặn; AWAITING_DECISION→REGISTERED
 *   chặn khi CHƯA có khoản ghi nhận; chỉ mở khi đã có khoản (R7-04).
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import { canTransitionLeadStatus } from "../../../lib/leads/status";
import { leadChildSchema } from "../../../lib/validators/lead";

test.describe("[R7-01] LeadChild + transition guard", () => {
  test.beforeEach(async () => {
    await resetDb();
  });

  test("[R7-01-01] 1 lead có N LeadChild (1-N) + đọc kèm children", async () => {
    const lead = await db.lead.create({
      data: {
        parentName: "Chị Hoa",
        phone: "0911111111",
        status: "NEW",
        children: {
          create: [
            { fullName: "Bé An", ageYears: 8 },
            { fullName: "Bé Bình", ageYears: 10 },
            { fullName: "Bé Châu", ageYears: 6, trialStatus: "SCHEDULED" },
          ],
        },
      },
      include: { children: true },
    });
    expect(lead.children).toHaveLength(3);
    expect(lead.children.map((c) => c.fullName).sort()).toEqual(["Bé An", "Bé Bình", "Bé Châu"]);
    expect(lead.children.every((c) => c.leadId === lead.id)).toBe(true);
  });

  test("[R7-01-02] xoá lead → cascade xoá LeadChild", async () => {
    const lead = await db.lead.create({
      data: { parentName: "Anh Tú", phone: "0922222222", children: { create: [{ fullName: "Bé X" }] } },
      include: { children: true },
    });
    expect(await db.leadChild.count({ where: { leadId: lead.id } })).toBe(1);
    await db.lead.delete({ where: { id: lead.id } });
    expect(await db.leadChild.count({ where: { leadId: lead.id } })).toBe(0);
  });

  test("[R7-01-03] leadChildSchema: thiếu fullName → invalid; hợp lệ → default trialStatus NONE", () => {
    expect(leadChildSchema.safeParse({ fullName: "" }).success).toBe(false);
    const ok = leadChildSchema.safeParse({ fullName: "Bé Y", ageYears: 7 });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.trialStatus).toBe("NONE");
  });

  test("[R7-01-04] NEW→REGISTERED bị CHẶN (không phải từ AWAITING_DECISION)", () => {
    const r = canTransitionLeadStatus("NEW", "REGISTERED", { hasRecordedPayment: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  test("[R7-01-05] AWAITING_DECISION→REGISTERED bị CHẶN khi CHƯA có khoản ghi nhận", () => {
    const r = canTransitionLeadStatus("AWAITING_DECISION", "REGISTERED", { hasRecordedPayment: false });
    expect(r.ok).toBe(false);
  });

  test("[R7-01-06] AWAITING_DECISION→REGISTERED MỞ khi đã có khoản ghi nhận", () => {
    const r = canTransitionLeadStatus("AWAITING_DECISION", "REGISTERED", { hasRecordedPayment: true });
    expect(r.ok).toBe(true);
  });

  test("[R7-01-07] enum REGISTERED tồn tại trong DB (migration applied) — ghi/đọc được", async () => {
    const lead = await db.lead.create({
      data: { parentName: "PH Reg", phone: "0933333333", status: "REGISTERED" },
      select: { status: true },
    });
    expect(lead.status).toBe("REGISTERED");
  });
});
