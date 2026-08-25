/**
 * R7-01 — Lead có N con (LeadChild) + guard chuyển trạng thái sang DA_DANG_KY.
 * Postgres LOCAL (.env.test).
 *
 * - Tạo 1 lead + N LeadChild (quan hệ 1-N + cascade khi xoá lead).
 * - canTransitionLeadStatus: MOI→DA_DANG_KY chặn; CHO_QUYET_DINH→DA_DANG_KY
 *   chặn khi CHƯA có khoản ghi nhận; chỉ mở khi đã có khoản (R7-04).
 *
 * ⚠️ GĐ5 (25/08/2026) — CẦN NGƯỜI QUYẾT: `canTransitionLeadStatus` nay trả `ok`
 *   cho MỌI cặp (nhánh chặn REGISTERED đã gỡ khỏi lib/leads/status.ts, cổng tiền
 *   dời sang `evaluatePaymentGuard` trong convert). Ba ca R7-01-04/05/06 dưới đây
 *   mới chỉ được ÁNH XẠ TÊN enum, CHƯA sửa kỳ vọng: 04 và 05 sẽ ĐỎ khi chạy thật.
 *   Hoặc viết lại chúng cho cổng tiền mới, hoặc xoá — không thuộc phạm vi đổi tên.
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
        status: "MOI",
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

  test("[R7-01-04] MOI→DA_DANG_KY bị CHẶN (không phải từ CHO_QUYET_DINH)", () => {
    const r = canTransitionLeadStatus("MOI", "DA_DANG_KY", { hasRecordedPayment: true });
    expect(r.ok).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  test("[R7-01-05] CHO_QUYET_DINH→DA_DANG_KY bị CHẶN khi CHƯA có khoản ghi nhận", () => {
    const r = canTransitionLeadStatus("CHO_QUYET_DINH", "DA_DANG_KY", { hasRecordedPayment: false });
    expect(r.ok).toBe(false);
  });

  test("[R7-01-06] CHO_QUYET_DINH→DA_DANG_KY MỞ khi đã có khoản ghi nhận", () => {
    const r = canTransitionLeadStatus("CHO_QUYET_DINH", "DA_DANG_KY", { hasRecordedPayment: true });
    expect(r.ok).toBe(true);
  });

  test("[R7-01-07] enum DA_DANG_KY tồn tại trong DB (migration applied) — ghi/đọc được", async () => {
    const lead = await db.lead.create({
      data: { parentName: "PH Reg", phone: "0933333333", status: "DA_DANG_KY" },
      select: { status: true },
    });
    expect(lead.status).toBe("DA_DANG_KY");
  });
});
