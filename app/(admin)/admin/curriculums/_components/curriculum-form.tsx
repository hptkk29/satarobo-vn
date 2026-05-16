"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCurriculumAndRedirect,
  updateCurriculum,
  deleteCurriculumAndRedirect,
} from "../_actions";

interface CourseOption {
  id: string;
  name: string;
}

export type CurriculumFormValue = {
  id: string;
  courseId: string;
  name: string;
  version: number;
  description: string | null;
  isActive: boolean;
};

export function CurriculumForm({
  curriculum,
  courses,
}: {
  curriculum?: CurriculumFormValue;
  courses: CourseOption[];
}) {
  const router = useRouter();
  const isEdit = Boolean(curriculum);
  const [courseId, setCourseId] = useState(curriculum?.courseId ?? "");
  const [name, setName] = useState(curriculum?.name ?? "");
  const [version, setVersion] = useState<number>(curriculum?.version ?? 1);
  const [description, setDescription] = useState(curriculum?.description ?? "");
  const [isActive, setIsActive] = useState(curriculum?.isActive ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      courseId,
      name,
      version,
      description: description.trim() || null,
      isActive,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateCurriculum(curriculum!.id, payload)
        : await createCurriculumAndRedirect(payload);
      if (res && !res.ok) setError(res.error);
      else if (isEdit) router.refresh();
    });
  }

  function handleDelete() {
    if (!curriculum) return;
    if (
      !confirm(
        `Xoá giáo trình "${curriculum.name} v${curriculum.version}"? Hành động này không thể hoàn tác.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteCurriculumAndRedirect(curriculum.id);
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-neutral-200 bg-white p-6"
    >
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">
            Khoá học <span className="text-red-500">*</span>
          </span>
          <select
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            required
            disabled={pending}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
          >
            <option value="">— Chọn khoá học —</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">
            Version <span className="text-red-500">*</span>
          </span>
          <input
            type="number"
            min={1}
            value={version}
            onChange={(e) =>
              setVersion(Math.max(1, parseInt(e.target.value, 10) || 1))
            }
            required
            disabled={pending}
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
          />
          <span className="mt-1 block text-xs text-neutral-500">
            Tăng version khi cập nhật lớn — duy nhất per khoá học
          </span>
        </label>
      </div>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-neutral-700">
          Tên giáo trình <span className="text-red-500">*</span>
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="VD: Lập trình Robot K1 v1.0"
          required
          disabled={pending}
          className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-neutral-700">
          Mô tả
        </span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Mô tả ngắn về giáo trình, mục tiêu tổng thể, đối tượng..."
          rows={3}
          disabled={pending}
          className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
          disabled={pending}
          className="h-4 w-4 rounded border-neutral-300"
        />
        <span className="font-medium text-neutral-700">
          Đang sử dụng (lớp mới sẽ dùng giáo trình này)
        </span>
      </label>

      <div className="flex flex-wrap gap-3 border-t border-neutral-100 pt-4">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[#7C3AED] px-6 py-2.5 font-bold text-white shadow-md hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo giáo trình"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/curriculums")}
          disabled={pending}
          className="rounded-xl border-2 border-neutral-200 bg-white px-6 py-2.5 font-bold text-neutral-700 hover:bg-neutral-50"
        >
          Huỷ
        </button>
        {isEdit && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="ml-auto rounded-xl border-2 border-red-200 bg-white px-6 py-2.5 font-bold text-red-700 hover:bg-red-50"
          >
            Xoá
          </button>
        )}
      </div>
    </form>
  );
}
