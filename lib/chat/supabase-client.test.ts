// @vitest-environment node
/**
 * Khoá các bất biến của đường subscribe THẬT (`subscribeConversation` /
 * `subscribeUserTopic`) — đường mà production dùng, và trước bài test này KHÔNG có gì
 * chạm tới:
 *
 *   • `_zztest-chat-us02.ts` tự dựng channel riêng để kiểm policy RLS, nên nó chứng
 *     minh CẤU HÌNH Supabase đúng, không chứng minh CLIENT của ta gọi đúng.
 *   • `use-chat-channel.test.ts` inject `transport` giả nên `defaultTransport` →
 *     `subscribeConversation` không bao giờ chạy dưới test.
 *
 * Hệ quả nếu để hở (audit 09/08 chỉ ra): bỏ `private: true` thì client join topic
 * PUBLIC trong khi server vẫn phát private ⇒ hoặc chat chết câm (không tin nào tới,
 * không lỗi nào ném), hoặc — nếu "Allow public access" bị bật lại trên Dashboard —
 * bất kỳ ai cầm anon key (nằm sẵn trong bundle) đọc chéo mọi hội thoại. Cả hai
 * nhánh đều đi qua toàn bộ cổng CI mà không đỏ một dòng.
 *
 * ⚠️ Nhóm cuối file pin BẤT BIẾN ĐẮT NHẤT của module: **không bao giờ `setAuth` khi còn
 * kênh đang joined**. Đo thật (scripts/_zztest-chat-token-va-lo.ts, LỖ 3): làm vậy là
 * kênh chết ở nhịp heartbeat kế tiếp và KHÔNG tự hồi. Cái này không có test nào khác
 * bắt được — typecheck/lint/build đều xanh với bản hỏng.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type ChannelOpts = { config?: { private?: boolean } };
type BroadcastCb = (message: { event: string; payload: Record<string, unknown> }) => void;
type FakeChannel = {
  topic: string;
  joined: boolean;
  on: ReturnType<typeof vi.fn>;
  subscribe: ReturnType<typeof vi.fn>;
  /** Listener broadcast đã gắn lên CHÍNH object kênh này (đếm để bắt rò listener). */
  broadcastCbs: BroadcastCb[];
  /** Bắn payload từ kênh này — kể cả khi nó là kênh CŨ đã bị thay. */
  emit: (event: string, payload: Record<string, unknown>) => void;
};

/** Kênh đang nằm trong client (mô phỏng `RealtimeClient.channels`, khử trùng theo topic). */
let liveChannels: FakeChannel[] = [];
/** Nhật ký thao tác theo THỨ TỰ — chỗ duy nhất chứng minh được "setAuth khi không còn kênh". */
let trace: string[] = [];

const ANON_KEY = "anon-key-gia";

/**
 * Tuỳ chọn `createClient` — bản mock CŨ VỨT BỎ tham số này, và chính vì thế luật 1-ter
 * ("phải tự cấp callback `accessToken`") VÔ HÌNH với mọi bài test: xoá dòng đó khỏi
 * `supabase-client.ts` thì typecheck + lint + build + toàn bộ unit test vẫn xanh, trong khi
 * realtime trên prod chết vĩnh viễn sau nhịp heartbeat đầu tiên.
 */
type CreateClientOpts = { accessToken?: () => Promise<string> };
let clientOpts: CreateClientOpts | null = null;

/**
 * `RealtimeClient.accessTokenValue` — giá trị mà `RealtimeChannel.subscribe()` NHÉT VÀO
 * PAYLOAD JOIN. Đây là biến quyết định ai được vào kênh, không phải vé ta cầm trong tay.
 */
let accessTokenValue: string = ANON_KEY;
/** Vé thực sự đi kèm MỖI lần join, theo thứ tự. */
let joinTokens: string[] = [];

/**
 * Mô phỏng `_wrapHeartbeatCallback` → `_setAuthSafely()` của `@supabase/realtime-js`: mỗi
 * nhịp 25s, thư viện tự lấy token từ callback `accessToken` rồi ghi đè `accessTokenValue`.
 * KHÔNG có callback ⇒ `_getAccessToken()` rơi về `supabaseKey` (anon key) vì repo này dùng
 * Auth.js chứ không dùng Supabase Auth. Đo thật 10/08 (V3, `_zztest-chat-token-va-lo.ts`):
 * join MUỘN sau ≥2 nhịp heartbeat → `CHANNEL_ERROR: Unauthorized`, không bao giờ vào lại được.
 */
