"use client";

import {
  createClient,
  type SupabaseClient,
  type RealtimeChannel,
} from "@supabase/supabase-js";

/**
 * US-02 — Supabase client phía BROWSER cho chat realtime + ĐIỀU PHỐI VÉ (JWT) của
 * cả kết nối.
 *
 * Chỉ dùng anon key (NEXT_PUBLIC_*) — anon key một mình KHÔNG đọc được gì:
 * channel là private, policy SELECT trên `realtime.messages` đòi JWT có claim
 * `app_user_id` là participant còn hiệu lực. JWT lấy từ
 * `GET /api/chat/realtime-token`, truyền vào `subscribeConversation` / `subscribeUserTopic`.
 *
 * KHÔNG import file này ở server — service role key không bao giờ ở client.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * ⛔ VÌ SAO Ở ĐÂY CÓ MỘT "SỔ ĐĂNG KÝ KÊNH" CHỨ KHÔNG PHẢI `setAuth` TRẦN
 * ══════════════════════════════════════════════════════════════════════════════
 * Bản cũ gia hạn vé bằng `client.realtime.setAuth(jwt)` giữa phiên. ĐO THẬT trên
 * Supabase dev (scripts/_zztest-chat-token-va-lo.ts, LỖ 3):
 *
 *   R  setAuth@+25,0s → kênh CLOSED@+40,2s | R2 setAuth@+35,4s → CLOSED@+39,5s
 *   R3 setAuth@+45,1s → CLOSED@+64,5s, trong khi vé gốc còn sống tới +187,4s
 *      ⇒ chết sớm 122s, KHÔNG phải vì hết hạn.
 *   Kênh ĐỐI CHỨNG (không gọi setAuth) đi qua ĐÚNG các nhịp heartbeat đó vẫn
 *      SUBSCRIBED suốt 94/94 tick. Theo dõi thêm 56–81s: 0 lần SUBSCRIBED lại.
 *
 * Nguồn gốc trong thư viện (`@supabase/realtime-js@2.112.2`,
 * `RealtimeClient._performAuth`): khi giá trị token ĐỔI, nó `push(access_token)`
 * xuống MỌI kênh đang `joined`. Chính cú push đó giết kênh ở nhịp heartbeat kế
 * tiếp và kênh KHÔNG tự hồi.
 *
 * Hệ quả cay nhất: `client.channel()` là SINGLETON dùng chung một kết nối, nên
 * gia hạn vé của kênh `conv:` giết luôn kênh `user:` (badge chưa đọc) và ngược lại
 * — kể cả khi ta "chỉ đổi kênh của mình". Vì vậy việc đổi vé KHÔNG thể là việc
 * riêng của một kênh; nó là thao tác MỨC KẾT NỐI:
 *
 *   1. rời HẾT kênh đang mở (state → `leaving` ⇒ `isJoined()` false),
 *   2. `setAuth(vé mới)` — lúc này KHÔNG còn kênh nào `joined` ⇒ KHÔNG có push,
 *   3. join lại toàn bộ kênh bằng vé mới (một lần JOIN MỚI thật sự).
 *
 * Bước 3 còn vá luôn LỖ 2 (rò nội dung cho người đã bị gỡ): policy RLS chỉ được
 * đánh giá LÚC JOIN — đã đo: người bị gỡ join lại → CHANNEL_ERROR. Nên mỗi chu kỳ
 * gia hạn tự đá người đã bị gỡ ra khỏi kênh, cửa sổ rò bị chặn ở đúng chu kỳ đó
 * thay vì kéo hết đời vé.
 *
 * ⚠️ ĐỪNG thêm lại một hàm `setRealtimeAuth(jwt)` "cho tiện". Nó đã bị xoá có chủ ý.
 */

let browserClient: SupabaseClient | null = null;

/**
 * Vé ĐANG có hiệu lực trên kết nối. Thư viện đọc biến này qua callback `accessToken` (xem
 * {@link getSupabaseBrowserClient}) nên nó phải được cập nhật TRƯỚC mọi lời gọi `setAuth`.
 */
