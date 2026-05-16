"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Save, X } from "lucide-react";
import {
  cancelAuditAndRedirect,
  saveAuditDraft,
  submitAuditAndRedirect,
} from "../_actions";

export interface AuditRowInit {
  itemId: string;
  itemCode: string;
  itemName: string;
  unit: string;
  category: string;
  previousQty: number;
  actualQty: number;
  reason: string;
}

interface Props {
  auditId: string;
  centerName: string;
  auditCode: string | null;
  rows: AuditRowInit[];
}

export function BulkAuditForm({
  auditId,
  centerName,
  auditCode,
  rows: initialRows,
}: Props) {
  const router = useRouter();
  // Keep actualQty as string so the input behaves naturally (empty / partial typing OK).
  const [rows, setRows] = useState(
    initialRows.map((r) => ({ ...r, actualQty: String(r.actualQty) })),
  );
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.itemCode.toLowerCase().includes(q) ||
        r.itemName.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const stats = useMemo(() => {
    let changedCount = 0;
    let increases = 0;
    let decreases = 0;
    let missingReason = 0;
    for (const r of rows) {
      const actual = Number.parseInt(r.actualQty, 10);
      const validActual = Number.isFinite(actual) ? actual : r.previousQty;
      const delta = validActual - r.previousQty;
      if (delta !== 0) {
        changedCount += 1;
        if (delta > 0) increases += 1;
        else decreases += 1;
        if (!r.reason || r.reason.trim().length < 5) missingReason += 1;
      }
    }
    return { changedCount, increases, decreases, missingReason };
  }, [rows]);

  function updateRow(
    itemId: string,
    field: "actualQty" | "reason",
    value: string,
  ) {
    setRows((prev) =>
      prev.map((r) => (r.itemId === itemId ? { ...r, [field]: value } : r)),
    );
  }

  function buildLines() {
    return rows.map((r) => {
      const actual = Number.parseInt(r.actualQty, 10);
      const validActual = Number.isFinite(actual) && actual >= 0 ? actual : r.previousQty;
      return {
        itemId: r.itemId,
        previousQty: r.previousQty,
        actualQty: validActual,
        reason: r.reason.trim() || null,
      };
    });
  }

  function handleSaveDraft() {
    setError(null);
    startTransition(async () => {
      const res = await saveAuditDraft({ auditId, lines: buildLines() });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSavedAt(new Date());
      router.refresh();
    });
  }

  function handleSubmit() {
    setError(null);
    if (stats.changedCount === 0) {
      setError("Chưa có dòng nào thay đổi — Submit sẽ không tạo movement nào");
      return;
    }
    if (stats.missingReason > 0) {
      setError(
        `Còn ${stats.missingReason} dòng có Δ ≠ 0 chưa có lý do ≥ 5 ký tự`,
      );
      return;
    }
    if (
      !confirm(
        `Submit phiếu kiểm kê?\n\n` +
          `• ${stats.changedCount} dòng sẽ tạo movement ADJUSTMENT_*\n` +
          `• Balance sẽ update theo "Số lượng thực tế"\n` +
          `• Không thể hoàn tác (status sẽ COMPLETED).`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      // Save current draft state first to make sure server has the latest values.
      const draftRes = await saveAuditDraft({ auditId, lines: buildLines() });
      if (!draftRes.ok) {
        setError(draftRes.error);
        return;
      }
      const res = await submitAuditAndRedirect(auditId);
      if (res && !res.ok) setError(res.error);
    });
  }

  function handleCancel() {
    if (!confirm("Huỷ phiếu kiểm kê này? Không tạo movement nào.")) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelAuditAndRedirect(auditId);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <div>
          <strong>Cơ sở:</strong> {centerName}
          {auditCode && (
            <>
              {" "}
              · <strong>Mã phiếu:</strong> {auditCode}
            </>
          )}
        </div>
        <div className="mt-1 text-xs text-amber-700">
          Nhập số lượng thực tế đếm được. Mọi dòng có Δ ≠ 0 đều cần lý do ≥ 5
          ký tự. Submit sẽ ghi nhận movement ADJUSTMENT và cập nhật tồn kho
          atomic.
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3">
        <div className="text-sm text-neutral-700">
          <span className="font-bold">{stats.changedCount}</span> dòng thay đổi
          {stats.increases > 0 && (
            <span className="ml-3 text-green-600">+{stats.increases} tăng</span>
          )}
          {stats.decreases > 0 && (
            <span className="ml-3 text-red-600">-{stats.decreases} giảm</span>
          )}
          {stats.missingReason > 0 && (
            <span className="ml-3 text-amber-700">
              · {stats.missingReason} thiếu lý do
            </span>
          )}
          {savedAt && (
            <span className="ml-3 text-xs text-neutral-500">
              Đã lưu nháp {savedAt.toLocaleTimeString("vi-VN")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            Huỷ phiếu
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            Lưu nháp
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={
              pending || stats.changedCount === 0 || stats.missingReason > 0
            }
            className="inline-flex items-center gap-1 rounded-md bg-green-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" />
            {pending ? "Đang xử lý..." : "Submit kiểm kê"}
          </button>
        </div>
      </div>

      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm theo mã / tên hàng..."
        className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
      />

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-100 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Mã
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Tên hàng
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  ĐV
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Hệ thống
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Thực tế *
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Δ
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Lý do (Δ ≠ 0, ≥ 5 ký tự)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-8 text-center text-sm text-neutral-400"
                  >
                    {rows.length === 0
                      ? "Chưa có mặt hàng active nào trong hệ thống."
                      : "Không có dòng nào khớp với từ khoá tìm."}
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const actualNum = Number.parseInt(r.actualQty, 10);
                  const validActual = Number.isFinite(actualNum)
                    ? actualNum
                    : r.previousQty;
                  const delta = validActual - r.previousQty;
                  const rowBg =
                    delta > 0 ? "bg-green-50/60" : delta < 0 ? "bg-red-50/60" : "";
                  const deltaColor =
                    delta > 0
                      ? "text-green-700"
                      : delta < 0
                        ? "text-red-700"
                        : "text-neutral-400";
                  const reasonMissing =
                    delta !== 0 && r.reason.trim().length < 5;
                  return (
                    <tr key={r.itemId} className={rowBg}>
                      <td className="px-3 py-2 font-mono text-xs text-neutral-600">
                        {r.itemCode}
                      </td>
                      <td className="px-3 py-2 text-neutral-900">
                        {r.itemName}
                      </td>
                      <td className="px-3 py-2 text-neutral-500">{r.unit}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                        {r.previousQty}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={0}
                          value={r.actualQty}
                          onChange={(e) =>
                            updateRow(r.itemId, "actualQty", e.target.value)
                          }
                          disabled={pending}
                          className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-right text-sm tabular-nums disabled:opacity-60"
                        />
                      </td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums font-bold ${deltaColor}`}
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </td>
                      <td className="px-3 py-2">
                        {delta !== 0 ? (
                          <input
                            type="text"
                            value={r.reason}
                            onChange={(e) =>
                              updateRow(r.itemId, "reason", e.target.value)
                            }
                            disabled={pending}
                            placeholder={
                              delta > 0
                                ? "VD: Tìm thêm trong kho phụ"
                                : "VD: Mất 2 cái khi vận chuyển"
                            }
                            className={
                              "w-full rounded-md border px-2 py-1 text-xs " +
                              (reasonMissing
                                ? "border-amber-400 bg-amber-50"
                                : "border-neutral-300")
                            }
                          />
                        ) : (
                          <span className="text-xs text-neutral-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
