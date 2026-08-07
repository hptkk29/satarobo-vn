"use client";

// Tab "Kế hoạch lịch học" — lớp có NHIỀU giai đoạn lịch (vd tháng 7 học 2 buổi/tuần,
// tháng 8 còn 1 buổi/tuần), và ô "áp dụng từ ngày" để dội lịch mới xuống các buổi ĐÃ SINH.
//
// Chọn ngày/giờ bằng `<input type="date">` / `type="time"` native — đúng idiom admin của
// repo (class-form.tsx) và trình duyệt tự mở lịch khi bấm vào. Không thêm thư viện UI.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CalendarRange, Info, Plus, Save, Trash2 } from "lucide-react";
import {
  applyScheduleAction,
  previewApplyScheduleAction,
  saveSchedulePhasesAction,
  type SchedulePhaseInput,
} from "../_schedule-actions";

/** T2…T7 rồi CN — đọc theo tuần học. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
const WEEK_LABEL: Record<number, string> = {
  1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 0: "CN",
};

export interface PhaseFormValue {
  from: string;
  to: string;
  note: string;
  /** weekday → giờ; có khoá = học thứ đó. */
  days: Record<number, { start: string; end: string }>;
}

type PreviewRow = {
  id: string;
  topic: string | null;
  oldDate: string;
  newDate: string | null;
  keepReason: string | null;
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
}
/** +1 ngày cho chuỗi "YYYY-MM-DD" bằng số học UTC (không dính TZ máy). */
function nextYmd(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return "";
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1))
    .toISOString()
    .slice(0, 10);
}

const emptyPhase = (from = ""): PhaseFormValue => ({ from, to: "", note: "", days: {} });

