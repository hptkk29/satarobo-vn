"use client";

// components/chat/use-chat-channel.ts — US-07: nhận tin realtime + RECONCILE bắt buộc.
//
// Hook này nối 3 thứ rời nhau lại:
//   1. Supabase Realtime private channel `conv:{id}` (kênh nhanh, KHÔNG đảm bảo delivery);
//   2. `fetchMessagesSince` qua Server Action (nguồn sự thật, bù mọi tin kênh làm rớt);
//   3. `chat-store.ts` (hợp nhất + khử trùng + mốc đã đọc — logic thuần, test riêng).
//
// Ba cái bẫy của BA §7.3 được đóng ở đây:
//   - **Broadcast không đảm bảo delivery** → MỖI lần trạng thái kênh về `SUBSCRIBED`
//     (lần đầu VÀ mọi lần re-subscribe sau khi chập mạng) đều gọi `fetchMessagesSince`.
//     Đây là CHỐT CHẶN "mất mạng không mất tin" (NT1/TS-09), KHÔNG phải tối ưu — đừng
//     bỏ đi vì "kênh đang chạy tốt rồi".
//   - **Quyền cache theo connection** → policy RLS chỉ chạy lúc join, nên người bị gỡ
//     giữa phiên vẫn nhận broadcast tới khi ngắt kết nối. Server phát `participant.removed`,
//     client tự `unsubscribe` + gọi `onRemoved` để UI thoát ra (AC3 / F-KICK bước 3).
//   - **Trùng tin** → mọi đường vào (optimistic, broadcast, Server Action, reconcile) đều
//     đi qua `mergeMessages` với khử trùng 2 tầng (id + clientMsgId).
//
// Token realtime sống 15' → hook tự xin token mới ở ~80% TTL và `setAuth` lại, không
// chờ tới lúc hết hạn mới xử lý (hết hạn giữa chừng = kênh im lặng, tin tới muộn cả phút).

import { useCallback, useEffect, useRef, useState } from "react";
import { setRealtimeAuth, subscribeConversation } from "@/lib/chat/supabase-client";
import { clearActiveConversation, setActiveConversation } from "./active-conversation";
import { notifyConversationRead } from "./read-signal";
import {
  applyMessageDeleted,
  computeUnreadReset,
  lastSeenMessageId,
  mergeMessages,
  parseBroadcastMessage,
  parseConversationLocked,
  parseMessageDeleted,
  parseParticipantRemoved,
  type ChatMessage,
  type IncomingMessage,
} from "./chat-store";

/** Xin token mới khi đã tiêu 80% TTL — còn 20% làm đệm cho mạng chậm. */
const TOKEN_RENEW_RATIO = 0.8;
/** Sàn chống vòng lặp nóng khi `expiresAt` quá gần / lệch giờ máy. */
const MIN_RENEW_DELAY_MS = 5_000;
/** Không đọc được `expiresAt` → cứ 10' xin lại (vẫn ngắn hơn TTL 15'). */
const FALLBACK_RENEW_MS = 10 * 60_000;
/** Xin token hỏng (mạng chớp) → thử lại; token cũ còn hiệu lực nên chưa rớt kênh. */
const TOKEN_RENEW_RETRY_MS = 30_000;
/** Trần số trang của MỘT lượt reconcile (30 tin/trang) — chặn vòng lặp nếu server trả `hasMore` mãi. */
const MAX_RECONCILE_PAGES = 20;

export type ChatChannelStatus =
  | "idle"
  | "connecting"
  | "subscribed"
  | "error"
  | "closed"
  /** Đã bị gỡ khỏi hội thoại (AC3) — kênh đã đóng, UI phải điều hướng ra. */
  | "removed";

export type ChatChannelSubscription = { unsubscribe: () => void };

export type ChatChannelHandlers = {
  onBroadcast: (event: string, payload: Record<string, unknown>) => void;
  onStatus: (status: string, err?: Error) => void;
};

/** Cổng ra Realtime. Tách interface để test bơm bản giả (không cần Supabase thật). */
export type ChatChannelTransport = {
  subscribe(
    conversationId: string,
    jwt: string,
    handlers: ChatChannelHandlers,
  ): ChatChannelSubscription;
  setAuth(jwt: string): void | Promise<void>;
};

export type RealtimeTokenResponse = { token: string; expiresAt: string };

/** Trang trả về của `fetchMessagesSince` (xem `lib/chat/queries.ts`). */
export type ReconcilePage = {
  messages: IncomingMessage[];
  hasMore?: boolean;
  nextSinceMessageId?: string | null;
};

