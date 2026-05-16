"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { enrollStudent } from "../_actions";

interface StudentOption {
  id: string;
  name: string;
  parentPhone: string | null;
  studentCode: string | null;
}

interface ClassOption {
  id: string;
  classCode: string | null;
  name: string;
  status: string;
  maxStudents: number;
  enrolledCount: number;
  centerName: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  PLANNED: "Đang lên KH",
  RECRUITING: "Tuyển sinh",
  ACTIVE: "Đang dạy",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Huỷ",
};

export function EnrollForm({
  students,
  classes,
}: {
  students: StudentOption[];
  classes: ClassOption[];
}) {
  const router = useRouter();
  const [studentId, setStudentId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedClass = useMemo(
    () => classes.find((c) => c.id === classId) ?? null,
    [classes, classId],
  );

  const isFull = selectedClass
    ? selectedClass.enrolledCount >= selectedClass.maxStudents
    : false;
  const isClosed =
    selectedClass?.status === "CANCELLED" || selectedClass?.status === "COMPLETED";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!studentId) return setError("Chọn học viên");
    if (!classId) return setError("Chọn lớp");

    startTransition(async () => {
      const res = await enrollStudent({
        studentId,
        classId,
        notes: notes.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/admin/enrollments");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-neutral-200 bg-white p-6 space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">
            Học viên <span className="text-red-500">*</span>
          </span>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            disabled={pending}
            required
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
          >
            <option value="">— Chọn học viên —</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.studentCode ? ` · ${s.studentCode}` : ""}
                {s.parentPhone ? ` · ${s.parentPhone}` : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">
            Lớp học <span className="text-red-500">*</span>
          </span>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            disabled={pending}
            required
            className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
          >
            <option value="">— Chọn lớp —</option>
            {classes.map((c) => {
              const full = c.enrolledCount >= c.maxStudents;
              return (
                <option
                  key={c.id}
                  value={c.id}
                  disabled={full}
                >
                  {c.classCode ? `${c.classCode} · ` : ""}
                  {c.name} · {c.centerName ?? "—"} · {c.enrolledCount}/
                  {c.maxStudents}
                  {full ? " (FULL)" : ""}
                </option>
              );
            })}
          </select>
          {selectedClass && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <span
                className={
                  "inline-flex rounded-full px-2 py-0.5 font-semibold " +
                  (isFull
                    ? "bg-red-100 text-red-700"
                    : "bg-green-100 text-green-700")
                }
              >
                Còn {Math.max(0, selectedClass.maxStudents - selectedClass.enrolledCount)}/
                {selectedClass.maxStudents} chỗ
              </span>
              <span className="text-neutral-500">
                Trạng thái lớp:{" "}
                <strong>
                  {STATUS_LABEL[selectedClass.status] ?? selectedClass.status}
                </strong>
              </span>
              {isClosed && (
                <span className="text-red-600 font-semibold">
                  Lớp đã đóng — không nhận đăng ký mới
                </span>
              )}
            </div>
          )}
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-semibold text-neutral-700">
            Ghi chú
          </span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="VD: Đăng ký qua campaign 20 suất miễn phí…"
            rows={3}
            disabled={pending}
            className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#7C3AED] focus:ring-2 focus:ring-[#7C3AED]/20"
          />
        </label>
      </section>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending || isFull || isClosed}
          className="rounded-xl bg-[#7C3AED] px-6 py-3 font-bold text-white shadow-md hover:opacity-90 disabled:opacity-60"
        >
          {pending ? "Đang lưu..." : "Tạo đăng ký"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/enrollments")}
          disabled={pending}
          className="rounded-xl border-2 border-neutral-200 bg-white px-6 py-3 font-bold text-neutral-700 hover:bg-neutral-50"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}
