"use client";

// Một dòng trong luồng chat của phụ huynh (M2).
//   - SYSTEM  → giữa luồng, không avatar, không tên (US-09 AC4);
//   - ANNOUNCEMENT → khung nhấn mạnh, bọc `AnnouncementReadMarker` (US-10 AC3);
//   - CHAT    → bong bóng trái/phải.
// Tin đã gỡ hiện text thay thế do `chat-store` chuẩn hoá — component này KHÔNG tự
// quyết định hiển thị body gốc trong bất kỳ nhánh nào.

import { AlertCircle, Loader2, Megaphone, Undo2 } from "lucide-react";
import type { ChatMessage } from "@/components/chat/chat-store";
import { cn } from "@/lib/utils";
import { formatChatTimestamp } from "./format";
import { AnnouncementReadMarker } from "./announcement-read-marker";

/**
 * US-12 AC1 — cửa sổ tự thu hồi. Khai lại (không import `RECALL_WINDOW_MS` từ
 * `lib/chat/moderation.ts`) vì file đó import Prisma. **Server vẫn là chốt chặn**:
 * nút biến mất chỉ là phép lịch sự, quá 15' server từ chối kể cả khi client gọi.
 */
const RECALL_WINDOW_MS = 15 * 60_000;

export function canRecall(
  message: Pick<ChatMessage, "kind" | "deleted" | "createdAt" | "id">,
  isMine: boolean,
  nowMs: number,
): boolean {
  // `nowMs = 0` = component chưa mount xong (client chưa đặt đồng hồ) — chưa vẽ nút,
  // nếu không mọi tin cũ đều "còn trong 15 phút" vì hiệu số ra số âm.
  if (nowMs <= 0) return false;
  if (!isMine || message.deleted || message.kind !== "CHAT") return false;
  if (message.id.startsWith("tmp:")) return false; // chưa có id server
  return nowMs - message.createdAt.getTime() <= RECALL_WINDOW_MS;
}

export function MessageRow({
  message,
  isMine,
  senderName,
  nowMs,
  recallPending,
  onRecall,
  onRetry,
}: {
  message: ChatMessage;
  isMine: boolean;
  senderName: string | null;
  nowMs: number;
  recallPending: boolean;
  onRecall: (messageId: string) => void;
  onRetry: (clientMsgId: string) => void;
}) {
  if (message.kind === "SYSTEM") {
    return (
      <div className="my-1 flex justify-center">
        <p className="max-w-[85%] rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">
          {message.body}
        </p>
      </div>
    );
  }

  if (message.kind === "ANNOUNCEMENT") {
    return (
      <AnnouncementReadMarker messageId={message.id}>
        <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
            <Megaphone className="size-3.5" /> Thông báo
          </p>
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
            {message.body}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {senderName ? `${senderName} · ` : ""}
            {formatChatTimestamp(message.createdAt)}
          </p>
        </div>
      </AnnouncementReadMarker>
    );
  }

  const sending = message.send?.status === "sending";
  const failed = message.send?.status === "failed";

  return (
    <div className={cn("flex flex-col", isMine ? "items-end" : "items-start")}>
      {!isMine && senderName && (
        <span className="mb-0.5 max-w-full truncate px-1 text-[11px] font-semibold text-muted-foreground">
          {senderName}
        </span>
      )}
      <div
        className={cn(
          "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm",
          message.deleted
            ? "border border-dashed border-border bg-transparent italic text-muted-foreground"
            : isMine
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
          failed && "opacity-70 ring-1 ring-destructive",
        )}
      >
        {message.body}
      </div>

      <div className="mt-0.5 flex items-center gap-2 px-1 text-[10px] text-muted-foreground">
        <span>{formatChatTimestamp(message.createdAt)}</span>

        {sending && (
          <span className="inline-flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" /> Đang gửi…
          </span>
        )}

        {failed && (
          <button
            type="button"
            onClick={() => message.clientMsgId && onRetry(message.clientMsgId)}
            className="inline-flex min-h-[24px] items-center gap-1 rounded px-1 font-semibold text-destructive hover:underline"
          >
            <AlertCircle className="size-3" /> Gửi lại
          </button>
        )}

        {canRecall(message, isMine, nowMs) && (
          <button
            type="button"
            disabled={recallPending}
            onClick={() => onRecall(message.id)}
            className="inline-flex min-h-[24px] items-center gap-1 rounded px-1 hover:underline disabled:opacity-50"
          >
            <Undo2 className="size-3" /> Thu hồi
          </button>
        )}
      </div>
    </div>
  );
}
