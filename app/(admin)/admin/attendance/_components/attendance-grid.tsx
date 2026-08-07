// app/(admin)/admin/attendance/_components/attendance-grid.tsx
//
// 07/08/2026 — BỎ mặc định "Có mặt", theo đúng site GV (attendance-panel.tsx sửa cùng
// ngày). Trước đây mở lưới lên là cả lớp đã sáng "Có mặt" sẵn dù buổi chưa điểm danh:
// màn hình nói dối, và chỉ cần sửa 1 em rồi Lưu là buổi được tính "đã điểm danh" trong
// khi những em còn lại KHÔNG có bản ghi nào. Nay mọi ô đều TRỐNG, ai bấm mới có
// (không có bản ghi Attendance = chưa điểm danh — enum không có nhãn "chưa"), và nút
// Lưu ĐÒI đánh dấu đủ cả lớp. Xem lý do đầy đủ ở comment trong save().
"use client";

import { useMemo, useState, useTransition } from "react";
import { Check, X, Clock, FileText, Save } from "lucide-react";
import { markAttendance } from "../_actions";
import { ENROLLMENT_STATUS } from "@/lib/labels/registry";

type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
type MakeupStatus = "NONE" | "NEEDS_MAKEUP" | "MADE_UP";
// R7-08 — DB thêm ABSENT_EXCUSED/ABSENT_UNEXCUSED (2-phase). Lưới điểm danh chỉ chỉnh
// 4 trạng thái gốc; 2 nhãn mới quy về gốc khi nạp state ban đầu.
type DbAttendanceStatus = AttendanceStatus | "ABSENT_EXCUSED" | "ABSENT_UNEXCUSED";
/**
 * ⚠️ 07/08/2026 — trả `null` khi HV CHƯA có bản ghi điểm danh (trước đây fallback
 * "PRESENT"). Đây chính là chỗ đẻ ra cảnh cả lớp sáng "Có mặt" khi vừa mở buổi chưa
 * điểm danh; giờ trạng thái phải do người dùng tự bấm.
 */
function toEditableStatus(
  s: DbAttendanceStatus | null | undefined,
): AttendanceStatus | null {
  if (s === "ABSENT_EXCUSED") return "EXCUSED";
  if (s === "ABSENT_UNEXCUSED") return "ABSENT";
  return s ?? null;
}

interface StudentRow {
  studentId: string;
  studentName: string;
  studentPhone: string | null;
  enrollmentStatus: string;
  existing: {
    id: string;
    status: DbAttendanceStatus;
    note: string | null;
    makeupStatus: MakeupStatus;
    absenceReason: string | null;
  } | null;
  // R7-08 — HS học bù liên cơ sở: tên CS gốc để hiện badge "Học bù từ <CS>".
  makeupFromCenter?: string | null;
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
  /** null = CHƯA điểm danh (không phải "có mặt"). */
  status: AttendanceStatus | null;
  note: string;
  makeupStatus: MakeupStatus;
  absenceReason: string;
  dirty: boolean;
}

const isAbsent = (s: AttendanceStatus | null) => s === "ABSENT" || s === "EXCUSED";

