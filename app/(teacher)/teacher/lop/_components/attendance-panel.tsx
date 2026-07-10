// app/(teacher)/teacher/lop/_components/attendance-panel.tsx — #06 (câu 50).
//
// Visual PORT từ bàn giao Kiệt/H1 (satarobo-ui-giaovien/.../attendance-board.tsx,
// tìm thấy 10/07): chip 4 trạng thái / học viên + đếm nhanh + "tất cả có mặt" +
// avatar initials. GIỮ NGUYÊN data contract + action/guard thật của repo này:
// 4 status markable (2 nhãn còn lại NEEDS_MAKEUP/MADE_UP là hệ suy — đủ 6 nhãn SRS);
// nút Lưu gọi saveClassAttendanceAction(sessionId, records). Token màu theo tone
// ATTENDANCE_LABELS (lib/labels) — không dùng token riêng của project mock.
//
// Câu 46: rows KHÔNG chứa SĐT/contact — chỉ tên HV (server đã strip trước khi truyền).
"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, Save } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ATTENDANCE_LABELS, type AttendanceLabelTone } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { saveClassAttendanceAction } from "../_actions";

// 4 status GV được đánh (2 makeup còn lại NEEDS_MAKEUP/MADE_UP là hệ suy) → 6 nhãn SRS.
const MARKABLE = ["PRESENT", "LATE", "ABSENT_EXCUSED", "ABSENT_UNEXCUSED"] as const;
type Markable = (typeof MARKABLE)[number];

// Màu chip/chấm theo tone của ATTENDANCE_LABELS — đổi tone ở lib/labels là đổi cả đây.
const TONE_ACTIVE: Record<AttendanceLabelTone, string> = {
  green: "border-emerald-600 bg-emerald-600 text-white",
  amber: "border-amber-500 bg-amber-500 text-white",
  blue: "border-blue-500 bg-blue-500 text-white",
  red: "border-red-500 bg-red-500 text-white",
  purple: "border-purple-600 bg-purple-600 text-white",
  neutral: "border-neutral-400 bg-neutral-400 text-white",
};
const TONE_DOT: Record<AttendanceLabelTone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
  purple: "bg-purple-500",
  neutral: "bg-neutral-400",
};

const initials = (name: string) =>
  name
    .split(" ")
    .slice(-2)
    .map((w) => w[0] ?? "")
    .join("")
    .toUpperCase();

export type AttendancePanelRow = {
  studentId: string;
  studentName: string;
  enrollmentStatus: string;
  makeupFromCenter?: string | null;
  existingStatus: string | null;
  existingNote: string | null;
};

/** Chuẩn hoá status cũ (2-phase R7-08) về 1 trong 4 nhãn markable để hiển thị mặc định. */
function normalize(status: string | null): Markable {
  if (status === "ABSENT") return "ABSENT_UNEXCUSED";
  if (status === "EXCUSED") return "ABSENT_EXCUSED";
  if ((MARKABLE as readonly string[]).includes(status ?? "")) return status as Markable;
  return "PRESENT";
}

export function AttendancePanel({
  sessionId,
  rows,
  editable,
}: {
  sessionId: string;
  rows: AttendancePanelRow[];
  editable: boolean;
}) {
  const [state, setState] = useState<Record<string, { status: Markable; note: string }>>(() =>
    Object.fromEntries(
      rows.map((r) => [r.studentId, { status: normalize(r.existingStatus), note: r.existingNote ?? "" }]),
    ),
  );
  const [pending, startTransition] = useTransition();

  const counts = useMemo(() => {
    const c: Record<Markable, number> = {
      PRESENT: 0,
      LATE: 0,
      ABSENT_EXCUSED: 0,
      ABSENT_UNEXCUSED: 0,
    };
    for (const r of rows) c[state[r.studentId]?.status ?? "PRESENT"]++;
    return c;
  }, [state, rows]);

  function setStatus(studentId: string, status: Markable) {
    setState((s) => ({ ...s, [studentId]: { ...s[studentId], status } }));
  }
  function setNote(studentId: string, note: string) {
    setState((s) => ({ ...s, [studentId]: { ...s[studentId], note } }));
  }
  function setAllPresent() {
    setState((s) =>
      Object.fromEntries(
        rows.map((r) => [r.studentId, { ...s[r.studentId], status: "PRESENT" as Markable }]),
      ),
    );
  }

  function save() {
    const records = rows.map((r) => ({
      studentId: r.studentId,
      status: state[r.studentId]?.status ?? "PRESENT",
      note: state[r.studentId]?.note?.trim() || null,
    }));
    startTransition(async () => {
      const res = await saveClassAttendanceAction(sessionId, records);
      if (res.ok) toast.success(`Đã lưu điểm danh ${res.saved} học viên`);
      else toast.error(res.error);
    });
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-500">
        Lớp chưa có học viên đang học.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {/* Tổng hợp gọn + thao tác nhanh (port từ attendance-board) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm">
          <span className="font-semibold text-neutral-900">{rows.length} học viên</span>
          {MARKABLE.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 rounded-md bg-neutral-100 px-2 py-1 text-xs"
            >
              <span className={cn("h-2 w-2 rounded-full", TONE_DOT[ATTENDANCE_LABELS[k].tone])} />
              <span className="text-neutral-500">{ATTENDANCE_LABELS[k].label}</span>
              <span className="font-bold text-neutral-900">{counts[k]}</span>
            </span>
          ))}
        </div>
        {editable && (
          <button
            type="button"
            onClick={setAllPresent}
            disabled={pending}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-purple-700 hover:text-purple-800 disabled:cursor-not-allowed disabled:text-neutral-400"
          >
            <Check className="h-4 w-4" /> Đánh dấu tất cả có mặt
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-neutral-50 hover:bg-neutral-50">
              <TableHead>Học viên</TableHead>
              <TableHead>Trạng thái điểm danh</TableHead>
              <TableHead className="w-[220px]">Ghi chú</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.studentId}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-purple-700 text-xs font-bold text-white">
                      {initials(r.studentName)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">
                        {r.studentName}
                      </p>
                      {r.makeupFromCenter && (
                        <span className="mt-0.5 inline-block rounded bg-purple-100 px-1.5 py-0.5 text-[11px] text-purple-700">
                          Học bù từ {r.makeupFromCenter}
                        </span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1.5">
                    {MARKABLE.map((k) => {
                      const info = ATTENDANCE_LABELS[k];
                      const active = (state[r.studentId]?.status ?? "PRESENT") === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          disabled={!editable || pending}
                          onClick={() => setStatus(r.studentId, k)}
                          aria-pressed={active}
                          aria-label={`${info.label} — ${r.studentName}`}
                          className={cn(
                            "rounded-md border px-2.5 py-1 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                            active
                              ? TONE_ACTIVE[info.tone]
                              : "border-neutral-200 bg-white text-neutral-500 hover:bg-neutral-50",
                          )}
                        >
                          {info.label}
                        </button>
                      );
                    })}
                  </div>
                </TableCell>
                <TableCell>
                  <input
                    type="text"
                    className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                    placeholder="—"
                    value={state[r.studentId]?.note ?? ""}
                    disabled={!editable || pending}
                    onChange={(e) => setNote(r.studentId, e.target.value)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {editable && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={pending}>
            <Save className="mr-1.5 h-4 w-4" />
            {pending ? "Đang lưu…" : "Lưu điểm danh"}
          </Button>
        </div>
      )}
    </div>
  );
}
