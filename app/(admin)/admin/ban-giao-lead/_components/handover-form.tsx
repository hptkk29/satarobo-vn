"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { previewHandoverAction, runHandoverAction } from "../_actions";

type SaleOpt = { id: string; label: string };

export function HandoverForm({
  sales,
  statuses,
  campaigns,
}: {
  sales: SaleOpt[];
  statuses: string[];
  campaigns: string[];
}) {
  const [fromUserId, setFromUserId] = useState("");
  const [toUserId, setToUserId] = useState("");
  const [selStatuses, setSelStatuses] = useState<string[]>([]);
  const [campaign, setCampaign] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);
  const [reason, setReason] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [pending, start] = useTransition();

  function toggleStatus(s: string) {
    setCount(null);
    setSelStatuses((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function preview() {
    if (!fromUserId) {
      toast.error("Chọn sale bàn giao");
      return;
    }
    start(async () => {
      const res = await previewHandoverAction({ fromUserId, statuses: selStatuses, campaign, onlyActive });
      if (res.ok) setCount(res.count ?? 0);
      else toast.error(res.error ?? "Lỗi");
    });
  }

  function run() {
    if (!fromUserId || !toUserId) {
      toast.error("Chọn sale bàn giao và sale nhận");
      return;
    }
    start(async () => {
      const res = await runHandoverAction({ fromUserId, toUserId, statuses: selStatuses, campaign, onlyActive, reason });
      if (res.ok) {
        toast.success(`Đã chuyển ${res.moved} lead, ${res.tasksMoved} task`);
        setCount(null);
        setReason("");
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  return (
    <div className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2">
      <label className="text-sm">
        <span className="mb-1 block text-neutral-600">Sale bàn giao (nguồn)</span>
        <select
          value={fromUserId}
          onChange={(e) => {
            setFromUserId(e.target.value);
            setCount(null);
          }}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">— Chọn —</option>
          {sales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-neutral-600">Sale nhận (đích)</span>
        <select
          value={toUserId}
          onChange={(e) => setToUserId(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">— Chọn —</option>
          {sales.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <div className="text-sm sm:col-span-2">
        <span className="mb-1 block text-neutral-600">Lọc trạng thái (để trống = tất cả)</span>
        <div className="flex flex-wrap gap-1.5">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => toggleStatus(s)}
              className={`rounded-full border px-2.5 py-1 text-xs ${
                selStatuses.includes(s)
                  ? "border-purple-600 bg-purple-50 text-purple-700"
                  : "border-neutral-300 text-neutral-500"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <label className="text-sm">
        <span className="mb-1 block text-neutral-600">Chiến dịch (utmCampaign)</span>
        <select
          value={campaign}
          onChange={(e) => {
            setCampaign(e.target.value);
            setCount(null);
          }}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">— Mọi chiến dịch —</option>
          {campaigns.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={onlyActive}
          onChange={(e) => {
            setOnlyActive(e.target.checked);
            setCount(null);
          }}
        />
        <span className="text-neutral-600">Chỉ lead chưa đóng (bỏ ENROLLED/LOST/DUPLICATE)</span>
      </label>

      <label className="text-sm sm:col-span-2">
        <span className="mb-1 block text-neutral-600">Lý do bàn giao</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="VD: Sale Nguyễn Văn A nghỉ việc 06/2026"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="flex items-center gap-3 sm:col-span-2">
        <button
          onClick={preview}
          disabled={pending}
          className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Xem trước số lead
        </button>
        {count !== null ? <span className="text-sm text-neutral-600">→ {count} lead khớp điều kiện</span> : null}
        <button
          onClick={run}
          disabled={pending || count === null || count === 0}
          className="ml-auto rounded-md bg-purple-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Thực hiện bàn giao
        </button>
      </div>
    </div>
  );
}
