"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, RotateCcw, X } from "lucide-react";
import { resolveAbsence } from "../_actions";

export interface AbsenceItem {
  id: string;
  studentName: string;
  studentCode: string | null;
  className: string | null;
  sessionDate: string | null;
  reason: string;
  urgency: "URGENT" | "ON_TIME";
  createdAt: string;
  hasSession: boolean;
}

export function AbsenceRow({ item }: { item: AbsenceItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [response, setResponse] = useState("");

  function handle(action: "MAKEUP" | "ABSENT", excused?: boolean) {
    startTransition(async () => {
      const res = await resolveAbsence({
        requestId: item.id,
        action,
        excused,
        response: response || null,
      });
      if (res.ok) {
        toast.success(action === "MAKEUP" ? "Đã xếp học bù" : "Đã ghi nhận vắng");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi xử lý");
      }
    });
  }

  return (
    <li className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-neutral-900">{item.studentName}</span>
          {item.studentCode && (
            <span className="text-xs text-neutral-400">{item.studentCode}</span>
          )}
          {item.urgency === "URGENT" ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700">
              GẤP
            </span>
          ) : (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
              Đúng hạn
            </span>
          )}
        </div>
        <span className="text-xs text-neutral-400">
          {new Date(item.createdAt).toLocaleDateString("vi-VN")}
        </span>
      </div>

      <p className="mt-1 text-sm text-neutral-600">
        {item.className ?? "—"}
        {item.sessionDate && (
          <>
            {" · "}
            <span className="inline-flex items-center gap-1 text-neutral-700">
              <CalendarClock className="h-3.5 w-3.5" />
              {new Date(item.sessionDate).toLocaleDateString("vi-VN", {
                weekday: "short",
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
          </>
        )}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-700">{item.reason}</p>

      {!item.hasSession ? (
        <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
          Yêu cầu không gắn buổi cụ thể — xử lý ở trang Yêu cầu phụ huynh.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Phản hồi cho phụ huynh (tuỳ chọn)"
            disabled={pending}
            className="w-full rounded-lg border border-neutral-200 px-3 py-1.5 text-sm outline-none focus:border-[#7C3AED] disabled:opacity-50"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handle("MAKEUP")}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-sm font-semibold text-white hover:bg-purple-700 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" /> Xếp học bù
            </button>
            <button
              type="button"
              onClick={() => handle("ABSENT", true)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Đánh vắng (có phép)
            </button>
            <button
              type="button"
              onClick={() => handle("ABSENT", false)}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Đánh vắng (không phép)
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
