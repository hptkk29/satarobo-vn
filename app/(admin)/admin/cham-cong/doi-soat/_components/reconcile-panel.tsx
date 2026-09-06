"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import type { ReconcileReport } from "@/lib/cham-cong/reconcile";
import { reconcileAction } from "../_actions";

const KIND: Record<ReconcileReport["cellDiffs"][number]["kind"], string> = {
  MISSING_SYS: "Sheet có ca, hệ thống trống",
  MISSING_SHEET: "Hệ thống có ca, Sheet trống",
  CODE: "Khác mã ca",
  UNITS: "Khác số công",
};

export function ReconcilePanel() {
  const [file, setFile] = useState<File | null>(null);
  const [pending, start] = useTransition();
  const [reports, setReports] = useState<ReconcileReport[] | null>(null);

  function run() {
    if (!file) return;
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const r = await reconcileAction(fd);
      if (!r.ok) { toast.error(r.error); return; }
      setReports(r.data.reports);
      const bad = r.data.reports.reduce((n, x) => n + x.cellDiffs.length, 0);
      if (bad === 0) toast.success("Không lệch ô nào"); else toast.warning(`${bad} ô lệch — xem bảng`);
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-2 text-base font-semibold">1. Chọn file Sheet lịch (.xlsx) đang chạy song song</h2>
        <p className="mb-3 text-sm text-muted-foreground">Cùng file với màn Import lịch. Chỉ đọc — không ghi gì vào hệ thống. So tới hôm qua; ngày hôm nay chưa hết ca nên bỏ qua.</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 text-sm hover:bg-muted">
            <FileSpreadsheet className="h-4 w-4" />
            {file ? file.name : "Chọn file…"}
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Button type="button" onClick={run} disabled={!file || pending}>
            {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />} Đối soát
          </Button>
        </div>
      </section>

      {reports?.map((r) => (
        <section key={r.periodKey} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Kỳ {r.periodKey} — {r.people} người · so {r.daysCompared} ngày</h2>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${r.cleanStreak >= 10 ? "bg-state-success-soft text-state-success-ink" : "bg-state-warning-soft text-state-warning-ink"}`}>Chuỗi ngày sạch: {r.cleanStreak} / 10</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Ô lệch</div><div className="text-xl font-bold">{r.cellDiffs.length}</div></div>
            <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Lệch tổng tháng</div><div className="text-xl font-bold">{r.totalDiffs.length}</div></div>
            <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Chưa ánh xạ</div><div className="text-xl font-bold">{r.unmapped.length}</div>{r.unmapped.length > 0 && <div className="text-xs text-muted-foreground">{r.unmapped.join(", ")} — ánh xạ ở màn Import lịch</div>}</div>
            <div className="rounded-lg bg-muted p-3"><div className="text-xs text-muted-foreground">Miễn chấm công (bỏ qua)</div><div className="text-xl font-bold">{r.exempt.length}</div>{r.exempt.length > 0 && <div className="text-xs text-muted-foreground">{r.exempt.join(", ")}</div>}</div>
          </div>
          <div className="flex flex-wrap gap-1">
            {r.perDay.map((d) => <span key={d.day} title={`Ngày ${d.day}: ${d.diffs} lệch`} className={`h-6 w-6 rounded text-center text-[11px] leading-6 ${d.diffs === 0 ? "bg-state-success-soft text-state-success-ink" : "bg-state-danger-soft text-state-danger-ink"}`}>{d.day}</span>)}
          </div>
          {r.cellDiffs.length > 0 && (
            <PhanTrangBang cuonNgang>
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <tr><th className="px-3 py-2">Người</th><th className="px-3 py-2">Ngày</th><th className="px-3 py-2">Sheet</th><th className="px-3 py-2">Hệ thống</th><th className="px-3 py-2 text-right">Công Sheet</th><th className="px-3 py-2 text-right">Công HT</th><th className="px-3 py-2">Loại lệch</th></tr>
                </thead>
                <tbody>
                  {r.cellDiffs.map((d, i) => (
                    <tr key={i} className="border-b border-border">
                      <td className="px-3 py-1.5 font-medium">{d.sheetName}</td>
                      <td className="px-3 py-1.5">{d.day}</td>
                      <td className="px-3 py-1.5 font-mono">{d.sheetCode ?? "—"}</td>
                      <td className="px-3 py-1.5 font-mono">{d.sysCode ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right">{d.sheetUnits}</td>
                      <td className="px-3 py-1.5 text-right">{d.sysUnits ?? "chưa tính"}</td>
                      <td className="px-3 py-1.5 text-xs">{KIND[d.kind]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PhanTrangBang>
          )}
          {r.totalDiffs.length > 0 && (
            <ul className="text-sm">
              {r.totalDiffs.map((t) => <li key={t.sheetName}>{t.sheetName}: Sheet {t.sheetTotal} · hệ thống {t.sysTotal}</li>)}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
