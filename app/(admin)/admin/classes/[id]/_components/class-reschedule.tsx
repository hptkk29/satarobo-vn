"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, CalendarPlus } from "lucide-react";
import { previewClassReschedule, applyClassReschedule, generateSessionsAction } from "../../_actions";

type Item = { id: string; topic: string | null; oldDate: string; newDate: string };

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit" });
}

export function ClassReschedule({ classId, canEdit }: { classId: string; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<Item[] | null>(null);

  if (!canEdit) return null;

  function preview() {
    startTransition(async () => {
      const res = await previewClassReschedule(classId);
      if (res.ok) {
        setItems(res.items);
        if (res.items.length === 0) toast.info("Không có buổi tương lai để dời");
      } else {
        toast.error(res.error);
      }
    });
  }

  function apply() {
    startTransition(async () => {
      const res = await applyClassReschedule(classId);
      if (res.ok) {
        toast.success("Đã dời buổi tương lai theo lịch mới + lịch nghỉ");
        setItems(null);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const changed = items?.filter((it) => fmt(it.oldDate) !== fmt(it.newDate)) ?? [];

  function generate() {
    startTransition(async () => {
      const res = await generateSessionsAction(classId);
      if (res.ok) {
        toast.success(res.generated ? `Đã sinh ${res.generated} buổi học` : "Lớp đã có buổi học");
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
          <CalendarClock className="h-4 w-4" /> Buổi học theo lịch
        </h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={generate}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <CalendarPlus className="h-4 w-4" /> Sinh buổi học
          </button>
          <button
            type="button"
            onClick={preview}
            disabled={pending}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Xem trước dời
          </button>
        </div>
      </div>
      <p className="mb-2 text-xs text-gray-500">
        &quot;Sinh buổi học&quot; tạo buổi theo lịch lớp + số buổi chuẩn của khoá, bỏ qua ngày nghỉ (chỉ khi lớp chưa có buổi). Lớp duyệt ACTIVE tự sinh.
      </p>
      <p className="text-xs text-gray-500">
        Áp lịch lớp hiện tại cho các buổi CHƯA diễn ra; buổi trùng lịch nghỉ cơ sở sẽ dời sang buổi kế (giữ đủ tổng buổi). Buổi đã diễn ra giữ nguyên.
      </p>

      {items && (
        <div className="mt-3">
          {items.length === 0 ? (
            <p className="text-sm text-gray-400">Không có buổi tương lai.</p>
          ) : (
            <>
              <ul className="max-h-56 space-y-1 overflow-y-auto text-sm">
                {items.map((it) => {
                  const moved = fmt(it.oldDate) !== fmt(it.newDate);
                  return (
                    <li key={it.id} className="flex items-center justify-between gap-2">
                      <span className="truncate text-gray-600">{it.topic ?? "Buổi học"}</span>
                      <span className={`tabular-nums ${moved ? "font-semibold text-amber-700" : "text-gray-400"}`}>
                        {fmt(it.oldDate)}{moved ? ` → ${fmt(it.newDate)}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-gray-500">{changed.length} buổi sẽ đổi ngày.</p>
              <button
                type="button"
                onClick={apply}
                disabled={pending}
                className="mt-2 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Đang áp dụng…" : "Áp dụng dời buổi"}
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
