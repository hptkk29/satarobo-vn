"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MESSENGER_SEND_SAN_SANG, LY_DO_CHUA_GUI_DUOC } from "@/lib/crm/messenger-send-gate";
import { replyAction } from "../actions";

const QUICK_REPLIES = [
  "Dạ anh/chị cho em xin SĐT để tư vấn lộ trình phù hợp cho bé ạ.",
  "Dạ Sata Robo có lớp thử miễn phí, anh/chị cho bé qua trải nghiệm nhé.",
];

export function ReplyBox({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  // S-2a (25/08/2026) — Ô trả lời TẮT vì repo chưa có đường gửi ra Meta Send API:
  // bấm "Gửi" chỉ ghi một dòng vào DB, khách không nhận được gì, và dòng đó còn tắt
  // luôn cảnh báo SLA-0 "chậm phản hồi". Thà nói thật còn hơn để người trực tưởng
  // đã trả lời khách. Cách mở lại: xem `lib/crm/messenger-send-gate.ts`.
  const khoa = !MESSENGER_SEND_SAN_SANG;

  function send(value: string) {
    start(async () => {
      const res = await replyAction(conversationId, value);
      if (res.ok) {
        toast.success("Đã gửi");
        setText("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  if (khoa) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-state-warning bg-state-warning-soft p-3 text-sm text-state-warning-ink">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          <span className="font-semibold">Chưa trả lời được từ đây.</span>{" "}
          {LY_DO_CHUA_GUI_DUOC}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nhập trả lời..."
          onKeyDown={(e) => e.key === "Enter" && text.trim() && send(text)}
        />
        <Button onClick={() => send(text)} disabled={pending || !text.trim()}>
          Gửi
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {QUICK_REPLIES.map((q) => (
          <button
            key={q}
            type="button"
            disabled={pending}
            onClick={() => send(q)}
            className="rounded border px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted"
          >
            {q.slice(0, 28)}…
          </button>
        ))}
      </div>
    </div>
  );
}
