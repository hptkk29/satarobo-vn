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
