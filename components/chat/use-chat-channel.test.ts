// components/chat/use-chat-channel.test.ts — US-07 AC2/AC3/AC4/AC5 + gia hạn token + dọn dẹp.
//
// Không chạm Supabase thật: transport và endpoint token đều được bơm vào (DI). Fake timer
// để lái mốc gia hạn token mà không phải chờ 12 phút thật.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import {
  useChatChannel,
  type ChatChannelHandlers,
  type ChatChannelTransport,
  type ReconcilePage,
} from "./use-chat-channel";
import type { IncomingMessage } from "./chat-store";
import { getActiveConversation, setActiveConversation } from "./active-conversation";
import { subscribeConversationRead } from "./read-signal";

const CONV = "conv-1";
const ME = "user-me";
const OTHER = "user-other";
/** TTL thật của `/api/chat/realtime-token` (lib/chat/realtime-token.ts). */
const TTL_MS = 15 * 60_000;

function row(id: string, over: Partial<IncomingMessage> = {}): IncomingMessage {
  return {
    id,
    conversationId: CONV,
    kind: "CHAT",
    senderId: OTHER,
    body: `tin ${id}`,
    clientMsgId: null,
    createdAt: new Date(Date.parse("2026-08-09T10:00:00.000Z") + Number(id.replace(/\D/g, "")) * 1000),
    ...over,
  };
}

function page(messages: IncomingMessage[], over: Partial<ReconcilePage> = {}): ReconcilePage {
  return { messages, hasMore: false, nextSinceMessageId: messages[messages.length - 1]?.id ?? null, ...over };
}

