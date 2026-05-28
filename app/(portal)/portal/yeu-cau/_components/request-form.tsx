"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ALL_REQUEST_TYPES, REQUEST_TYPE_LABEL } from "@/lib/portal/request-labels";
import { createParentRequest } from "../actions";

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none";

export function RequestForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [type, setType] = useState("ABSENCE");
  const [content, setContent] = useState("");
  const [date, setDate] = useState("");

  function submit() {
    startTransition(async () => {
      const res = await createParentRequest({
        type,
        content,
        preferredDate: date || null,
      });
      if (res.ok) {
        toast.success("Đã gửi yêu cầu");
        setContent("");
        setDate("");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi gửi yêu cầu");
    });
  }

  const showDate = type === "ABSENCE" || type === "MAKEUP" || type === "RESERVE";

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-700">
        Gửi yêu cầu mới
      </h2>
      <div className="space-y-3">
        <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
          {ALL_REQUEST_TYPES.map((t) => (
            <option key={t} value={t}>
              {REQUEST_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        {showDate && (
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-neutral-500">
              Ngày liên quan (tuỳ chọn)
            </span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </label>
        )}
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={4}
          placeholder="Mô tả chi tiết yêu cầu…"
          className={inputCls}
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          {pending ? "Đang gửi…" : "Gửi yêu cầu"}
        </button>
      </div>
    </section>
  );
}
