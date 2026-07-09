// app/(teacher)/teacher/lop/_components/attendance-panel.tsx — #06 (câu 50).
//
// ⚠️ MOUNT POINT: đây là selector 6-nhãn TỐI GIẢN (placeholder). Khi Kiệt H1 bàn giao
// component điểm danh dùng chung, THAY <select> dưới bằng component đó — GIỮ NGUYÊN data
// contract: onChange trả { studentId, status: AttendanceStatus, makeupStatus?, note? };
// nút Lưu gọi saveClassAttendanceAction(sessionId, records). Không đổi action/guard.
//
// Câu 46: rows KHÔNG chứa SĐT/contact — chỉ tên HV (server đã strip trước khi truyền).
"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ATTENDANCE_LABELS } from "@/lib/labels";
import { Button } from "@/components/ui/button";
import { saveClassAttendanceAction } from "../_actions";

// 4 status GV được đánh (2 makeup còn lại NEEDS_MAKEUP/MADE_UP là hệ suy) → 6 nhãn SRS.
const MARKABLE = ["PRESENT", "LATE", "ABSENT_EXCUSED", "ABSENT_UNEXCUSED"] as const;
type Markable = (typeof MARKABLE)[number];

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

  function setStatus(studentId: string, status: Markable) {
    setState((s) => ({ ...s, [studentId]: { ...s[studentId], status } }));
  }
  function setNote(studentId: string, note: string) {
    setState((s) => ({ ...s, [studentId]: { ...s[studentId], note } }));
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
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-3 py-2 font-medium">Học viên</th>
              <th className="px-3 py-2 font-medium">Điểm danh</th>
              <th className="px-3 py-2 font-medium">Ghi chú</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td className="px-3 py-2">
                  <span className="font-medium text-neutral-800">{r.studentName}</span>
                  {r.makeupFromCenter && (
                    <span className="ml-2 rounded bg-purple-100 px-1.5 py-0.5 text-xs text-purple-700">
                      Học bù từ {r.makeupFromCenter}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {/* MOUNT POINT — thay bằng component 6-nhãn của Kiệt H1 (giữ onChange contract). */}
                  <select
                    className="rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                    value={state[r.studentId]?.status ?? "PRESENT"}
                    disabled={!editable || pending}
                    onChange={(e) => setStatus(r.studentId, e.target.value as Markable)}
                    aria-label={`Điểm danh ${r.studentName}`}
                  >
                    {MARKABLE.map((k) => (
                      <option key={k} value={k}>
                        {ATTENDANCE_LABELS[k].label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input
                    type="text"
                    className="w-full rounded-md border border-neutral-300 px-2 py-1 text-sm disabled:opacity-50"
                    placeholder="—"
                    value={state[r.studentId]?.note ?? ""}
                    disabled={!editable || pending}
                    onChange={(e) => setNote(r.studentId, e.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="flex justify-end">
          <Button onClick={save} disabled={pending}>
            {pending ? "Đang lưu…" : "Lưu điểm danh"}
          </Button>
        </div>
      )}
    </div>
  );
}