function createFakeTransport() {
  const calls = {
    subscribe: [] as { conversationId: string; jwt: string }[],
    setAuth: [] as string[],
    unsubscribe: 0,
  };
  let handlers: ChatChannelHandlers | null = null;

  const transport: ChatChannelTransport = {
    subscribe(conversationId, jwt, h) {
      calls.subscribe.push({ conversationId, jwt });
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
    get handlers(): ChatChannelHandlers {
      if (!handlers) throw new Error("chưa subscribe");
      return handlers;
    },
  };
}

/** Chạy hết microtask + đẩy đồng hồ giả. */
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function tokenResponse(name: string) {
  return { token: name, expiresAt: new Date(Date.now() + TTL_MS).toISOString() };
}

type Harness = ReturnType<typeof setup>;

function setup(over: Partial<Parameters<typeof useChatChannel>[0]> = {}) {
  const fake = createFakeTransport();
  let tokenSeq = 0;
  const fetchToken = vi.fn(async () => tokenResponse(`jwt-${++tokenSeq}`));
  const fetchSince = vi.fn(async (_lastSeenMessageId: string | null): Promise<ReconcilePage> =>
    page([]),
  );
  const markRead = vi.fn(async () => ({ unreadCount: 0 }));
  const onRemoved = vi.fn();

  const view = renderHook(() =>
    useChatChannel({
      conversationId: CONV,
      currentUserId: ME,
      fetchSince,
      markRead,
      onRemoved,
      transport: fake.transport,
      fetchToken,
      ...over,
    }),
  );

  return { fake, fetchToken, fetchSince, markRead, onRemoved, view };
}

async function connect(h: Harness) {
  await flush();
  act(() => h.fake.handlers.onStatus("SUBSCRIBED"));
  await flush();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("kết nối kênh", () => {
  it("xin JWT rồi subscribe đúng hội thoại; SUBSCRIBED ⇒ status subscribed", async () => {
    const h = setup();
    await flush();

    expect(h.fetchToken).toHaveBeenCalledTimes(1);
    expect(h.fake.calls.subscribe).toEqual([{ conversationId: CONV, jwt: "jwt-1" }]);

    act(() => h.fake.handlers.onStatus("SUBSCRIBED"));
    await flush();
    expect(h.view.result.current.status).toBe("subscribed");
  });

  it("không lấy được vé ⇒ status error, không subscribe (không treo im lặng)", async () => {
    const h = setup({
      fetchToken: vi.fn(async () => {
        throw new Error("Realtime chưa được cấu hình");
      }),
    });
    await flush();

    expect(h.fake.calls.subscribe).toHaveLength(0);
    expect(h.view.result.current.status).toBe("error");
    expect(h.view.result.current.error).toBe("Realtime chưa được cấu hình");
  });

  it("CHANNEL_ERROR ⇒ báo mất kết nối nhưng KHÔNG xoá tin đang có", async () => {
    const h = setup({ initialMessages: [row("m1")] });
    await connect(h);

    act(() => h.fake.handlers.onStatus("CHANNEL_ERROR", new Error("boom")));
    await flush();

    expect(h.view.result.current.status).toBe("error");
    expect(h.view.result.current.messages.map((m) => m.id)).toEqual(["m1"]);
  });
});

describe("AC2 — reconcile bắt buộc mỗi lần SUBSCRIBED (TS-09)", () => {
  it("lần SUBSCRIBED đầu gọi fetchMessagesSince(null) đúng một lần", async () => {
    const h = setup();
    h.fetchSince.mockResolvedValueOnce(page([row("m1")]));
    await connect(h);

    expect(h.fetchSince).toHaveBeenCalledTimes(1);
    expect(h.fetchSince).toHaveBeenCalledWith(null);
    expect(h.view.result.current.messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("mất mạng rồi re-SUBSCRIBED ⇒ gọi lại đúng MỘT lần với mốc lastSeen, đủ 5 tin, không trùng", async () => {
    const h = setup();
    h.fetchSince.mockResolvedValueOnce(page([row("m1")]));
    await connect(h);

    // Rớt mạng 30s rồi kênh tự join lại (TS-09 bước 2–3).
    act(() => h.fake.handlers.onStatus("CHANNEL_ERROR"));
    await flush(30_000);
    h.fetchSince.mockResolvedValueOnce(
      // Server trả kèm cả m1 (client đã có) để chứng minh khử trùng theo id.
      page([row("m1"), row("m2"), row("m3"), row("m4"), row("m5"), row("m6")]),
    );
    act(() => h.fake.handlers.onStatus("SUBSCRIBED"));
    await flush();

    expect(h.fetchSince).toHaveBeenCalledTimes(2);
    expect(h.fetchSince).toHaveBeenLastCalledWith("m1");
    expect(h.view.result.current.messages.map((m) => m.id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
      "m6",
    ]);
  });

  it("lỡ hơn một trang (TS-09.5) ⇒ cuốn hết hasMore trong CÙNG một lượt", async () => {
    const h = setup();
    h.fetchSince
      .mockResolvedValueOnce(page([row("m1"), row("m2")], { hasMore: true, nextSinceMessageId: "m2" }))
      .mockResolvedValueOnce(page([row("m3")]));
    await connect(h);

    expect(h.fetchSince.mock.calls.map((c) => c[0])).toEqual([null, "m2"]);
    expect(h.view.result.current.messages.map((m) => m.id)).toEqual(["m1", "m2", "m3"]);
    expect(h.view.result.current.isReconciling).toBe(false);
  });

  it("reconcile hỏng ⇒ báo lỗi, không mất tin đang hiển thị", async () => {
    const h = setup({ initialMessages: [row("m1")] });
    h.fetchSince.mockRejectedValueOnce(new Error("Mạng lỗi"));
    await connect(h);

    expect(h.view.result.current.error).toBe("Mạng lỗi");
    expect(h.view.result.current.messages.map((m) => m.id)).toEqual(["m1"]);
  });

  it("tin nhận qua broadcast được hợp nhất và trở thành mốc reconcile kế tiếp", async () => {
    const h = setup();
    await connect(h);

    act(() =>
      h.fake.handlers.onBroadcast("message.created", {
        id: "m9",
        conversationId: CONV,
        senderId: OTHER,
        kind: "CHAT",
        body: "tin realtime",
        clientMsgId: null,
        createdAt: "2026-08-09T10:00:09.000Z",
      }),
    );
    await flush();
    expect(h.view.result.current.messages.map((m) => m.id)).toEqual(["m9"]);

    act(() => h.fake.handlers.onStatus("SUBSCRIBED"));
    await flush();
    expect(h.fetchSince).toHaveBeenLastCalledWith("m9");
  });
});

describe("AC3 — bị gỡ giữa phiên (TS-11 / F-KICK)", () => {
  it("participant.removed cho CHÍNH MÌNH ⇒ unsubscribe + onRemoved + status removed", async () => {
    const h = setup();
    await connect(h);

    act(() => h.fake.handlers.onBroadcast("participant.removed", { userId: ME }));
    await flush();

    expect(h.fake.calls.unsubscribe).toBe(1);
    expect(h.onRemoved).toHaveBeenCalledTimes(1);
    expect(h.view.result.current.status).toBe("removed");
  });

  it("sau khi bị gỡ, broadcast đến muộn không còn chèn tin vào luồng", async () => {
    const h = setup();
    await connect(h);

    act(() => h.fake.handlers.onBroadcast("participant.removed", { userId: ME }));
    act(() =>
      h.fake.handlers.onBroadcast("message.created", {
        id: "m-late",
        createdAt: "2026-08-09T10:00:20.000Z",
      }),
    );
    await flush();

    expect(h.view.result.current.messages).toHaveLength(0);
  });

  it("participant.removed của NGƯỜI KHÁC ⇒ không đụng gì (event phát cho cả topic)", async () => {
    const h = setup();
    await connect(h);

    act(() => h.fake.handlers.onBroadcast("participant.removed", { userId: OTHER }));
    await flush();

    expect(h.fake.calls.unsubscribe).toBe(0);
    expect(h.onRemoved).not.toHaveBeenCalled();
    expect(h.view.result.current.status).toBe("subscribed");
  });
});

describe("AC4 — message.deleted đổi tại chỗ", () => {
  it("tin đổi thành text đã gỡ, không gọi lại server (không reload luồng)", async () => {
    const h = setup({ initialMessages: [row("m1"), row("m2")] });
    await connect(h);
    const callsBefore = h.fetchSince.mock.calls.length;

    act(() => h.fake.handlers.onBroadcast("message.deleted", { messageId: "m2" }));
    await flush();

    const list = h.view.result.current.messages;
    expect(list.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(list[1].deleted).toBe(true);
    expect(list[1].body).toBe("Tin nhắn đã được gỡ");
    expect(h.fetchSince.mock.calls.length).toBe(callsBefore);
  });
});

describe("AC5 — mốc đã đọc theo foreground", () => {
  it("đang mở ở foreground ⇒ markConversationRead tới tin mới nhất, không gọi lặp", async () => {
    const h = setup();
    h.fetchSince.mockResolvedValueOnce(page([row("m1"), row("m2")]));
    await connect(h);

    expect(h.markRead).toHaveBeenCalledTimes(1);
    expect(h.markRead).toHaveBeenCalledWith("m2");

    // Không có tin mới ⇒ không bắn thêm request nào.
    act(() => h.fake.handlers.onStatus("SUBSCRIBED"));
    await flush();
    expect(h.markRead).toHaveBeenCalledTimes(1);

    act(() =>
      h.fake.handlers.onBroadcast("message.created", {
        id: "m3",
        senderId: OTHER,
        createdAt: "2026-08-09T10:00:30.000Z",
      }),
    );
    await flush();
    expect(h.markRead).toHaveBeenLastCalledWith("m3");
  });

  // Badge tổng ở thanh nav do LAYOUT RSC tính và layout KHÔNG render lại khi điều hướng
  // client-side; đọc tin lại không sinh `bump` nào. Nên đánh dấu đã đọc XONG mà không phát
  // tín hiệu ở đây = badge chỉ biết tăng, treo số cũ tới khi F5.
  it("markConversationRead ghi xong ⇒ phát tín hiệu cho badge nav hỏi lại", async () => {
    const heard = vi.fn();
    const unsubscribe = subscribeConversationRead(heard);
    try {
      const h = setup();
      h.fetchSince.mockResolvedValueOnce(page([row("m1")]));
      await connect(h);

      expect(h.markRead).toHaveBeenCalledWith("m1");
      expect(heard).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it("markConversationRead HỎNG ⇒ KHÔNG phát tín hiệu (badge không được tụt khi DB chưa ghi)", async () => {
    const heard = vi.fn();
    const unsubscribe = subscribeConversationRead(heard);
    try {
      const h = setup({
        markRead: vi.fn(async () => {
          throw new Error("mạng chớp");
        }),
      });
      h.fetchSince.mockResolvedValueOnce(page([row("m1")]));
      await connect(h);
      await flush();

      expect(heard).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("tab ẩn ⇒ KHÔNG đánh dấu đã đọc; quay lại foreground mới đánh dấu", async () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const h = setup();
    h.fetchSince.mockResolvedValueOnce(page([row("m1")]));
    await connect(h);

    expect(h.markRead).not.toHaveBeenCalled();
    expect(h.view.result.current.unreadCount).toBe(1);

    visibility.mockReturnValue("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(h.markRead).toHaveBeenCalledWith("m1");
    expect(h.view.result.current.unreadCount).toBe(0);
  });
});

describe("gia hạn token trước khi hết hạn", () => {
  it("tới ~80% TTL ⇒ xin token mới + setAuth, KHÔNG dựng lại kênh", async () => {
    const h = setup();
    await connect(h);
    expect(h.fetchToken).toHaveBeenCalledTimes(1);

    await flush(TTL_MS * 0.8 + 100);

    expect(h.fetchToken).toHaveBeenCalledTimes(2);
    expect(h.fake.calls.setAuth).toEqual(["jwt-2"]);
    expect(h.fake.calls.subscribe).toHaveLength(1); // kênh cũ vẫn sống
    expect(h.fetchSince).toHaveBeenCalledTimes(1); // gia hạn KHÔNG kích hoạt reconcile
  });

  it("gia hạn lặp lại được (token thứ 3) — không dừng sau lần đầu", async () => {
    const h = setup();
    await connect(h);

    await flush(TTL_MS * 0.8 + 100);
    await flush(TTL_MS * 0.8 + 100);

    expect(h.fake.calls.setAuth).toEqual(["jwt-2", "jwt-3"]);
  });

  it("xin token hỏng ⇒ thử lại sau, không làm chết kênh", async () => {
    const fetchToken = vi
      .fn()
      .mockResolvedValueOnce(tokenResponse("jwt-1"))
      .mockRejectedValueOnce(new Error("mạng chớp"))
      .mockResolvedValueOnce(tokenResponse("jwt-3"));
    const h = setup({ fetchToken });
    await connect(h);

    await flush(TTL_MS * 0.8 + 100); // lần gia hạn hỏng
    expect(h.fake.calls.setAuth).toHaveLength(0);
    expect(h.view.result.current.status).toBe("subscribed");

    await flush(30_000 + 100); // lần thử lại
    expect(h.fake.calls.setAuth).toEqual(["jwt-3"]);
  });
});

describe("dọn dẹp khi unmount", () => {
  it("unsubscribe + huỷ timer gia hạn + gỡ listener foreground", async () => {
    const removeDoc = vi.spyOn(document, "removeEventListener");
    const removeWin = vi.spyOn(window, "removeEventListener");
    const h = setup();
    await connect(h);

    act(() => h.view.unmount());

    expect(h.fake.calls.unsubscribe).toBe(1);
    expect(removeDoc).toHaveBeenCalledWith("visibilitychange", expect.any(Function));
    expect(removeWin).toHaveBeenCalledWith("focus", expect.any(Function));

    await flush(TTL_MS * 2);
    expect(h.fetchToken).toHaveBeenCalledTimes(1); // không còn timer nào chạy
  });

  it("kết quả reconcile về sau khi unmount không gây cập nhật state (không rò)", async () => {
    const h = setup();
    let release: ((p: ReconcilePage) => void) | null = null;
    h.fetchSince.mockImplementationOnce(
      () =>
        new Promise<ReconcilePage>((resolve) => {
          release = resolve;
        }),
    );
    await flush();
    act(() => h.fake.handlers.onStatus("SUBSCRIBED"));
    await flush();

    act(() => h.view.unmount());
    await act(async () => {
      release?.(page([row("m1")]));
      await vi.advanceTimersByTimeAsync(0);
    });

    // Không ném, không cảnh báo "state update on unmounted" — luồng cuối vẫn rỗng.
    expect(h.view.result.current.messages).toHaveLength(0);
  });
});

describe("mergeLocal — cùng đường khử trùng với broadcast (TS-10.3)", () => {
  it("bản optimistic + broadcast + kết quả Server Action ⇒ vẫn một dòng", async () => {
    const h = setup();
    await connect(h);
    const clientMsgId = "9f1a2b3c-0000-4000-8000-000000000001";

    act(() =>
      h.view.result.current.mergeLocal({
        id: `tmp:${clientMsgId}`,
        conversationId: CONV,
        senderId: ME,
        body: "chào cả nhà",
        clientMsgId,
        createdAt: new Date("2026-08-09T10:00:40.000Z"),
      }),
    );
    act(() =>
      h.fake.handlers.onBroadcast("message.created", {
        id: "m-real",
        conversationId: CONV,
        senderId: ME,
        kind: "CHAT",
        body: "chào cả nhà",
        clientMsgId,
        createdAt: "2026-08-09T10:00:41.000Z",
      }),
    );
    act(() =>
      h.view.result.current.mergeLocal({
        id: "m-real",
        conversationId: CONV,
        senderId: ME,
        body: "chào cả nhà",
        clientMsgId,
        createdAt: new Date("2026-08-09T10:00:41.000Z"),
      }),
    );
    await flush();

    expect(h.view.result.current.messages.map((m) => m.id)).toEqual(["m-real"]);
  });
});

// AC5 — mẩu trạng thái nối luồng chat với BADGE ở thanh nav. Không có đăng ký này thì badge
// tổng cộng thêm cho chính hội thoại người dùng đang nhìn (tin đó đã được `markConversationRead`
// đánh dấu đọc), số nháy lên rồi tụt về 0 — nhìn như lỗi.
describe("đăng ký hội thoại ĐANG MỞ cho badge nav", () => {
  beforeEach(() => setActiveConversation(null));
  afterEach(() => setActiveConversation(null));

  it("mount ⇒ ghi nhận hội thoại đang mở; unmount ⇒ nhả ra", async () => {
    const h = setup();
    await connect(h);
    expect(getActiveConversation()).toBe(CONV);

    act(() => h.view.unmount());
    expect(getActiveConversation()).toBeNull();
  });

  it("enabled=false (chưa mở luồng nào) ⇒ KHÔNG chiếm chỗ của hội thoại khác", async () => {
    const h = setup({ enabled: false });
    await flush();
    expect(getActiveConversation()).toBeNull();
    act(() => h.view.unmount());
  });
});
