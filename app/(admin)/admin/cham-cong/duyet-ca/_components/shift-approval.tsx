"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { ExcelImporter, type ImportResult } from "@/components/admin/ExcelImporter";
import { parseShiftCell, parseDateCell, SHIFT_EXCEL_COLUMNS } from "@/lib/attendance/shift-excel";
import type { WorkShift } from "@prisma/client";
import { importApprovedShifts, type ShiftImportRow } from "../_actions";

type Center = { id: string; name: string };

function thisMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function ShiftApproval({
  centers,
  fixedCenterId,
}: {
  centers: Center[];
  fixedCenterId: string | null;
}) {
  const [centerId, setCenterId] = useState(fixedCenterId ?? centers[0]?.id ?? "");
  const [month, setMonth] = useState(thisMonth());

  const exportUrl = `/api/admin/cham-cong/shift-export?centerId=${encodeURIComponent(centerId)}&month=${encodeURIComponent(month)}`;
  const ready = !!centerId && /^\d{4}-\d{2}$/.test(month);

  function parseRow(row: Record<string, unknown>): ShiftImportRow | { error: string } {
    const email = String(row["Mã NV"] ?? "").trim();
    if (!email) return { error: "Thiếu Mã NV" };
    const dateRes = parseDateCell(row["Ngày"]);
    if ("error" in dateRes) return { error: dateRes.error };
    const shiftRes = parseShiftCell(row["Ca"]);
    if ("error" in shiftRes) return { error: shiftRes.error };
    return {
      email,
      date: dateRes.date,
      shifts: shiftRes.shifts as WorkShift[],
      note: String(row["Ghi chú"] ?? "").trim(),
    };
  }

  async function onImport(rows: ShiftImportRow[]): Promise<ImportResult> {
    const res = await importApprovedShifts({ centerId, month, rows });
    return { success: res.success, errors: res.errors };
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        {fixedCenterId ? (
          <div className="text-sm">
            <span className="mb-1 block text-xs text-muted-foreground">Cơ sở</span>
            <span className="font-semibold text-foreground">
              {centers.find((c) => c.id === centerId)?.name ?? "—"}
            </span>
          </div>
        ) : (
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Cơ sở</span>
            <select
              value={centerId}
              onChange={(e) => setCenterId(e.target.value)}
              className="rounded-lg border border-border px-3 py-1.5 text-sm"
            >
              {centers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-xs text-muted-foreground">Tháng</span>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded-lg border border-border px-3 py-1.5 text-sm"
          />
        </label>
        <a
          href={ready ? exportUrl : undefined}
          aria-disabled={!ready}
          className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold ${ ready ? "bg-primary text-white hover:opacity-90" : "pointer-events-none bg-muted text-muted-foreground" }`}
        >
          <Download className="h-4 w-4" /> Export lịch đề xuất
        </a>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <ExcelImporter<ShiftImportRow>
          title="Import lịch ca chính thức (đè tháng)"
          templateUrl={exportUrl}
          templateFilename={`lich-ca-${month}.xlsx`}
          columnHints={SHIFT_EXCEL_COLUMNS.map((c) => ({ key: c, label: c }))}
          parseRow={parseRow}
          onImport={onImport}
        />
        <p className="mt-3 text-xs text-state-warning-ink">
          ⚠ Import sẽ <b>ĐÈ HOÀN TOÀN</b> lịch chính thức của cơ sở trong tháng {month}. Export →
          sửa trong file → import lên lại (cùng định dạng cột).
        </p>
      </div>
    </div>
  );
}
