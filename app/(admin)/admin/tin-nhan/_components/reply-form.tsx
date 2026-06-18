"use client";

import { useState, useTransition } from "react";
import { replyStaffMessage } from "../actions";

// LMS-15 — form trả lời cho staff (admin).
export function ReplyForm({ threadId }: { threadId: string }) {
  const [body, setBody] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    setErr(null);
    if (!body.trim()) {
      setErr("Vui lòng nhập nội dung");
      return;
    }
    start(async () => {
      const res = await replyStaffMessage({ threadId, body });
      if (!res.ok) {
        setErr(res.error ?? "Gửi thất bại");
        return;
      }
      setBody("");
    });
  }

  return (
    <div className="space-y-2">
      <textarea
        className="w-full rounded-md border px-3 py-2 text-sm"
        rows={3}
        placeholder="Trả lời phụ huynh…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={pending}
      />
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Đang gửi…" : "Gửi trả lời"}
      </button>
    </div>
  );
}