let ticketForConnection: string | null = null;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY — realtime chat chưa được cấu hình",
    );
  }

  browserClient = createClient(url, anonKey, {
    /**
     * ⛔ BẮT BUỘC — ĐỪNG BỎ. Không có dòng này thì vé của ta bị THAY BẰNG ANON KEY sau ≤25s.
     *
     * Đọc trong nguồn (`@supabase/supabase-js@2.112.2`): `SupabaseClient` LUÔN truyền
     * `accessToken: this._getAccessToken` xuống `RealtimeClient`, và `_getAccessToken()`
     * rơi về `supabaseKey` (tức **anon key**) khi không có phiên Supabase Auth — mà repo
     * này không dùng Supabase Auth (Auth.js là nguồn phiên duy nhất), nên nó LUÔN rơi về
     * anon key. Hệ quả dây chuyền trong `@supabase/realtime-js@2.112.2`:
     *
     *   1. `_performAuth` thấy `this.accessToken` tồn tại ⇒ đặt `_manuallySetToken = false`,
     *      KỂ CẢ khi ta gọi `setAuth(vé)` tường minh.
     *   2. `_wrapHeartbeatCallback` gọi `_setAuthSafely()` mỗi nhịp heartbeat (25s), và
     *      `RealtimeChannel.subscribe()` cũng gọi nó khi join xong ('ok'). Cả hai chỉ chạy
     *      khi `!_isManualToken()` — tức LUÔN chạy ở đây.
     *   3. `setAuth()` không tham số ⇒ lấy token từ callback ⇒ **anon key** ⇒ khác vé đang
     *      giữ ⇒ ghi đè `accessTokenValue` và `push(access_token)` xuống mọi kênh `joined`.
     *
     * Hai thiệt hại đo được: kênh đang mở bị đá ở nhịp heartbeat kế tiếp, và — nguy hiểm
     * hơn cho chính bản vá này — `RealtimeChannel.subscribe()` nhét
     * `socket.accessTokenValue` vào payload JOIN, nên MỌI lần join lại (chu kỳ gia hạn,
     * và cả đường tự nối lại sau CLOSED) sau nhịp heartbeat đầu tiên sẽ join bằng ANON KEY
     * ⇒ RLS từ chối ⇒ realtime chết vĩnh viễn cho tới khi tải lại trang.
     *
     * Trả vé của ta ⇒ mọi lần "tự làm mới" của thư viện thành no-op (giá trị không đổi ⇒
     * không có push), và join lại luôn mang đúng vé. `?? anonKey` chỉ để lời gọi trước khi
     * có vé không ném.
     */
    accessToken: async () => ticketForConnection ?? anonKey,
  });
  return browserClient;
}

/** Vé realtime do `GET /api/chat/realtime-token` cấp. */
export type RealtimeAuth = {
  token: string;
  /** ISO timestamp — mốc `exp` của chính vé này. */
  expiresAt: string;
};

export type SubscribeConversationHandlers = {
  /** Payload broadcast của hội thoại (server phát bằng service role). */
  onBroadcast?: (event: string, payload: Record<string, unknown>) => void;
  /** Trạng thái channel: SUBSCRIBED | CHANNEL_ERROR | TIMED_OUT | CLOSED. */
  onStatus?: (status: string, err?: Error) => void;
};

export type RealtimeSubscription = { unsubscribe: () => void };

/** Một kênh đang được một người dùng của module này giữ. */
type ChannelEntry = {
  topic: string;
  handlers: SubscribeConversationHandlers;
  /** Kênh HIỆN TẠI; đổi mỗi lần gia hạn vé. `null` = đang giữa hai lần join. */
  channel: RealtimeChannel | null;
  /** Người giữ đã gọi `unsubscribe()` — mọi callback muộn phải câm. */
  released: boolean;
};

const entries = new Set<ChannelEntry>();
/** Kênh đã gắn listener broadcast rồi — chống gắn hai lần nếu thư viện trả lại đúng object cũ. */
const boundChannels = new WeakSet<RealtimeChannel>();

/** Vé ĐANG áp lên kết nối (một kết nối chỉ có duy nhất một vé). */
let appliedToken: string | null = null;
let appliedExpiresAtMs = 0;
let swapInFlight = false;
let queuedAuth: RealtimeAuth | null = null;

