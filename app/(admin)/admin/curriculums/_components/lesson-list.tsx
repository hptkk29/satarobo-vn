"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from "lucide-react";
import { LessonFormDialog, type LessonFormValue } from "./lesson-form-dialog";
import { deleteLesson, reorderLessons } from "../_actions";

export function LessonList({
  curriculumId,
  initialLessons,
}: {
  curriculumId: string;
  initialLessons: LessonFormValue[];
}) {
  const router = useRouter();
  // Local copy so reorder feels instant; server refresh confirms.
  const [lessons, setLessons] = useState<LessonFormValue[]>(initialLessons);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const nextOrder =
    lessons.length === 0 ? 1 : Math.max(...lessons.map((l) => l.order)) + 1;

  function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= lessons.length) return;
    const next = [...lessons];
    [next[idx], next[j]] = [next[j], next[idx]];
    setLessons(next);

    setError(null);
    startTransition(async () => {
      const res = await reorderLessons({
        curriculumId,
        lessonIds: next.map((l) => l.id),
      });
      if (!res.ok) {
        setError(res.error);
        setLessons(initialLessons);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete(lesson: LessonFormValue) {
    if (
      !confirm(
        `Xoá "Bài ${lesson.order}: ${lesson.title}"? Hành động này không hoàn tác.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await deleteLesson(lesson.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="rounded-xl border border-neutral-200 bg-white">
      <header className="flex items-center justify-between border-b border-neutral-100 p-4">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700">
            Bài học ({lessons.length})
          </h2>
          <p className="text-xs text-neutral-500">
            Sắp xếp bằng nút ↑↓; số thứ tự cập nhật theo thời gian thực.
          </p>
        </div>
        <LessonFormDialog
          curriculumId={curriculumId}
          defaultOrder={nextOrder}
          trigger={(open) => (
            <button
              type="button"
              onClick={open}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Thêm bài
            </button>
          )}
        />
      </header>

      {error && (
        <div className="border-b border-red-100 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {lessons.length === 0 ? (
        <div className="p-8 text-center text-sm text-neutral-400">
          Chưa có bài học. Bấm “Thêm bài” để bắt đầu.
        </div>
      ) : (
        <table className="w-full">
          <thead className="bg-neutral-50 text-left">
            <tr>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 w-20">
                Bài
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                Tiêu đề
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 w-24">
                Thời lượng
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 w-20 text-center">
                MT
              </th>
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 w-20 text-center">
                TL
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500 w-40">
                Hành động
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-100">
            {lessons.map((lesson, idx) => (
              <tr key={lesson.id} className="hover:bg-neutral-50/60">
                <td className="px-3 py-3 font-bold tabular-nums text-neutral-700">
                  Bài {lesson.order}
                </td>
                <td className="px-3 py-3">
                  <div className="font-medium text-neutral-900">{lesson.title}</div>
                  {lesson.description && (
                    <div className="mt-0.5 text-xs text-neutral-500 line-clamp-1">
                      {lesson.description}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3 text-sm tabular-nums text-neutral-600">
                  {lesson.duration}′
                </td>
                <td className="px-3 py-3 text-center text-sm tabular-nums text-neutral-600">
                  {lesson.objectives.length}
                </td>
                <td className="px-3 py-3 text-center text-sm tabular-nums text-neutral-600">
                  {lesson.materials.length}
                </td>
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => move(idx, -1)}
                      disabled={pending || idx === 0}
                      className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
                      aria-label="Lên"
                      title="Lên"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(idx, 1)}
                      disabled={pending || idx === lessons.length - 1}
                      className="rounded p-1.5 text-neutral-600 hover:bg-neutral-100 disabled:opacity-30"
                      aria-label="Xuống"
                      title="Xuống"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                    <LessonFormDialog
                      curriculumId={curriculumId}
                      lesson={lesson}
                      trigger={(open) => (
                        <button
                          type="button"
                          onClick={open}
                          className="rounded p-1.5 text-[#7C3AED] hover:bg-[#7C3AED]/10"
                          aria-label="Sửa"
                          title="Sửa"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => handleDelete(lesson)}
                      disabled={pending}
                      className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-30"
                      aria-label="Xoá"
                      title="Xoá"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
