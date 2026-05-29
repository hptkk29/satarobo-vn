"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { WorkShift } from "@prisma/client";
import { SHIFT_ORDER, SHIFT_DEFS, registrationWindowWarning } from "@/lib/shifts";
import { saveMyShifts } from "../_actions";

type DayReg = { shifts: WorkShift[]; status: string; note: string };
type Cell = { dateStr: string | null; day: number | null };

const WEEKDAYS = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

export function MyShiftsCalendar({
  cells,
  byDate,
  todayStr,
}: {
  cells: Cell[];
  byDate: Record<string, DayReg>;
  todayStr: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<string | null>(null);

  const sel = selected ? byDate[selected] : undefined;
  const [picked, setPicked] = useState<WorkShift[]>([]);
  const [note, setNote] = useState("");

  function openDay(dateStr: string) {
    setSelected(dateStr);
    setPicked(byDate[dateStr]?.shifts ?? []);
    setNote(byDate[dateStr]?.note ?? "");
  }

  function toggle(s: WorkShift) {
    setPicked((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  function save() {
    if (!selected) return;
    startTransition(async () => {
      const res = await saveMyShifts({ date: selected, shifts: picked, note: note.trim() });
      if (res.ok) {
        toast.success(res.status === "LEAVE_REQUESTED" ? "Đã lưu (đánh dấu xin nghỉ khẩn)" : "Đã lưu ca");
        setSelected(null);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const warning = selected ? registrationWindowWarning(new Date(), new Date(`${selected}T00:00:00`)) : null;

  return (
    <>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-gray-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c.dateStr) return <div key={i} />;
          const reg = byDate[c.dateStr];
          const isToday = c.dateStr === todayStr;
          return (
            <button
              key={i}
              type="button"
              onClick={() => openDay(c.dateStr!)}
              className={`min-h-[64px] rounded-lg border p-1 text-left transition-colors hover:border-[#7C3AED] ${
                isToday ? "border-[#7C3AED] bg-purple-50/40" : "border-gray-200 bg-white"
              }`}
            >
              <div className="text-xs font-semibold text-gray-700">{c.day}</div>
              <div className="mt-0.5 flex flex-wrap gap-0.5">
                {reg?.shifts.map((s) => (
                  <span key={s} className="rounded bg-[#7C3AED] px-1 text-[9px] font-bold text-white">
                    {SHIFT_DEFS[s].label.replace("Ca ", "")}
                  </span>
                ))}
                {reg?.status === "LEAVE_REQUESTED" && (
                  <span className="rounded bg-rose-100 px-1 text-[9px] font-bold text-rose-700">nghỉ?</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button type="button" aria-label="Đóng" className="absolute inset-0 bg-black/40" onClick={() => setSelected(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-5 shadow-xl">
            <h3 className="mb-1 text-sm font-bold text-gray-900">Đăng ký ca · {selected}</h3>
            {sel?.status === "LEAVE_REQUESTED" && (
              <p className="mb-2 text-xs font-medium text-rose-600">Đang ở trạng thái xin nghỉ khẩn.</p>
            )}
            <div className="space-y-2">
              {SHIFT_ORDER.map((s) => {
                const on = picked.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggle(s)}
                    disabled={pending}
                    className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm ${
                      on ? "border-[#7C3AED] bg-purple-50 text-[#7C3AED]" : "border-gray-200 text-gray-600"
                    }`}
                  >
                    <span className="font-medium">{SHIFT_DEFS[s].label}</span>
                    <span className="text-xs">{SHIFT_DEFS[s].start}–{SHIFT_DEFS[s].end}{on ? " ✓" : ""}</span>
                  </button>
                );
              })}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={pending}
              rows={2}
              placeholder="Ghi chú (vd: lý do xin nghỉ)…"
              className="mt-3 w-full resize-y rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#7C3AED] focus:outline-none"
            />
            {warning && (
              <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1.5 text-xs text-amber-700">{warning}</p>
            )}
            <p className="mt-2 text-xs text-gray-400">Bỏ chọn hết = xin nghỉ cả ngày.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={save}
                disabled={pending}
                className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Đang lưu…" : "Lưu"}
              </button>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