async function heartbeat(): Promise<void> {
  accessTokenValue = clientOpts?.accessToken ? await clientOpts.accessToken() : ANON_KEY;
}

const createChannel = vi.fn((topic: string, _opts: ChannelOpts) => {
  const existing = liveChannels.find((c) => c.topic === topic);
  if (existing) return existing;
  const channel: FakeChannel = {
    topic,
    joined: false,
    broadcastCbs: [],
    on: vi.fn((_type: string, _filter: unknown, cb: BroadcastCb) => {
      channel.broadcastCbs.push(cb);
      return channel;
    }),
    emit: (event, payload) => {
      for (const cb of channel.broadcastCbs) cb({ event, payload });
    },
    subscribe: vi.fn((cb?: (status: string) => void) => {
      channel.joined = true;
      // `RealtimeChannel.subscribe()` gửi `socket.accessTokenValue` trong payload JOIN —
      // KHÔNG phải vé mà người gọi vừa cầm. Ghi lại đúng giá trị đó.
      joinTokens.push(accessTokenValue);
      trace.push(`join:${topic}`);
      cb?.("SUBSCRIBED");
      return channel;
    }),
  };
  liveChannels.push(channel);
  return channel;
});
const setAuth = vi.fn(async (jwt: string) => {
  accessTokenValue = jwt;
  trace.push(`setAuth:${jwt}:joined=${liveChannels.filter((c) => c.joined).length}`);
});
const removeChannel = vi.fn(async (channel: FakeChannel) => {
  channel.joined = false;
  liveChannels = liveChannels.filter((c) => c !== channel);
  trace.push(`leave:${channel.topic}`);
  return "ok";
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: (_url: string, _key: string, opts?: CreateClientOpts) => {
    clientOpts = opts ?? null;
    return {
      channel: (topic: string, chOpts: ChannelOpts) => createChannel(topic, chOpts),
      removeChannel: (channel: FakeChannel) => removeChannel(channel),
      realtime: { setAuth: (jwt: string) => setAuth(jwt) },
    };
  },
}));

/** Vé hợp lệ: `expiresAt` là ISO thật vì `applyRealtimeAuth` so mốc hết hạn. */
function auth(token: string, ttlSeconds = 300) {
  return { token, expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString() };
}

beforeEach(() => {
  vi.resetModules();
  createChannel.mockClear();
  setAuth.mockClear();
  removeChannel.mockClear();
  liveChannels = [];
  trace = [];
  clientOpts = null;
  accessTokenValue = ANON_KEY;
  joinTokens = [];
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://zztest.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
});

async function load() {
  return import("@/lib/chat/supabase-client");
}

