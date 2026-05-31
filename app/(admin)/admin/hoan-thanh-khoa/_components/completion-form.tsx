"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { markCourseCompletion } from "../_actions";

type Opt = { id: string; name: string; studentCode?: string | null };

export function CompletionForm({ students, courses }: { students: Opt[]; courses: Opt[] }) {
  const [studentId, setStudentId] = useState("");
  const [courseId, setCourseId] = useState("");
  const [finalGrade, setFinalGrade] = useState("");
  const [finalAssessment, setFinalAssessment] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!studentId || !courseId) {
      toast.error("Chọn học viên và khoá");
      return;
    }
    if (!finalAssessment.trim()) {
      toast.error("Nhập đánh giá cuối khoá của GV");
      return;
    }
    start(async () => {
      const res = await markCourseCompletion({ studentId, courseId, finalGrade, finalAssessment });
      if (res.ok) {
        toast.success(`Đã hoàn thành khoá. Chứng chỉ: ${res.certificateCode}`);
        setFinalGrade("");
        setFinalAssessment("");
      } else {
        toast.error(res.error ?? "Lỗi");
      }
    });
  }

  return (
    <div className="grid gap-3 rounded-xl border border-neutral-200 bg-white p-4 sm:grid-cols-2">
      <label className="text-sm">
        <span className="mb-1 block text-neutral-600">Học viên</span>
        <select
          value={studentId}
          onChange={(e) => setStudentId(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">— Chọn —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.studentCode ? ` (${s.studentCode})` : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-neutral-600">Khoá</span>
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        >
          <option value="">— Chọn —</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="text-sm">
        <span className="mb-1 block text-neutral-600">Xếp loại cuối khoá</span>
        <input
          value={finalGrade}
          onChange={(e) => setFinalGrade(e.target.value)}
          placeholder="Giỏi / Khá / Xuất sắc…"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>

      <label className="text-sm sm:col-span-2">
        <span className="mb-1 block text-neutral-600">Đánh giá cuối khoá của GV *</span>
        <textarea
          value={finalAssessment}
          onChange={(e) => setFinalAssessment(e.target.value)}
          rows={3}
          placeholder="Nhận xét quá trình học, kỹ năng đạt được, gợi ý phát triển…"
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="sm:col-span-2">
        <button
          onClick={submit}
          disabled={pending}
          className="rounded-md bg-purple-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Đang xử lý…" : "Đánh dấu hoàn thành & sinh chứng chỉ"}
        </button>
      </div>
    </div>
  );
}
