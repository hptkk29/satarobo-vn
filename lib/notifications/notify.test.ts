// lib/notifications/notify.test.ts — sự cố egress 05/09/2026: thông báo không đổi thì KHÔNG ghi,
// KHÔNG rung; chỉ rung khi tạo mới hoặc `reopen` kéo bản đã đọc về chưa đọc.
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const findMany = vi.fn();
  const upsert = vi.fn();
  const update = vi.fn();
  const broadcastMessages = vi.fn(async () => true);
  return {
    findMany,
    upsert,
    update,
    broadcastMessages,
    mockDb: { staffNotification: { findMany, upsert, update } },
  };
});

vi.mock("@/lib/db", () => ({ db: h.mockDb }));
vi.mock("@/lib/chat/broadcast", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/lib/chat/broadcast")>();
  return { ...mod, broadcastMessages: h.broadcastMessages };
});

import { ghiThongBaoNhanSu, notifyStaff } from "@/lib/notifications/notify";
import { classifyNotification } from "@/lib/notifications/catalog";

const THAM_SO = {
  userIds: ["u1", "u2"],
  dedupeKey: "sla:SLA-1:lead1",
  title: "Cảnh báo SLA (SLA-1)",
  body: "Chưa bàn giao > 4h",
  href: "/leads/lead1",
  entityId: "lead1",
};

const PHAN_LOAI = classifyNotification(THAM_SO.dedupeKey);

/** Dòng đã có trong DB khớp y nguyên với THAM_SO sau khi classify. */
function dongCu(userId: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    userId,
    readAt: null,
    title: THAM_SO.title,
    body: THAM_SO.body,
    href: THAM_SO.href,
    groupKey: PHAN_LOAI.groupKey,
    priority: PHAN_LOAI.priority,
    entityType: PHAN_LOAI.entityType,
    entityId: "lead1",
    expiresAt: null,
    ...extra,
  };
}

beforeEach(() => {
  h.findMany.mockReset();
  h.upsert.mockReset();
  h.update.mockReset();
  h.broadcastMessages.mockClear();
});

describe("ghiThongBaoNhanSu", () => {
  it("chưa có bản ghi ⇒ tạo + rung cho đúng người đó", async () => {
    h.findMany.mockResolvedValue([dongCu("u2")]); // u2 đã có, u1 chưa
    const kq = await ghiThongBaoNhanSu(THAM_SO);
    expect(h.upsert).toHaveBeenCalledTimes(1);
    expect(h.upsert.mock.calls[0][0].where.userId_dedupeKey.userId).toBe("u1");
    expect(h.update).not.toHaveBeenCalled();
    expect(kq).toEqual({ soNguoi: 2, canRung: ["u1"] });
  });

  it("bản ghi y nguyên ⇒ KHÔNG ghi, KHÔNG rung (đây là đường cron lặp)", async () => {
    h.findMany.mockResolvedValue([dongCu("u1"), dongCu("u2")]);
    const kq = await ghiThongBaoNhanSu(THAM_SO);
    expect(h.upsert).not.toHaveBeenCalled();
    expect(h.update).not.toHaveBeenCalled();
    expect(kq.canRung).toEqual([]);
  });

  it("nội dung đổi nhưng đang chưa đọc ⇒ ghi lại, không rung (badge không đổi số)", async () => {
    h.findMany.mockResolvedValue([dongCu("u1", { body: "cũ" })]);
    const kq = await ghiThongBaoNhanSu({ ...THAM_SO, userIds: ["u1"] });
    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update.mock.calls[0][0].data.readAt).toBeUndefined();
    expect(kq.canRung).toEqual([]);
  });

  it("`reopen` trên bản đã đọc ⇒ kéo về chưa đọc + rung", async () => {
    h.findMany.mockResolvedValue([dongCu("u1", { readAt: new Date("2026-09-01") })]);
    const kq = await ghiThongBaoNhanSu({ ...THAM_SO, userIds: ["u1"], reopen: true });
    expect(h.update.mock.calls[0][0].data.readAt).toBeNull();
    expect(kq.canRung).toEqual(["u1"]);
  });

  it("`reopen` trên bản chưa đọc, nội dung y nguyên ⇒ không làm gì", async () => {
    h.findMany.mockResolvedValue([dongCu("u1")]);
    const kq = await ghiThongBaoNhanSu({ ...THAM_SO, userIds: ["u1"], reopen: true });
    expect(h.update).not.toHaveBeenCalled();
    expect(kq.canRung).toEqual([]);
  });

  it("lọc trùng + rỗng trong danh sách người nhận", async () => {
    h.findMany.mockResolvedValue([]);
    const kq = await ghiThongBaoNhanSu({ ...THAM_SO, userIds: ["u1", "", "u1"] });
    expect(kq.soNguoi).toBe(1);
    expect(h.upsert).toHaveBeenCalledTimes(1);
  });
});

describe("notifyStaff", () => {
  it("chỉ broadcast tới người cần rung; không ai cần thì KHÔNG gọi Realtime", async () => {
    h.findMany.mockResolvedValue([dongCu("u1"), dongCu("u2")]);
    expect(await notifyStaff(THAM_SO)).toBe(2);
    expect(h.broadcastMessages).not.toHaveBeenCalled();

    h.findMany.mockResolvedValue([dongCu("u2")]);
    await notifyStaff(THAM_SO);
    expect(h.broadcastMessages).toHaveBeenCalledTimes(1);
    const msgs = (h.broadcastMessages.mock.calls as unknown as Array<[Array<{ topic: string; event: string }>]>)[0][0];
    expect(msgs).toEqual([expect.objectContaining({ topic: "user:u1", event: "notification.bumped" })]);
  });
});
