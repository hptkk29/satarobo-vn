"use client";

// M2 — Luồng hội thoại của phụ huynh (US-06 / US-07 / US-09 / US-12).
//
// Ranh giới trách nhiệm (đừng gộp lại):
//   · RSC (`app/(portal)/portal/tin-nhan/[conversationId]/page.tsx`) tải 30 tin mới
//     nhất + thành viên + trạng thái hội thoại → truyền xuống đây. KHÔNG có `useEffect`
//     nào fetch dữ liệu ban đầu.
//   · `useChatChannel` lo realtime + RECONCILE (`fetchMessagesSince` ở mọi lần
//     SUBSCRIBED) + mốc đã đọc. Component này KHÔNG tự nói chuyện với Supabase.
//   · `chat-store` lo khử trùng optimistic ↔ broadcast ↔ kết quả action và chính sách
//     thử lại. Component này chỉ *hẹn giờ* theo `retryDelayMs` mà store trả về.
//
// `useEffect` ở đây chỉ dùng cho: cuộn, IntersectionObserver (tải trang cũ), đồng hồ
// 15' của nút thu hồi, dọn timer — đúng phần việc bắt buộc phải ở client.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Users } from "lucide-react";
import Link from "next/link";
import { useChatChannel } from "@/components/chat/use-chat-channel";
import {
  createOptimisticMessage,
  nextSendState,
  startSend,
  type ChatMessage,
} from "@/components/chat/chat-store";
import {
  fetchMessagesSinceAction,
  getMessagesPageAction,
  markConversationReadAction,
  recallOwnMessageAction,
  sendChatMessageAction,
} from "@/lib/chat/_actions";
import { MessageComposer } from "./message-composer";
import { MessageRow } from "./message-row";
import type { PortalChatMember, PortalChatMessage } from "./types";

/** Coi như "đang ở đáy" khi còn cách đáy dưới ngần này — tin mới tự cuộn xuống. */
const STICK_TO_BOTTOM_PX = 80;
/** Nhịp cập nhật đồng hồ cho cửa sổ thu hồi 15' (không cần chính xác tới giây). */
const RECALL_CLOCK_TICK_MS = 30_000;

