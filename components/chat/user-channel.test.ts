// components/chat/user-channel.test.ts — hub kênh `user:{id}`: refcount, resync, gia hạn token.
//
// Không chạm Supabase thật: transport + endpoint token đều bơm vào (DI), giống
// `use-chat-channel.test.ts`.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createUserChannelHub,
  type UserChannelEvent,
  type UserChannelHandlers,
  type UserChannelTransport,
} from "./user-channel";

const ME = "user-me";
/** TTL thật của `/api/chat/realtime-token`. */
const TTL_MS = 15 * 60_000;

function createFakeTransport() {
  const calls = {
    subscribe: [] as { userId: string; jwt: string }[],
    setAuth: [] as string[],
    unsubscribe: 0,
  };
  let handlers: UserChannelHandlers | null = null;

  const transport: UserChannelTransport = {
    subscribe(userId, jwt, h) {
      calls.subscribe.push({ userId, jwt });
      handlers = h;
      return {
        unsubscribe: () => {
          calls.unsubscribe += 1;
        },
      };
    },
    setAuth(jwt) {
      calls.setAuth.push(jwt);
    },
  };

  return {
    transport,
    calls,
    get handlers(): UserChannelHandlers {
      if (!handlers) throw new Error("chưa subscribe");
      return handlers;
    },
  };
}

function setup(over: { fetchToken?: () => Promise<{ token: string; expiresAt: string }> } = {}) {
  const fake = createFakeTransport();
  let seq = 0;
  const fetchToken =
    over.fetchToken ??
    vi.fn(async () => ({
      token: `jwt-${++seq}`,
      expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    }));
  const hub = createUserChannelHub({ transport: fake.transport, fetchToken });
  return { hub, fake, fetchToken };
}

async function flush(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
}