export type UseChatChannelOptions = {
  conversationId: string;
  /** `User.id` người đang xem — để biết `participant.removed` có phải mình không (AC3). */
  currentUserId: string;
  /**
   * AC2 — Server Action bọc `fetchMessagesSince(conversationId, userId, lastSeenMessageId)`.
   * BẮT BUỘC: đây là đường bù tin duy nhất khi kênh realtime rớt.
   */
  fetchSince: (lastSeenMessageId: string | null) => Promise<ReconcilePage>;
  /** AC5 — Server Action bọc `markConversationRead`. Thiếu ⇒ chỉ tính badge cục bộ. */
  markRead?: (lastReadMessageId: string) => Promise<unknown>;
  /** Tin đã render sẵn từ RSC (trang đầu) — hợp nhất luôn để reconcile có mốc. */
  initialMessages?: IncomingMessage[];
  /** AC3 — gọi khi chính mình bị gỡ khỏi hội thoại; UI điều hướng về danh sách. */
  onRemoved?: () => void;
  /** false ⇒ không kết nối (chưa chọn hội thoại). */
  enabled?: boolean;
  /** DI cho test. */
  transport?: ChatChannelTransport;
  /** DI cho test. */
  fetchToken?: (signal: AbortSignal) => Promise<RealtimeTokenResponse>;
};

export type UseChatChannelResult = {
  /** Luồng tin CŨ → MỚI, đã khử trùng. */
  messages: ChatMessage[];
  /**
   * US-15 AC3 — trạng thái khoá do Admin vừa đổi, nhận qua broadcast `conversation.locked`.
   * `null` = chưa có event nào trong phiên này ⇒ dùng trạng thái server đã render.
   * Chỉ để ĐỔI GIAO DIỆN cho kịp; chốt chặn thật vẫn là guard `CONVERSATION_LOCKED` ở
   * server (`lib/chat/messages.ts`), nên client cũ chưa cập nhật cũng không gửi được tin.
   */
  lockedByAdmin: boolean | null;
  status: ChatChannelStatus;
  error: string | null;
  /** Đang chạy một lượt reconcile (UI có thể hiện "đang đồng bộ…"). */
  isReconciling: boolean;
  /** Badge chưa đọc cục bộ (0 khi đang mở ở foreground). */
  unreadCount: number;
  /** Ép chạy reconcile (nút "tải lại" khi người dùng nghi mất tin). */
  reconcile: () => Promise<void>;
  /** Đưa bản optimistic / kết quả Server Action vào cùng luồng (khử trùng chung). */
  mergeLocal: (incoming: IncomingMessage | IncomingMessage[]) => void;
};

const defaultTransport: ChatChannelTransport = {
  subscribe(conversationId, jwt, handlers) {
    const channel = subscribeConversation(conversationId, jwt, handlers);
    return {
      unsubscribe: () => {
        void channel.unsubscribe();
      },
    };
  },
  setAuth: (jwt) => setRealtimeAuth(jwt),
};

