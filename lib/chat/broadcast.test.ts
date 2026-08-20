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

/**
 * Chuông nhân sự đi nhờ ĐÚNG kênh `user:{id}` sẵn có — không topic mới, không migration
 * (policy `user_can_receive_own_user_broadcast` chỉ so topic, KHÔNG lọc tên event).
 * Bất biến đắt nhất ở đây là BR-30: payload chỉ được là TÍN HIỆU.
 */
describe("[noti] notificationBumpBroadcasts — builder thuần", () => {
  it("mỗi userId một phần tử topic user:{id}, event notification.bumped, private=true", async () => {
    const { notificationBumpBroadcasts } = await loadModule();
    const out = notificationBumpBroadcasts(["u1", "u2", "u3"], {
      at: "2026-08-19T03:04:05.000Z",
    });
    expect(out.map((m) => m.topic)).toEqual(["user:u1", "user:u2", "user:u3"]);
    expect(out.every((m) => m.event === "notification.bumped" && m.private === true)).toBe(true);
  });

  it("payload có ĐÚNG khoá `at` — không tiêu đề/href/unreadCount (BR-30)", async () => {
    const { notificationBumpBroadcasts } = await loadModule();
    const [one] = notificationBumpBroadcasts(["u1"], { at: "2026-08-19T03:04:05.000Z" });
    expect(Object.keys(one!.payload)).toEqual(["at"]);
    expect(one!.payload.at).toBe("2026-08-19T03:04:05.000Z");
  });

  /**
   * Nơi gọi thật thường có nguyên object StaffNotification trong tay (title, href,
   * studentId…). Builder dựng lại từng khoá thay vì spread, nên dù người gọi có nhét thêm
   * gì thì cũng KHÔNG có đường nào rò ra kênh realtime — chỗ mà "đúng người" không đồng
   * nghĩa "đúng quyền xem nội dung".
   */
  it("người gọi nhét thêm khoá (title/href) ⇒ builder VẪN chỉ đẩy `at`", async () => {
    const { notificationBumpBroadcasts } = await loadModule();
    const smuggled = {
      at: "2026-08-19T03:04:05.000Z",
      title: "Nhận xét mới của HV Nguyễn Văn A",
      href: "/attendance?sessionId=abc",
      unreadCount: 7,
    };
    const [one] = notificationBumpBroadcasts(["u1"], smuggled);
    expect(Object.keys(one!.payload)).toEqual(["at"]);
  });

  it("khử trùng userId + bỏ chuỗi rỗng (một người nhận 2 thông báo chỉ cần 1 tín hiệu)", async () => {
    const { notificationBumpBroadcasts } = await loadModule();
    const out = notificationBumpBroadcasts(["u1", "u1", "", "u2"], {
      at: "2026-08-19T03:04:05.000Z",
    });
    expect(out.map((m) => m.topic)).toEqual(["user:u1", "user:u2"]);
  });

  // Event mới KHÔNG được có đường gửi riêng: nó phải đi qua đúng primitive đang giữ trần
  // lô 60/POST đã đo (n=95 → 502, n=200 → 429 và KHÔNG ai nhận).
  it("đi qua broadcastMessages: 130 người → 3 lô ≤60, không phần tử nào rơi", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const { broadcastMessages, notificationBumpBroadcasts } = await loadModule();
    const ids = Array.from({ length: 130 }, (_, i) => `u${i}`);
    const ok = await broadcastMessages(
      notificationBumpBroadcasts(ids, { at: "2026-08-19T03:04:05.000Z" }),
    );

    expect(ok).toBe(true);
    const batches = fetchMock.mock.calls.map((c) =>
      sentBody((c as unknown as [string, RequestInit])[1]),
    );
    expect(batches.map((b) => b.length)).toEqual([60, 60, 10]);
    expect(batches.flat().map((m) => m.topic)).toEqual(ids.map((id) => `user:${id}`));
  });
});

/**
 * ⚠️ NHÓM NÀY TỪNG HỢP THỨC HOÁ MỘT LỖI SẢN PHẨM.
 *
 * Bản cũ gim ngưỡng lô = 200 với `fetch` giả LUÔN trả 202, nên nó "chứng minh" rằng chia
 * lô 200 là ổn — trong khi endpoint Supabase THẬT từ chối: đo trên dev (LỖ 4) n=95 → 502,
 * n=200 → HTTP 429 "Too many messages to broadcast, please reduce the batch size" và
 * KHÔNG giao cho ai. Nghĩa là mọi nhóm >200 người đã im lặng mất tin realtime suốt thời
 * gian qua, với một bài test xanh đứng bảo lãnh.
 *
 * Luật rút ra, giữ nguyên khi sửa nhóm này: ngưỡng phải được gim bằng SỐ ĐO, và phải có
 * ít nhất một bài chứng minh "lô quá to = THẤT BẠI có tiếng", không phải im lặng.
 */