export function ClassSchedulePhases({
  classId,
  canEdit,
  initialPhases,
  isDerived,
  defaultApplyFrom,
}: {
  classId: string;
  canEdit: boolean;
  initialPhases: PhaseFormValue[];
  /** true = chưa lưu kế hoạch, đây là giai đoạn suy từ lịch hiện tại của lớp. */
  isDerived: boolean;
  /** "YYYY-MM-DD" — mặc định ngày mai. */
  defaultApplyFrom: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [phases, setPhases] = useState<PhaseFormValue[]>(
    initialPhases.length > 0 ? initialPhases : [emptyPhase()],
  );
  const [reason, setReason] = useState("");
  const [applyFrom, setApplyFrom] = useState(defaultApplyFrom);
  const [preview, setPreview] = useState<{
    rows: PreviewRow[];
    changedCount: number;
    keptCount: number;
    conflicts: { date: string; messages: string[] }[];
    newEndDate: string | null;
  } | null>(null);

  const payload: SchedulePhaseInput[] = useMemo(
    () =>
      phases.map((p) => ({
        from: p.from,
        to: p.to,
        note: p.note,
        slots: WEEK_ORDER.filter((w) => p.days[w]).map((w) => ({
          weekday: w,
          startTime: p.days[w].start,
          endTime: p.days[w].end,
        })),
      })),
    [phases],
  );

  function patch(i: number, next: Partial<PhaseFormValue>) {
    setPhases((prev) => prev.map((p, idx) => (idx === i ? { ...p, ...next } : p)));
    setPreview(null);
  }
  function toggleDay(i: number, w: number) {
    setPhases((prev) =>
      prev.map((p, idx) => {
        if (idx !== i) return p;
        const days = { ...p.days };
        if (days[w]) delete days[w];
        // Giờ mặc định lấy từ thứ đã khai trong CÙNG giai đoạn — bớt gõ lại.
        else {
          const any = WEEK_ORDER.map((x) => p.days[x]).find(Boolean);
          days[w] = { start: any?.start ?? "17:30", end: any?.end ?? "19:00" };
        }
        return { ...p, days };
      }),
    );
    setPreview(null);
  }
  function setDayTime(i: number, w: number, field: "start" | "end", value: string) {
    setPhases((prev) =>
      prev.map((p, idx) =>
        idx === i ? { ...p, days: { ...p.days, [w]: { ...p.days[w], [field]: value } } } : p,
      ),
    );
    setPreview(null);
  }
  function addPhase() {
    setPhases((prev) => {
      const last = prev[prev.length - 1];
      // Giai đoạn mới nối ngay sau giai đoạn trước; giai đoạn trước phải có ngày kết thúc.
      const from = last?.to ? nextYmd(last.to) : "";
      return [...prev, emptyPhase(from)];
    });
    setPreview(null);
  }
  function removePhase(i: number) {
    setPhases((prev) => (prev.length <= 1 ? prev : prev.filter((_, idx) => idx !== i)));
    setPreview(null);
  }

  function save() {
    startTransition(async () => {
      const res = await saveSchedulePhasesAction(classId, payload, reason);
      if (res.ok) {
        toast.success("Đã lưu kế hoạch lịch học");
        if (res.warning) toast.warning(res.warning);
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi lưu kế hoạch");
      }
    });
  }

  function doPreview() {
    startTransition(async () => {
      // Gửi kèm kế hoạch đang gõ trên form → xem trước được TRƯỚC khi lưu.
      const res = await previewApplyScheduleAction(classId, applyFrom, payload);
      if (res.ok) {
        setPreview({
          rows: res.rows,
          changedCount: res.changedCount,
          keptCount: res.keptCount,
          conflicts: res.conflicts,
          newEndDate: res.newEndDate,
        });
        if (res.changedCount === 0) toast.info("Không có buổi nào phải đổi ngày");
        else if (res.conflicts.length > 0) {
          toast.warning(`${res.conflicts.length} buổi ở lịch mới bị trùng phòng/GV`);
        }
      } else {
        setPreview(null);
        toast.error(res.error);
      }
    });
  }

  function apply() {
    startTransition(async () => {
      // Gửi CHÍNH kế hoạch vừa xem trước: action lưu kế hoạch + dời buổi trong 1 giao
      // dịch. Trước đây áp dụng chạy trên bản ĐÃ LƯU nên admin duyệt một bảng, hệ thống
      // ghi một bảng khác.
      const res = await applyScheduleAction(classId, applyFrom, payload, reason);
      if (res.ok) {
        toast.success(
          `Đã lưu kế hoạch và áp lịch: dời ${res.moved ?? 0} buổi, giữ nguyên ${res.kept ?? 0} buổi đã có dữ liệu`,
        );
        setPreview(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi áp lịch");
      }
    });
  }

  if (!canEdit) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-500">
        Bạn không có quyền sửa lịch lớp.
      </section>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
          <CalendarRange className="h-4 w-4" /> Kế hoạch lịch học
        </h2>
        <p className="mb-3 text-xs text-gray-500">
          Một lớp có thể đổi nhịp học giữa khoá — ví dụ tháng 7 học 2 buổi/tuần, tháng 8 còn
          1 buổi/tuần. Mỗi giai đoạn khai khoảng ngày + các thứ trong tuần + giờ của từng thứ.
          Giai đoạn cuối bỏ trống ô &quot;đến ngày&quot; để kéo dài tới khi học đủ số buổi.
        </p>

        {isDerived && (
          <p className="mb-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Lớp chưa có kế hoạch. Giai đoạn dưới đây được suy từ lịch hiện tại của lớp — kiểm
              lại rồi bấm <b>Lưu kế hoạch</b> để chốt. Trước khi lưu, lớp vẫn chạy theo lịch cũ.
            </span>
          </p>
        )}

        <div className="space-y-3">
          {phases.map((p, i) => {
            const isLast = i === phases.length - 1;
            return (
              <div key={i} className="rounded-lg border border-gray-200 bg-gray-50/60 p-4">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-gray-800">Giai đoạn {i + 1}</span>
                  {phases.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePhase(i)}
                      disabled={pending}
                      className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Xoá
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-700">
                      Từ ngày <span className="text-red-600">*</span>
                    </span>
                    <input
                      type="date"
                      value={p.from}
                      onChange={(e) => patch(i, { from: e.target.value })}
                      disabled={pending}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:opacity-50"
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold text-gray-700">
                      Đến ngày{" "}
                      {isLast && <span className="font-normal text-gray-400">(để trống = đến hết khoá)</span>}
                    </span>
                    <input
                      type="date"
                      value={p.to}
                      onChange={(e) => patch(i, { to: e.target.value })}
                      disabled={pending}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:opacity-50"
                    />
                  </label>
                </div>

                <div className="mt-3">
                  <span className="mb-1.5 block text-xs font-semibold text-gray-700">
                    Học thứ mấy, mấy giờ <span className="text-red-600">*</span>
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {WEEK_ORDER.map((w) => {
                      const on = Boolean(p.days[w]);
                      return (
                        <button
                          key={w}
                          type="button"
                          onClick={() => toggleDay(i, w)}
                          disabled={pending}
                          aria-pressed={on}
                          className={`rounded-md border px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${
                            on
                              ? "border-orange-500 bg-orange-500 text-white"
                              : "border-gray-300 bg-white text-gray-600 hover:bg-gray-100"
                          }`}
                        >
                          {WEEK_LABEL[w]}
                        </button>
                      );
                    })}
                  </div>

                  {WEEK_ORDER.filter((w) => p.days[w]).length > 0 && (
                    <div className="mt-2 space-y-1.5">
                      {WEEK_ORDER.filter((w) => p.days[w]).map((w) => (
                        <div key={w} className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="w-8 font-semibold text-gray-700">{WEEK_LABEL[w]}</span>
                          <input
                            type="time"
                            value={p.days[w].start}
                            onChange={(e) => setDayTime(i, w, "start", e.target.value)}
                            disabled={pending}
                            className="rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-orange-500 disabled:opacity-50"
                          />
                          <span className="text-gray-400">→</span>
                          <input
                            type="time"
                            value={p.days[w].end}
                            onChange={(e) => setDayTime(i, w, "end", e.target.value)}
                            disabled={pending}
                            className="rounded-lg border border-gray-300 px-2 py-1 text-sm outline-none focus:border-orange-500 disabled:opacity-50"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <label className="mt-3 block">
                  <span className="mb-1 block text-xs font-semibold text-gray-700">Ghi chú</span>
                  <input
                    type="text"
                    value={p.note}
                    onChange={(e) => patch(i, { note: e.target.value })}
                    disabled={pending}
                    placeholder="vd: nghỉ hè, chuyển sang 1 buổi/tuần"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:opacity-50"
                  />
                </label>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={addPhase}
          disabled={pending}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-400 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          <Plus className="h-4 w-4" /> Thêm kế hoạch lịch
        </button>

        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-200 pt-4">
          <label className="min-w-[16rem] flex-1">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Lý do thay đổi</span>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={pending}
              placeholder="Ghi vào nhật ký thay đổi của lớp"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            <Save className="h-4 w-4" /> {pending ? "Đang lưu…" : "Lưu kế hoạch"}
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wider text-gray-500">
          Áp lịch mới cho các buổi đã sinh
        </h2>
        <p className="mb-3 text-xs text-gray-500">
          Buổi TRƯỚC ngày áp dụng giữ nguyên. Buổi từ ngày áp dụng trở đi mà{" "}
          <b>đã có dữ liệu</b> (đã điểm danh, đã nhận xét, đã giao bài tập, đã có ảnh, đã hoàn
          tất hoặc đã huỷ) cũng <b>giữ nguyên ngày</b> — chỉ buổi còn trống mới được dời. Tổng
          số buổi của khoá không đổi; ngày bế giảng tự dịch theo.
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Áp dụng từ ngày</span>
            <input
              type="date"
              value={applyFrom}
              onChange={(e) => {
                setApplyFrom(e.target.value);
                setPreview(null);
              }}
              disabled={pending}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </label>
          <button
            type="button"
            onClick={doPreview}
            disabled={pending || !applyFrom}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Xem trước
          </button>
          <button
            type="button"
            onClick={apply}
            disabled={pending || !preview || preview.conflicts.length > 0 || preview.changedCount === 0}
            className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
            title={!preview ? "Bấm Xem trước đã" : undefined}
          >
            {pending ? "Đang áp dụng…" : "Áp dụng"}
          </button>
        </div>

        {preview && (
          <div className="mt-3">
            <p className="mb-2 text-sm text-gray-600">
              <b className="text-gray-900">{preview.changedCount}</b> buổi đổi ngày ·{" "}
              <b className="text-gray-900">{preview.keptCount}</b> buổi giữ nguyên vì đã có dữ liệu
              {preview.newEndDate && (
                <> · ngày bế giảng mới: <b className="text-gray-900">{fmt(preview.newEndDate)}</b></>
              )}
            </p>

            {preview.conflicts.length > 0 && (
              <div className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
                  <AlertTriangle className="h-4 w-4" /> Lịch mới trùng phòng/giáo viên — không áp
                  dụng được
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-red-700">
                  {preview.conflicts.map((c) => (
                    <li key={c.date}>
                      {fmt(c.date)} — {c.messages.join("; ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 text-sm">
              {preview.rows.map((r) => {
                const moved = r.newDate !== null && fmt(r.oldDate) + fmtTime(r.oldDate) !== fmt(r.newDate) + fmtTime(r.newDate);
                return (
                  <li key={r.id} className="flex items-center justify-between gap-2">
                    <span className="truncate text-gray-600">{r.topic ?? "Buổi học"}</span>
                    {r.keepReason ? (
                      <span className="shrink-0 tabular-nums text-gray-400">
                        {fmt(r.oldDate)} · giữ nguyên ({r.keepReason})
                      </span>
                    ) : (
                      <span
                        className={`shrink-0 tabular-nums ${moved ? "font-semibold text-amber-700" : "text-gray-400"}`}
                      >
                        {fmt(r.oldDate)} {fmtTime(r.oldDate)}
                        {moved && r.newDate ? ` → ${fmt(r.newDate)} ${fmtTime(r.newDate)}` : ""}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