async function defaultFetchToken(signal: AbortSignal): Promise<RealtimeTokenResponse> {
  const res = await fetch("/api/chat/realtime-token", { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`Không lấy được vé realtime (HTTP ${res.status})`);
  return (await res.json()) as RealtimeTokenResponse;
}

/** Tab đang hiện? SSR/không có document ⇒ coi như đang hiện. */
function isForeground(): boolean {
  return typeof document === "undefined" || document.visibilityState === "visible";
}

export function useChatChannel(options: UseChatChannelOptions): UseChatChannelResult {
  const { conversationId, currentUserId, enabled = true } = options;

  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    mergeMessages([], options.initialMessages ?? []),
  );
  const [status, setStatus] = useState<ChatChannelStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isReconciling, setIsReconciling] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  /** US-15 AC3 — null cho tới khi có event `conversation.locked` đầu tiên. */
  const [lockedByAdmin, setLockedByAdmin] = useState<boolean | null>(null);

  // Mọi thứ thay đổi mỗi render đi qua ref ⇒ effect kết nối CHỈ phụ thuộc conversationId,
  // không bị re-subscribe (và không mất tin) chỉ vì cha render lại với callback mới.
  const fetchSinceRef = useRef(options.fetchSince);
  const markReadRef = useRef(options.markRead);
  const onRemovedRef = useRef(options.onRemoved);
  const currentUserIdRef = useRef(currentUserId);
  const transportRef = useRef(options.transport ?? defaultTransport);
  const fetchTokenRef = useRef(options.fetchToken ?? defaultFetchToken);
  fetchSinceRef.current = options.fetchSince;
  markReadRef.current = options.markRead;
  onRemovedRef.current = options.onRemoved;
  currentUserIdRef.current = currentUserId;

  const messagesRef = useRef<ChatMessage[]>(messages);
  const lastSeenRef = useRef<string | null>(lastSeenMessageId(messages));
  const lastMarkedRef = useRef<string | null>(null);
  /** Số thứ tự lượt reconcile — kết quả của lượt cũ không được đè lượt mới. */
  const reconcileSeqRef = useRef(0);
  const mountedRef = useRef(true);

  const mergeLocal = useCallback((incoming: IncomingMessage | IncomingMessage[]) => {
    setMessages((prev) => mergeMessages(prev, incoming));
  }, []);

  /**
   * AC2 — lấy mọi tin sau `lastSeenMessageId`. Cuốn hết `hasMore` trong CÙNG một lượt:
   * mất mạng 10 phút có thể lỡ hơn 30 tin (TS-09.5), dừng ở trang đầu là vẫn mất tin.
   */
  const reconcile = useCallback(async () => {
    const runId = ++reconcileSeqRef.current;
    setIsReconciling(true);
    try {
      let since = lastSeenRef.current;
      for (let page = 0; page < MAX_RECONCILE_PAGES; page++) {
        const result = await fetchSinceRef.current(since);
        // Có lượt reconcile mới hơn (SUBSCRIBED lại) hoặc đã unmount ⇒ bỏ kết quả cũ.
        if (!mountedRef.current || runId !== reconcileSeqRef.current) return;

        const batch = result?.messages ?? [];
        if (batch.length > 0) setMessages((prev) => mergeMessages(prev, batch));
        if (!result?.hasMore) break;

        const next = result.nextSinceMessageId ?? batch[batch.length - 1]?.id ?? null;
        if (!next || next === since) break; // server không tiến ⇒ dừng, tránh lặp vô hạn
        since = next;
      }
      if (runId === reconcileSeqRef.current) setError(null);
    } catch (err) {
      if (!mountedRef.current || runId !== reconcileSeqRef.current) return;
      setError(err instanceof Error ? err.message : "Không đồng bộ được tin nhắn");
    } finally {
      if (mountedRef.current && runId === reconcileSeqRef.current) setIsReconciling(false);
    }
  }, []);

  /** AC5 — đánh giá mốc đã đọc. Đọc ref nên gọi được từ listener DOM lẫn effect. */
  const evaluateRead = useCallback(() => {
    const decision = computeUnreadReset({
      messages: messagesRef.current,
      currentUserId: currentUserIdRef.current,
      lastMarkedMessageId: lastMarkedRef.current,
      foreground: isForeground(),
    });
    setUnreadCount(decision.unreadCount);
    if (!decision.shouldMark || !decision.lastReadMessageId) return;

    const target = decision.lastReadMessageId;
    const previous = lastMarkedRef.current;
    lastMarkedRef.current = target; // đặt TRƯỚC await ⇒ không bắn hai lần cho cùng một mốc
    const call = markReadRef.current;
    if (!call) return;
    // Hai nhánh của CÙNG một `then` (không phải `.then().catch()`): nhánh lỗi ở đây chỉ được
    // bắt lỗi của `markConversationRead`, không được nuốt lỗi của `notifyConversationRead`
    // rồi lùi nhầm mốc đã đọc.
    void Promise.resolve(call(target)).then(
      () => {
        // Badge tổng ở thanh nav do LAYOUT RSC tính (`countChatUnreadForUser`), mà layout
        // KHÔNG render lại khi điều hướng client-side — và việc đọc tin không sinh `bump`
        // nào trên kênh `user:{id}`. Không phát tín hiệu ở đây thì badge chỉ biết TĂNG:
        // đọc hết 5 tin, DB đã về 0, nav vẫn treo "5" cho tới khi F5.
        notifyConversationRead();
      },
      () => {
        // Hỏng thì lùi mốc để lần đánh giá sau thử lại (unread không được "mất" âm thầm).
        if (lastMarkedRef.current === target) lastMarkedRef.current = previous;
      },
    );
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // AC5 — cho badge tổng ở thanh nav biết hội thoại nào đang mở, để tin mới của CHÍNH nó
  // không cộng badge (nó được đánh dấu đã đọc ngay khi tab đang hiện). Chỉ là mẩu trạng
  // thái điều phối, không phải nguồn dữ liệu — xem `active-conversation.ts`.
  useEffect(() => {
    if (!enabled || !conversationId) return;
    setActiveConversation(conversationId);
    return () => clearActiveConversation(conversationId);
  }, [conversationId, enabled]);

  // Luồng đổi ⇒ cập nhật mốc reconcile + đánh giá lại mốc đã đọc.
  useEffect(() => {
    messagesRef.current = messages;
    lastSeenRef.current = lastSeenMessageId(messages);
    evaluateRead();
  }, [messages, evaluateRead]);

  // AC5 — tab ẩn/thu nhỏ làm timer & rAF bị bóp: bám SỰ KIỆN của trình duyệt, không bám timer.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const handler = () => evaluateRead();
    document.addEventListener("visibilitychange", handler);
    window.addEventListener("focus", handler);
    return () => {
      document.removeEventListener("visibilitychange", handler);
      window.removeEventListener("focus", handler);
    };
  }, [evaluateRead]);

  useEffect(() => {
    if (!enabled || !conversationId) return;

    const transport = transportRef.current;
    const abort = new AbortController();
    let cancelled = false;
    let subscription: ChatChannelSubscription | null = null;
    let renewTimer: ReturnType<typeof setTimeout> | null = null;

    const clearRenew = () => {
      if (renewTimer !== null) {
        clearTimeout(renewTimer);
        renewTimer = null;
      }
    };

    const teardown = () => {
      cancelled = true;
      clearRenew();
      abort.abort();
      subscription?.unsubscribe();
      subscription = null;
    };

    const scheduleRenew = (expiresAt: string | undefined) => {
      clearRenew();
      const at = expiresAt ? new Date(expiresAt).getTime() : Number.NaN;
      const delay = Number.isNaN(at)
        ? FALLBACK_RENEW_MS
        : Math.max((at - Date.now()) * TOKEN_RENEW_RATIO, MIN_RENEW_DELAY_MS);
      renewTimer = setTimeout(() => void renew(), delay);
    };

    const renew = async () => {
      if (cancelled) return;
      try {
        const fresh = await fetchTokenRef.current(abort.signal);
        if (cancelled) return;
        await transport.setAuth(fresh.token);
        scheduleRenew(fresh.expiresAt);
      } catch {
        if (cancelled) return;
        clearRenew();
        renewTimer = setTimeout(() => void renew(), TOKEN_RENEW_RETRY_MS);
      }
    };

    const handleBroadcast = (event: string, payload: Record<string, unknown>) => {
      if (cancelled) return;

      if (event === "message.created") {
        const parsed = parseBroadcastMessage(payload);
        if (parsed) setMessages((prev) => mergeMessages(prev, parsed));
        return;
      }
      if (event === "message.deleted") {
        // AC4 — đổi tại chỗ, KHÔNG reload luồng.
        const messageId = parseMessageDeleted(payload);
        if (messageId) setMessages((prev) => applyMessageDeleted(prev, messageId));
        return;
      }
      if (event === "conversation.locked") {
        // US-15 AC3 — Admin khoá/mở khoá: ô nhập của MỌI client đang mở phải đổi NGAY,
        // không chờ tải lại trang. Payload lạ → giữ nguyên trạng thái server đã render.
        const parsed = parseConversationLocked(payload);
        if (parsed) setLockedByAdmin(parsed.locked);
        return;
      }
      if (event === "participant.removed") {
        // AC3 — chỉ phản ứng khi là CHÍNH MÌNH (event phát cho cả topic).
        if (parseParticipantRemoved(payload) !== currentUserIdRef.current) return;
        teardown();
        setStatus("removed");
        onRemovedRef.current?.();
      }
    };

    const handleStatus = (channelStatus: string, err?: Error) => {
      if (cancelled) return;
      if (channelStatus === "SUBSCRIBED") {
        setStatus("subscribed");
        // ⚠️ AC2 — reconcile ở MỌI lần SUBSCRIBED, kể cả lần re-subscribe sau khi mạng chập.
        void reconcile();
        return;
      }
      if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
        setStatus("error");
        setError(err?.message ?? "Mất kết nối tới máy chủ tin nhắn — đang thử lại");
        return;
      }
      if (channelStatus === "CLOSED") setStatus("closed");
    };

    const start = async () => {
      setStatus("connecting");
      try {
        const { token, expiresAt } = await fetchTokenRef.current(abort.signal);
        if (cancelled) return;
        subscription = transport.subscribe(conversationId, token, {
          onBroadcast: handleBroadcast,
          onStatus: handleStatus,
        });
        scheduleRenew(expiresAt);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : "Không kết nối được kênh tin nhắn");
      }
    };
    void start();

    return teardown;
  }, [conversationId, enabled, reconcile]);

  return {
    messages,
    lockedByAdmin,
    status,
    error,
    isReconciling,
    unreadCount,
    reconcile,
    mergeLocal,
  };
}
