"use client";

// Lưới phân ca tháng — người × ngày, ô là <select> mã ca (sửa tay = MANUAL, không bị khung ca /
// file đè). Tổng công = số ô có mã trừ X/P (luật Sheet, K-01).
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { setCellAction } from "../_actions";

export type GridRow = {
  userId: string;
  name: string;
  jobLabel: string | null;
  homeUnit: string;
  cells: Record<number, { code: string; source: string; centerUnit: string } | null>;
};

const SOURCE_TINT: Record<string, string> = { MANUAL: "bg-amber-50", SWAP: "bg-sky-50", LEAVE: "bg-violet-50", IMPORT: "", PATTERN: "", HOLIDAY: "bg-rose-50" };

export function MonthGrid({ rows, days, codes, canEdit, holidays }: { rows: GridRow[]; days: { day: number; wd: number; ymd: string }[]; codes: string[]; canEdit: boolean; holidays: Set<string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  function change(row: GridRow, ymd: string, code: string) {
    const key = `${row.userId}:${ymd}`;
    setBusy(key);
    start(async () => {
      const r = await setCellAction({ userId: row.userId, workDate: ymd, code: code || null, homeUnit: row.homeUnit });
      if (!r.ok) toast.error(r.error);
      setBusy(null);
      router.refresh();
    });
  }

  const total = (row: GridRow) => {
    let t = 0;
    let off = 0;
    for (const c of Object.values(row.cells)) {
      if (!c) continue;
      if (c.code === "X" || c.code === "P") off += 1;
      else t += 1;
    }
    return { t, off };
  };

  return (
    <PhanTrangBang cuonNgang>
      <table className="text-xs">
        <thead className="bg-muted text-left uppercase text-muted-foreground">
          <tr>
            <th className="sticky left-0 z-10 bg-muted px-2 py-1">Nhân sự</th>
            {days.map((d) => (
              <th key={d.day} className={`px-1 py-1 text-center ${d.wd === 1 ? "text-muted-foreground/60" : ""} ${holidays.has(d.ymd) ? "text-rose-600" : ""}`} title={holidays.has(d.ymd) ? "Ngày lễ" : undefined}>
                <div>{d.day}</div>
                <div className="font-normal">{["CN", "T2", "T3", "T4", "T5", "T6", "T7"][d.wd]}</div>
              </th>
            ))}
            <th className="px-2 py-1 text-right">Công</th>
            <th className="px-2 py-1 text-right">Nghỉ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { t, off } = total(row);
            return (
              <tr key={row.userId} className="border-t border-border">
                <td className="sticky left-0 z-10 bg-card px-2 py-1 font-medium whitespace-nowrap">
                  {row.name}
                  {row.jobLabel && <span className="ml-1 font-normal text-muted-foreground">· {row.jobLabel}</span>}
                </td>
                {days.map((d) => {
                  const c = row.cells[d.day] ?? null;
                  const key = `${row.userId}:${d.ymd}`;
                  return (
                    <td key={d.day} className={`px-0.5 py-0.5 text-center ${c ? SOURCE_TINT[c.source] ?? "" : ""}`} title={c ? `${c.code} · ${c.source} · ${c.centerUnit}` : ""}>
                      {canEdit ? (
                        <select
                          className={`w-14 rounded border border-border bg-transparent px-0.5 py-0.5 text-xs ${busy === key ? "opacity-50" : ""}`}
                          value={c?.code ?? ""}
                          disabled={pending && busy === key}
                          onChange={(e) => change(row, d.ymd, e.target.value)}
                        >
                          <option value="">—</option>
                          {codes.map((code) => <option key={code} value={code}>{code}</option>)}
                        </select>
                      ) : (
                        <span>{c?.code ?? ""}</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-1 text-right font-semibold">{t}</td>
                <td className="px-2 py-1 text-right text-muted-foreground">{off}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </PhanTrangBang>
  );
}
