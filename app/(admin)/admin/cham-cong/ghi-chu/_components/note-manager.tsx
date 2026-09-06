"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { deleteBriefNoteAction, saveBriefNoteAction } from "../_actions";

export type NoteRow = { id: string; centerId: string; centerLabel: string; weekday: number | null; date: string | null; audience: "ALL" | "KINH_DOANH" | "GIAO_VIEN"; mode: "APPEND" | "SUPPRESS" | "REPLACE"; text: string; isActive: boolean };
type Draft = Omit<NoteRow, "id" | "centerLabel"> & { id?: string; kind: "weekday" | "date" };

const WD = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const AUD: Record<NoteRow["audience"], string> = { ALL: "Cả khối", KINH_DOANH: "Kinh doanh", GIAO_VIEN: "Giáo viên" };
const MODE: Record<NoteRow["mode"], string> = { APPEND: "Gửi kèm", SUPPRESS: "Không gửi tin", REPLACE: "Thay toàn bộ" };

export function NoteManager({ rows, blocks }: { rows: NoteRow[]; blocks: { id: string; label: string; canAssign: boolean }[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const editable = blocks.filter((b) => b.canAssign);
  const [draft, setDraft] = useState<Draft | null>(null);
  const field = "rounded-md border border-border bg-background px-2 py-1 text-sm";

  function save() {
    if (!draft) return;
    start(async () => {
      const r = await saveBriefNoteAction({ ...draft, weekday: draft.kind === "weekday" ? draft.weekday : null, date: draft.kind === "date" ? draft.date : null });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Đã lưu");
      setDraft(null);
      router.refresh();
    });
  }
  function del(id: string) {
    start(async () => {
      const r = await deleteBriefNoteAction(id);
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {draft ? (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3">
          <label className="text-sm">Khối<select className={`${field} w-full`} value={draft.centerId} onChange={(e) => setDraft({ ...draft, centerId: e.target.value })}>{editable.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}</select></label>
          <label className="text-sm">Lặp theo
            <select className={`${field} w-full`} value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Draft["kind"] })}>
              <option value="weekday">Thứ trong tuần (việc cố định)</option>
              <option value="date">Một ngày cụ thể (ghi đè)</option>
            </select>
          </label>
          {draft.kind === "weekday" ? (
            <label className="text-sm">Thứ<select className={`${field} w-full`} value={draft.weekday ?? 1} onChange={(e) => setDraft({ ...draft, weekday: Number(e.target.value) })}>{[1, 2, 3, 4, 5, 6, 0].map((w) => <option key={w} value={w}>{WD[w]}</option>)}</select></label>
          ) : (
            <label className="text-sm">Ngày<input type="date" className={`${field} w-full`} value={draft.date ?? ""} onChange={(e) => setDraft({ ...draft, date: e.target.value || null })} /></label>
          )}
          <label className="text-sm">Gửi cho<select className={`${field} w-full`} value={draft.audience} onChange={(e) => setDraft({ ...draft, audience: e.target.value as NoteRow["audience"] })}>{(Object.keys(AUD) as NoteRow["audience"][]).map((a) => <option key={a} value={a}>{AUD[a]}</option>)}</select></label>
          <label className="text-sm">Cách gửi<select className={`${field} w-full`} value={draft.mode} onChange={(e) => setDraft({ ...draft, mode: e.target.value as NoteRow["mode"] })}>{(Object.keys(MODE) as NoteRow["mode"][]).map((m) => <option key={m} value={m}>{MODE[m]}</option>)}</select></label>
          <label className="text-sm sm:col-span-3">Nội dung<input className={`${field} w-full`} value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="VD: 15:00–16:00 HỌP TỔNG KẾT TUẦN (60 phút) — có mặt đầy đủ" /></label>
          <div className="flex gap-2 sm:col-span-3">
            <Button type="button" onClick={save} disabled={pending}>{pending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}Lưu</Button>
            <Button type="button" variant="outline" onClick={() => setDraft(null)}>Huỷ</Button>
          </div>
        </div>
      ) : (
        editable.length > 0 && (
          <Button type="button" onClick={() => setDraft({ centerId: editable[0].id, kind: "weekday", weekday: 1, date: null, audience: "ALL", mode: "APPEND", text: "", isActive: true })}><Plus className="mr-1 h-4 w-4" /> Thêm ghi chú</Button>
        )
      )}
      <PhanTrangBang cuonNgang>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr><th className="px-3 py-2">Khối</th><th className="px-3 py-2">Khi nào</th><th className="px-3 py-2">Gửi cho</th><th className="px-3 py-2">Cách gửi</th><th className="px-3 py-2">Nội dung</th><th className="px-3 py-2" /></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-b border-border ${r.isActive ? "" : "opacity-50"}`}>
                <td className="px-3 py-2">{r.centerLabel}</td>
                <td className="px-3 py-2">{r.date ?? (r.weekday !== null ? WD[r.weekday] : "")}</td>
                <td className="px-3 py-2 text-xs">{AUD[r.audience]}</td>
                <td className="px-3 py-2 text-xs">{MODE[r.mode]}</td>
                <td className="px-3 py-2">{r.text}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <button type="button" className="mr-2 text-xs text-primary underline" onClick={() => setDraft({ ...r, kind: r.date ? "date" : "weekday" })}>Sửa</button>
                  <button type="button" className="text-destructive" title="Xoá" disabled={pending} onClick={() => del(r.id)}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PhanTrangBang>
    </div>
  );
}
