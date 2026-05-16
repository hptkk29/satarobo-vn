"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { StringArrayEditor } from "@/app/(admin)/admin/kits/_components/string-array-editor";
import { createLesson, updateLesson } from "../_actions";

export type LessonFormValue = {
  id: string;
  curriculumId: string;
  order: number;
  title: string;
  description: string | null;
  content: string | null;
  duration: number;
  objectives: string[];
  materials: string[];
  notes: string | null;
};

interface Props {
  curriculumId: string;
  lesson?: LessonFormValue;
  defaultOrder?: number;
  trigger: (open: () => void) => React.ReactNode;
}

export function LessonFormDialog({
  curriculumId,
  lesson,
  defaultOrder,
  trigger,
}: Props) {
  const router = useRouter();
  const isEdit = Boolean(lesson);
  const [isOpen, setIsOpen] = useState(false);
  const [order, setOrder] = useState<number>(
    lesson?.order ?? defaultOrder ?? 1,
  );
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [duration, setDuration] = useState<number>(lesson?.duration ?? 90);
  const [description, setDescription] = useState(lesson?.description ?? "");
  const [content, setContent] = useState(lesson?.content ?? "");
  const [objectives, setObjectives] = useState<string[]>(lesson?.objectives ?? []);
  const [materials, setMaterials] = useState<string[]>(lesson?.materials ?? []);
  const [notes, setNotes] = useState(lesson?.notes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => {
    if (pending) return;
    setIsOpen(false);
    setError(null);
  };

  const open = () => {
    setIsOpen(true);
    setError(null);
    // For "add" mode, reset to fresh defaults each time
    if (!isEdit) {
      setOrder(defaultOrder ?? 1);
      setTitle("");
      setDuration(90);
      setDescription("");
      setContent("");
      setObjectives([]);
      setMaterials([]);
      setNotes("");
    }
  };

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = {
      curriculumId,
      title,
      order,
      duration,
      description: description.trim() || null,
      content: content.trim() || null,
      objectives,
      materials,
      notes: notes.trim() || null,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateLesson(lesson!.id, payload)
        : await createLesson(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setIsOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {trigger(open)}

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lesson-form-title"
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 py-8"
          onClick={close}
        >
          <div
            className="relative w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={close}
              aria-label="Đóng"
              className="absolute right-3 top-3 rounded-md p-1 text-neutral-500 hover:bg-neutral-100"
            >
              <X className="h-4 w-4" />
            </button>

            <h2
              id="lesson-form-title"
              className="text-lg font-bold text-neutral-900"
            >
              {isEdit ? `Sửa bài ${lesson!.order}` : "Thêm bài học"}
            </h2>

            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[100px_1fr_120px]">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-neutral-600">
                    Bài số *
                  </span>
                  <input
                    type="number"
                    min={1}
                    value={order}
                    onChange={(e) =>
                      setOrder(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    required
                    disabled={pending}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-neutral-600">
                    Tiêu đề *
                  </span>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="VD: Giới thiệu Robot và môi trường"
                    required
                    disabled={pending}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-neutral-600">
                    Thời lượng (phút)
                  </span>
                  <input
                    type="number"
                    min={15}
                    step={5}
                    value={duration}
                    onChange={(e) =>
                      setDuration(Math.max(15, parseInt(e.target.value, 10) || 90))
                    }
                    disabled={pending}
                    className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-600">
                  Mô tả ngắn
                </span>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả ngắn về buổi học (có thể hiển thị cho HS/PH)"
                  rows={2}
                  disabled={pending}
                  className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-600">
                  Nội dung chính
                </span>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Nội dung chi tiết (markdown OK)"
                  rows={5}
                  disabled={pending}
                  className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20 font-mono"
                />
              </label>

              <div>
                <span className="mb-1 block text-xs font-semibold text-neutral-600">
                  Mục tiêu học tập
                </span>
                <StringArrayEditor
                  value={objectives}
                  onChange={setObjectives}
                  placeholder="VD: Hiểu cấu tạo cơ bản của robot..."
                />
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-neutral-600">
                  Tài liệu (URL)
                </span>
                <StringArrayEditor
                  value={materials}
                  onChange={setMaterials}
                  placeholder="VD: https://drive.google.com/..."
                />
                <span className="mt-1 block text-xs text-neutral-500">
                  E4 sẽ thay bằng upload trực tiếp lên R2; hiện tại paste URL.
                </span>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-neutral-600">
                  Ghi chú nội bộ (cho GV)
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="VD: Chuẩn bị 5 bộ kit Alpha, kiểm tra pin trước buổi học"
                  rows={2}
                  disabled={pending}
                  className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
                />
              </label>

              <div className="flex justify-end gap-2 border-t border-neutral-100 pt-4">
                <button
                  type="button"
                  onClick={close}
                  disabled={pending}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
                >
                  Huỷ
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                >
                  {pending ? "Đang lưu..." : isEdit ? "Cập nhật" : "Tạo bài"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
