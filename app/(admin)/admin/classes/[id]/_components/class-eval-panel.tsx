"use client";

import { useState, useTransition } from "react";
import { ClipboardCheck } from "lucide-react";
import { SessionEvalFill, type StudentLite } from "../../../evaluations/_components/session-eval-fill";
import { loadClassSessionRoster } from "../_attendance-actions";
import type { AttendanceRosterRow } from "@/lib/attendance/roster";

type SessionOpt = { id: string; date: string; topic: string | null; status: string };

function fmt(dateIso: string): string {
  const d = new Date(dateIso);
  const day = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  return `${day} · ${time}`;
}

export function rowsToEvalStudents(rows: AttendanceRosterRow[]): StudentLite[] {
  return rows.map((r) => ({
    studentId: r.studentId,
    name: r.studentName,
    present: r.existing?.status === "PRESENT" || r.existing?.status === "LATE",
  }));
}

/**
 * R2-CLASS-7 — Tab "Đánh giá" lớp chính: chọn buổi → nạp DS học viên (qua roster
 * điểm danh, scope-checked) → SessionEvalFill (phiếu SESSION_EVAL lớp chính). Học
 * viên buổi mặc định render server-side; đổi buổi mới fetch lại (không useEffect).
 */
export function ClassEvalPanel({
  sessions,
  initialSessionId,
  initialStudents,
  canEdit,
}: {
  sessions: SessionOpt[];
  initialSessionId: string | null;
  initialStudents: StudentLite[];
  canEdit: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string>(initialSessionId ?? "");
  const [students, setStudents] = useState<StudentLite[]>(initialStudents);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSelect(id: string) {
    setSelectedId(id);
    setError(null);
    if (!id) {
      setStudents([]);
      return;
    }
    startTransition(async () => {
      const res = await loadClassSessionRoster(id);
      if (res.ok) {
        setStudents(rowsToEvalStudents(res.rows));
      } else {
        setStudents([]);
        setError(res.error);
      }
    });
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-8 text-center text-sm text-neutral-600">
        <ClipboardCheck className="mx-auto mb-2 h-8 w-8 text-neutral-400" />
        Lớp chưa có buổi học để đánh giá.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <label className="block max-w-md">
        <span className="mb-1 block text-sm font-semibold text-neutral-700">Chọn buổi đánh giá</span>
        <select
          value={selectedId}
          onChange={(e) => onSelect(e.target.value)}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED]"
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
          <SessionEvalFill key={selectedId} sessionId={selectedId} students={students} canEdit={canEdit} />
        </div>
      ) : !error ? (
        <p className="text-sm text-neutral-500">Chọn một buổi học để mở phiếu đánh giá.</p>
      ) : null}
    </div>
  );
}
