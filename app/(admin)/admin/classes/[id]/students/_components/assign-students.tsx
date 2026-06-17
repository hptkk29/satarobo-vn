"use client";

// R7-07 (PR1) — UI gán học viên: bộ lọc (danh sách enrollment đủ điều kiện) với
// chọn nhiều + "Thêm toàn bộ"; cảnh báo vượt sức chứa + xác nhận override.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UserPlus, Users, AlertTriangle } from "lucide-react";
import { assignSelectedAction, assignAllFilteredAction } from "../_actions";

type Row = {
  id: string;
  status: string;
  statusLabel: string;
  name: string;
  studentCode: string | null;
};

export function AssignStudents({
  classId,
  maxStudents,
  activeCount,
  current,
  assignable,
  canOverride,
}: {
  classId: string;
  maxStudents: number;
  activeCount: number;
  current: Row[];
  assignable: Row[];
  canOverride: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());
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
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
          <Users className="h-4 w-4" /> Học sinh trong lớp ({activeCount}/{maxStudents})
        </h2>
        {current.length === 0 ? (
          <p className="text-sm text-gray-400">Lớp chưa có học sinh.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {current.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between py-2 text-sm"
              >
                <span className="font-medium text-gray-900">
                  {s.name}
                  {s.studentCode ? (
                    <span className="ml-2 text-xs text-gray-400">
                      {s.studentCode}
                    </span>
                  ) : null}
                </span>
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                  {s.statusLabel}
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
