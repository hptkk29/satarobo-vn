// @vitest-environment node
/**
 * US-06 — `broadcastToConversation`: đẩy realtime bằng service role, FAIL-AND-FORGET.
 *
 * Bất biến được pin ở đây (AC3 + NT1 "Postgres là nguồn sự thật"):
 *  • Lỗi HTTP / mạng / thiếu env → TRẢ VỀ false, TUYỆT ĐỐI không throw. Một cú
 *    throw ở đây sẽ kéo đổ `sendChatMessage` sau khi tin ĐÃ commit ⇒ người gửi
 *    thấy "lỗi" trong khi tin nằm trong DB — đúng kiểu bug mất niềm tin nhất.
 *  • Thiếu env → warn ĐÚNG MỘT LẦN rồi im (môi trường chưa cấu hình Supabase vẫn
 *    chạy được, không rải log mỗi tin nhắn).
 *  • Gọi đúng REST broadcast của Supabase Realtime: topic `conv:{id}`, private:true,
 *    service role key ở CẢ `apikey` lẫn `Authorization` (đúng cách gọi đã chạy
 *    thật ở scripts/_zztest-chat-us02.ts bước 6).
 *
 * Module giữ state (cờ warn-once) ⇒ mỗi test `vi.resetModules()` + import lại.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL_ENV = "https://zztest.supabase.co";
const KEY_ENV = "service-role-key-for-unit-test-only";

const saved: Record<string, string | undefined> = {};
const ENV_KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;

/** Import lại module sạch state (cờ warn-once nằm ở scope module). */
async function loadBroadcast() {
  vi.resetModules();
  const mod = await import("./broadcast");
  return mod.broadcastToConversation;
}

/** Module đầy đủ (builder + primitive nhiều topic) — cũng cần state sạch. */
async function loadModule() {
  vi.resetModules();
  return import("./broadcast");
}

type SentMessage = { topic: string; event: string; payload: Record<string, unknown>; private: boolean };

