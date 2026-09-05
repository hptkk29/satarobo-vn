"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { plannedMinutes, type ShiftSegment } from "@/lib/cham-cong/catalog";
import { toggleShiftTemplateAction } from "../_actions";
import { TemplateEditor, type TemplateEditorValue } from "./template-editor";

export type TemplateRow = TemplateEditorValue & { id: string; centerName: string | null };

function fmtMinutes(m: number): string {
  if (!m) return "—";
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

export function TemplateTable({ rows, centers, canGlobal }: { rows: TemplateRow[]; centers: { id: string; code: string; name: string }[]; canGlobal: boolean }) {
  const [editing, setEditing] = useState<TemplateEditorValue | "new" | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function toggle(row: TemplateRow) {
    start(async () => {
      const r = await toggleShiftTemplateAction(row.id, !row.isActive);
      if (!r.ok) toast.error(r.error);
      else toast.success(row.isActive ? `Đã ngưng mã ${row.code}` : `Đã bật lại mã ${row.code}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {editing ? (
        <TemplateEditor initial={editing === "new" ? undefined : editing} centers={centers} canGlobal={canGlobal} onDone={() => { setEditing(null); router.refresh(); }} />
      ) : (
        <Button type="button" onClick={() => setEditing("new")}><Plus className="mr-1 h-4 w-4" /> Thêm mã ca</Button>
      )}
      <PhanTrangBang cuonNgang>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Mã</th>
              <th className="px-3 py-2">Tên</th>
              <th className="px-3 py-2">Sáng</th>
              <th className="px-3 py-2">Chiều</th>
              <th className="px-3 py-2 text-right">Giờ KH</th>
              <th className="px-3 py-2 text-right">Công</th>
              <th className="px-3 py-2">Chấm</th>
              <th className="px-3 py-2">Nơi làm</th>
              <th className="px-3 py-2">Phạm vi</th>
              <th className="px-3 py-2">Trạng thái</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const segs = r.segments as ShiftSegment[];
              const am = segs.filter((s) => Number(s.start.slice(0, 2)) < 12);
              const pm = segs.filter((s) => Number(s.start.slice(0, 2)) >= 12);
              return (
                <tr key={r.id} className={`border-b border-border ${r.isActive ? "" : "opacity-50"}`}>
                  <td className="px-3 py-2 font-mono font-semibold">{r.code}</td>
                  <td className="px-3 py-2">{r.name}{r.note ? <div className="text-xs text-muted-foreground">{r.note}</div> : null}</td>
                  <td className="px-3 py-2">{am.length ? `${am[0].start}–${am[am.length - 1].end}` : "—"}</td>
                  <td className="px-3 py-2">{pm.length ? `${pm[0].start}–${pm[pm.length - 1].end}` : "—"}</td>
                  <td className="px-3 py-2 text-right">{fmtMinutes(plannedMinutes({ segments: segs, nominalMinutes: r.nominalMinutes }))}</td>
                  <td className="px-3 py-2 text-right">{r.dayCredit}</td>
                  <td className="px-3 py-2 text-xs">{r.attendanceMode === "REQUIRED" ? "Phải quét" : r.attendanceMode === "OPTIONAL" ? "Tuỳ chọn" : "Không"}</td>
                  <td className="px-3 py-2 text-xs">{r.defaultPlace}</td>
                  <td className="px-3 py-2 text-xs">{r.centerName ?? "Dùng chung"}</td>
                  <td className="px-3 py-2 text-xs">{r.isActive ? "Đang dùng" : "Đã ngưng"}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <button type="button" className="mr-2 text-primary" title="Sửa" onClick={() => setEditing(r)}><Pencil className="h-4 w-4" /></button>
                    <button type="button" className="text-xs text-muted-foreground underline" disabled={pending} onClick={() => toggle(r)}>{r.isActive ? "Ngưng" : "Bật"}</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </PhanTrangBang>
    </div>
  );
}
