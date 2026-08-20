"use client";

// components/chat/user-channel.ts — HUB kênh realtime mức NGƯỜI DÙNG (`user:{User.id}`).
//
// Món nợ Đợt 1: chỉ tồn tại kênh mức HỘI THOẠI (`conv:{id}`) và client chỉ join kênh của
// hội thoại ĐANG MỞ ⇒ tin đến ở hội thoại khác không có tín hiệu nào tới trình duyệt, nên
// badge chưa đọc lẫn danh sách hội thoại đều đứng yên tới khi người dùng bấm đi bấm lại.
// Kênh này chở các event NHẸ, thuần TÍN HIỆU (không body, không PII — BR-30):
//   • `conversation.bumped`  — có tin mới ở một hội thoại của tôi;
//   • `notification.bumped`  — chuông nhân sự của tôi có mục mới (khỏi chờ vòng poll 60s).
// Kênh vốn đã mở sẵn cho mọi trang có badge, nên chở thêm tín hiệu chuông KHÔNG tốn thêm
// kết nối, thêm topic, hay thêm policy nào (policy chỉ so topic, không lọc theo tên event).
//
// VÌ SAO LÀ HUB REFCOUNT chứ không phải "mỗi component một hook":
// trên site GV, `SidebarContent` được render Ở HAI NƠI (sidebar desktop + drawer mobile,
// cả hai luôn mounted), cộng thêm màn danh sách ⇒ ≥3 nơi cùng muốn nghe. Ba lần
// `client.channel("user:X")` trên CÙNG một connection singleton là đường vào lỗi join
// trùng topic. Ở đây: người nghe đầu tiên mở kênh, người cuối cùng rời thì đóng.
//
// ⚠️ Hub có bộ hẹn giờ gia hạn vé RIÊNG, chạy song song với bộ của `useChatChannel`, và cả
// hai dùng CHUNG một connection singleton. Bản cũ ghi "không sai, ai ghi sau thắng" — ĐO THẬT
// đã bác bỏ: `realtime.setAuth` giữa phiên giết kênh ở nhịp heartbeat kế tiếp (≤25s sau lời
// gọi) và kênh KHÔNG tự hồi, tức mỗi lần hub gia hạn có thể giết luôn kênh `conv:` của tab.
// Nay việc đổi vé đi qua `applyRealtimeAuth` ở `lib/chat/supabase-client.ts` — một chu kỳ
// RỜI-ĐỔI-JOIN ở mức kết nối, và nó trả về mốc hết hạn ĐANG có hiệu lực để hai bộ hẹn giờ
// không dẫm chân nhau (bên tới sau thấy vé còn quá nửa đời thì rút lui).
//
// ⚠️ Broadcast KHÔNG đảm bảo delivery ⇒ MỖI lần kênh về `SUBSCRIBED` (lần đầu, mọi lần
// re-subscribe sau khi chập mạng, VÀ mọi lần gia hạn vé) hub phát `{ type: "resync" }` để
// người nghe hỏi lại nguồn sự thật. Đây là chốt chặn, không phải tối ưu — cùng luật với
// `useChatChannel`. Kênh về `CLOSED` ngoài ý muốn thì hub tự nối lại (backoff).

import { parseConversationBumped, type ConversationBump } from "./chat-store";

/** Xin token mới khi đã tiêu 80% TTL — trùng chính sách của `use-chat-channel.ts`. */
const TOKEN_RENEW_RATIO = 0.8;
const MIN_RENEW_DELAY_MS = 5_000;
/** Không đọc được `expiresAt` → 3' xin lại (vẫn ngắn hơn TTL 5'). */
const FALLBACK_RENEW_MS = 3 * 60_000;
const TOKEN_RENEW_RETRY_MS = 30_000;
/** Mở kênh hỏng (mạng chớp lúc tải trang) → thử lại; hub sống suốt phiên nên đáng thử. */
const START_RETRY_MS = 30_000;
/** Kênh đóng ngoài ý muốn → nối lại, nhân đôi mỗi lần, kịch 30s (trùng `use-chat-channel.ts`). */
const RECONNECT_BASE_MS = 2_000;
const RECONNECT_MAX_MS = 30_000;

