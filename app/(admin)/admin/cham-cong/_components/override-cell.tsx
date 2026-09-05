"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { setDayOverrideAction } from "../_actions";

/** Ô "Công" trên bảng công ngày: bấm bút chì → nhập công + lý do (ghi đè) hoặc bỏ ghi đè. */
export function OverrideCell({ userId, workDate, credit, engineCredit, override, note, canAdjust, locked }: {
  userId: string; workDate: string; credit: number | null; engineCredit: number | null; override: boolean; note: string | null; canAdjust: boolean; locked: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [units, setUnits] = useState(credit != null ? String(credit) : "");
  const [reason, setReason] = useState(note ?? "");
  const save = (u: number | null) =>
    start(async () => {
      const r = await setDayOverrideAction({ userId, workDate, units: u, note: u == null ? null : reason });
      if (r.ok) { toast.success(u == null ? "Đã bỏ ghi đè" : "Đã ghi đè công"); setOpen(false); router.refresh(); } else toast.error(r.error);
    });
  if (!open) {
    return (
      <span className="inline-flex items-center gap-1">
        <span className="font-semibold">{credit ?? "…"}</span>
        {override && <span title={note ?? "Quản lý đã ghi đè"} className="text-xs text-amber-600">*</span>}
        {canAdjust && !locked && credit != null && <button type="button" onClick={() => setOpen(true)} className="text-muted-foreground hover:text-foreground" aria-label="Ghi đè công"><Pencil className="h-3.5 w-3.5" /></button>}
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="flex items-center gap-1">
        <input type="number" step={0.5} min={0} max={3} value={units} onChange={(e) => setUnits(e.target.value)} className="w-16 rounded-md border border-border bg-background px-1 py-0.5 text-sm" />
        <span className="text-[11px] text-muted-foreground">máy: {engineCredit ?? "—"}</span>
      </span>
      <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Lý do (bắt buộc)" className="w-40 rounded-md border border-border bg-background px-1 py-0.5 text-xs" />
      <span className="flex gap-1 text-xs">
        <button type="button" disabled={pending || !reason.trim() || units === ""} onClick={() => save(Number(units))} className="rounded bg-primary px-2 py-0.5 font-semibold text-white disabled:opacity-50">Lưu</button>
        {override && <button type="button" disabled={pending} onClick={() => save(null)} className="rounded border border-border px-2 py-0.5">Bỏ ghi đè</button>}
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground">Huỷ</button>
      </span>
    </span>
  );
}