/** `expiresAt` dị dạng ⇒ coi như vé ngắn, để lần gia hạn kế tiếp tới sớm chứ đừng tin nhầm. */
const FALLBACK_TTL_MS = 60_000;

function expiresAtMsOf(auth: RealtimeAuth): number {
  const at = Date.parse(auth.expiresAt);
  return Number.isNaN(at) ? Date.now() + FALLBACK_TTL_MS : at;
}

/**
 * Mở kênh cho một entry. **KHÔNG BAO GIỜ ném** — xem khối `catch`.
 */
function openChannel(entry: ChannelEntry): void {
  if (entry.released || entry.channel) return;

  const { onBroadcast, onStatus } = entry.handlers;
  try {
    const client = getSupabaseBrowserClient();
    const channel = client.channel(entry.topic, { config: { private: true } });
    entry.channel = channel;

    if (onBroadcast && !boundChannels.has(channel)) {
      boundChannels.add(channel);
      channel.on("broadcast", { event: "*" }, (message) => {
        // Kênh đã bị thay (gia hạn vé) hoặc người giữ đã rời ⇒ nuốt, không đẩy lên UI.
        if (entry.channel !== channel || entry.released) return;
        onBroadcast(message.event, message.payload as Record<string, unknown>);
      });
    }

    channel.subscribe((status, err) => {
      if (entry.channel !== channel || entry.released) return;
      onStatus?.(status, err);
    });
  } catch (e) {
    /**
     * Vì sao KHÔNG để nó ném ra ngoài:
     *
     * `RealtimeChannel.subscribe()` ném đồng bộ `"tried to subscribe multiple times"` nếu
     * `client.channel(topic)` trả về ĐÚNG kênh cũ. Kênh cũ vẫn còn trong `socket.channels`
     * khi lần rời trước kết thúc bằng nhánh `'error'`: phoenix chỉ gắn `onClose` cho
     * `'ok'`/`'timeout'`, nên nhánh `'error'` KHÔNG chạy `socket._remove(channel)` —
     * `removeChannel` vẫn resolve bình thường và `await` ở `closeChannel` không cứu được.
     *
     * Nếu để ném: trong `swapAuth` nó thoát cả vòng `for` ⇒ những kênh còn lại của chu kỳ
     * KHÔNG bao giờ được join lại, và vì `swapAuth` được gọi bằng `void` nên lỗi biến mất
     * thành unhandled rejection. Trong `user-channel.ts` thì tệ hơn: `defaultTransport`
     * nuốt lỗi bằng `.catch(() => {})` ⇒ hub chết CÂM, badge đứng im tới khi F5 — đúng
     * loại "mất realtime âm thầm" mà cả bản vá này sinh ra để diệt.
     *
     * Nên: nuốt lỗi ở đây, trả entry về trạng thái "chưa có kênh", rồi BÁO `CLOSED` cho
     * người giữ để bộ nối-lại có backoff của họ chạy (`use-chat-channel.ts` /
     * `user-channel.ts`). Báo trong microtask vì `subscribePrivateTopic` chưa kịp trả
     * `RealtimeSubscription` cho người gọi.
     */
    entry.channel = null;
    queueMicrotask(() => {
      if (entry.released) return;
      onStatus?.("CLOSED", e instanceof Error ? e : new Error(String(e)));
    });
  }
}

/**
 * Rời kênh và CHỜ tới lúc rời hẳn.
 *
 * `entry.channel = null` đặt TRƯỚC khi rời có chủ đích: `RealtimeChannel.subscribe`
 * đăng ký `_onClose(() => callback(CLOSED))`, nên mỗi lần gia hạn sẽ bắn một CLOSED
 * "giả" ra ngoài. Người dùng module này nay tự nối lại khi gặp CLOSED (phòng thủ lớp
 * hai) — để CLOSED của chính lần gia hạn lọt ra là đẻ ra một vòng nối-lại vô nghĩa.
 *
 * Phải AWAIT: `client.channel(topic)` khử trùng theo topic, nên join lại khi kênh cũ
 * chưa rời xong sẽ nhận về đúng object cũ (đang `leaving`) thay vì kênh mới.
 */