describe("[bump] broadcastMessages — chia lô theo trần THẬT của endpoint", () => {
  it("1 conv + 65 bump → 2 lô (≤60/lô), KHÔNG mất phần tử nào", async () => {
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
    const sent = fetchMock.mock.calls.flatMap((c) =>
      sentBody((c as unknown as [string, RequestInit])[1]),
    );
    expect(sent).toHaveLength(66);
    expect(sent[0]?.topic).toBe("conv:c1");
    expect(new Set(sent.map((m) => m.topic)).size).toBe(66);
  });

  // Đúng mảng 205 của số đo: bản cũ chia [200,5] và 7/7 người mẫu trong lô 1 MẤT tin.
  it("mảng 205 → [60,60,60,25]: không lô nào vượt trần, không phần tử nào rơi", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);

    const { broadcastMessages, userBumpBroadcasts } = await loadModule();
    const ids = Array.from({ length: 205 }, (_, i) => `u${i}`);
    const ok = await broadcastMessages(
      userBumpBroadcasts(ids, {
        conversationId: "c1",
        messageId: "m1",
        kind: "CHAT",
        at: "2026-08-09T00:00:00.000Z",
      }),
    );

    expect(ok).toBe(true);
    const batches = fetchMock.mock.calls.map((c) =>
      sentBody((c as unknown as [string, RequestInit])[1]),
    );
    expect(batches.map((b) => b.length)).toEqual([60, 60, 60, 25]);
    // Không ai bị bỏ lại: đúng 205 topic KHÁC NHAU đã lên đường.
    const topics = batches.flat().map((m) => m.topic);
    expect(new Set(topics).size).toBe(205);
    expect(topics).toEqual(ids.map((id) => `user:${id}`));
  });

  /**
   * Bài quyết định: `fetch` giả KHÔNG còn "luôn 202" mà mô phỏng ĐÚNG số đo của endpoint
   * thật (LỖ 4) — n≤80 nhận, n=95 trả 502, n≥100 trả 429 và KHÔNG giao cho ai. Đây là
   * thứ mà bản test cũ thiếu, và vì thiếu nên nó đứng bảo lãnh cho ngưỡng 200 hỏng.
   * Nâng `BROADCAST_MAX_PER_POST` lên lại là bài này đỏ ngay.
   */
  it("với endpoint mô phỏng theo SỐ ĐO THẬT (n=95→502, n≥100→429): mọi lô đều được nhận", async () => {
    const rejected: number[] = [];
    const delivered: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        const batch = sentBody(init);
        if (batch.length >= 100) {
          rejected.push(batch.length);
          return new Response(
            JSON.stringify({
              message: "Too many messages to broadcast, please reduce the batch size",
            }),
            { status: 429 },
          );
        }
        if (batch.length >= 90) {
          rejected.push(batch.length);
          return new Response("bad gateway", { status: 502 });
        }
        delivered.push(...batch.map((m) => m.topic));
        return new Response("{}", { status: 202 });
      }),
    );

    const { broadcastMessages, userBumpBroadcasts } = await loadModule();
    const ids = Array.from({ length: 205 }, (_, i) => `u${i}`);
    const ok = await broadcastMessages(
      userBumpBroadcasts(ids, {
        conversationId: "c1",
        messageId: "m1",
        kind: "CHAT",
        at: "2026-08-09T00:00:00.000Z",
      }),
    );

    expect(rejected).toEqual([]);
    expect(delivered).toHaveLength(205);
    expect(ok).toBe(true);
  });

  it("250 phần tử → KHÔNG lô nào quá 60 (n=95 đã 502, n=200 đã 429 trên endpoint thật)", async () => {
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

    const sizes = fetchMock.mock.calls.map(
      (c) => sentBody((c as unknown as [string, RequestInit])[1]).length,
    );
    expect(Math.max(...sizes)).toBeLessThanOrEqual(60);
    expect(sizes.reduce((a, b) => a + b, 0)).toBe(250);
  });

  it("lô quá to bị endpoint từ chối (429) → THẤT BẠI có tiếng: false + log, KHÔNG im lặng", async () => {
    const body = JSON.stringify({
      message: "Too many messages to broadcast, please reduce the batch size",
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status: 429 })));

    const { broadcastMessages, userBumpBroadcasts } = await loadModule();
    const ok = await broadcastMessages(
      userBumpBroadcasts(["u1", "u2"], {
        conversationId: "c1",
        messageId: "m1",
        kind: "CHAT",
        at: "2026-08-09T00:00:00.000Z",
      }),
    );

    expect(ok).toBe(false);
    const logged = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(logged).toContain("429");
    // Truy được AI mất tin — bản cũ chỉ in `batch[0].topic`.
    expect(logged).toContain("user:u1");
    expect(logged).toContain("user:u2");
    // Và đọc được mã lỗi thật của Realtime để biết phải hạ ngưỡng.
    expect(logged).toContain("reduce the batch size");
  });

  // Lô ĐẦY (60 người) rụng: log không được rút gọn thành "lô 1 hỏng". Bản cũ in đúng
  // `batch[0].topic` ⇒ 59 người còn lại biến mất khỏi mọi dấu vết, không có đường nào
  // dựng lại danh sách ai mất tin.
  it("lô ĐẦY rụng ⇒ log in mẫu 10 topic + tổng số còn lại (truy ra được ai mất tin)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));

    const { broadcastMessages, userBumpBroadcasts } = await loadModule();
    const ids = Array.from({ length: 60 }, (_, i) => `u${i}`);
    await broadcastMessages(
      userBumpBroadcasts(ids, {
        conversationId: "c1",
        messageId: "m1",
        kind: "CHAT",
        at: "2026-08-09T00:00:00.000Z",
      }),
    );

    const logged = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    for (const id of ids.slice(0, 10)) expect(logged).toContain(`user:${id}`);
    expect(logged).toContain("…+50");
    expect(logged).toContain("n=60");
  });

  it("nhiều lô KHÔNG bắn dồn: tối đa 2 lô chạy song song (bắn dồn = timeout cả loạt)", async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight -= 1;
        return new Response("{}", { status: 202 });
      }),
    );

    const { broadcastMessages, userBumpBroadcasts } = await loadModule();
    const ids = Array.from({ length: 300 }, (_, i) => `u${i}`);
    await broadcastMessages(
      userBumpBroadcasts(ids, {
        conversationId: "c1",
        messageId: "m1",
        kind: "CHAT",
        at: "2026-08-09T00:00:00.000Z",
      }),
    );

    // Đúng 2, không phải "≤2": 300 phần tử = 5 lô, đo được đỉnh 2 chứng minh vừa có
    // song song (không tuần tự hoá) vừa không vượt trần. Bắn cả 5 lô một lúc → đỉnh 5.
    expect(peak).toBe(2);
  });

  /**
   * Trần ngân sách TỔNG (`BROADCAST_TOTAL_BUDGET_MS`) — nhánh duy nhất của module này
   * chưa từng có test nào chạy qua, dù nó là thứ quyết định hành vi khi endpoint chậm
   * đúng như đã ĐO: ~0,70 giây MỖI PHẦN TỬ và tuyến tính (n=60 → 41,8s). Một lớp lớn
   * chia 3 lô là chạm trần thật, không phải tình huống giả định.
   *
   * Hai điều được khoá ở đây, và cả hai đều là bài học phải trả giá mới có:
   *  • hết ngân sách thì DỪNG, không bắn tiếp (bản không có trần sẽ chạy tới lúc Vercel
   *    cắt ngang việc-sau-response, và lúc đó không còn log nào để biết chuyện gì xảy ra);
   *  • dừng thì phải KÊU, và kêu đủ để TRUY RA AI MẤT TIN. Im lặng ở đây tái lập đúng lỗi
   *    đã đo 10/08: 8/12 người mẫu mất bump trong khi `probeAlive` chứng minh tai họ vẫn
   *    nghe được — mất tín hiệu mà không ai biết là loại hỏng đắt nhất của module này.
   */
  it("hết ngân sách tổng ⇒ BỎ lô còn lại, trả false và log truy ra được ai mất tin", async () => {
    let nowMs = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => nowMs);
    // Mỗi lô 60 phần tử ngốn ~42s theo số đo thật; lấy tròn 30s để 2 lô đầu vừa lọt
    // ngân sách 45s còn lô thứ ba thì chắc chắn hết.
    const fetchMock = vi.fn(async () => {
      nowMs += 30_000;
      return new Response("{}", { status: 202 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { broadcastMessages, userBumpBroadcasts } = await loadModule();
    const ids = Array.from({ length: 130 }, (_, i) => `u${i}`); // 3 lô: [60, 60, 10]
    const ok = await broadcastMessages(
      userBumpBroadcasts(ids, {
        conversationId: "c1",
        messageId: "m1",
        kind: "CHAT",
        at: "2026-08-09T00:00:00.000Z",
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2); // lô 3 KHÔNG được bắn
    expect(ok).toBe(false); // và người gọi phải biết là lượt này KHÔNG trọn vẹn

    const logged = warnSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n");
    expect(logged).toContain("Hết ngân sách");
    expect(logged).toContain("lô 3/3");
    expect(logged).toContain("n=10");
    // Đủ để truy ra ai mất tin — không phải một dòng "đã bỏ một lô".
    expect(logged).toContain("user:u120");
    expect(logged).toContain("user:u129");
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
