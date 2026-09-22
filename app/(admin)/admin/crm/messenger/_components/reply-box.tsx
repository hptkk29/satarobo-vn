"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { replyAction } from "../actions";

const QUICK_REPLIES = [
  "Dạ anh/chị cho em xin SĐT để tư vấn lộ trình phù hợp cho bé ạ.",
  "Dạ Sata Robo có lớp thử miễn phí, anh/chị cho bé qua trải nghiệm nhé.",
];

export function ReplyBox({ conversationId }: { conversationId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

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
