"use client";

// Màn import lịch phân ca (L1): chọn file → xem trước + xác nhận ánh xạ tên → áp → đối chiếu
// 15 con số. Người vận hành tự làm, không qua dev (PHẦN 6b). shadcn/Tailwind thuần.
import { useMemo, useState, useTransition } from "react";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ApplyResult, ImportPreview } from "@/lib/cham-cong/import-core";
import { applyImportAction, previewImportAction } from "../_actions";

type Candidate = { userId: string; label: string; centerCode: string | null };

export function ImportWizard({ candidates }: { candidates: Candidate[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<(ImportPreview & { centers: string[] }) | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [periods, setPeriods] = useState<string[]>([]);
  const [importKhungCa, setImportKhungCa] = useState(true);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [pending, start] = useTransition();
  const labelOf = useMemo(() => new Map(candidates.map((c) => [c.userId, c.label])), [candidates]);

  function doPreview() {
    if (!file) {
      toast.error("Chọn file .xlsx trước");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const r = await previewImportAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setPreview(r.data);
      setResult(null);
      const m: Record<string, string> = {};
      for (const p of r.data.people) {
        const pick = p.rememberedUserId ?? (p.suggestions[0]?.score >= 90 ? p.suggestions[0].userId : "");
        if (pick) m[p.displayName] = pick;
      }
      setMapping(m);
      setPeriods(r.data.months.length ? [r.data.months[r.data.months.length >= 2 ? 1 : 0].periodKey] : []);
      if (r.data.warnings.length) toast.warning(`${r.data.warnings.length} cảnh báo khi đọc file`);
    });
  }

  function doApply() {
    if (!file || !preview) return;
    const unmapped = preview.people.filter((p) => !mapping[p.displayName]);
    if (unmapped.length) {
      toast.error(`Còn ${unmapped.length} người chưa ánh xạ: ${unmapped.slice(0, 3).map((p) => p.displayName).join(", ")}${unmapped.length > 3 ? "…" : ""}`);
      return;
    }
    if (!importKhungCa && periods.length === 0) {
      toast.error("Chọn ít nhất một kỳ hoặc khung ca");
      return;
    }
    const fd = new FormData();
    fd.set("file", file);
    fd.set("mapping", JSON.stringify(mapping));
    fd.set("periodKeys", JSON.stringify(periods));
    fd.set("importKhungCa", importKhungCa ? "1" : "0");
    start(async () => {
      const r = await applyImportAction(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setResult(r.data);
      toast.success(`Đã áp: ${r.data.assignments.created} ô mới, ${r.data.assignments.unchanged} giữ nguyên, ${r.data.patterns.upserted} ô khung ca`);
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="mb-2 text-base font-semibold">1. Chọn file lịch phân ca (.xlsx)</h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Trên Google Sheet: Tệp → Tải xuống → Microsoft Excel (.xlsx). Hệ thống đọc tab KHUNG CA CỐ ĐỊNH và các tab LỊCH Tmm-yyyy.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2 text-sm hover:bg-muted">
            <FileSpreadsheet className="h-4 w-4" />
            {file ? file.name : "Chọn file…"}
            <input type="file" accept=".xlsx" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Button type="button" onClick={doPreview} disabled={!file || pending}>
            {pending && !preview ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
            Đọc file
          </Button>
        </div>
      </section>

      {preview && (
        <>
          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-1 text-base font-semibold">2. Ánh xạ tên trên Sheet ↔ nhân sự</h2>
            <p className="mb-3 text-sm text-muted-foreground">
              Hệ thống chỉ gợi ý — anh/chị xác nhận một lần, lần sau tự nhớ. Bạn được phân ca ở: <b>{preview.centers.join(", ") || "—"}</b>.
              {preview.unknownCodes.length > 0 && (
                <span className="ml-2 text-destructive">Mã ca lạ trong file: {preview.unknownCodes.join(", ")} — thêm vào Danh mục ca trước.</span>
              )}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3">Tên trên Sheet</th>
                    <th className="py-2 pr-3">Họ tên đầy đủ</th>
                    <th className="py-2 pr-3">Khối</th>
                    <th className="py-2 pr-3">Vai trò</th>
                    <th className="py-2 pr-3">Nhân sự trong hệ thống</th>
                    <th className="py-2">Gợi ý</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.people.map((p) => (
                    <tr key={p.displayName} className="border-t border-border">
                      <td className="py-2 pr-3 font-medium">{p.displayName}</td>
                      <td className="py-2 pr-3">{p.fullName}</td>
                      <td className="py-2 pr-3">{p.units.join(" + ")}</td>
                      <td className="py-2 pr-3">{p.role}</td>
                      <td className="py-2 pr-3">
                        <select
                          className="w-64 rounded-md border border-border bg-background px-2 py-1"
                          value={mapping[p.displayName] ?? ""}
                          onChange={(e) => setMapping((m) => ({ ...m, [p.displayName]: e.target.value }))}
                        >
                          <option value="">— chưa ánh xạ —</option>
                          {candidates.map((c) => (
                            <option key={c.userId} value={c.userId}>
                              {c.label}
                              {c.centerCode ? ` (${c.centerCode})` : " (HO)"}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {p.rememberedUserId
                          ? `đã nhớ: ${labelOf.get(p.rememberedUserId) ?? "?"}`
                          : p.suggestions.slice(0, 2).map((s) => `${labelOf.get(s.userId) ?? "?"} (${s.reason})`).join(" · ") || "không có"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-3 text-base font-semibold">3. Chọn phần cần áp</h2>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={importKhungCa} onChange={(e) => setImportKhungCa(e.target.checked)} />
              Khung ca cố định hằng tuần ({preview.people.length} người)
            </label>
            <div className="flex flex-wrap gap-3">
              {preview.months.map((m) => (
                <label key={m.periodKey} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={periods.includes(m.periodKey)}
                    onChange={(e) => setPeriods((ps) => (e.target.checked ? [...ps, m.periodKey] : ps.filter((x) => x !== m.periodKey)))}
                  />
                  <span>
                    <b>{m.sheetName}</b> · {m.rows} dòng · {Object.values(m.counts).reduce((a, b) => a + b, 0)} ô
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Ca do đơn đã duyệt hoặc sửa tay trên lưới được GIỮ, không bị file đè. Ô đổi mã = huỷ ca cũ + tạo ca mới (có vết).
            </p>
            <div className="mt-4">
              <Button type="button" onClick={doApply} disabled={pending}>
                {pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
                Áp vào hệ thống
              </Button>
            </div>
          </section>
        </>
      )}

      {result && (
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-3 text-base font-semibold">4. Kết quả</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
            <dt className="text-muted-foreground">Ô mới</dt>
            <dd className="font-semibold">{result.assignments.created}</dd>
            <dt className="text-muted-foreground">Giữ nguyên</dt>
            <dd className="font-semibold">{result.assignments.unchanged}</dd>
            <dt className="text-muted-foreground">Huỷ (đổi mã)</dt>
            <dd className="font-semibold">{result.assignments.cancelled}</dd>
            <dt className="text-muted-foreground">Giữ ca đơn/sửa tay</dt>
            <dd className="font-semibold">{result.assignments.keptManual}</dd>
            <dt className="text-muted-foreground">Bỏ qua — không quyền cơ sở</dt>
            <dd className="font-semibold">{result.assignments.skippedNoPermission}</dd>
            <dt className="text-muted-foreground">Bỏ qua — mã lạ</dt>
            <dd className="font-semibold">{result.assignments.unknownCode}</dd>
            <dt className="text-muted-foreground">Khung ca: ô ghi / ô xoá</dt>
            <dd className="font-semibold">
              {result.patterns.upserted} / {result.patterns.deleted}
            </dd>
          </dl>
          {result.counts.map((c) => {
            const codes = [...new Set([...Object.keys(c.sheet), ...Object.keys(c.db)])].sort();
            const mismatch = codes.filter((k) => (c.sheet[k] ?? 0) !== (c.db[k] ?? 0));
            return (
              <div key={c.periodKey} className="mt-4">
                <h3 className="mb-1 text-sm font-semibold">
                  Đối chiếu {c.periodKey}: {mismatch.length === 0 ? <span className="text-state-success-ink">khớp toàn bộ</span> : <span className="text-destructive">{mismatch.length} mã lệch</span>}
                </h3>
                <div className="overflow-x-auto">
                  <table className="text-xs">
                    <thead>
                      <tr>
                        <th className="pr-3 text-left">Mã</th>
                        {codes.map((k) => (
                          <th key={k} className={`px-2 text-right ${mismatch.includes(k) ? "text-destructive" : ""}`}>{k}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="pr-3 text-muted-foreground">Sheet</td>
                        {codes.map((k) => <td key={k} className="px-2 text-right">{c.sheet[k] ?? 0}</td>)}
                      </tr>
                      <tr>
                        <td className="pr-3 text-muted-foreground">Hệ thống</td>
                        {codes.map((k) => <td key={k} className="px-2 text-right">{c.db[k] ?? 0}</td>)}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
          {result.warnings.length > 0 && (
            <ul className="mt-3 list-disc pl-5 text-xs text-amber-700">
              {result.warnings.slice(0, 30).map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
