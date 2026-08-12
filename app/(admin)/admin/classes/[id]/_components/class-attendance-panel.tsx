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
      <div className="rounded-xl border-2 border-dashed border-border bg-muted p-8 text-center text-sm text-muted-foreground">
        <ClipboardCheck className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
        Lớp chưa có buổi học để điểm danh. Sinh buổi ở tab “Buổi học”.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="block max-w-md">
        <span className="mb-1 block text-sm font-semibold text-foreground">Chọn buổi điểm danh</span>
        <select
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
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
        <div className="rounded-lg border border-state-danger-soft bg-state-danger-soft px-4 py-3 text-sm text-state-danger-ink">
          {error}
        </div>
      )}

      {selectedId && !error ? (
        <div className={pending ? "opacity-60" : ""}>
          {/* key = buổi: state trong AttendanceGrid chỉ khởi tạo 1 lần, không có key thì
              đổi buổi xong lưới vẫn giữ trạng thái buổi TRƯỚC (cùng lớp nên phần lớn HV
              trùng) — màn hình nói dối, và với luật "phải đủ cả lớp" thì đếm luôn sai. */}
          <AttendanceGrid key={selectedId} sessionId={selectedId} rows={rows} />
        </div>
      ) : !error ? (
        <p className="text-sm text-muted-foreground">Chọn một buổi học để điểm danh.</p>
      ) : null}
    </div>
  );
}
