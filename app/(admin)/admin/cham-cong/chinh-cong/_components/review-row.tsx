"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import { reviewAdjustmentRequest } from "../_actions";

export interface ReviewItem {
  id: string;
  userName: string;
  centerName: string | null;
  date: string; // ISO
  reason: string;
  requested: string | null;
  createdAt: string;
  locked: boolean; // quá hạn với quản lý hiện tại
  lockReason: string | null;
}

export function ReviewRow({ item }: { item: ReviewItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [note, setNote] = useState("");

  function decide(decision: "APPROVED" | "REJECTED") {
    startTransition(async () => {
      const res = await reviewAdjustmentRequest({
        id: item.id,
        decision,
        reviewNote: note,
        checkIn: decision === "APPROVED" ? checkIn : "",
        checkOut: decision === "APPROVED" ? checkOut : "",
      });
      if (res.ok) {
        toast.success(decision === "APPROVED" ? "Đã duyệt + áp chỉnh" : "Đã từ chối");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi xử lý");
    });
  }

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-gray-900">
          {item.userName}
          <span className="ml-2 text-sm font-normal text-gray-500">
            {new Date(item.date).toLocaleDateString("vi-VN")}
          </span>
        </span>
        {item.centerName && <span className="text-xs text-gray-400">{item.centerName}</span>}
      </div>
      {item.requested && <p className="mt-1 text-sm text-gray-700">Đề nghị: {item.requested}</p>}
      <p className="mt-1 whitespace-pre-wrap text-sm text-gray-600">{item.reason}</p>

      {item.locked ? (
        <p className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">
          {item.lockReason ?? "Quá hạn chỉnh — chỉ admin cấp cao xử lý được."}
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">Giờ vào đúng</span>
              <input type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-gray-500">Giờ ra đúng</span>
              <input type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1 text-sm" />
            </label>
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú duyệt (tuỳ chọn)"
            className="w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => decide("APPROVED")}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Duyệt + áp giờ
            </button>
            <button
              type="button"
              onClick={() => decide("REJECTED")}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Từ chối
            </button>
          </div>
          <p className="text-[11px] text-gray-400">
            Bỏ trống giờ vào/ra = duyệt mà không đổi bản ghi công (chỉ phản hồi).
          </p>
        </div>
      )}
    </li>
  );
}