function sentBody(init: RequestInit): SentMessage[] {
  return (JSON.parse(String(init.body)) as { messages: SentMessage[] }).messages;
}

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.NEXT_PUBLIC_SUPABASE_URL = URL_ENV;
  process.env.SUPABASE_SERVICE_ROLE_KEY = KEY_ENV;
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k] as string;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("[US-06] broadcastToConversation — đường thành công", () => {
  it("POST đúng REST broadcast: topic conv:{id}, private=true, service role ở apikey + Authorization", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const broadcast = await loadBroadcast();
    const ok = await broadcast("conv-1", "message.created", { id: "m1", clientMsgId: "c1" });

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${URL_ENV}/realtime/v1/api/broadcast`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe(KEY_ENV);
    expect(headers.Authorization).toBe(`Bearer ${KEY_ENV}`);

    const body = JSON.parse(String(init.body)) as {
      messages: { topic: string; event: string; payload: unknown; private: boolean }[];
    };
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0]?.topic).toBe("conv:conv-1");
    expect(body.messages[0]?.event).toBe("message.created");
    expect(body.messages[0]?.private).toBe(true);
    expect(body.messages[0]?.payload).toEqual({ id: "m1", clientMsgId: "c1" });
  });
});

describe("[US-06][AC3] fail-and-forget — không bao giờ throw ra ngoài", () => {
  it("HTTP 500 → false + warn, KHÔNG throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));

    const broadcast = await loadBroadcast();
    await expect(broadcast("conv-1", "message.created", {})).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });

  it("HTTP 401 (key sai) → false, KHÔNG throw", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unauthorized", { status: 401 })));

    const broadcast = await loadBroadcast();
    await expect(broadcast("conv-1", "message.created", {})).resolves.toBe(false);
  });

  it("fetch ném lỗi mạng → false, KHÔNG throw", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const broadcast = await loadBroadcast();
    await expect(broadcast("conv-1", "message.created", {})).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Topic mức NGƯỜI DÙNG `user:{id}` — vá món nợ badge/danh sách của Đợt 1.
// Bất biến sống-chết: N người nhận nằm trong ĐÚNG MỘT POST. Đường gửi tin có trần chờ
// 5s mỗi lời gọi; lặp N call là biến một nhóm lớp 65 người thành 65 × 5s rủi ro treo.
// ═════════════════════════════════════════════════════════════════════════════
describe("[bump] userBumpBroadcasts — builder thuần", () => {
  it("mỗi userId một phần tử topic user:{id}, event conversation.bumped, private=true", async () => {
    const { userBumpBroadcasts } = await loadModule();
    const out = userBumpBroadcasts(["u1", "u2", "u3"], {
      conversationId: "c1",
      messageId: "m1",
      kind: "CHAT",
      at: "2026-08-09T00:00:00.000Z",
    });
    expect(out.map((m) => m.topic)).toEqual(["user:u1", "user:u2", "user:u3"]);
    expect(out.every((m) => m.event === "conversation.bumped" && m.private === true)).toBe(true);
  });

  it("payload có ĐÚNG 4 khoá — không body/senderName/preview/unreadCount (BR-30)", async () => {
    const { userBumpBroadcasts } = await loadModule();
    const [one] = userBumpBroadcasts(["u1"], {
      conversationId: "c1",
      messageId: "m1",
      kind: "ANNOUNCEMENT",
      at: "2026-08-09T00:00:00.000Z",
    });
    expect(Object.keys(one!.payload).sort()).toEqual(["at", "conversationId", "kind", "messageId"]);
  });

  it("khử trùng userId + bỏ chuỗi rỗng (một người có mặt 2 lần chỉ nhận 1 bump)", async () => {
    const { userBumpBroadcasts } = await loadModule();
    const out = userBumpBroadcasts(["u1", "u1", "", "u2"], {
      conversationId: "c1",
      messageId: "m1",
      kind: "CHAT",
      at: "2026-08-09T00:00:00.000Z",
    });
    expect(out.map((m) => m.topic)).toEqual(["user:u1", "user:u2"]);
  });
});

describe("[bump] broadcastMessages — N người nhận nằm trong MỘT POST", () => {
  it("1 conv + 65 bump → fetch gọi ĐÚNG 1 lần, body có 66 phần tử", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const { broadcastMessages, conversationBroadcast, userBumpBroadcasts } = await loadModule();
    const ids = Array.from({ length: 65 }, (_, i) => `u${i}`);
    const ok = await broadcastMessages([
      conversationBroadcast("c1", "message.created", { id: "m1" }),
      ...userBumpBroadcasts(ids, {
        conversationId: "c1",
        messageId: "m1",
        kind: "CHAT",
        at: "2026-08-09T00:00:00.000Z",
      }),
    ]);

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const msgs = sentBody((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1]);
    expect(msgs).toHaveLength(66);
    expect(msgs[0]?.topic).toBe("conv:c1");
  });

  it("250 phần tử → chia 2 lô, không lô nào quá 200, KHÔNG mất người nhận", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const { broadcastMessages, userBumpBroadcasts } = await loadModule();
    const ids = Array.from({ length: 250 }, (_, i) => `u${i}`);
    await broadcastMessages(
      userBumpBroadcasts(ids, {
        conversationId: "c1",
        messageId: "m1",
        kind: "CHAT",
        at: "2026-08-09T00:00:00.000Z",
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const sizes = fetchMock.mock.calls.map(
      (c) => sentBody((c as unknown as [string, RequestInit])[1]).length,
    );
    expect(Math.max(...sizes)).toBeLessThanOrEqual(200);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(250);
  });

  it("mảng rỗng → KHÔNG gọi fetch, trả true (không POST body rỗng)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { broadcastMessages } = await loadModule();
    await expect(broadcastMessages([])).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("một lô lỗi mạng → false, KHÔNG throw (fail-and-forget giữ nguyên)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    const { broadcastMessages, conversationBroadcast } = await loadModule();
    await expect(
      broadcastMessages([conversationBroadcast("c1", "message.created", {})]),
    ).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalled();
  });
});

describe("[US-06] thiếu env → no-op, warn đúng 1 lần", () => {
  it("thiếu SUPABASE_SERVICE_ROLE_KEY → false, KHÔNG gọi fetch", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const broadcast = await loadBroadcast();
    await expect(broadcast("conv-1", "message.created", {})).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("thiếu NEXT_PUBLIC_SUPABASE_URL → gọi 3 lần chỉ warn 1 lần (không rải log mỗi tin)", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    vi.stubGlobal("fetch", vi.fn());

    const broadcast = await loadBroadcast();
    await broadcast("conv-1", "message.created", {});
    await broadcast("conv-1", "message.created", {});
    await broadcast("conv-2", "message.created", {});
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