function bumpPayload(over: Record<string, unknown> = {}) {
  return {
    conversationId: "conv-1",
    messageId: "msg-1",
    kind: "CHAT",
    at: "2026-08-09T10:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-09T10:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createUserChannelHub", () => {
  it("3 người nghe cùng một userId ⇒ MỞ ĐÚNG MỘT kênh, topic `user:{id}`", async () => {
    const { hub, fake } = setup();
    const offs = [vi.fn(), vi.fn(), vi.fn()].map((l) => hub.subscribe(ME, l));
    await flush();

    expect(fake.calls.subscribe).toHaveLength(1);
    expect(fake.calls.subscribe[0].userId).toBe(ME);
    offs.forEach((off) => off());
  });

  it("người nghe cuối cùng rời mới đóng kênh", async () => {
    const { hub, fake } = setup();
    const off1 = hub.subscribe(ME, vi.fn());
    const off2 = hub.subscribe(ME, vi.fn());
    await flush();

    off1();
    expect(fake.calls.unsubscribe).toBe(0);
    off2();
    expect(fake.calls.unsubscribe).toBe(1);
  });

  it("MỖI lần SUBSCRIBED phát `resync` cho mọi người nghe (kể cả re-subscribe sau chập mạng)", async () => {
    const { hub, fake } = setup();
    const events: UserChannelEvent[] = [];
    const off = hub.subscribe(ME, (e) => events.push(e));
    await flush();

    fake.handlers.onStatus("SUBSCRIBED");
    fake.handlers.onStatus("CHANNEL_ERROR", new Error("rớt mạng"));
    fake.handlers.onStatus("SUBSCRIBED");

    expect(events.filter((e) => e.type === "resync")).toHaveLength(2);
    off();
  });

  it("broadcast `conversation.bumped` → event bump đã chuẩn hoá", async () => {
    const { hub, fake } = setup();
    const events: UserChannelEvent[] = [];
    const off = hub.subscribe(ME, (e) => events.push(e));
    await flush();

    fake.handlers.onBroadcast("conversation.bumped", bumpPayload());

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "bump" });
    if (events[0].type === "bump") {
      expect(events[0].bump.conversationId).toBe("conv-1");
      expect(events[0].bump.messageId).toBe("msg-1");
    }
    off();
  });

  it("payload dị dạng hoặc event lạ ⇒ KHÔNG gọi người nghe", async () => {
    const { hub, fake } = setup();
    const listener = vi.fn();
    const off = hub.subscribe(ME, listener);
    await flush();

    fake.handlers.onBroadcast("conversation.bumped", bumpPayload({ messageId: undefined }));
    fake.handlers.onBroadcast("conversation.bumped", bumpPayload({ at: "không-phải-ngày" }));
    fake.handlers.onBroadcast("message.created", { id: "m1" });

    expect(listener).not.toHaveBeenCalled();
    off();
  });

  it("một người nghe ném lỗi KHÔNG chặn những người còn lại", async () => {
    const { hub, fake } = setup();
    const good = vi.fn();
    const off1 = hub.subscribe(ME, () => {
      throw new Error("hỏng");
    });
    const off2 = hub.subscribe(ME, good);
    await flush();

    fake.handlers.onBroadcast("conversation.bumped", bumpPayload());
    expect(good).toHaveBeenCalledTimes(1);
    off1();
    off2();
  });

  it("tới ~80% TTL thì xin token mới và setAuth (kênh không rớt)", async () => {
    const { hub, fake, fetchToken } = setup();
    const off = hub.subscribe(ME, vi.fn());
    await flush();
    expect(fetchToken).toHaveBeenCalledTimes(1);

    await flush(TTL_MS * 0.8 + 10);
    expect(fetchToken).toHaveBeenCalledTimes(2);
    expect(fake.calls.setAuth).toEqual(["jwt-2"]);
    expect(fake.calls.unsubscribe).toBe(0);
    off();
  });

  it("xin token hỏng ⇒ thử lại sau 30s, KHÔNG đóng kênh", async () => {
    let n = 0;
    const fetchToken = vi.fn(async () => {
      n += 1;
      if (n === 2) throw new Error("mạng chớp");
      return { token: `jwt-${n}`, expiresAt: new Date(Date.now() + TTL_MS).toISOString() };
    });
    const { hub, fake } = setup({ fetchToken });
    const off = hub.subscribe(ME, vi.fn());
    await flush();

    await flush(TTL_MS * 0.8 + 10); // lần gia hạn hỏng
    expect(fake.calls.setAuth).toHaveLength(0);
    expect(fake.calls.unsubscribe).toBe(0);

    await flush(30_000 + 10); // thử lại
    expect(fake.calls.setAuth).toEqual(["jwt-3"]);
    off();
  });

  it("mở kênh hỏng ⇒ thử lại sau 30s (hub sống suốt phiên)", async () => {
    let n = 0;
    const fetchToken = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error("mạng chớp lúc tải trang");
      return { token: `jwt-${n}`, expiresAt: new Date(Date.now() + TTL_MS).toISOString() };
    });
    const { hub, fake } = setup({ fetchToken });
    const off = hub.subscribe(ME, vi.fn());
    await flush();
    expect(fake.calls.subscribe).toHaveLength(0);

    await flush(30_000 + 10);
    expect(fake.calls.subscribe).toHaveLength(1);
    off();
  });

  it("huỷ trước khi token về ⇒ không mở kênh mồ côi", async () => {
    const { hub, fake } = setup();
    const off = hub.subscribe(ME, vi.fn());
    off();
    await flush();
    expect(fake.calls.subscribe).toHaveLength(0);
  });

  it("người nghe đăng ký SAU khi kênh đã mở vẫn nhận bump (không chỉ người mở kênh)", async () => {
    const { hub, fake } = setup();
    const off1 = hub.subscribe(ME, vi.fn());
    await flush();
    const late = vi.fn();
    const off2 = hub.subscribe(ME, late);
    await flush();

    // Vẫn đúng MỘT kênh — người tới sau ghé nhờ kênh sẵn có.
    expect(fake.calls.subscribe).toHaveLength(1);
    fake.handlers.onBroadcast("conversation.bumped", bumpPayload());
    expect(late).toHaveBeenCalledTimes(1);
    off1();
    off2();
  });

  it("mở lại kênh (badge mount lại sau khi rời chat) ⇒ xin vé MỚI, không xài lại vé cũ", async () => {
    const { hub, fake, fetchToken } = setup();
    const off = hub.subscribe(ME, vi.fn());
    await flush();

    // Đã đi qua một lần gia hạn ⇒ vé jwt-1 trong tay hub là vé CŨ.
    await flush(TTL_MS * 0.8 + 10);
    expect(fake.calls.setAuth).toEqual(["jwt-2"]);

    off(); // người nghe cuối rời ⇒ kênh đóng
    expect(fake.calls.unsubscribe).toBe(1);

    const off2 = hub.subscribe(ME, vi.fn());
    await flush();

    // Vé cũ có thể đã hết TTL 15' ⇒ join bằng nó là kênh câm không báo lỗi.
    expect(fetchToken).toHaveBeenCalledTimes(3);
    expect(fake.calls.subscribe).toHaveLength(2);
    expect(fake.calls.subscribe[1].jwt).toBe("jwt-3");
    off2();
  });

  it("đổi người dùng trong cùng tab ⇒ đóng kênh cũ, mở kênh của người MỚI", async () => {
    const { hub, fake } = setup();
    const off1 = hub.subscribe(ME, vi.fn());
    await flush();

    const off2 = hub.subscribe("user-khac", vi.fn());
    await flush();

    expect(fake.calls.unsubscribe).toBe(1);
    expect(fake.calls.subscribe.map((c) => c.userId)).toEqual([ME, "user-khac"]);
    off1();
    off2();
  });

  it("kênh CŨ bắn muộn sau khi đã dựng lại ⇒ KHÔNG lọt vào người nghe (chặn theo generation)", async () => {
    const { hub, fake } = setup();
    const listener = vi.fn();
    const off1 = hub.subscribe(ME, listener);
    await flush();
    const stale = fake.handlers; // handlers của kênh người dùng CŨ

    // Đổi người dùng ⇒ kênh cũ bị đóng, nhưng `listener` vẫn còn trong danh sách.
    const off2 = hub.subscribe("user-khac", vi.fn());
    await flush();

    stale.onBroadcast("conversation.bumped", bumpPayload());
    stale.onStatus("SUBSCRIBED");

    expect(listener).not.toHaveBeenCalled();
    off1();
    off2();
  });
});
