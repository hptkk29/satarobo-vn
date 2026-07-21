"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  changeAssignmentStatus,
  createAssignmentAndRedirect,
  deleteAssignmentAndRedirect,
  publishAssignment,
  updateAssignment,
} from "../_actions";

type Status = "DRAFT" | "PUBLISHED" | "CLOSED" | "ARCHIVED";

interface ClassOption {
  id: string;
  name: string;
  classCode: string | null;
}
interface LessonOption {
  id: string;
  order: number;
  title: string;
  curriculumName: string;
}

export type AssignmentFormValue = {
  id: string;
  title: string;
  kind: "CLASSWORK" | "HOMEWORK";
  description: string;
  instructions: string | null;
  classId: string;
  lessonId: string | null;
  totalPoints: number;
  dueAt: Date | null;
  allowText: boolean;
  allowFile: boolean;
  status: Status;
};

function toDateTimeInput(d: Date | null): string {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AssignmentForm({
  assignment,
  classes,
  lessons,
}: {
  assignment?: AssignmentFormValue;
  classes: ClassOption[];
  lessons: LessonOption[];
}) {
  const router = useRouter();
  const isEdit = Boolean(assignment);

  const [title, setTitle] = useState(assignment?.title ?? "");
  const [kind, setKind] = useState<"CLASSWORK" | "HOMEWORK">(assignment?.kind ?? "CLASSWORK");
  const [description, setDescription] = useState(assignment?.description ?? "");
  const [instructions, setInstructions] = useState(assignment?.instructions ?? "");
  const [classId, setClassId] = useState(assignment?.classId ?? "");
  const [lessonId, setLessonId] = useState(assignment?.lessonId ?? "");
  const [totalPoints, setTotalPoints] = useState(assignment?.totalPoints ?? 10);
  const [dueAt, setDueAt] = useState(toDateTimeInput(assignment?.dueAt ?? null));
  const [allowText, setAllowText] = useState(assignment?.allowText ?? true);
  const [allowFile, setAllowFile] = useState(assignment?.allowFile ?? true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  // QA 21/07 (#1) — window.confirm block renderer (treo với automation, không
  // đồng nhất UI) → dialog xác nhận riêng cho Publish và Xoá.
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const status: Status = assignment?.status ?? "DRAFT";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    const payload = {
      title,
      kind,
      description,
      instructions: instructions.trim() || null,
      classId,
      lessonId: lessonId || null,
      totalPoints,
      dueAt: dueAt ? new Date(dueAt) : null,
      allowText,
      allowFile,
      status,
    };
    startTransition(async () => {
      const res = isEdit
        ? await updateAssignment(assignment!.id, payload)
        : await createAssignmentAndRedirect(payload);
      if (res && !res.ok) setError(res.error);
      else if (isEdit) router.refresh();
    });
  }

  function handlePublish() {
    if (!assignment) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await publishAssignment(assignment.id);
      if (!res.ok) {
        setError(res.error);
        setConfirmPublish(false);
        return;
      }
      setInfo(`Đã tạo ${res.data?.created ?? 0} bản nộp bài rỗng cho HS.`);
      setConfirmPublish(false);
      router.refresh();
    });
  }

  function handleChangeStatus(next: "CLOSED" | "ARCHIVED") {
    if (!assignment) return;
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const res = await changeAssignmentStatus({
        assignmentId: assignment.id,
        status: next,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!assignment) return;
    setError(null);
    startTransition(async () => {
      const res = await deleteAssignmentAndRedirect(assignment.id);
      if (res && !res.ok) {
        setError(res.error);
        setConfirmDelete(false);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {info}
        </div>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700">
            Thông tin bài tập
          </h2>
          <span
            className={
              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold " +
              statusBadge(status)
            }
          >
            {statusLabel(status)}
          </span>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">
            Tiêu đề <span className="text-red-500">*</span>
          </span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            disabled={pending}
            placeholder="VD: Bài tập tuần 1 — Lập trình cơ bản"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">Loại bài</span>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as "CLASSWORK" | "HOMEWORK")}
            disabled={pending}
            className={inputClass}
          >
            <option value="CLASSWORK">Bài trên lớp</option>
            <option value="HOMEWORK">Bài tập về nhà</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">
            Mô tả <span className="text-red-500">*</span>
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            required
            disabled={pending}
            placeholder="Mô tả ngắn về yêu cầu bài tập"
            className={`${inputClass} resize-y`}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">
            Hướng dẫn chi tiết
          </span>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={5}
            disabled={pending}
            placeholder="Các bước, ví dụ, tiêu chí chấm điểm..."
            className={`${inputClass} resize-y`}
          />
        </label>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-neutral-700">
              Lớp học <span className="text-red-500">*</span>
            </span>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              required
              disabled={pending}
              className={inputClass}
            >
              <option value="">— Chọn lớp —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.classCode ? `${c.classCode} · ` : ""}
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-neutral-700">
              Bài học (tuỳ chọn)
            </span>
            <select
              value={lessonId}
              onChange={(e) => setLessonId(e.target.value)}
              disabled={pending}
              className={inputClass}
            >
              <option value="">— Không gắn —</option>
              {lessons.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.curriculumName} — Bài {l.order}: {l.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-neutral-700">
              Tổng điểm <span className="text-red-500">*</span>
            </span>
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={totalPoints}
              onChange={(e) =>
                setTotalPoints(Math.max(0.1, parseFloat(e.target.value) || 10))
              }
              required
              disabled={pending}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-neutral-700">
              Hạn nộp
            </span>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              disabled={pending}
              className={inputClass}
            />
          </label>
        </div>

        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowText}
              onChange={(e) => setAllowText(e.target.checked)}
              disabled={pending}
              className="h-4 w-4 rounded border-neutral-300"
            />
            <span className="font-medium text-neutral-700">
              Cho phép trả lời text
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={allowFile}
              onChange={(e) => setAllowFile(e.target.checked)}
              disabled={pending}
              className="h-4 w-4 rounded border-neutral-300"
            />
            <span className="font-medium text-neutral-700">
              Cho phép nộp file
            </span>
          </label>
        </div>
      </section>

      <div className="flex flex-wrap gap-3 border-t border-neutral-200 pt-5">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-[#7C3AED] px-6 py-3 font-bold text-white shadow-md hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Đang lưu..." : isEdit ? "Lưu thay đổi" : "Tạo bài tập"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/assignments")}
          disabled={pending}
          className="rounded-xl border-2 border-neutral-200 bg-white px-6 py-3 font-bold text-neutral-700 hover:bg-neutral-50"
        >
          Huỷ
        </button>

        {isEdit && status === "DRAFT" && (
          <button
            type="button"
            onClick={() => setConfirmPublish(true)}
            disabled={pending}
            className="rounded-xl bg-green-600 px-6 py-3 font-bold text-white shadow-md hover:bg-green-700 disabled:opacity-60"
          >
            Publish
          </button>
        )}
        {isEdit && status === "PUBLISHED" && (
          <button
            type="button"
            onClick={() => handleChangeStatus("CLOSED")}
            disabled={pending}
            className="rounded-xl border-2 border-amber-300 bg-white px-6 py-3 font-bold text-amber-700 hover:bg-amber-50"
          >
            Đóng (CLOSED)
          </button>
        )}
        {isEdit && (status === "PUBLISHED" || status === "CLOSED") && (
          <button
            type="button"
            onClick={() => handleChangeStatus("ARCHIVED")}
            disabled={pending}
            className="rounded-xl border-2 border-neutral-300 bg-white px-6 py-3 font-bold text-neutral-700 hover:bg-neutral-50"
          >
            Lưu trữ
          </button>
        )}

        {isEdit && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            disabled={pending}
            className="ml-auto rounded-xl border-2 border-red-200 bg-white px-6 py-3 font-bold text-red-700 hover:bg-red-50"
          >
            Xoá
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        pending={pending}
        tone="primary"
        title="Publish bài tập này?"
        description="Hệ thống sẽ tạo bản ghi nộp bài trống cho mọi học viên đang học trong lớp và bài sẽ hiển thị trên portal phụ huynh."
        confirmLabel="Publish"
        onConfirm={handlePublish}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        pending={pending}
        title={`Xoá bài tập "${assignment?.title ?? ""}"?`}
        description="Các bản nộp chưa được chấm sẽ bị xoá theo. Hành động không thể hoàn tác."
        confirmLabel="Xoá bài tập"
        onConfirm={handleDelete}
      />
    </form>
  );
}

const inputClass =
  "w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20";

function statusLabel(s: Status) {
  switch (s) {
    case "DRAFT":
      return "Đang soạn";
    case "PUBLISHED":
      return "Đã giao";
    case "CLOSED":
      return "Đã đóng";
    case "ARCHIVED":
      return "Lưu trữ";
  }
}

function statusBadge(s: Status) {
  switch (s) {
    case "DRAFT":
      return "bg-gray-100 text-gray-700";
    case "PUBLISHED":
      return "bg-green-100 text-green-700";
    case "CLOSED":
      return "bg-amber-100 text-amber-700";
    case "ARCHIVED":
      return "bg-neutral-100 text-neutral-500";
  }
}
