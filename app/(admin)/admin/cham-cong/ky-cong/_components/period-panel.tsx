"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Lock, RefreshCw, Unlock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { lockPeriodAction, recomputePeriodAction, reopenPeriodAction, setStandardUnitsAction } from "../_actions";

export function PeriodPanel({ centerId, ky, status, standardUnits, standardUnitsNote, canClose, canReopen, canExport, periodEnded }: {
  centerId: string; ky: string; status: "OPEN" | "CLOSING" | "LOCKED" | "REOPENED" | null; standardUnits: number | null; standardUnitsNote: string | null;
  canClose: boolean; canReopen: boolean; canExport: boolean; periodEnded: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [std, setStd] = useState(standardUnits != null ? String(standardUnits) : "");
  const [stdNote, setStdNote] = useState(standardUnitsNote ?? "");
  const [confirmLock, setConfirmLock] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const locked = status === "LOCKED";
  const run = (fn: () => Promise<{ ok: true; note?: string } | { ok: false; error: string }>) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { toast.success(r.note ?? "Xong"); setConfirmLock(false); router.refresh(); } else toast.error(r.error);
    });

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trạng thái</p>
        <p className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-sm font-semibold ${locked ? "bg-state-success-soft text-state-success-ink" : "bg-state-warning-soft text-state-warning-ink"}`}>{locked ? "Đã chốt" : status === "REOPENED" ? "Đã mở lại" : "Đang mở"}</p>
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Công chuẩn (K-04)</label>
        <div className="mt-1 flex items-center gap-1">
          <input type="number" step={0.5} min={0} max={31} value={std} onChange={(e) => setStd(e.target.value)} disabled={locked || !canClose} className="w-20 rounded-md border border-border bg-background px-2 py-1 text-sm" />
          <input value={stdNote} onChange={(e) => setStdNote(e.target.value)} placeholder="Ghi chú (vd: trừ 1 ngày lễ)" disabled={locked || !canClose} className="w-48 rounded-md border border-border bg-background px-2 py-1 text-sm" />
          {canClose && !locked && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setStandardUnitsAction({ centerId, ky, standardUnits: std === "" ? null : Number(std), note: stdNote }))}>Lưu</Button>}
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Để trống rồi Lưu = tính lại tự động từ ngày nghỉ tuần + lễ.</p>
      </div>
      <div className="ml-auto flex flex-wrap gap-2">
        {canClose && !locked && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => recomputePeriodAction({ centerId, ky }))}><RefreshCw className="mr-1 h-4 w-4" /> Tính lại</Button>}
        {canExport && <a href={`/api/admin/cham-cong/export?centerId=${encodeURIComponent(centerId)}&ky=${ky}`} className="inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted"><Download className="mr-1 h-4 w-4" /> Xuất Excel{locked ? "" : " (bản tạm)"}</a>}
        {canClose && !locked && (confirmLock
          ? <Button size="sm" disabled={pending || !periodEnded} onClick={() => run(() => lockPeriodAction({ centerId, ky }))}><Lock className="mr-1 h-4 w-4" /> Xác nhận chốt kỳ {ky}</Button>
          : <Button size="sm" disabled={!periodEnded} title={periodEnded ? "" : "Chỉ chốt sau ngày cuối tháng"} onClick={() => setConfirmLock(true)}><Lock className="mr-1 h-4 w-4" /> Chốt kỳ</Button>)}
        {canReopen && locked && (
          <span className="flex items-center gap-1">
            <input value={reopenReason} onChange={(e) => setReopenReason(e.target.value)} placeholder="Lý do mở lại (bắt buộc)" className="w-56 rounded-md border border-border bg-background px-2 py-1 text-sm" />
            <Button size="sm" variant="outline" disabled={pending || reopenReason.trim().length < 5} onClick={() => run(() => reopenPeriodAction({ centerId, ky, reason: reopenReason }))}><Unlock className="mr-1 h-4 w-4" /> Mở lại</Button>
          </span>
        )}
      </div>
    </div>
  );
}
