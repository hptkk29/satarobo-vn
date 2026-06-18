"use client";

import { useState, useTransition } from "react";
import { sendParentMessage } from "../actions";

// LMS-15 — form gửi tin cho PH (mở thread mới: cần subject; trả lời: chỉ body).
export function MessageForm({
  threadId,
  withSubject,
}: {
  threadId?: string;
  withSubject?: boolean;
}) {
  const [subject, setSubject] = useState("");
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
      const res = await sendParentMessage({ threadId, subject: subject || null, body });
      if (!res.ok) {
        setErr(res.error ?? "Gửi thất bại");
        return;
      }
      setBody("");
      setSubject("");
    });
  }

  return (
    <div className="space-y-2">
      {withSubject && (
        <input
          className="w-full rounded-md border px-3 py-2 text-sm"
          placeholder="Tiêu đề (vd: Hỏi về tiến độ học của con)"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          disabled={pending}
        />
      )}
      <textarea
        className="w-full rounded-md border px-3 py-2 text-sm"
        rows={3}
        placeholder="Nhập tin nhắn cho giáo viên / trung tâm…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        disabled={pending}
      />
      {err && <p className="text-sm text-rose-600">{err}</p>}
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="rounded-md bg-orange-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {pending ? "Đang gửi…" : "Gửi"}
      </button>
    </div>
  );
}
