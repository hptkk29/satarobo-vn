"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

interface Opt {
  id: string;
  label: string;
}

/**
 * Bộ chọn lớp/buổi cho trang điểm danh — client-side navigation thay form GET
 * reload cả trang (Lỗi "Mở phải bấm 2 lần" — QA 20/07: full reload nhiều giây
 * không phản hồi khiến người dùng bấm lại). Đổi lớp → lọc danh sách buổi ngay;
 * bấm "Mở" → mở bảng điểm danh với nút hiện "Đang mở…" trong lúc chờ.
 *
 * Lưu ý: page.tsx render component này với key={classId} để state buổi reset
 * khi đổi lớp qua URL.
 */
export function AttendanceSelector({
  classes,
  sessions,
  classId,
  sessionId,
}: {
  classes: Opt[];
  sessions: Opt[];
  classId: string;
  sessionId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selSession, setSelSession] = useState(sessionId);

  function push(nextClassId: string, nextSessionId: string) {
    const params = new URLSearchParams();
    if (nextClassId) params.set("classId", nextClassId);
    if (nextSessionId) params.set("sessionId", nextSessionId);
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/attendance?${qs}` : "/attendance");
    });
  }

  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center">
      <select
        value={classId}
        onChange={(e) => {
          setSelSession("");
          push(e.target.value, "");
        }}
        disabled={pending}
        aria-label="Lọc theo lớp"
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:opacity-60"
      >
        <option value="">Tất cả lớp</option>
        {classes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <select
        value={selSession}
        onChange={(e) => setSelSession(e.target.value)}
        disabled={pending}
        aria-label="Chọn buổi học"
        className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 disabled:opacity-60 sm:max-w-md"
      >
        <option value="">— Chọn buổi học —</option>
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => push(classId, selSession)}
        disabled={pending || !selSession}
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "Đang mở…" : "Mở"}
      </button>
    </div>
  );
}
