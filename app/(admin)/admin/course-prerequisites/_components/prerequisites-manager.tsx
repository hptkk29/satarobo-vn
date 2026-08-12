"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import {
  setCoursePrerequisites,
  clearCoursePrerequisites,
} from "../_actions";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

type CourseOpt = { id: string; label: string };
type Row = { courseId: string; courseLabel: string; prereqs: CourseOpt[] };

export function PrerequisitesManager({
  courses,
  rows,
}: {
  courses: CourseOpt[];
  rows: Row[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState<null | { courseId: string; fixed: boolean }>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function remove(courseId: string) {
    startTransition(async () => {
      const res = await clearCoursePrerequisites(courseId);
      if (res.ok) {
        toast.success("Đã xoá điều kiện tiên quyết");
        setConfirmDelete(null);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const configuredIds = new Set(rows.map((r) => r.courseId));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setEditing({ courseId: "", fixed: false })}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Thêm điều kiện tiên quyết
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <PhanTrangBang>
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-muted">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Khoá</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Phải hoàn thành trước</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    Chưa có khoá nào cấu hình tiên quyết. Bấm “Thêm điều kiện tiên quyết”.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.courseId} className="hover:bg-muted/60">
                    <td className="px-4 py-3 font-medium text-foreground">{r.courseLabel}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1.5">
                        {r.prereqs.map((p) => (
                          <span key={p.id} className="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-medium text-primary">
                            {p.label}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setEditing({ courseId: r.courseId, fixed: true })}
                          className="rounded p-1.5 text-state-info-ink hover:bg-state-info-soft"
                          title="Sửa"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {confirmDelete === r.courseId ? (
                          <button
                            type="button"
                            onClick={() => remove(r.courseId)}
                            disabled={pending}
                            className="rounded bg-state-danger-soft px-2 py-1 text-xs font-semibold text-state-danger-ink hover:bg-state-danger-soft-hover disabled:opacity-50"
                          >
                            Xác nhận xoá?
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDelete(r.courseId)}
                            className="rounded p-1.5 text-state-danger-ink hover:bg-state-danger-soft"
                            title="Xoá toàn bộ tiên quyết của khoá này"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </PhanTrangBang>
      </div>

      {editing && (
        <PrereqDialog
          courses={courses}
          fixedCourseId={editing.fixed ? editing.courseId : null}
          initialPrereqs={rows.find((r) => r.courseId === editing.courseId)?.prereqs.map((p) => p.id) ?? []}
          configuredIds={configuredIds}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function PrereqDialog({
  courses,
  fixedCourseId,
  initialPrereqs,
  configuredIds,
  onClose,
  onSaved,
}: {
  courses: CourseOpt[];
  fixedCourseId: string | null;
  initialPrereqs: string[];
  configuredIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [courseId, setCourseId] = useState(fixedCourseId ?? "");
  const [picked, setPicked] = useState<string[]>(initialPrereqs);

  function toggle(id: string) {
    setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  function save() {
    if (!courseId) {
      toast.error("Chọn khoá");
      return;
    }
    if (picked.length === 0) {
      toast.error("Chọn ít nhất 1 khoá tiên quyết");
      return;
    }
    startTransition(async () => {
      const res = await setCoursePrerequisites({ courseId, requiredCourseIds: picked });
      if (res.ok) {
        toast.success("Đã lưu điều kiện tiên quyết");
        onSaved();
      } else toast.error(res.error);
    });
  }

  // Khi thêm mới: gợi ý khoá chưa cấu hình (vẫn cho chọn lại để sửa).
  const courseChoices = courses;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button type="button" aria-label="Đóng" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground">
            {fixedCourseId ? "Sửa điều kiện tiên quyết" : "Thêm điều kiện tiên quyết"}
          </h3>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <label className="block">
          <span className="mb-1 block text-xs font-medium text-muted-foreground">Khoá học</span>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            disabled={!!fixedCourseId || pending}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-primary focus:outline-none disabled:bg-muted"
          >
            <option value="">— Chọn khoá —</option>
            {courseChoices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}{!fixedCourseId && configuredIds.has(c.id) ? " (đã có cấu hình)" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-4">
          <span className="mb-2 block text-xs font-medium text-muted-foreground">
            Phải hoàn thành trước ({picked.length})
          </span>
          <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto">
            {courses
              .filter((c) => c.id !== courseId)
              .map((c) => {
                const on = picked.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => toggle(c.id)}
                    disabled={pending}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${ on ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-muted-foreground hover:border-primary" }`}
                  >
                    {on ? "✓ " : ""}{c.label}
                  </button>
                );
              })}
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={pending}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {pending ? "Đang lưu…" : "Lưu"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Hủy
          </button>
        </div>
      </div>
    </div>
  );
}
