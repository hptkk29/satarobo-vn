"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendParentMessage } from "../actions";

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none";

export function MessageForm({ enrollmentId }: { enrollmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [body, setBody] = useState("");

  function submit() {
    const text = body.trim();
    if (!text) {
      toast.error("Vui lòng nhập nội dung");
      return;
    }
    startTransition(async () => {
      const res = await sendParentMessage({ enrollmentId, body: text });
      if (res.ok) {
        setBody("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi gửi tin nhắn");
      }
    });
  }

  return (
    <div className="flex items-end gap-2">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        maxLength={2000}
        placeholder="Nhập tin nhắn gửi giáo viên…"
        className={inputCls}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {pending ? "Đang gửi…" : "Gửi"}
      </button>
    </div>
  );
}