async function closeChannel(entry: ChannelEntry): Promise<void> {
  const channel = entry.channel;
  entry.channel = null;
  if (!channel) return;
  try {
    await getSupabaseBrowserClient().removeChannel(channel);
  } catch {
    // Rời kênh hỏng không được chặn việc dựng lại kênh mới.
  }
}

/**
 * Chu kỳ đổi vé MỨC KẾT NỐI (xem đầu file). Nối tiếp nhau, không chạy chồng:
 * yêu cầu tới lúc đang chạy được xếp hàng và chỉ giữ cái mới nhất.
 */
async function swapAuth(auth: RealtimeAuth): Promise<void> {
  if (swapInFlight) {
    queuedAuth = auth;
    return;
  }
  swapInFlight = true;
  let next: RealtimeAuth | null = auth;
  try {
    while (next) {
      const current: RealtimeAuth = next;
      next = null;
      appliedToken = current.token;
      appliedExpiresAtMs = expiresAtMsOf(current);
      // TRƯỚC `setAuth`: callback `accessToken` đọc biến này, và thư viện tự gọi lại nó
      // ở mỗi nhịp heartbeat + mỗi lần join xong. Đặt sau là để hở một cửa sổ mà thư viện
      // đọc được vé CŨ rồi tự "sửa lại" cho ta.
      ticketForConnection = current.token;

      // 1) rời hết — 2) đổi vé khi không còn kênh nào joined — 3) join lại.
      await Promise.all([...entries].map((e) => closeChannel(e)));
      await getSupabaseBrowserClient().realtime.setAuth(current.token);
      for (const entry of entries) openChannel(entry);

      next = queuedAuth;
      queuedAuth = null;
    }
  } finally {
    swapInFlight = false;
  }
}

/**
 * Áp vé mới lên kết nối. **Trả về mốc hết hạn ĐANG THỰC SỰ có hiệu lực** (ISO) —
 * người gọi PHẢI hẹn giờ gia hạn theo mốc này, không phải theo vé mình vừa xin.
 *
 * Vì sao có thể "bỏ" vé mới: hai bộ hẹn giờ độc lập cùng gia hạn trên MỘT kết nối
 * (`use-chat-channel.ts` cho `conv:` và `user-channel.ts` cho `user:`). Nếu cứ nhận
 * là mỗi chu kỳ TTL có 2 lần rời-join toàn bộ kênh, tức 2 lần reconcile + 2 lần
 * resync mỗi ~4 phút cho mỗi tab. Luật: vé đang áp còn hơn NỬA đời vé mới thì giữ
 * nguyên (ngay sau một lần đổi, người thứ hai tới sẽ thấy "còn nhiều" và rút lui;
 * tới lúc thật sự cần đổi thì chỉ còn 20% TTL nên chắc chắn qua cửa này).
 */
