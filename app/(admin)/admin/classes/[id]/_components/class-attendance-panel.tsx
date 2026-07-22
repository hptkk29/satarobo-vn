"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck } from "lucide-react";
import { AttendanceGrid } from "../../../attendance/_components/attendance-grid";
import { loadClassSessionRoster } from "../_attendance-actions";
import type { AttendanceRosterRow } from "@/lib/attendance/roster";
import { formatDateDMY } from "@/lib/format/date";

type SessionOpt = { id: string; date: string; topic: string | null; status: string };

function fmt(dateIso: string): string {
  const d = new Date(dateIso);
  const day = formatDateDMY(d);
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

/**
 * R2-CLASS-1 — Tab "Điểm danh" trong trang chi tiết lớp: chọn buổi (dropdown) →
 * nạp roster qua server action (scope-checked) → AttendanceGrid. Roster buổi mặc
 * định render server-side (RSC, không useEffect-fetch); đổi buổi mới fetch lại.
 */
export function ClassAttendancePanel({
  sessions,
  initialSessionId,
  initialRows,
}: {
  sessions: SessionOpt[];
  initialSessionId: string | null;
  initialRows: AttendanceRosterRow[];
}) {
  const [selectedId, setSelectedId] = useState<string>(initialSessionId ?? "");
  const [rows, setRows] = useState<AttendanceRosterRow[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSelect(id: string) {
    setSelectedId(id);
    setError(null);
    if (!id) {
      setRows([]);
      return;
    }
    startTransition(async () => {
      const res = await loadClassSessionRoster(id);
      if (res.ok) {
        setRows(res.rows);
      } else {
        setRows([]);
        setError(res.error);
      }
    });
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-600">
        <ClipboardCheck className="mx-auto mb-2 h-8 w-8 text-neutral-400" />
        Lớp chưa có buổi học để điểm danh. Sinh buổi ở tab “Buổi học”.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="block max-w-md">
        <span className="mb-1 block text-sm font-semibold text-neutral-700">Chọn buổi điểm danh</span>
        <select
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500"
        >
          <option value="">— Chọn buổi học —</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {fmt(s.date)}
              {s.topic ? ` — ${s.topic}` : ""}
              {s.status === "CANCELLED" ? " (đã huỷ)" : ""}
            </option>
          ))}
        </select>
      </label>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {selectedId && !error ? (
        <div className={pending ? "opacity-60" : ""}>
          <AttendanceGrid sessionId={selectedId} rows={rows} />
        </div>
      ) : !error ? (
        <p className="text-sm text-neutral-500">Chọn một buổi học để điểm danh.</p>
      ) : null}
    </div>
  );
}