export type UserChannelEvent =
  /** Có tin mới ở một hội thoại nào đó của tôi. */
  | { type: "bump"; bump: ConversationBump }
  /**
   * Chuông nhân sự của tôi vừa có gì đó mới. Chỉ có MỐC THỜI GIAN, không tiêu đề/`href`
   * (BR-30) — người nghe phải đi hỏi lại server rồi mới vẽ.
   */
  | { type: "noti"; at: Date }
  /** Kênh vừa (re)kết nối — hãy hỏi lại server, có thể đã lỡ bump lúc mất mạng. */
  | { type: "resync" };

export type UserChannelListener = (event: UserChannelEvent) => void;

/**
 * Payload `notification.bumped` → mốc thời gian; `null` nếu dị dạng.
 *
 * Nghiêm ngặt có chủ đích, đúng nếp `parseConversationBumped`: thà BỎ một tín hiệu hỏng còn
 * hơn đoán bừa (`new Date(undefined)` ra Invalid Date, để lọt là người nghe cầm rác). Bỏ
 * cũng không mất gì: lần `SUBSCRIBED` kế tiếp phát `resync`, người nghe hỏi lại server là bù đủ.
 */
function parseNotificationBumped(payload: Record<string, unknown>): Date | null {
  const at = payload.at;
  if (typeof at !== "string" && typeof at !== "number" && !(at instanceof Date)) return null;
  const parsed = new Date(at);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type UserChannelSubscription = { unsubscribe: () => void };

export type UserChannelHandlers = {
  onBroadcast: (event: string, payload: Record<string, unknown>) => void;
  onStatus: (status: string, err?: Error) => void;
};

export type RealtimeTokenResponse = { token: string; expiresAt: string };

/** Cổng ra Realtime — tách interface để test bơm bản giả (không cần Supabase thật). */
export type UserChannelTransport = {
  subscribe(
    userId: string,
    auth: RealtimeTokenResponse,
    handlers: UserChannelHandlers,
  ): UserChannelSubscription;
  /**
   * Gia hạn vé ở mức KẾT NỐI (chu kỳ rời-đổi-join). Trả về mốc `expiresAt` ĐANG có
   * hiệu lực (ISO) — có thể là vé của kênh `conv:` nếu bên đó vừa đổi hộ.
   */
  renewAuth(auth: RealtimeTokenResponse): string | Promise<string>;
};

export type UserChannelHub = {
  /** Đăng ký nghe; trả về hàm huỷ. Người nghe cuối cùng huỷ ⇒ kênh đóng. */
  subscribe(userId: string, listener: UserChannelListener): () => void;
};

/**
 * ⚠️ `@/lib/chat/supabase-client` được nạp ĐỘNG (không import tĩnh).
 *
 * Badge "Tin nhắn" nằm trong nav ⇒ hub này bị kéo vào bundle của MỌI trang admin / portal /
 * site GV. Import tĩnh sẽ nhét luôn `@supabase/supabase-js` (~50 kB gzip, có cả tầng
 * realtime) vào chunk khởi động của từng trang, kể cả trang không liên quan gì tới chat —
 * đúng loại thuế vi phạm ngân sách hiệu năng (admin ≥ 90 mobile, portal chạy trên máy
 * phụ huynh). Nạp động đẩy nó ra chunk bất đồng bộ, tải sau khi trang đã tương tác được.
 */
const defaultTransport: UserChannelTransport = {
  subscribe(userId, auth, handlers) {
    let channel: { unsubscribe: () => unknown } | null = null;
    let cancelled = false;

    void import("@/lib/chat/supabase-client")
      .then((mod) => {
        if (cancelled) return;
        channel = mod.subscribeUserTopic(userId, auth, handlers);
      })
      .catch(() => {
        // Không tải được module realtime ⇒ badge đứng ở số server (xuống cấp êm).
      });

    return {
      unsubscribe: () => {
        cancelled = true;
        void channel?.unsubscribe();
        channel = null;
      },
    };
  },
  async renewAuth(auth) {
    const mod = await import("@/lib/chat/supabase-client");
    return mod.applyRealtimeAuth(auth);
  },
};

async function defaultFetchToken(signal: AbortSignal): Promise<RealtimeTokenResponse> {
  const res = await fetch("/api/chat/realtime-token", { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Không lấy được vé realtime (HTTP ${res.status})`);
  return (await res.json()) as RealtimeTokenResponse;
}

export function createUserChannelHub(deps: {
  transport?: UserChannelTransport;
  fetchToken?: (signal: AbortSignal) => Promise<RealtimeTokenResponse>;
} = {}): UserChannelHub {
  const transport = deps.transport ?? defaultTransport;
  const fetchToken = deps.fetchToken ?? defaultFetchToken;

  const listeners = new Set<UserChannelListener>();
  let currentUserId: string | null = null;
  let subscription: UserChannelSubscription | null = null;
  let abort: AbortController | null = null;
  let renewTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Số lần nối lại liên tiếp — về 0 mỗi lần kênh SUBSCRIBED thật sự. */
  let reconnectAttempt = 0;
  /** Mọi callback bất đồng bộ so số này trước khi đụng state — chặn kết quả của lượt cũ. */
  let generation = 0;

  const emit = (event: UserChannelEvent) => {
    for (const listener of [...listeners]) {
      try {
        listener(event);
      } catch {
        // Một người nghe hỏng không được kéo những người còn lại xuống theo.
      }
    }
  };

  /**
   * Huỷ hẹn giờ của VÉ (gia hạn / thử lại). CỐ Ý không đụng `reconnectTimer`: một lần gia
   * hạn vé thành công không được nuốt mất lượt nối lại đang chờ, nếu không kênh đã CLOSED
   * sẽ nằm chết im lặng — đúng cái bug đang vá.
   */
  const clearTokenTimers = () => {
    if (renewTimer !== null) {
      clearTimeout(renewTimer);
      renewTimer = null;
    }
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  /** Huỷ MỌI hẹn giờ — chỉ dùng khi thật sự đóng kênh (`stop`). */
  const clearTimers = () => {
    clearTokenTimers();
    if (reconnectTimer !== null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const stop = () => {
    generation += 1;
    clearTimers();
    abort?.abort();
    abort = null;
    subscription?.unsubscribe();
    subscription = null;
    currentUserId = null;
  };

  const start = (userId: string) => {
    const gen = ++generation;
    const controller = new AbortController();
    abort = controller;
    currentUserId = userId;

    const scheduleRenew = (expiresAt: string | undefined) => {
      if (gen !== generation) return;
      clearTokenTimers();
      const at = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
      const delay = Number.isNaN(at)
        ? FALLBACK_RENEW_MS
        : Math.max((at - Date.now()) * TOKEN_RENEW_RATIO, MIN_RENEW_DELAY_MS);
      renewTimer = setTimeout(() => void renew(), delay);
    };

    const renew = async () => {
      if (gen !== generation) return;
      try {
        const fresh = await fetchToken(controller.signal);
        if (gen !== generation) return;
        // Mốc HIỆU LỰC, không phải mốc của vé vừa xin (kênh `conv:` có thể vừa đổi vé hộ).
        const effectiveExpiresAt = await transport.renewAuth(fresh);
        if (gen !== generation) return;
        scheduleRenew(effectiveExpiresAt);
      } catch {
        if (gen !== generation) return;
        clearTokenTimers();
        // Token CŨ còn hiệu lực ⇒ kênh chưa rớt, chỉ cần thử lại lát nữa.
        renewTimer = setTimeout(() => void renew(), TOKEN_RENEW_RETRY_MS);
      }
    };

    // Lọc theo TÊN event, không phải "nhận hết cho tiện": topic `user:{id}` là kênh dùng
    // chung, event lạ (hoặc event của phiên bản client cũ/mới hơn) phải rơi im lặng chứ
    // không được biến thành tín hiệu sai. Mỗi tên có parser riêng — payload dị dạng ⇒ bỏ,
    // `resync` ở lần SUBSCRIBED kế tiếp bù lại.
    const handleBroadcast = (event: string, payload: Record<string, unknown>) => {
      if (gen !== generation) return;
      if (event === "conversation.bumped") {
        const bump = parseConversationBumped(payload);
        if (bump) emit({ type: "bump", bump });
        return;
      }
      if (event === "notification.bumped") {
        const at = parseNotificationBumped(payload);
        if (at) emit({ type: "noti", at });
      }
    };

    /**
     * Kênh đóng ngoài ý muốn ⇒ dựng lại bằng vé MỚI. Hub sống suốt phiên nên không được
     * "đóng rồi thôi": badge chưa đọc sẽ đứng im tới khi người dùng F5. Backoff nhân đôi,
     * kịch 30s, và chỉ nối lại khi còn người nghe.
     */
    const scheduleReconnect = () => {
      if (gen !== generation || reconnectTimer !== null || listeners.size === 0) return;
      const delay = Math.min(RECONNECT_BASE_MS * 2 ** reconnectAttempt, RECONNECT_MAX_MS);
      reconnectAttempt += 1;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (gen !== generation || listeners.size === 0) return;
        stop(); // đóng kênh cũ + huỷ mọi timer (generation++) — listeners GIỮ NGUYÊN
        start(userId);
      }, delay);
    };

    const handleStatus = (status: string) => {
      if (gen !== generation) return;
      // Chốt chặn: broadcast có thể rơi ⇒ mỗi lần (re)kết nối là một lần hỏi lại server.
      if (status === "SUBSCRIBED") {
        reconnectAttempt = 0;
        emit({ type: "resync" });
        return;
      }
      // CHANNEL_ERROR / TIMED_OUT có `rejoinTimer` của phoenix lo — chen vào là join đôi.
      if (status === "CLOSED") scheduleReconnect();
    };

    void (async () => {
      try {
        const auth = await fetchToken(controller.signal);
        if (gen !== generation) return;
        subscription = transport.subscribe(userId, auth, {
          onBroadcast: handleBroadcast,
          onStatus: handleStatus,
        });
        scheduleRenew(auth.expiresAt);
      } catch {
        if (gen !== generation) return;
        clearTokenTimers();
        // Không có kênh = badge đứng ở số server dựng lúc tải trang (xuống cấp êm),
        // nhưng hub sống suốt phiên nên vẫn đáng thử lại thay vì bỏ hẳn realtime.
        retryTimer = setTimeout(() => {
          if (gen !== generation || listeners.size === 0) return;
          start(userId);
        }, START_RETRY_MS);
      }
    })();
  };

  return {
    subscribe(userId, listener) {
      // Đổi người dùng trong cùng một tab (đăng xuất/đăng nhập lại) — dựng lại kênh.
      if (currentUserId !== null && currentUserId !== userId) stop();

      listeners.add(listener);
      if (subscription === null && retryTimer === null && currentUserId !== userId) {
        start(userId);
      }

      let done = false;
      return () => {
        if (done) return;
        done = true;
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
  };
}

/** Bản dùng ở runtime — MỘT kênh `user:{id}` cho cả tab, dù có bao nhiêu badge/danh sách. */
export const userChannelHub: UserChannelHub = createUserChannelHub();