export function applyRealtimeAuth(auth: RealtimeAuth): string {
  const incomingMs = expiresAtMsOf(auth);

  if (appliedToken !== null) {
    if (auth.token === appliedToken) return new Date(appliedExpiresAtMs).toISOString();

    const now = Date.now();
    if (appliedExpiresAtMs - now > (incomingMs - now) / 2) {
      return new Date(appliedExpiresAtMs).toISOString();
    }
  }

  /**
   * ⛔ VÉ ĐẦU TIÊN CŨNG PHẢI ĐI QUA CHU KỲ NÀY — ĐỪNG "tối ưu" thành `setAuth` thẳng.
   *
   * Bản trước có một nhánh riêng cho vé đầu: `void setAuth(token)` rồi join ngay, với lý
   * lẽ "chưa kênh nào `joined` nên không có push nào giết ai". Lý lẽ đó SAI trong thực tế.
   * ĐO THẬT trên Supabase dev (scripts/_zztest-chat-token-va-lo.ts, biến thể V1/V2 — hai
   * kênh RAW khác nhau ĐÚNG một biến, cùng dòng thời gian, cùng nguồn phát nhịp 500ms):
   *
   *   V1  `void setAuth(vé)` rồi join NGAY  → 0/92 tick, CLOSED 2,7s sau SUBSCRIBED
   *   V2a `await setAuth(vé)` rồi join       → 92/92 tick, không bao giờ bị đóng
   *   V2b kênh thứ hai cùng kết nối (V2a)    → 67/67 tick, không bao giờ bị đóng
   *   CTRL `await setAuth(vé)`, một kênh     → 92/92 tick, không bao giờ bị đóng
   *
   * Hai kết luận đọc thẳng từ bảng đó:
   *   • HAI kênh private trên MỘT kết nối là hình dạng LÀNH (V2a+V2b) — nghi ngờ cũ về
   *     `conv:` + `user:` dùng chung singleton là sai địa chỉ;
   *   • KHÔNG chờ `setAuth` xong mà join ngay là hình dạng CHẾT, và nó chết CÂM: kênh vẫn
   *     báo SUBSCRIBED rồi mới CLOSED vài giây sau, không kèm lý do.
   * Triệu chứng khớp y hệt bản cũ của module: `P@conv` SUBSCRIBED rồi CLOSED sau 3,5s ở
   * chu kỳ đầu và 1,5s ở chu kỳ sau, trong khi `P@user` (join trong CÙNG chu kỳ, sau khi
   * `setAuth` đã xong) sống nguyên 66/67 tick.
   *
   * `swapAuth` vốn đã `await setAuth` giữa bước rời và bước join, nên cho vé đầu đi qua
   * chính nó là đủ: lúc đó chưa có kênh nào để rời, bước 1 thành no-op.
   * Đánh đổi: hàm này vẫn trả về đồng bộ, còn việc join lùi lại một vài microtask —
   * `subscribePrivateTopic` đã biết chờ nhờ cờ `swapInFlight`.
   */
  void swapAuth(auth);
  return new Date(incomingMs).toISOString();
}

function subscribePrivateTopic(
  topic: string,
  auth: RealtimeAuth,
  handlers: SubscribeConversationHandlers,
): RealtimeSubscription {
  const entry: ChannelEntry = { topic, handlers, channel: null, released: false };
  entries.add(entry);

  applyRealtimeAuth(auth);
  // Đang giữa một chu kỳ đổi vé ⇒ bước 3 của chu kỳ sẽ mở hộ kênh này bằng vé mới;
  // mở ở đây nữa là dựng kênh bằng vé sắp bị thay.
  if (!swapInFlight) openChannel(entry);

  return {
    unsubscribe: () => {
      if (entry.released) return;
      entry.released = true;
      entries.delete(entry);
      void closeChannel(entry);
    },
  };
}

/**
 * Subscribe private channel `conv:{id}`. Vé do server mint (route
 * /api/chat/realtime-token); gia hạn KHÔNG đi qua hàm này mà qua
 * {@link applyRealtimeAuth} (chu kỳ rời-đổi-join, xem đầu file).
 */
export function subscribeConversation(
  conversationId: string,
  auth: RealtimeAuth,
  handlers: SubscribeConversationHandlers = {},
): RealtimeSubscription {
  return subscribePrivateTopic(`conv:${conversationId}`, auth, handlers);
}

/**
 * Subscribe private channel `user:{userId}` — kênh mức NGƯỜI DÙNG (không phải hội thoại).
 *
 * Vì sao cần: kênh `conv:{id}` chỉ tới được người ĐANG MỞ hội thoại đó, nên tin đến ở hội
 * thoại khác không có tín hiệu nào tới trình duyệt ⇒ badge chưa đọc và danh sách hội thoại
 * đứng yên. Server bắn `conversation.bumped` (payload nhẹ, không PII) tới topic của từng
 * người nhận; client nhận xong đi hỏi lại server rồi mới vẽ.
 *
 * Quyền đọc do policy `user_can_receive_own_user_broadcast` quyết định: so `realtime.topic()`
 * với `'user:' || auth.jwt()->>'app_user_id'` ⇒ chỉ chính chủ join được topic của mình.
 */
export function subscribeUserTopic(
  userId: string,
  auth: RealtimeAuth,
  handlers: SubscribeConversationHandlers = {},
): RealtimeSubscription {
  return subscribePrivateTopic(`user:${userId}`, auth, handlers);
}
