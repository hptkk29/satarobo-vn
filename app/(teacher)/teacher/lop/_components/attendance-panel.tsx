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
import Link from "next/link";
import { Check, Save, Users } from "lucide-react";
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
import { EmptyState } from "../../_components/ui/empty-state";
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
  // Site GV bỏ tông tím → tone "purple" (nhãn MADE_UP, không hiển thị ở panel này
  // vì chỉ render MARKABLE) dùng cam thương hiệu để không lệch khỏi hệ màu.
  purple: "border-orange-600 bg-orange-600 text-white",
  neutral: "border-muted-foreground bg-muted-foreground text-white",
};
const TONE_DOT: Record<AttendanceLabelTone, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-500",
  blue: "bg-blue-500",
  red: "bg-red-500",
  purple: "bg-orange-500",
  neutral: "bg-muted-foreground",
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
    return <EmptyState icon={Users} title="Lớp chưa có học viên đang học." />;
  }

  return (
    <div className="space-y-3">
      {/* Tổng hợp gọn + thao tác nhanh (port từ attendance-board) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-sm">
          <span className="font-semibold text-foreground">{rows.length} học viên</span>
          {MARKABLE.map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs"
            >
              <span className={cn("h-2 w-2 rounded-full", TONE_DOT[ATTENDANCE_LABELS[k].tone])} />
              <span className="text-muted-foreground">{ATTENDANCE_LABELS[k].label}</span>
              <span className="font-bold text-foreground">{counts[k]}</span>
            </span>
          ))}
        </div>
        {editable && (
          <button
            type="button"
            onClick={setAllPresent}
            disabled={pending}
            className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-orange-700 hover:text-orange-800 disabled:cursor-not-allowed disabled:text-muted-foreground dark:text-orange-300 dark:hover:text-orange-200"
          >
            <Check className="h-4 w-4" aria-hidden /> Đánh dấu tất cả có mặt
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 hover:bg-muted/50">
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
                    <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
                      {initials(r.studentName)}
                    </span>
                    <div className="min-w-0">
                      <Link
                        href={`/teacher/hoc-vien?s=${r.studentId}`}
                        className="block truncate text-sm font-semibold text-foreground hover:text-orange-700 hover:underline dark:hover:text-orange-300"
                        title="Mở hồ sơ học viên"
                      >
                        {r.studentName}
                      </Link>
                      {r.makeupFromCenter && (
                        <span className="mt-0.5 inline-block rounded bg-orange-100 px-1.5 py-0.5 text-[11px] text-orange-700 dark:bg-orange-500/15 dark:text-orange-300">
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
                              : "border-border bg-card text-muted-foreground hover:bg-muted",
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
                    className="w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground disabled:opacity-50"
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
            <Save className="mr-1.5 h-4 w-4" aria-hidden />
            {pending ? "Đang lưu…" : "Lưu điểm danh"}
          </Button>
        </div>
      )}
    </div>
  );
}
