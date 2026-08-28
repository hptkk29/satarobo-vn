import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { bumpsContactClock, recordLeadActivity } from "./record-activity";

function fakeTx() {
  const created: unknown[] = [];
  const updated: unknown[] = [];
  const tx = {
    leadActivity: { create: vi.fn(async (a: unknown) => void created.push(a)) },
    lead: { update: vi.fn(async (a: unknown) => void updated.push(a)) },
  } as unknown as Prisma.TransactionClient;
  return { tx, created, updated };
}

describe("N-4 — một cửa ghi LeadActivity", () => {
  it("[N4-01] CALL/MESSAGE/NOTE/EMAIL do người thật ⇒ BUMP đồng hồ", async () => {
    for (const type of ["CALL", "MESSAGE", "NOTE", "EMAIL"] as const) {
      const { tx, updated } = fakeTx();
      await recordLeadActivity(tx, {
        leadId: "l1",
        actorId: "u1",
        actorName: "Sale A",
        type,
        content: "gọi khách",
      });
      expect(updated, `type=${type}`).toHaveLength(1);
    }
  });

  it("[N4-02] STATUS_CHANGE và HANDOVER KHÔNG bump — chống 'reset đồng hồ' bằng nút", async () => {
    // Đây là chốt chặn của OQ-C4. Nếu ai đó nới hàm này cho bump mọi loại thì Sale chỉ
    // cần bấm đổi trạng thái qua lại là cột "số ngày chưa tiếp cận" về 0 mà chưa gọi
    // khách lần nào — đúng thứ spec gọi là "làm đẹp giả".
    for (const type of ["STATUS_CHANGE", "HANDOVER"] as const) {
      const { tx, created, updated } = fakeTx();
      await recordLeadActivity(tx, {
        leadId: "l1",
        actorId: "u1",
        actorName: "Sale A",
        type,
        content: "đổi trạng thái",
      });
      expect(created, `type=${type}`).toHaveLength(1); // vẫn GHI hoạt động
      expect(updated, `type=${type}`).toHaveLength(0); // nhưng KHÔNG bump
    }
  });

  it("[N4-03] actorId = null (hệ thống sinh) KHÔNG bump, dù type đúng nhóm", async () => {
    // Hai điều kiện chứ không phải một: đường ĐỌC của C5 loại dòng actorId null, nên
    // bump ở đây sẽ làm cột hiển thị và bộ lọc nói hai chuyện khác nhau.
    const { tx, created, updated } = fakeTx();
    await recordLeadActivity(tx, {
      leadId: "l1",
      actorId: null,
      actorName: "Hệ thống",
      type: "NOTE",
      content: "tự động",
    });
    expect(created).toHaveLength(1);
    expect(updated).toHaveLength(0);
  });

  it("[N4-04] bumpsContactClock là hàm thuần, quyết định giống hệt đường ghi", () => {
    expect(bumpsContactClock({ type: "CALL", actorId: "u1" })).toBe(true);
    expect(bumpsContactClock({ type: "CALL", actorId: null })).toBe(false);
    expect(bumpsContactClock({ type: "STATUS_CHANGE", actorId: "u1" })).toBe(false);
  });
});