describe("subscribeConversation — bất biến của đường subscribe thật", () => {
  it("LUÔN join private channel (bỏ private:true = mất cửa chặn RLS)", async () => {
    const { subscribeConversation } = await load();
    subscribeConversation("conv-abc", auth("jwt-x"));

    await vi.waitFor(() => expect(createChannel).toHaveBeenCalledTimes(1));
    const [topic, opts] = createChannel.mock.calls[0]!;
    expect(topic).toBe("conv:conv-abc");
    // Đây là dòng chốt: private phải là true, không phải "truthy nhờ tình cờ".
    expect(opts?.config?.private).toBe(true);
  });

  it("đặt JWT do server mint TRƯỚC khi join (join trước = policy đọc token cũ/rỗng)", async () => {
    const { subscribeConversation } = await load();
    subscribeConversation("conv-abc", auth("jwt-x"));

    await vi.waitFor(() => expect(trace).toContain("join:conv:conv-abc"));
    expect(setAuth).toHaveBeenCalledWith("jwt-x");
    expect(trace.indexOf("setAuth:jwt-x:joined=0")).toBeLessThan(
      trace.indexOf("join:conv:conv-abc"),
    );
  });

  it("topic bám đúng quy ước conv:{id} — policy so 'conv:' || conversationId", async () => {
    const { subscribeConversation } = await load();
    subscribeConversation("11111111-2222-3333-4444-555555555555", auth("jwt"));
    await vi.waitFor(() => expect(createChannel).toHaveBeenCalledTimes(1));
    expect(createChannel.mock.calls[0]![0]).toBe("conv:11111111-2222-3333-4444-555555555555");
  });

  /**
   * BẤT BIẾN ĐẮT NHẤT CỦA VÉ ĐẦU TIÊN, và nó CHỈ đo được bằng số đo thật:
   * `void setAuth(vé)` rồi join NGAY cho ra kênh báo SUBSCRIBED rồi CHẾT CÂM sau ~2,7s
   * (0/92 tick), trong khi `await setAuth(vé)` rồi join cho 92/92 tick — hai kênh RAW khác
   * nhau đúng một biến, cùng dòng thời gian (scripts/_zztest-chat-token-va-lo.ts, V1 vs V2a).
   *
   * Bài test này khoá đúng cái "await" đó: giữ `setAuth` treo, và trong suốt thời gian nó
   * treo thì KHÔNG được có kênh nào ra đời.
   */
  it("KHÔNG tạo kênh khi setAuth còn treo — vé đầu tiên cũng phải chờ đặt vé xong", async () => {
    let releaseAuth: () => void = () => {};
    const authGate = new Promise<void>((r) => (releaseAuth = r));
    setAuth.mockImplementationOnce(async (jwt: string) => {
      await authGate;
      trace.push(`setAuth:${jwt}:joined=${liveChannels.filter((c) => c.joined).length}`);
    });

    const { subscribeConversation } = await load();
    subscribeConversation("conv-abc", auth("jwt-x"));

    // Cho event loop quay vài vòng: nếu module join "ngay", nó đã join ở đây rồi.
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(createChannel).not.toHaveBeenCalled();

    releaseAuth();
    await vi.waitFor(() => expect(trace).toContain("join:conv:conv-abc"));
  });
});

/**
 * `subscribeUserTopic` — kênh mức NGƯỜI DÙNG, đường THẬT của badge + danh sách tự cập nhật.
 * Hub (`components/chat/user-channel.ts`) bơm transport giả khi test nên hàm này cũng nằm
 * ngoài mọi bài test khác, y hệt cái bẫy đã ghi ở đầu file.
 *
 * Chuỗi phải khớp Ở BA NƠI: server phát (`lib/chat/broadcast.ts`), client join (đây), và
 * `USING` của policy `user_can_receive_own_user_broadcast` (`'user:' || app_user_id`).
 * Lệch một ký tự ⇒ kênh câm: không tin nào tới, không lỗi nào ném, CI vẫn xanh.
 */
describe("subscribeUserTopic — bất biến của kênh `user:{id}`", () => {
  it("topic đúng `user:{User.id}` (policy so chuỗi này với claim app_user_id)", async () => {
    const { subscribeUserTopic } = await load();
    subscribeUserTopic("ckuser123", auth("jwt-x"));

    await vi.waitFor(() => expect(createChannel).toHaveBeenCalledTimes(1));
    expect(createChannel.mock.calls[0]![0]).toBe("user:ckuser123");
  });

  it("LUÔN private (kênh public = ai cầm anon key cũng dò được tín hiệu của người khác)", async () => {
    const { subscribeUserTopic } = await load();
    subscribeUserTopic("ckuser123", auth("jwt-x"));
    await vi.waitFor(() => expect(createChannel).toHaveBeenCalledTimes(1));
    expect(createChannel.mock.calls[0]![1]?.config?.private).toBe(true);
  });

  it("đặt JWT TRƯỚC khi join (join trước = policy đọc token cũ/rỗng ⇒ bị từ chối)", async () => {
    const { subscribeUserTopic } = await load();
    subscribeUserTopic("ckuser123", auth("jwt-x"));

    await vi.waitFor(() => expect(trace).toContain("join:user:ckuser123"));
    expect(setAuth).toHaveBeenCalledWith("jwt-x");
    expect(trace.indexOf("setAuth:jwt-x:joined=0")).toBeLessThan(
      trace.indexOf("join:user:ckuser123"),
    );
  });

  it("KHÔNG dùng chung tiền tố với kênh hội thoại (hai policy, hai bề mặt quyền)", async () => {
    const { subscribeUserTopic, subscribeConversation } = await load();
    subscribeUserTopic("abc", auth("jwt"));
    subscribeConversation("abc", auth("jwt"));

    await vi.waitFor(() => expect(createChannel).toHaveBeenCalledTimes(2));
    const topics = createChannel.mock.calls.map((c) => c[0]);
    expect(topics).toEqual(["user:abc", "conv:abc"]);
  });
});

