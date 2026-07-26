"use client";

// R7-07 (PR1) — UI gán học viên: bộ lọc (danh sách enrollment đủ điều kiện) với
// chọn nhiều + "Thêm toàn bộ"; cảnh báo vượt sức chứa + xác nhận override.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Users, AlertTriangle, GraduationCap } from "lucide-react";
import {
  assignSelectedAction,
  assignAllFilteredAction,
  promoteConfirmedAction,
  setEnrollmentSaleAction,
} from "../_actions";

type Row = {
  id: string;
  status: string;
  statusLabel: string;
  name: string;
  studentCode: string | null;
  /** T3.2 — chỉ hàng "đang trong lớp" mới có sale phụ trách. */
  saleId?: string | null;
};

type SaleOption = { id: string; name: string };

export function AssignStudents({
  classId,
  maxStudents,
  activeCount,
  current,
  assignable,
  canOverride,
  sales = [],
}: {
  classId: string;
  maxStudents: number;
  activeCount: number;
  current: Row[];
  assignable: Row[];
  canOverride: boolean;
  /** T3.2 — sale cùng cơ sở với lớp (đã lọc ở server). */
  sales?: SaleOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // (a) PA-B — tick chọn các ghi danh "Đã xếp" để chuyển gộp sang "Đang học".
  // Lưu danh sách BỎ TICK (mặc định chọn hết — 1 cú bấm cho cả lớp; em mới thành
  // "Đã xếp" sau refresh cũng tự được chọn); bỏ tick em chưa đóng đủ tiền.
  const [promoteOff, setPromoteOff] = useState<Set<string>>(new Set());
  const confirmedRows = current.filter((s) => s.status === "CONFIRMED");

  function togglePromote(id: string) {
    setPromoteOff((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // T3.2 — đổi sale phụ trách ngay tại dòng học viên (giữ optimistic để select không
  // nháy về giá trị cũ trước khi router.refresh() xong).
  const [saleDraft, setSaleDraft] = useState<Record<string, string>>({});

  function changeSale(enrollmentId: string, value: string) {
    setSaleDraft((prev) => ({ ...prev, [enrollmentId]: value }));
    startTransition(async () => {
      const res = await setEnrollmentSaleAction(classId, enrollmentId, value || null);
      if (res.ok) {
        toast.success("Đã cập nhật sale phụ trách");
        router.refresh();
      } else {
        setSaleDraft((prev) => {
          const next = { ...prev };
          delete next[enrollmentId];
          return next;
        });
        toast.error(res.error ?? "Không đổi được sale phụ trách");
      }
    });
  }

  function promote() {
    const ids = confirmedRows.filter((s) => !promoteOff.has(s.id)).map((s) => s.id);
    if (ids.length === 0) {
      toast.error("Chưa tick học viên nào (cột Đã xếp)");
      return;
    }
    startTransition(async () => {
      const res = await promoteConfirmedAction(classId, ids);
      if (res.ok) {
        toast.success(`Đã chuyển ${res.promoted ?? 0} học viên sang "Đang học"`);
        router.refresh();
      } else {
        toast.error(res.error ?? "Không chuyển được");
      }
    });
  }
  // Khi vượt sức chứa, action trả needsOverride → giữ lại payload chờ xác nhận.
  const [pendingOverride, setPendingOverride] = useState<
    | { kind: "selected"; ids: string[] }
    | { kind: "all" }
    | null
  >(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleResult(
    res: Awaited<ReturnType<typeof assignSelectedAction>>,
    retry: { kind: "selected"; ids: string[] } | { kind: "all" },
  ) {
    if (res.ok) {
      toast.success(
        `Đã gán ${res.assigned ?? 0} học viên` +
          (res.skipped ? ` (bỏ qua ${res.skipped})` : ""),
      );
      setSelected(new Set());
      setPendingOverride(null);
      router.refresh();
      return;
    }
    if (res.needsOverride) {
      if (canOverride) {
        setPendingOverride(retry);
        toast.warning(res.error ?? "Vượt sức chứa — cần xác nhận override.");
      } else {
        toast.error(res.error ?? "Vượt sức chứa — bạn không có quyền override.");
      }
      return;
    }
    toast.error(res.error ?? "Không gán được học viên");
  }

  function assignSelected(override = false) {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("Chưa chọn học viên nào");
      return;
    }
    startTransition(async () => {
      const res = await assignSelectedAction(classId, ids, override);
      handleResult(res, { kind: "selected", ids });
    });
  }

  function assignAll(override = false) {
    startTransition(async () => {
      const res = await assignAllFilteredAction(classId, override);
      handleResult(res, { kind: "all" });
    });
  }

  function confirmOverride() {
    if (!pendingOverride) return;
    if (pendingOverride.kind === "all") assignAll(true);
    else assignSelected(true);
  }

  return (
    <div className="space-y-6">
      {/* Sĩ số hiện tại */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
            <Users className="h-4 w-4" /> Học sinh trong lớp ({activeCount}/{maxStudents})
          </h2>
          {/* (a) PA-B — nút gộp: chỉ hiện khi lớp còn em "Đã xếp" */}
          {confirmedRows.length > 0 && (
            <button
              type="button"
              onClick={promote}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              <GraduationCap className="h-4 w-4" />
              {pending
                ? "Đang chuyển…"
                : `Chuyển sang Đang học (${confirmedRows.filter((s) => !promoteOff.has(s.id)).length}/${confirmedRows.length})`}
            </button>
          )}
        </div>
        {current.length === 0 ? (
          <p className="text-sm text-gray-400">Lớp chưa có học sinh.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {current.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between gap-3 py-2 text-sm"
              >
                <span className="flex items-center gap-3 font-medium text-gray-900">
                  {/* tick chọn chỉ cho em "Đã xếp" — em khác giữ nguyên hàng tĩnh */}
                  {s.status === "CONFIRMED" ? (
                    <input
                      type="checkbox"
                      checked={!promoteOff.has(s.id)}
                      onChange={() => togglePromote(s.id)}
                      aria-label={`Chọn ${s.name} để chuyển sang Đang học`}
                      className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-600"
                    />
                  ) : (
                    <span className="h-4 w-4" aria-hidden />
                  )}
                  {s.name}
                  {s.studentCode ? (
                    <span className="text-xs font-normal text-gray-400">
                      {s.studentCode}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-3">
                  {/* T3.2 — Sale phụ trách (vị trí như cột CSKH). */}
                  <label className="flex items-center gap-1.5 text-xs text-gray-500">
                    <span className="hidden sm:inline">Sale phụ trách</span>
                    <select
                      value={saleDraft[s.id] ?? s.saleId ?? ""}
                      onChange={(e) => changeSale(s.id, e.target.value)}
                      disabled={pending || sales.length === 0}
                      aria-label={`Sale phụ trách của ${s.name}`}
                      className="max-w-[11rem] rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 outline-none focus:border-[#7C3AED] disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      <option value="">
                        {sales.length === 0 ? "— Cơ sở chưa có sale —" : "— Chưa gán —"}
                      </option>
                      {sales.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span
                    className={
                      "rounded-full px-2.5 py-0.5 text-xs font-semibold " +
                      (s.status === "CONFIRMED"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-600")
                    }
                  >
                    {s.statusLabel}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Gán học viên đủ điều kiện */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
            <UserPlus className="h-4 w-4" /> Học viên đủ điều kiện ({assignable.length})
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => assignSelected(false)}
              disabled={pending || selected.size === 0}
              className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Đang gán…" : `Thêm đã chọn (${selected.size})`}
            </button>
            <button
              type="button"
              onClick={() => assignAll(false)}
              disabled={pending || assignable.length === 0}
              className="rounded-lg border border-[#7C3AED] px-4 py-2 text-sm font-semibold text-[#7C3AED] hover:bg-purple-50 disabled:opacity-50"
            >
              Thêm toàn bộ
            </button>
          </div>
        </div>

        {pendingOverride && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
              <AlertTriangle className="h-4 w-4" /> Vượt sức chứa lớp. Xác nhận
              override để vẫn thêm (ghi audit)?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={confirmOverride}
                disabled={pending}
                className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                Xác nhận override
              </button>
              <button
                type="button"
                onClick={() => setPendingOverride(null)}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Huỷ
              </button>
            </div>
          </div>
        )}

        {assignable.length === 0 ? (
          <p className="text-sm text-gray-400">
            Không có học viên nào đủ điều kiện (đúng khóa + đúng cơ sở + chưa xếp
            lớp active).
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {assignable.map((s) => (
              <li key={s.id} className="py-2">
                <label className="flex cursor-pointer items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    className="h-4 w-4 rounded border-gray-300 text-[#7C3AED] focus:ring-[#7C3AED]"
                  />
                  <span className="font-medium text-gray-900">
                    {s.name}
                    {s.studentCode ? (
                      <span className="ml-2 text-xs text-gray-400">
                        {s.studentCode}
                      </span>
                    ) : null}
                  </span>
                  <span className="ml-auto rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                    {s.statusLabel}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
