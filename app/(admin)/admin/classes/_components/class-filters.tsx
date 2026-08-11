"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export interface FilterOption {
  value: string;
  label: string;
}

/**
 * Bộ lọc lớp học — client-side navigation (router.push trong transition) thay cho
 * form GET reload cả trang. Với full reload, trang cũ đứng yên nhiều giây (dev
 * compile + query) không có phản hồi nào → người dùng tưởng nút không ăn và bấm
 * lần 2 (Lỗi 1 — QA 20/07). Soft nav + nút "Đang lọc…" cho feedback tức thì và
 * input là controlled state nên không mất giá trị khi trang re-render.
 */
export function ClassFilters({
  initial,
  statuses,
  centers,
  courses,
  teachers,
}: {
  initial: {
    q?: string;
    status?: string;
    centerId?: string;
    courseId?: string;
    teacherId?: string;
  };
  statuses: FilterOption[];
  centers: FilterOption[];
  courses: FilterOption[];
  teachers: FilterOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(initial.q ?? "");
  const [status, setStatus] = useState(initial.status ?? "");
  const [centerId, setCenterId] = useState(initial.centerId ?? "");
  const [courseId, setCourseId] = useState(initial.courseId ?? "");
  const [teacherId, setTeacherId] = useState(initial.teacherId ?? "");

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (centerId) params.set("centerId", centerId);
    if (courseId) params.set("courseId", courseId);
    if (teacherId) params.set("teacherId", teacherId);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/classes?${qs}` : "/classes");
    });
  }

  const selectCls =
    "rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none";

  return (
    <form
      onSubmit={apply}
      className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6"
    >
      <input
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm tên / mã lớp..."
        className="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
      />
      <select
        name="status"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        aria-label="Lọc theo trạng thái"
        className={selectCls}
      >
        <option value="">Mọi trạng thái</option>
        {statuses.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        name="centerId"
        value={centerId}
        onChange={(e) => setCenterId(e.target.value)}
        aria-label="Lọc theo cơ sở"
        className={selectCls}
      >
        <option value="">Tất cả cơ sở</option>
        {centers.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        name="courseId"
        value={courseId}
        onChange={(e) => setCourseId(e.target.value)}
        aria-label="Lọc theo khoá học"
        className={selectCls}
      >
        <option value="">Tất cả khoá</option>
        {courses.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        name="teacherId"
        value={teacherId}
        onChange={(e) => setTeacherId(e.target.value)}
        aria-label="Lọc theo giáo viên"
        className={selectCls}
      >
        <option value="">Tất cả GV</option>
        {teachers.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 sm:col-span-2 lg:col-span-6"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "Đang lọc…" : "Áp dụng bộ lọc"}
      </button>
    </form>
  );
}