describe("applyRealtimeAuth — đổi vé là thao tác MỨC KẾT NỐI", () => {
  it("gia hạn: rời HẾT kênh → setAuth → join lại; setAuth không bao giờ chạy khi còn kênh joined", async () => {
    const { subscribeConversation, subscribeUserTopic, applyRealtimeAuth } = await load();
    // Vé đang áp sắp hết (20s) ⇒ vé mới thật sự được nhận, không bị luật "còn nhiều đời" bỏ.
    subscribeUserTopic("u1", auth("jwt-1", 20));
    subscribeConversation("c1", auth("jwt-1", 20));
    // Vé ĐẦU TIÊN nay cũng đi qua chu kỳ (phải `await setAuth` rồi mới join — xem
    // `applyRealtimeAuth`), nên phải chờ chu kỳ đó xong rồi mới xoá `trace`; xoá sớm thì
    // dấu vết của chu kỳ 1 rơi lẫn vào chu kỳ 2 và mọi khẳng định thứ tự đều vô nghĩa.
    await vi.waitFor(() => expect(trace.filter((t) => t.startsWith("join:"))).toHaveLength(2));
    trace = [];

    applyRealtimeAuth(auth("jwt-2", 300));
    await vi.waitFor(() => expect(trace.filter((t) => t.startsWith("join:"))).toHaveLength(2));

    // Mọi lời gọi setAuth phải rơi vào lúc KHÔNG còn kênh nào joined — đây chính là
    // điều kiện làm `push(access_token)` không xảy ra (nguyên nhân giết kênh đã đo).
    for (const line of trace.filter((t) => t.startsWith("setAuth:"))) {
      expect(line.endsWith("joined=0")).toBe(true);
    }
    expect(trace).toEqual([
      "leave:user:u1",
      "leave:conv:c1",
      "setAuth:jwt-2:joined=0",
      "join:user:u1",
      "join:conv:c1",
    ]);
  });

  it("một topic — một kênh: sau gia hạn KHÔNG còn kênh cũ nào sống song song", async () => {
    const { subscribeConversation, applyRealtimeAuth } = await load();
    subscribeConversation("c1", auth("jwt-1", 20));
    await vi.waitFor(() => expect(trace).toContain("join:conv:c1"));
    trace = [];

    applyRealtimeAuth(auth("jwt-2", 300));
    await vi.waitFor(() => expect(trace).toContain("join:conv:c1"));

    expect(liveChannels.filter((c) => c.topic === "conv:c1" && c.joined)).toHaveLength(1);
  });

  // Kênh cũ phải bị DỌN, không chỉ "bị bỏ quên": nếu listener của nó còn sống thì mỗi lần
  // gia hạn nhân đôi số callback trên cùng một payload (tin hiện 2 lần), và kênh cũ vẫn
  // bơm dữ liệu lên UI bằng vé đã bị thay.
  it("gia hạn: mỗi kênh gắn ĐÚNG 1 listener, và kênh CŨ không còn đẩy được gì lên UI", async () => {
    const { subscribeConversation, applyRealtimeAuth } = await load();
    const heard: string[] = [];
    subscribeConversation("c1", auth("jwt-1", 20), {
      onBroadcast: (event) => heard.push(event),
    });
    await vi.waitFor(() => expect(trace).toContain("join:conv:c1"));
    const older = liveChannels.find((c) => c.topic === "conv:c1")!;
    trace = [];

    applyRealtimeAuth(auth("jwt-2", 300));
    await vi.waitFor(() => expect(trace).toContain("join:conv:c1"));
    const newer = liveChannels.find((c) => c.topic === "conv:c1")!;

    expect(newer).not.toBe(older);
    expect(older.broadcastCbs).toHaveLength(1);
    expect(newer.broadcastCbs).toHaveLength(1);

    // Kênh cũ bắn muộn ⇒ bị nuốt; kênh mới bắn ⇒ tới UI đúng MỘT lần.
    older.emit("message.created", { id: "m-cu" });
    newer.emit("message.created", { id: "m-moi" });
    expect(heard).toEqual(["message.created"]);
  });

  // Người dùng đóng tab / rời hội thoại ĐÚNG LÚC chu kỳ đang chạy (giữa bước "rời hết" và
  // bước "join lại"). Bước 3 chạy trên tập `entries` ⇒ ai đã nhả phải biến mất khỏi tập đó,
  // nếu không ta join lại một kênh không còn ai giữ và không ai đóng được nữa.
  it("unsubscribe GIỮA lúc gia hạn ⇒ không dựng lại kênh mồ côi", async () => {
    const { subscribeConversation, subscribeUserTopic, applyRealtimeAuth } = await load();
    const sub = subscribeConversation("c1", auth("jwt-1", 20));
    subscribeUserTopic("u1", auth("jwt-1", 20));
    await vi.waitFor(() => expect(trace.filter((t) => t.startsWith("join:"))).toHaveLength(2));
    trace = [];

    applyRealtimeAuth(auth("jwt-2", 300)); // chu kỳ bắt đầu (rời hết đang chạy)
    sub.unsubscribe(); // ...người giữ nhả ngay giữa chừng
    await vi.waitFor(() => expect(trace).toContain("join:user:u1"));

    expect(trace.filter((t) => t === "join:conv:c1")).toHaveLength(0);
    expect(liveChannels.map((c) => c.topic)).toEqual(["user:u1"]);
  });

  // Ngược lại: có người subscribe MỚI giữa chu kỳ. Mở kênh ngay lúc đó là dựng kênh bằng vé
  // SẮP BỊ THAY, và tệ hơn: lúc `setAuth` chạy sẽ có kênh đang `joined` ⇒ đúng cú
  // `push(access_token)` đã đo được là giết kênh.
  it("subscribe MỚI giữa chu kỳ ⇒ chỉ join sau setAuth, và setAuth vẫn chạy khi joined=0", async () => {
    const { subscribeUserTopic, subscribeConversation, applyRealtimeAuth } = await load();
    subscribeUserTopic("u1", auth("jwt-1", 20));
    await vi.waitFor(() => expect(trace).toContain("join:user:u1"));
    trace = [];

    applyRealtimeAuth(auth("jwt-2", 300));
    subscribeConversation("c1", auth("jwt-2", 300)); // chen vào giữa chu kỳ
    // Chờ tới khi chu kỳ chạy XONG cả hai bước, không chỉ chờ "đã join" — kênh mở sớm
    // (bằng vé cũ) cũng làm `join:` xuất hiện ngay, và chờ nhầm mốc là bỏ lọt đúng lỗi này.
    await vi.waitFor(() => {
      expect(trace.some((t) => t.startsWith("setAuth:"))).toBe(true);
      expect(trace).toContain("join:conv:c1");
    });

    for (const line of trace.filter((t) => t.startsWith("setAuth:"))) {
      expect(line.endsWith("joined=0")).toBe(true);
    }
    expect(trace.indexOf("setAuth:jwt-2:joined=0")).toBeLessThan(trace.indexOf("join:conv:c1"));
    expect(trace.filter((t) => t === "join:conv:c1")).toHaveLength(1);
  });

  // Hai bộ hẹn giờ độc lập (`use-chat-channel` + `user-channel`) cùng gia hạn trên MỘT kết
  // nối. Nhận cả hai = 2 lần rời-join toàn bộ kênh mỗi chu kỳ TTL, tức 2 lần reconcile +
  // 2 lần resync cho mỗi tab. Bên tới sau phải rút lui, và phải biết mốc thật để hẹn giờ.
  it("vé đang áp còn hơn nửa đời vé mới ⇒ GIỮ vé cũ và trả về mốc hết hạn THẬT", async () => {
    const { subscribeConversation, applyRealtimeAuth } = await load();
    const first = auth("jwt-1", 300);
    subscribeConversation("c1", first);
    await vi.waitFor(() => expect(trace).toContain("join:conv:c1"));
    trace = [];

    const effective = applyRealtimeAuth(auth("jwt-2", 300));

    expect(effective).toBe(new Date(Date.parse(first.expiresAt)).toISOString());
    expect(trace).toEqual([]); // không rời, không setAuth, không join lại
  });

  it("vé đang áp sắp hết ⇒ ĐỔI, và trả về mốc của vé mới", async () => {
    const { subscribeConversation, applyRealtimeAuth } = await load();
    subscribeConversation("c1", auth("jwt-1", 20)); // chỉ còn 20s
    await vi.waitFor(() => expect(trace).toContain("join:conv:c1"));
    trace = [];

    const next = auth("jwt-2", 300);
    const effective = applyRealtimeAuth(next);

    expect(effective).toBe(new Date(Date.parse(next.expiresAt)).toISOString());
    await vi.waitFor(() => expect(trace).toContain("setAuth:jwt-2:joined=0"));
  });

  it("unsubscribe rồi thì chu kỳ gia hạn KHÔNG dựng lại kênh đó (không rò kênh mồ côi)", async () => {
    const { subscribeConversation, applyRealtimeAuth } = await load();
    const sub = subscribeConversation("c1", auth("jwt-1", 20));
    await vi.waitFor(() => expect(trace).toContain("join:conv:c1"));
    sub.unsubscribe();
    trace = [];

    applyRealtimeAuth(auth("jwt-2", 300));
    await vi.waitFor(() => expect(trace).toContain("setAuth:jwt-2:joined=0"));

    expect(trace.filter((t) => t === "join:conv:c1")).toHaveLength(0);
  });

  /**
   * Cửa duy nhất còn lại cho "mất realtime ÂM THẦM" sau bản vá.
   *
   * `RealtimeChannel.subscribe()` ném ĐỒNG BỘ `"tried to subscribe multiple times"` khi
   * `client.channel(topic)` trả về đúng kênh CŨ. Chuyện đó xảy ra thật khi lần rời trước
   * kết thúc ở nhánh `'error'`: phoenix chỉ gắn `onClose` cho `'ok'`/`'timeout'` nên
   * `socket._remove(channel)` KHÔNG chạy, dù `removeChannel` vẫn resolve — tức `await` ở
   * `closeChannel` không cứu được. Fake dưới đây mô phỏng ĐÚNG nhánh đó.
   *
   * Nếu `openChannel` để lỗi thoát ra: trong `swapAuth` nó cắt cả vòng `for` ⇒ các kênh
   * SAU nó không bao giờ join lại, và vì `swapAuth` chạy bằng `void` nên lỗi tan thành
   * unhandled rejection. Hai khẳng định dưới khoá đúng hai hệ quả đó.
   */
  it("rời kênh hỏng (kênh cũ còn sót) ⇒ KHÔNG ném, báo CLOSED cho người giữ, kênh SAU vẫn join", async () => {
    const { subscribeConversation, subscribeUserTopic, applyRealtimeAuth } = await load();
    const convStatuses: string[] = [];
    subscribeConversation("c1", auth("jwt-1", 20), {
      onStatus: (s) => convStatuses.push(s),
    });
    subscribeUserTopic("u1", auth("jwt-1", 20));
    await vi.waitFor(() => expect(trace.filter((t) => t.startsWith("join:"))).toHaveLength(2));
    trace = [];
    convStatuses.length = 0;

    // Nhánh `'error'` của phoenix: promise resolve nhưng kênh KHÔNG rời khỏi socket
    // ⇒ lần `client.channel("conv:c1")` kế tiếp trả lại chính nó ⇒ `subscribe()` ném.
    removeChannel.mockImplementationOnce(async (channel: FakeChannel) => {
      trace.push(`leave-error:${channel.topic}`);
      return "error";
    });
    const stuck = liveChannels.find((c) => c.topic === "conv:c1")!;
    stuck.subscribe.mockImplementation(() => {
      throw new Error("tried to subscribe multiple times");
    });

    applyRealtimeAuth(auth("jwt-2", 300));

    // 1) kênh SAU trong cùng chu kỳ vẫn được join lại — vòng lặp không bị cắt.
    await vi.waitFor(() => expect(trace).toContain("join:user:u1"));
    // 2) người giữ kênh hỏng ĐƯỢC BÁO, nếu không thì bộ nối-lại của họ không bao giờ chạy.
    await vi.waitFor(() => expect(convStatuses).toContain("CLOSED"));
  });
});

