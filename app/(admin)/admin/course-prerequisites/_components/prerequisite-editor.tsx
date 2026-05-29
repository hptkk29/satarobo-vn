"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import { addCoursePrerequisite, removeCoursePrerequisite } from "../_actions";

type Existing = { id: string; requiredCourseId: string; label: string };
type Option = { id: string; label: string };

export function PrerequisiteEditor({
  courseId,
  existing,
  options,
}: {
  courseId: string;
  existing: Existing[];
  options: Option[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pick, setPick] = useState("");

  // Loại các khoá đã là tiên quyết khỏi dropdown.
  const usedIds = new Set(existing.map((e) => e.requiredCourseId));
  const available = options.filter((o) => !usedIds.has(o.id));

  function add() {
    if (!pick) {
      toast.error("Chọn khoá tiên quyết");
      return;
    }
    startTransition(async () => {
      const res = await addCoursePrerequisite(courseId, pick);
      if (res.ok) {
        toast.success("Đã thêm khoá tiên quyết");
        setPick("");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      const res = await removeCoursePrerequisite(id);
      if (res.ok) {
        toast.success("Đã xoá");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <div className="space-y-3">
      {existing.length === 0 ? (
        <p className="text-sm text-gray-400">Không yêu cầu khoá nào trước.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {existing.map((e) => (
            <span
              key={e.id}
              className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-3 py-1 text-sm font-medium text-purple-700"
            >
              Cần: {e.label}
              <button
                type="button"
                onClick={() => remove(e.id)}
                disabled={pending}
                className="rounded-full p-0.5 text-purple-400 hover:bg-purple-100 hover:text-purple-700 disabled:opacity-50"
                aria-label={`Xoá ${e.label}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {available.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={pick}
            onChange={(e) => setPick(e.target.value)}
            disabled={pending}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-[#7C3AED] focus:outline-none"
          >
            <option value="">— Thêm khoá phải hoàn thành trước —</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={add}
            disabled={pending || !pick}
            className="inline-flex items-center gap-1 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Thêm
          </button>
        </div>
      )}
    </div>
  );
}
