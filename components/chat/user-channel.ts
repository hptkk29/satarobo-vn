"use client";

// components/chat/user-channel.ts — HUB kênh realtime mức NGƯỜI DÙNG (`user:{User.id}`).
//
// Món nợ Đợt 1: chỉ tồn tại kênh mức HỘI THOẠI (`conv:{id}`) và client chỉ join kênh của
// hội thoại ĐANG MỞ ⇒ tin đến ở hội thoại khác không có tín hiệu nào tới trình duyệt, nên
// badge chưa đọc lẫn danh sách hội thoại đều đứng yên tới khi người dùng bấm đi bấm lại.
// Kênh này chở đúng một event NHẸ: `conversation.bumped` (không body, không PII — BR-30).
//
// VÌ SAO LÀ HUB REFCOUNT chứ không phải "mỗi component một hook":
// trên site GV, `SidebarContent` được render Ở HAI NƠI (sidebar desktop + drawer mobile,
// cả hai luôn mounted), cộng thêm màn danh sách ⇒ ≥3 nơi cùng muốn nghe. Ba lần
// `client.channel("user:X")` trên CÙNG một connection singleton là đường vào lỗi join
// trùng topic. Ở đây: người nghe đầu tiên mở kênh, người cuối cùng rời thì đóng.
//
// ⚠️ Hub có bộ hẹn giờ gia hạn token RIÊNG, chạy song song với bộ của `useChatChannel`.
// KHÔNG sai: `setRealtimeAuth` đổi token ở mức CONNECTION và mọi token đều của cùng một
// người — ai ghi sau thắng, cả hai đều hợp lệ. Giá phải trả: 2 request
// `/api/chat/realtime-token` mỗi ~12 phút (trần 30/phút/user — dư xa). Cố ý KHÔNG xây tầng
// chia sẻ token: 20 dòng trừu tượng để tiết kiệm 1 request/12 phút là lỗ.
//
// ⚠️ Broadcast KHÔNG đảm bảo delivery ⇒ MỖI lần kênh về `SUBSCRIBED` (lần đầu VÀ mọi lần
// re-subscribe sau khi chập mạng) hub phát `{ type: "resync" }` để người nghe hỏi lại
// nguồn sự thật. Đây là chốt chặn, không phải tối ưu — cùng luật với `useChatChannel`.

import { parseConversationBumped, type ConversationBump } from "./chat-store";

/** Xin token mới khi đã tiêu 80% TTL — trùng chính sách của `use-chat-channel.ts`. */
const TOKEN_RENEW_RATIO = 0.8;
const MIN_RENEW_DELAY_MS = 5_000;
const FALLBACK_RENEW_MS = 10 * 60_000;
const TOKEN_RENEW_RETRY_MS = 30_000;
/** Mở kênh hỏng (mạng chớp lúc tải trang) → thử lại; hub sống suốt phiên nên đáng thử. */
const START_RETRY_MS = 30_000;

export type UserChannelEvent =
  /** Có tin mới ở một hội thoại nào đó của tôi. */
  | { type: "bump"; bump: ConversationBump }
  /** Kênh vừa (re)kết nối — hãy hỏi lại server, có thể đã lỡ bump lúc mất mạng. */
  | { type: "resync" };

export type UserChannelListener = (event: UserChannelEvent) => void;

export type UserChannelSubscription = { unsubscribe: () => void };

export type UserChannelHandlers = {
  onBroadcast: (event: string, payload: Record<string, unknown>) => void;
  onStatus: (status: string, err?: Error) => void;
};

/** Cổng ra Realtime — tách interface để test bơm bản giả (không cần Supabase thật). */
export type UserChannelTransport = {
  subscribe(userId: string, jwt: string, handlers: UserChannelHandlers): UserChannelSubscription;
  setAuth(jwt: string): void | Promise<void>;
};

export type RealtimeTokenResponse = { token: string; expiresAt: string };

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
  subscribe(userId, jwt, handlers) {
    let channel: { unsubscribe: () => unknown } | null = null;
    let cancelled = false;

    void import("@/lib/chat/supabase-client")
      .then((mod) => {
        if (cancelled) return;
        channel = mod.subscribeUserTopic(userId, jwt, handlers);
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
  async setAuth(jwt) {
    const mod = await import("@/lib/chat/supabase-client");
    await mod.setRealtimeAuth(jwt);
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

  const clearTimers = () => {
    if (renewTimer !== null) {
      clearTimeout(renewTimer);
      renewTimer = null;
    }
    if (retryTimer !== null) {
      clearTimeout(retryTimer);
      retryTimer = null;
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
      clearTimers();
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
        await transport.setAuth(fresh.token);
        if (gen !== generation) return;
        scheduleRenew(fresh.expiresAt);
      } catch {
        if (gen !== generation) return;
        clearTimers();
        // Token CŨ còn hiệu lực ⇒ kênh chưa rớt, chỉ cần thử lại lát nữa.
        renewTimer = setTimeout(() => void renew(), TOKEN_RENEW_RETRY_MS);
      }
    };

    const handleBroadcast = (event: string, payload: Record<string, unknown>) => {
      if (gen !== generation) return;
      if (event !== "conversation.bumped") return;
      const bump = parseConversationBumped(payload);
      if (bump) emit({ type: "bump", bump });
    };

    const handleStatus = (status: string) => {
      if (gen !== generation) return;
      // Chốt chặn: broadcast có thể rơi ⇒ mỗi lần (re)kết nối là một lần hỏi lại server.
      if (status === "SUBSCRIBED") emit({ type: "resync" });
    };

    void (async () => {
      try {
        const { token, expiresAt } = await fetchToken(controller.signal);
        if (gen !== generation) return;
        subscription = transport.subscribe(userId, token, {
          onBroadcast: handleBroadcast,
          onStatus: handleStatus,
        });
        scheduleRenew(expiresAt);
      } catch {
        if (gen !== generation) return;
        clearTimers();
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