/** `clientMsgId` phải là UUID (schema server). `crypto.randomUUID` không có ở vài WebView cũ. */
function newClientMsgId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function ChatThread({
  conversationId,
  currentUserId,
  members,
  initialMessages,
  initialCursor,
  initialHasMore,
  canSend,
  disabledReason,
}: {
  conversationId: string;
  currentUserId: string;
  members: PortalChatMember[];
  /** 30 tin mới nhất từ RSC (MỚI → CŨ; store tự sắp lại CŨ → MỚI). */
  initialMessages: PortalChatMessage[];
  initialCursor: string | null;
  initialHasMore: boolean;
  canSend: boolean;
  /** Lý do hiện dưới ô nhập khi `canSend = false` (US-09 AC3). */
  disabledReason: string | null;
}) {
  const router = useRouter();

  const [cursor, setCursor] = useState<string | null>(initialCursor);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [recallingId, setRecallingId] = useState<string | null>(null);
  // 0 = chưa mount xong ⇒ chưa hiện nút thu hồi (tránh lệch server/client khi hydrate).
  const [nowMs, setNowMs] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const topSentinelRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  /** Bản optimistic đang chờ, theo `clientMsgId` — nguồn để thử lại mà không mất nội dung. */
  const pendingRef = useRef(new Map<string, ChatMessage>());
  const retryTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const { messages, status, error, isReconciling, mergeLocal, reconcile } = useChatChannel({
    conversationId,
    currentUserId,
    initialMessages,
    fetchSince: async (lastSeen) => {
      const res = await fetchMessagesSinceAction(conversationId, lastSeen);
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
    markRead: async (lastReadMessageId) => {
      const res = await markConversationReadAction(conversationId, lastReadMessageId);
      // NÉM khi hỏng là có chủ đích: hook bắt lỗi để LÙI mốc đã đọc và thử lại lần sau.
      // Nuốt lỗi ở đây = badge "chưa đọc" biến mất trong khi DB chưa ghi gì.
      if (!res.ok) throw new Error(res.error.message);
    },
    // US-07 AC3 — bị gỡ khỏi nhóm giữa phiên: hook đã unsubscribe, UI chỉ việc thoát ra.
    onRemoved: () => {
      toast.info("Bạn không còn trong nhóm lớp này.");
      router.replace("/portal/tin-nhan");
      router.refresh();
    },
  });

  const memberNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of members) map.set(m.userId, m.displayName);
    return map;
  }, [members]);

  // ── Gửi tin: optimistic + clientMsgId + thử lại theo chính sách của store ──

  async function deliver(clientMsgId: string) {
    const optimistic = pendingRef.current.get(clientMsgId);
    if (!optimistic) return;

    let errorMessage: string | null = null;
    let outcome: "retry" | "fatal";
    try {
      const res = await sendChatMessageAction({
        conversationId,
        body: optimistic.body,
        clientMsgId,
      });
      if (res.ok) {
        // Bản server thắng bản optimistic (khử trùng tầng 2 theo clientMsgId).
        pendingRef.current.delete(clientMsgId);
        retryTimersRef.current.delete(clientMsgId);
        mergeLocal(res.data);
        return;
      }
      // Action TRẢ VỀ lỗi = lỗi nghiệp vụ (403/429/quá dài) — thử lại cũng vô ích.
      outcome = "fatal";
      errorMessage = res.error.message;
    } catch {
      // Action NÉM = mạng/máy chủ không trả lời — đúng ca cần tự thử lại (US-06 AC6).
      outcome = "retry";
    }

    const attempt = nextSendState(optimistic.send ?? startSend(), outcome);
    const updated: ChatMessage = { ...optimistic, send: attempt };
    pendingRef.current.set(clientMsgId, updated);
    mergeLocal(updated);

    if (attempt.retryDelayMs !== null) {
      const timer = setTimeout(() => void deliver(clientMsgId), attempt.retryDelayMs);
      retryTimersRef.current.set(clientMsgId, timer);
      return;
    }
    if (errorMessage) toast.error(errorMessage);
  }

  function handleSend(body: string) {
    const clientMsgId = newClientMsgId();
    const optimistic = createOptimisticMessage({
      conversationId,
      clientMsgId,
      senderId: currentUserId,
      body,
    });
    pendingRef.current.set(clientMsgId, optimistic);
    mergeLocal(optimistic);
    stickToBottomRef.current = true;
    void deliver(clientMsgId);
  }

  function handleRetry(clientMsgId: string) {
    const prev = pendingRef.current.get(clientMsgId);
    if (!prev) return;
    const updated: ChatMessage = { ...prev, send: startSend() };
    pendingRef.current.set(clientMsgId, updated);
    mergeLocal(updated);
    void deliver(clientMsgId);
  }

  // ── Thu hồi (US-12 AC1) ────────────────────────────────────────────────────

  async function handleRecall(messageId: string) {
    const target = messages.find((m) => m.id === messageId);
    if (!target) return;
    setRecallingId(messageId);
    try {
      const res = await recallOwnMessageAction({ messageId });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      // Đổi tại chỗ, không reload. Broadcast `message.deleted` dội về sau cũng vô hại
      // (cùng id ⇒ khử trùng tầng 1).
      mergeLocal({ ...target, deleted: true, body: "" });
    } catch {
      toast.error("Không thu hồi được tin nhắn — vui lòng thử lại");
    } finally {
      setRecallingId(null);
    }
  }

  // ── Cuộn lên tải tiếp (US-09 AC1) ─────────────────────────────────────────

  async function loadOlder() {
    if (!hasMore || loadingOlder) return;
    setLoadingOlder(true);
    const container = scrollRef.current;
    const prevHeight = container?.scrollHeight ?? 0;
    const prevTop = container?.scrollTop ?? 0;
    try {
      const res = await getMessagesPageAction(conversationId, cursor);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      mergeLocal(res.data.messages);
      setHasMore(res.data.hasMore);
      setCursor(res.data.nextCursor);
      // Giữ nguyên chỗ đang đọc: chèn tin cũ vào đầu làm nội dung tụt xuống.
      requestAnimationFrame(() => {
        const c = scrollRef.current;
        if (c) c.scrollTop = prevTop + (c.scrollHeight - prevHeight);
      });
    } catch {
      toast.error("Không tải được tin cũ hơn — vui lòng thử lại");
    } finally {
      setLoadingOlder(false);
    }
  }

  const loadOlderRef = useRef(loadOlder);
  loadOlderRef.current = loadOlder;

  useEffect(() => {
    const root = scrollRef.current;
    const target = topSentinelRef.current;
    if (!root || !target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadOlderRef.current();
      },
      { root, threshold: 0.1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // Tin mới → cuộn xuống, NHƯNG chỉ khi người dùng đang ở đáy (đang đọc lịch sử thì
  // giật xuống đáy là mất chỗ đọc).
  useEffect(() => {
    const c = scrollRef.current;
    if (!c || !stickToBottomRef.current) return;
    c.scrollTop = c.scrollHeight;
  }, [messages]);

  useEffect(() => {
    setNowMs(Date.now());
    const timer = setInterval(() => setNowMs(Date.now()), RECALL_CLOCK_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const timers = retryTimersRef.current;
    return () => {
      for (const t of timers.values()) clearTimeout(t);
      timers.clear();
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {status === "error" && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <span className="min-w-0 truncate">
            {error ?? "Mất kết nối tới máy chủ tin nhắn — đang thử lại"}
          </span>
          <button
            type="button"
            onClick={() => void reconcile()}
            className="inline-flex min-h-[28px] shrink-0 items-center gap-1 font-semibold hover:underline"
          >
            <RefreshCw className="size-3.5" /> Tải lại
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={() => {
          const c = scrollRef.current;
          if (!c) return;
          stickToBottomRef.current =
            c.scrollHeight - c.scrollTop - c.clientHeight < STICK_TO_BOTTOM_PX;
        }}
        // Chiều cao CỐ ĐỊNH thay vì `flex-1`: shell portal (v1 và v2) khác nhau về
        // chiều cao khả dụng, và trên mobile còn bottom-nav — bám vh là cách duy nhất
        // cho ra một vùng cuộn thật ở cả hai shell mà không phải sửa layout ngoài.
        className="flex h-[55vh] flex-col gap-2 overflow-y-auto rounded-xl border border-border bg-card p-3 sm:h-[60vh]"
      >
        <div ref={topSentinelRef} className="h-px shrink-0" />

        {(loadingOlder || isReconciling) && (
          <p className="flex items-center justify-center gap-1.5 py-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            {loadingOlder ? "Đang tải tin cũ hơn…" : "Đang đồng bộ…"}
          </p>
        )}
        {!hasMore && messages.length > 0 && (
          <p className="py-1 text-center text-[11px] text-muted-foreground">
            Đây là đầu cuộc trò chuyện.
          </p>
        )}
        {messages.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Chưa có tin nhắn nào trong nhóm lớp này.
          </p>
        )}

        {messages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            isMine={m.senderId === currentUserId}
            senderName={m.senderId ? (memberNameById.get(m.senderId) ?? "Thành viên") : null}
            nowMs={nowMs}
            recallPending={recallingId === m.id}
            onRecall={(id) => void handleRecall(id)}
            onRetry={handleRetry}
          />
        ))}
      </div>

      <MessageComposer disabled={!canSend} disabledReason={disabledReason} onSend={handleSend} />

      <Link
        href={`/portal/tin-nhan/${conversationId}/thanh-vien`}
        className="inline-flex min-h-[44px] items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <Users className="size-3.5" /> Thành viên nhóm ({members.length})
      </Link>
    </div>
  );
}
