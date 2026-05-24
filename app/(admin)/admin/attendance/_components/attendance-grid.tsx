"use client";

import { useState, useTransition } from "react";
import { Check, X, Clock, FileText, Save } from "lucide-react";
import { markAttendance } from "../_actions";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";

interface StudentRow {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  enrollmentStatus: string;
  existing: {
    id: string;
    status: AttendanceStatus;
    note: string | null;
  } | null;
}

interface Props {
  sessionId: string;
  rows: StudentRow[];
}

const STATUS_META: Record<
  AttendanceStatus,
  { label: string; Icon: typeof Check; activeStyle: string; idleStyle: string }
> = {
  PRESENT: {
    label: "Có mặt",
    Icon: Check,
    activeStyle: "bg-green-600 text-white border-green-600 shadow",
    idleStyle: "bg-white text-neutral-600 border-neutral-200 hover:bg-green-50 hover:border-green-300",
  },
  ABSENT: {
    label: "Vắng",
    Icon: X,
    activeStyle: "bg-red-600 text-white border-red-600 shadow",
    idleStyle: "bg-white text-neutral-600 border-neutral-200 hover:bg-red-50 hover:border-red-300",
  },
  LATE: {
    label: "Muộn",
    Icon: Clock,
    activeStyle: "bg-amber-500 text-white border-amber-500 shadow",
    idleStyle: "bg-white text-neutral-600 border-neutral-200 hover:bg-amber-50 hover:border-amber-300",
  },
  EXCUSED: {
    label: "Phép",
    Icon: FileText,
    activeStyle: "bg-blue-600 text-white border-blue-600 shadow",
    idleStyle: "bg-white text-neutral-600 border-neutral-200 hover:bg-blue-50 hover:border-blue-300",
  },
};

const STATUS_ORDER: AttendanceStatus[] = ["PRESENT", "ABSENT", "LATE", "EXCUSED"];

interface RowState {
  status: AttendanceStatus;
  note: string;
  dirty: boolean;
}

export function AttendanceGrid({ sessionId, rows }: Props) {
  const [state, setState] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const r of rows) {
      init[r.studentId] = {
        status: r.existing?.status ?? "PRESENT",
        note: r.existing?.note ?? "",
        dirty: false,
      };
    }
    return init;
  });
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; msg: string } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();

  const dirtyCount = Object.values(state).filter((r) => r.dirty).length;

  function setStatus(studentId: string, status: AttendanceStatus) {
    setState((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], status, dirty: true },
    }));
    setFeedback(null);
  }

  function setNote(studentId: string, note: string) {
    setState((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], note, dirty: true },
    }));
    setFeedback(null);
  }

  function markAllPresent() {
    setState((prev) => {
      const next: Record<string, RowState> = {};
      for (const [id, r] of Object.entries(prev)) {
        next[id] = {
          status: "PRESENT",
          note: r.note,
          dirty: r.status !== "PRESENT" || r.dirty,
        };
      }
      return next;
    });
    setFeedback(null);
  }

  function save() {
    const dirty = Object.entries(state).filter(([, r]) => r.dirty);
    const records = dirty.length > 0 ? dirty : Object.entries(state);
    if (records.length === 0) return;

    startTransition(async () => {
      const res = await markAttendance(
        sessionId,
        records.map(([studentId, r]) => ({
          studentId,
          status: r.status,
          note: r.note.trim() || null,
        })),
      );
      if (res.error) {
        setFeedback({ kind: "error", msg: res.error });
      } else {
        setFeedback({
          kind: "success",
          msg: `Đã lưu điểm danh cho ${res.saved} học viên.`,
        });
        // Clear dirty flags
        setState((prev) => {
          const next: Record<string, RowState> = {};
          for (const [id, r] of Object.entries(prev)) {
            next[id] = { ...r, dirty: false };
          }
          return next;
        });
      }
    });
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50 p-12 text-center text-neutral-500">
        Lớp này chưa có học viên nào đăng ký ở trạng thái <strong>Đang học (ACTIVE)</strong>.
        <br />
        <a href="/enrollments" className="text-orange-600 hover:underline">
          → Tạo đăng ký
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-white p-4">
        <div className="text-sm text-neutral-600">
          <strong className="text-neutral-900">{rows.length} HV</strong> ·{" "}
          {dirtyCount > 0 ? (
            <span className="text-orange-600">{dirtyCount} thay đổi chưa lưu</span>
          ) : (
            <span className="text-neutral-400">Không có thay đổi</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={markAllPresent}
            disabled={pending}
            className="rounded-lg border border-green-300 bg-white px-3 py-1.5 text-sm font-semibold text-green-700 hover:bg-green-50 disabled:opacity-50"
          >
            Đánh dấu tất cả Có mặt
          </button>
          <button
            type="button"
            onClick={save}
            disabled={pending || dirtyCount === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white shadow hover:bg-orange-600 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {pending ? "Đang lưu..." : "Lưu điểm danh"}
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.kind === "success"
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {feedback.msg}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <table className="w-full">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left">
            <tr>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">
                Học viên
              </th>
              <th className="p-4 text-center text-xs font-bold uppercase tracking-wider text-neutral-700">
                Trạng thái
              </th>
              <th className="p-4 text-xs font-bold uppercase tracking-wider text-neutral-700">
                Ghi chú
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const s = state[r.studentId];
              const dirty = s?.dirty;
              return (
                <tr
                  key={r.studentId}
                  className={`border-b border-neutral-200 ${dirty ? "bg-orange-50/40" : "hover:bg-neutral-50"}`}
                >
                  <td className="p-4">
                    <div className="font-bold text-neutral-900">{r.studentName}</div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                      {r.studentPhone && <span className="font-mono">{r.studentPhone}</span>}
                      {r.enrollmentStatus !== "ACTIVE" && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                          {r.enrollmentStatus}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap items-center justify-center gap-1.5">
                      {STATUS_ORDER.map((status) => {
                        const meta = STATUS_META[status];
                        const active = s?.status === status;
                        const Icon = meta.Icon;
                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => setStatus(r.studentId, status)}
                            disabled={pending}
                            className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                              active ? meta.activeStyle : meta.idleStyle
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="p-4">
                    <input
                      type="text"
                      value={s?.note ?? ""}
                      onChange={(e) => setNote(r.studentId, e.target.value)}
                      placeholder="Ghi chú (tuỳ chọn)"
                      disabled={pending}
                      className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 disabled:opacity-50"
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