export function AttendanceGrid({ sessionId, rows }: Props) {
  const [state, setState] = useState<Record<string, RowState>>(() => {
    const init: Record<string, RowState> = {};
    for (const r of rows) {
      init[r.studentId] = {
        status: toEditableStatus(r.existing?.status),
        note: r.existing?.note ?? "",
        makeupStatus: r.existing?.makeupStatus ?? "NONE",
        absenceReason: r.existing?.absenceReason ?? "",
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
  /** Số HV chưa được đánh dấu — hiện lên để không ai tưởng buổi đã điểm danh xong. */
  const unmarked = rows.filter((r) => !state[r.studentId]?.status).length;

  /** HV ĐÃ có bản ghi trong DB lúc mở màn (dùng cho luật bỏ-chọn ở setStatus). */
  const savedIds = useMemo(
    () => new Set(rows.filter((r) => r.existing).map((r) => r.studentId)),
    [rows],
  );

  /**
   * Bấm lại đúng nhãn đang chọn = BỎ chọn (về "chưa điểm danh") — lỡ tay còn gỡ được.
   * CHỈ cho HV CHƯA có bản ghi trong DB: markAttendance chỉ upsert chứ không xoá, nên
   * bỏ chọn em đã lưu rồi bấm Lưu sẽ không xoá được gì — màn hình sẽ nói dối. Muốn sửa
   * em đã lưu thì chọn nhãn khác (hoặc xoá bản ghi ở luồng riêng).
   */
  function setStatus(studentId: string, status: AttendanceStatus) {
    setState((prev) => {
      const clearable = !savedIds.has(studentId);
      const next =
        prev[studentId]?.status === status && clearable ? null : status;
      return { ...prev, [studentId]: { ...prev[studentId], status: next, dirty: true } };
    });
    setFeedback(null);
  }

  function setNote(studentId: string, note: string) {
    setState((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], note, dirty: true },
    }));
    setFeedback(null);
  }

  function setAbsenceReason(studentId: string, absenceReason: string) {
    setState((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], absenceReason, dirty: true },
    }));
    setFeedback(null);
  }

  function setMakeupStatus(studentId: string, makeupStatus: MakeupStatus) {
    setState((prev) => ({
      ...prev,
      [studentId]: { ...prev[studentId], makeupStatus, dirty: true },
    }));
    setFeedback(null);
  }

  function markAllPresent() {
    setState((prev) => {
      const next: Record<string, RowState> = {};
      for (const [id, r] of Object.entries(prev)) {
        const changed = r.status !== "PRESENT";
        // QA 20/07 — dòng bị ĐỔI sang Có mặt thì xoá luôn ghi chú/lý do vắng cũ
        // (tránh dữ liệu mâu thuẫn kiểu "Có mặt" + note "đi muộn 10 phút").
        // Dòng vốn đã Có mặt giữ nguyên note.
        next[id] = {
          status: "PRESENT",
          note: changed ? "" : r.note,
          makeupStatus: changed ? "NONE" : r.makeupStatus,
          absenceReason: changed ? "" : r.absenceReason,
          dirty: changed || r.dirty,
        };
      }
      return next;
    });
    setFeedback(null);
  }

  function save() {
    // Phải đánh dấu đủ CẢ LỚP mới cho lưu. Không phải khắt khe cho vui: khắp hệ thống
    // (checklist buổi ở /admin/sessions/[id], cảnh báo khi hoàn tất buổi, dashboard +
    // cột "Cần xử lý" bên site GV) đều coi "buổi có ≥1 bản ghi Attendance = ĐÃ điểm
    // danh". Cho lưu dở dang thì buổi tô xanh "xong" trong khi vài em không có bản ghi
    // nào — im lặng mất người.
    if (unmarked > 0) {
      setFeedback({
        kind: "error",
        msg: `Còn ${unmarked} HV chưa đánh dấu — điểm danh đủ cả lớp rồi mới lưu được.`,
      });
      return;
    }

    // CHỈ gửi HV đã bấm trạng thái VÀ có thay đổi. Em chưa bấm = chưa điểm danh, không
    // ghi gì (Attendance không có nhãn "chưa" — không có bản ghi CHÍNH LÀ chưa).
    const records = Object.entries(state).flatMap(([studentId, r]) => {
      if (!r.dirty || !r.status) return [];
      return [
        {
          studentId,
          status: r.status,
          note: r.note.trim() || null,
          makeupStatus: isAbsent(r.status) ? r.makeupStatus : ("NONE" as MakeupStatus),
          absenceReason: isAbsent(r.status) ? r.absenceReason.trim() || null : null,
        },
      ];
    });
    if (records.length === 0) return;

    startTransition(async () => {
      const res = await markAttendance(sessionId, records);
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
        Lớp này chưa có học viên đang học.
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
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-sm text-neutral-600">
          <span>
            <strong className="text-neutral-900">{rows.length} HV</strong> ·{" "}
            {dirtyCount > 0 ? (
              <span className="text-orange-600">{dirtyCount} thay đổi chưa lưu</span>
            ) : (
              <span className="text-neutral-400">Không có thay đổi</span>
            )}
          </span>
          {unmarked > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-2 py-1 text-xs">
              <span className="h-2 w-2 rounded-full border border-neutral-400" />
              <span className="text-neutral-500">Chưa điểm danh</span>
              <span className="font-bold text-neutral-900">{unmarked}</span>
            </span>
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
                    <div className="flex items-center gap-2 font-bold text-neutral-900">
                      {r.studentName}
                      {r.makeupFromCenter && (
                        <span className="rounded-full bg-[#7C3AED]/10 px-2 py-0.5 text-[11px] font-semibold text-[#7C3AED]">
                          Học bù từ {r.makeupFromCenter}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-xs text-neutral-500">
                      {r.studentPhone && <span className="font-mono">{r.studentPhone}</span>}
                      {!r.makeupFromCenter && r.enrollmentStatus !== "ACTIVE" && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
                          {ENROLLMENT_STATUS.label(r.enrollmentStatus)}
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
                    {s && isAbsent(s.status) && (
                      <div className="mt-2 space-y-2 rounded-lg border border-red-100 bg-red-50/60 p-2">
                        <input
                          type="text"
                          value={s.absenceReason}
                          onChange={(e) => setAbsenceReason(r.studentId, e.target.value)}
                          placeholder="Lý do phụ huynh xin vắng"
                          disabled={pending}
                          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-red-400 disabled:opacity-50"
                        />
                        <div className="flex flex-wrap items-center gap-1.5">
                          {(
                            [
                              ["NONE", "Không bù"],
                              ["NEEDS_MAKEUP", "Cần học bù"],
                              ["MADE_UP", "Đã học bù"],
                            ] as [MakeupStatus, string][]
                          ).map(([value, label]) => {
                            const active = s.makeupStatus === value;
                            return (
                              <button
                                key={value}
                                type="button"
                                onClick={() => setMakeupStatus(r.studentId, value)}
                                disabled={pending}
                                className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition disabled:opacity-50 ${
                                  active
                                    ? "border-[#7C3AED] bg-[#7C3AED] text-white"
                                    : "border-neutral-200 bg-white text-neutral-600 hover:border-[#7C3AED]"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
