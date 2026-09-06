"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { saveLeaveTypeAction } from "../_actions";

export type LeaveTypeRow = { id: string; code: string; name: string; paidRatio: number; maxDaysPerYear: number | null; countsAsWorked: boolean; isActive: boolean };
type Draft = Omit<LeaveTypeRow, "id"> & { id: string | null };
const EMPTY: Draft = { id: null, code: "", name: "", paidRatio: 1, maxDaysPerYear: null, countsAsWorked: false, isActive: true };
const field = "rounded-md border border-border bg-background px-2 py-1 text-sm";

export function LeaveTypeList({ rows, canEdit }: { rows: LeaveTypeRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  function save() {
    if (!draft) return;
    start(async () => {
      const r = await saveLeaveTypeAction(draft.id, { code: draft.code, name: draft.name, paidRatio: draft.paidRatio, maxDaysPerYear: draft.maxDaysPerYear, countsAsWorked: draft.countsAsWorked, isActive: draft.isActive });
      if (r.ok) { toast.success("Đã lưu"); setDraft(null); router.refresh(); } else toast.error(r.error);
    });
  }
  return (
    <div className="space-y-4">
      {canEdit && !draft && <div className="flex justify-end"><Button onClick={() => setDraft(EMPTY)}><Plus className="mr-1.5 h-4 w-4" /> Thêm loại nghỉ</Button></div>}
      {draft && (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
          <label className="text-xs">Mã<input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} disabled={!!draft.id} className={`${field} mt-1 w-full font-mono`} /></label>
          <label className="text-xs sm:col-span-2">Tên<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={`${field} mt-1 w-full`} /></label>
          <label className="text-xs">Tỷ lệ lương (0–1)<input type="number" step={0.1} min={0} max={1} value={draft.paidRatio} onChange={(e) => setDraft({ ...draft, paidRatio: Number(e.target.value) })} className={`${field} mt-1 w-full`} /></label>
          <label className="text-xs">Tối đa ngày/năm<input type="number" min={0} value={draft.maxDaysPerYear ?? ""} onChange={(e) => setDraft({ ...draft, maxDaysPerYear: e.target.value === "" ? null : Number(e.target.value) })} placeholder="không giới hạn" className={`${field} mt-1 w-full`} /></label>
          <div className="flex flex-col gap-1 text-xs">
            <label className="flex items-center gap-1"><input type="checkbox" checked={draft.countsAsWorked} onChange={(e) => setDraft({ ...draft, countsAsWorked: e.target.checked })} /> Tính như đi làm</label>
            <label className="flex items-center gap-1"><input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} /> Đang dùng</label>
          </div>
          <div className="col-span-full flex justify-end gap-2"><Button variant="outline" disabled={pending} onClick={() => setDraft(null)}>Huỷ</Button><Button disabled={pending || !draft.code || !draft.name} onClick={save}>Lưu</Button></div>
        </div>
      )}
      <PhanTrangBang>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2">Mã</th><th className="px-3 py-2">Tên</th><th className="px-3 py-2 text-right">Tỷ lệ lương</th><th className="px-3 py-2 text-right">Tối đa/năm</th><th className="px-3 py-2">Tính công</th><th className="px-3 py-2">Trạng thái</th>{canEdit && <th />}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-b border-border ${r.isActive ? "" : "opacity-60"}`}>
                <td className="px-3 py-2 font-mono">{r.code}</td>
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-right">{Math.round(r.paidRatio * 100)}%</td>
                <td className="px-3 py-2 text-right">{r.maxDaysPerYear ?? "—"}</td>
                <td className="px-3 py-2">{r.countsAsWorked ? "Như đi làm" : "Không"}</td>
                <td className="px-3 py-2">{r.isActive ? "Đang dùng" : "Ngưng"}</td>
                {canEdit && <td className="px-3 py-2 text-right"><button type="button" className="text-xs text-primary hover:underline" onClick={() => setDraft({ ...r })}>Sửa</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      </PhanTrangBang>
    </div>
  );
}