/**
 * LUẬT 1-ter — callback `accessToken` khi tạo client.
 *
 * Luật này nằm trong `docs/chat-realtime/00-dieu-chinh-cho-repo.md` §E-ter từ 10/08 nhưng
 * KHÔNG có dòng test nào khoá nó: mock `createClient` cũ vứt bỏ tham số options, nên xoá
 * `accessToken: async () => ticketForConnection ?? anonKey` khỏi `supabase-client.ts` vẫn
 * cho typecheck + lint + build + toàn bộ unit test XANH. Đúng loại điểm mù mà cả đợt đo
 * 10/08 sinh ra để diệt, và là điểm mù ĐẮT NHẤT còn lại: hậu quả không phải một tin trễ mà
 * là realtime CHẾT VĨNH VIỄN tới khi người dùng tải lại trang.
 *
 * Cơ chế (đọc trong `@supabase/supabase-js@2.112.2` + `realtime-js@2.112.2`):
 * `SupabaseClient` LUÔN truyền `accessToken` xuống `RealtimeClient`; thiếu callback của ta
 * thì nó rơi về `supabaseKey` = ANON KEY (repo dùng Auth.js, không có phiên Supabase Auth).
 * `_wrapHeartbeatCallback` gọi `_setAuthSafely()` mỗi nhịp 25s ⇒ ghi đè `accessTokenValue`,
 * mà `RealtimeChannel.subscribe()` nhét chính giá trị đó vào payload JOIN.
 */
