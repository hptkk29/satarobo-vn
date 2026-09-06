"use client";

// Khung ca cố định hằng tuần — mỗi khối một bảng: người × 7 thứ, ô là <select> mã ca.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { addPersonToBlockAction, generateMonthAction, savePatternCellAction } from "../_actions";

export type PatternPerson = { userId: string; name: string; jobLabel: string | null; sheetName: string | null; byWeekday: Record<number, string | null> };
export type PatternBlock = { centerId: string; label: string; canAssign: boolean; people: PatternPerson[] };
export type Candidate = { userId: string; label: string };

const WD = [1, 2, 3, 4, 5, 6, 0];
const WD_LABEL: Record<number, string> = { 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 0: "CN" };

export function PatternGrid({ blocks, codes, candidates, defaultPeriod }: { blocks: PatternBlock[]; codes: string[]; candidates: Candidate[]; defaultPeriod: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [period, setPeriod] = useState(defaultPeriod);
  const [addUser, setAddUser] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);

  function save(block: PatternBlock, person: PatternPerson, weekday: number, code: string) {
    start(async () => {
      const r = await savePatternCellAction({ userId: person.userId, centerId: block.centerId, weekday, code: code || null, sheetName: person.sheetName ?? undefined, jobLabel: person.jobLabel ?? undefined });
      if (!r.ok) toast.error(r.error);
      router.refresh();
    });
  }
  function add(block: PatternBlock) {
    const userId = addUser[block.centerId];
    if (!userId) return;
    start(async () => {
      const r = await addPersonToBlockAction({ userId, centerId: block.centerId });
      if (!r.ok) toast.error(r.error);
      else toast.success("Đã thêm — chọn mã cho từng thứ");
      router.refresh();
    });
  }
  function generate() {
    const centerIds = blocks.filter((b) => b.canAssign).map((b) => b.centerId);
    start(async () => {
      const r = await generateMonthAction({ periodKey: period, centerIds });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const d = r.data;
      setResult(`Kỳ ${period}: +${d.created} ô mới · ${d.replaced} đổi · ${d.kept} giữ · ${d.cleared} xoá · ${d.skippedProtected} giữ ca đơn/sửa tay/file · ${d.skippedNoPermission} ngoài quyền · ${d.unknownCode} mã lạ${d.restWarnings.length ? ` · ⚠ ${d.restWarnings.length} người 7 ngày liên tiếp không nghỉ (Điều 111)` : ""}`);
      toast.success("Đã sinh lưới tháng");
      router.refresh();
    });
  }

  const sel = "rounded border border-border bg-background px-1 py-0.5 text-xs";
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="text-sm">Sinh lưới tháng<br /><input type="month" className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={period} onChange={(e) => setPeriod(e.target.value)} /></label>
        <Button type="button" onClick={generate} disabled={pending || !blocks.some((b) => b.canAssign)}>{pending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1 h-4 w-4" />}Sinh lưới từ khung ca</Button>
        <span className="text-xs text-muted-foreground">Không đè ô đã sửa tay, ô từ đơn đã duyệt, ô từ file import. Ô lễ giữ nguyên mã — hệ số lễ tính ở bảng công.</span>
        {result && <div className="w-full text-sm">{result}</div>}
      </div>
      {blocks.map((b) => (
        <section key={b.centerId} className="rounded-xl border border-border bg-card p-4">
          <h2 className="mb-2 text-base font-semibold">{b.label}{!b.canAssign && <span className="ml-2 text-xs font-normal text-muted-foreground">(chỉ xem)</span>}</h2>
          <PhanTrangBang cuonNgang>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-1 pr-2">Nhân sự</th><th className="py-1 pr-2">Vai trò</th>{WD.map((w) => <th key={w} className="py-1 pr-1 text-center">{WD_LABEL[w]}</th>)}</tr></thead>
              <tbody>
                {b.people.map((p) => (
                  <tr key={p.userId} className="border-t border-border">
                    <td className="py-1 pr-2 font-medium">{p.name}{p.sheetName && p.sheetName !== p.name ? <span className="ml-1 text-xs text-muted-foreground">({p.sheetName})</span> : null}</td>
                    <td className="py-1 pr-2 text-xs text-muted-foreground">{p.jobLabel ?? ""}</td>
                    {WD.map((w) => (
                      <td key={w} className="py-1 pr-1 text-center">
                        <select className={sel} value={p.byWeekday[w] ?? ""} disabled={!b.canAssign || pending} onChange={(e) => save(b, p, w, e.target.value)}>
                          <option value="">—</option>
                          {codes.map((c) => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </PhanTrangBang>
          {b.canAssign && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <select className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={addUser[b.centerId] ?? ""} onChange={(e) => setAddUser((m) => ({ ...m, [b.centerId]: e.target.value }))}>
                <option value="">+ Thêm nhân sự vào khối…</option>
                {candidates.filter((c) => !b.people.some((p) => p.userId === c.userId)).map((c) => <option key={c.userId} value={c.userId}>{c.label}</option>)}
              </select>
              <Button type="button" variant="outline" size="sm" disabled={!addUser[b.centerId] || pending} onClick={() => add(b)}>Thêm</Button>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}
