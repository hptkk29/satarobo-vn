"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createAdjustmentRequest } from "../../chinh-cong/_actions";

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none";

export function AdjustRequestForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState("");
  const [requested, setRequested] = useState("");
  const [reason, setReason] = useState("");

  function submit() {
    if (!date) {
      toast.error("Chọn ngày cần chỉnh");
      return;
    }
    startTransition(async () => {
      const res = await createAdjustmentRequest({ date, requested, reason });
      if (res.ok) {
        toast.success("Đã gửi yêu cầu chỉnh công");
        setDate("");
        setRequested("");
        setReason("");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi gửi yêu cầu");
    });
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
        Gửi yêu cầu chỉnh công
      </h2>
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">Ngày công cần chỉnh</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">Đề nghị (vd: giờ vào 07:30, giờ ra 17:30)</span>
          <input
            type="text"
            value={requested}
            onChange={(e) => setRequested(e.target.value)}
            placeholder="Giờ vào/ra đúng…"
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">Lý do / giải trình</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Vì sao cần chỉnh công ngày này…"
            className={inputCls}
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {pending ? "Đang gửi…" : "Gửi yêu cầu"}
        </button>
      </div>
    </section>
  );
}