describe("LUẬT 1-ter — vé phải sống qua nhịp heartbeat (callback `accessToken`)", () => {
  it("createClient PHẢI nhận callback `accessToken`, và callback trả VÉ chứ không phải anon key", async () => {
    const { subscribeConversation } = await load();
    subscribeConversation("c1", auth("jwt-1"));
    await vi.waitFor(() => expect(trace).toContain("join:conv:c1"));

    // Không có callback ⇒ thư viện tự "làm mới" bằng anon key mỗi 25s.
    expect(typeof clientOpts?.accessToken).toBe("function");
    // Có callback nhưng trả nhầm giá trị cũng hỏng y hệt — khoá luôn giá trị.
    await expect(clientOpts!.accessToken!()).resolves.toBe("jwt-1");
  });

  /**
   * ĐÂY LÀ ĐƯỜNG THẬT ĐÃ ĐO (V3): kênh thứ hai mở MUỘN trong khi vé cũ VẪN CÒN HẠN.
   * `applyRealtimeAuth` thấy `auth.token === appliedToken` nên thoát sớm — KHÔNG `setAuth`
   * — rồi `openChannel` join thẳng bằng `accessTokenValue` hiện có. Sau một nhịp heartbeat,
   * giá trị đó là ANON KEY nếu thiếu callback ⇒ RLS từ chối ⇒ `CHANNEL_ERROR: Unauthorized`
   * lặp mãi (đo được ở +65,6 / +71,4 / +78,2 / +88,5 / +103,4 / +118,2s, không lần nào vào lại).
   *
   * Hình dạng này có thật trong sản phẩm: badge `user:{id}` và kênh `conv:{id}` mount ở hai
   * thời điểm khác nhau nhưng dùng CHUNG một vé còn hạn.
   */
  it("kênh mở MUỘN sau nhịp heartbeat (vé cũ còn hạn, không setAuth) vẫn join bằng VÉ", async () => {
    const { subscribeConversation, subscribeUserTopic } = await load();
    subscribeConversation("c1", auth("jwt-1"));
    await vi.waitFor(() => expect(trace).toContain("join:conv:c1"));
    expect(joinTokens).toEqual(["jwt-1"]);

    await heartbeat(); // 25s trôi qua, thư viện tự làm mới token của kết nối

    subscribeUserTopic("u1", auth("jwt-1")); // CÙNG vé ⇒ không có setAuth nào chạy
    await vi.waitFor(() => expect(trace).toContain("join:user:u1"));

    expect(setAuth).toHaveBeenCalledTimes(1); // đúng là đã đi đường "thoát sớm"
    expect(joinTokens).toEqual(["jwt-1", "jwt-1"]); // KHÔNG được là anon key
  });

  it("gia hạn vé ⇒ callback trả vé MỚI (quên cập nhật = heartbeat kéo kết nối về vé cũ)", async () => {
    const { subscribeConversation, applyRealtimeAuth } = await load();
    subscribeConversation("c1", auth("jwt-1", 10));
    await vi.waitFor(() => expect(trace).toContain("join:conv:c1"));

    applyRealtimeAuth(auth("jwt-2", 300));
    await vi.waitFor(() => expect(trace).toContain("join:conv:c1"));
    await vi.waitFor(() => expect(setAuth).toHaveBeenCalledWith("jwt-2"));

    await expect(clientOpts!.accessToken!()).resolves.toBe("jwt-2");
    // Nhịp heartbeat sau khi gia hạn không được kéo kết nối về vé cũ/anon key.
    await heartbeat();
    expect(accessTokenValue).toBe("jwt-2");
  });
});
