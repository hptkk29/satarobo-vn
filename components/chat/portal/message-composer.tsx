"use client";

// Ô nhập tin của phụ huynh (M2).
//   - Hội thoại ARCHIVED/LOCKED → vô hiệu kèm ĐÚNG lý do (US-09 AC3);
//   - Quá 4000 ký tự → chặn tại client, server vẫn chặn độc lập (US-06 AC5).
// Component KHÔNG giữ trạng thái gửi: bấm gửi là nội dung rời ô nhập và sống tiếp
// trong bong bóng optimistic (có "đang gửi"/"gửi lại") — nội dung không bao giờ bốc hơi.

import { useState } from "react";
import { Send } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/** Trùng `CHAT_BODY_MAX` (`lib/chat/messages.ts`) — khai lại vì file đó import Prisma. */
const BODY_MAX = 4000;

export function MessageComposer({
  disabled = false,
  disabledReason,
  onSend,
}: {
  disabled?: boolean;
  disabledReason?: string | null;
  onSend: (body: string) => void;
}) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const tooLong = trimmed.length > BODY_MAX;

  function submit() {
    if (disabled || !trimmed || tooLong) return;
    onSend(trimmed);
    setValue("");
  }

  if (disabled) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-muted/40 px-3 py-3 text-center text-xs text-muted-foreground">
        {disabledReason ?? "Hội thoại này chỉ còn đọc."}
      </p>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          rows={1}
          placeholder="Nhập tin nhắn…"
          aria-label="Nội dung tin nhắn"
          className="max-h-32 min-h-[44px] flex-1 resize-y"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
        />
        <Button
          type="button"
          onClick={submit}
          disabled={!trimmed || tooLong}
          // ≥44px cho vùng chạm mobile 360px.
          className="h-11 shrink-0 px-4"
        >
          <Send className="size-4" />
          <span className="ml-1.5 hidden sm:inline">Gửi</span>
        </Button>
      </div>
      {tooLong && (
        <p className="text-[11px] font-semibold text-destructive">
          Tin nhắn tối đa {BODY_MAX} ký tự (đang {trimmed.length}).
        </p>
      )}
    </div>
  );
}
