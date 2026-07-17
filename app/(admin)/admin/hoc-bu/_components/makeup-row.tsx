"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarPlus, CheckCircle2, X } from "lucide-react";
import {
  getMakeupSuggestions,
  scheduleMakeupAction,
  completeMakeupAction,
  cancelMakeupAction,
} from "../_actions";
import { formatDateVN } from "@/lib/format/date";

export interface MakeupItem {
  id: string;
  studentName: string;
  className: string;
  missedDate: string | null;
  missedLesson: string | null;
  status: string;
  makeupDate: string | null;
}

type Sugg = {
  sessionId: string;
  className: string;
  date: string;
  lessonOrder: number | null;
  lessonTitle: string | null;
  // R7-08 — ưu tiên cơ sở nhà + còn chỗ.
  isHomeCenter?: boolean;
  capacityLeft?: number;
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  SCHEDULED: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-green-100 text-green-700",
  CANCELLED: "bg-gray-100 text-gray-500",
};
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ xếp bù",
  SCHEDULED: "Đã xếp bù",
  COMPLETED: "Đã bù xong",
  CANCELLED: "Đã huỷ",
};

export function MakeupRow({ item }: { item: MakeupItem }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [suggs, setSuggs] = useState<Sugg[] | null>(null);

  function loadSuggestions() {
    startTransition(async () => {
      const res = await getMakeupSuggestions(item.id);
      setSuggs(res);
      if (res.length === 0) toast.message("Chưa có buổi bù phù hợp (cùng khoá/lesson, không vượt tiến độ).");
    });
  }

  function schedule(sessionId: string) {
    startTransition(async () => {
      const res = await scheduleMakeupAction(item.id, sessionId);
      if (res.ok) { toast.success("Đã xếp buổi bù"); router.refresh(); }
      else toast.error(res.error ?? "Lỗi");
    });
  }
  function complete() {
    startTransition(async () => {
      const res = await completeMakeupAction(item.id);
      if (res.ok) { toast.success("Đã hoàn tất bù — số buổi cập nhật"); router.refresh(); }
      else toast.error(res.error ?? "Lỗi");
    });
  }
  function cancel() {
    startTransition(async () => {
      await cancelMakeupAction(item.id);
      toast.success("Đã huỷ nhu cầu bù");
      router.refresh();
    });
  }

  return (
    <li className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <span className="font-semibold text-gray-900">{item.studentName}</span>
          <span className="ml-2 text-sm text-gray-500">{item.className}</span>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[item.status]}`}>
          {STATUS_LABEL[item.status] ?? item.status}
        </span>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Buổi lỡ: {item.missedDate ? formatDateVN(item.missedDate) : "—"}
        {item.missedLesson ? ` · ${item.missedLesson}` : ""}
        {item.makeupDate && ` → bù: ${formatDateVN(item.makeupDate)}`}
      </p>

      {(item.status === "PENDING" || item.status === "SCHEDULED") && (
        <div className="mt-3 flex flex-wrap gap-2">
          {item.status === "PENDING" && (
            <button type="button" onClick={loadSuggestions} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <CalendarPlus className="h-4 w-4" /> Gợi ý buổi bù
            </button>
          )}
          {item.status === "SCHEDULED" && (
            <button type="button" onClick={complete} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50">
              <CheckCircle2 className="h-4 w-4" /> Đánh dấu đã bù
            </button>
          )}
          <button type="button" onClick={cancel} disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">
            <X className="h-4 w-4" /> Huỷ
          </button>
        </div>
      )}

      {suggs && suggs.length > 0 && item.status === "PENDING" && (
        <div className="mt-2 space-y-1 rounded-lg border border-gray-100 bg-gray-50 p-2">
          {suggs.map((s) => (
            <button key={s.sessionId} type="button" onClick={() => schedule(s.sessionId)} disabled={pending}
              className="flex w-full items-center justify-between rounded px-2 py-1 text-left text-sm hover:bg-white">
              <span className="flex items-center gap-1.5">
                {s.className}{s.lessonTitle ? ` · Bài ${s.lessonOrder}: ${s.lessonTitle}` : ""}
                {s.isHomeCenter === false && (
                  <span className="rounded-full bg-[#7C3AED]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#7C3AED]">
                    Cơ sở khác
                  </span>
                )}
              </span>
              <span className="text-xs text-gray-500">
                {formatDateVN(s.date)}
                {typeof s.capacityLeft === "number" ? ` · còn ${s.capacityLeft} chỗ` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}
