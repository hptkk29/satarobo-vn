"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Pencil, Trash2, ClipboardCheck, ListChecks } from "lucide-react";
import { deleteSession } from "../_actions";

type Row = {
  id: string;
  date: Date;
  topic: string | null;
  className: string;
  classId: string;
  attendanceCount: number;
};

function formatDateTime(d: Date): string {
  const date = new Date(d);
  const time = date.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  const day = date.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${day} · ${time}`;
}

function isPast(d: Date): boolean {
  return new Date(d).getTime() < Date.now();
}

export function SessionListRow({ session }: { session: Row }) {
  const [pending, startTransition] = useTransition();
  const past = isPast(session.date);

  function handleDelete() {
    if (
      !confirm(
        `Xoá buổi học "${session.topic ?? formatDateTime(session.date)}"?\nLưu ý: ${session.attendanceCount} bản ghi điểm danh sẽ bị xoá theo.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteSession(session.id);
      if (res?.error) alert(res.error);
    });
  }

  return (
    <tr className="border-b border-neutral-200 hover:bg-neutral-50">
      <td className="p-4 text-sm">
        <div className="font-bold tabular-nums text-neutral-900">{formatDateTime(session.date)}</div>
        <div className="mt-0.5 text-xs">
          {past ? (
            <span className="text-neutral-400">Đã diễn ra</span>
          ) : (
            <span className="text-green-600">Sắp tới</span>
          )}
        </div>
      </td>
      <td className="p-4">
        <div className="font-semibold text-neutral-900">{session.className}</div>
        {session.topic && (
          <div className="mt-0.5 text-xs text-neutral-500 line-clamp-2">📚 {session.topic}</div>
        )}
      </td>
      <td className="p-4 text-center">
        {session.attendanceCount > 0 ? (
          <span className="inline-block rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-700">
            {session.attendanceCount} điểm danh
          </span>
        ) : (
          <span className="text-xs text-neutral-400">Chưa có</span>
        )}
      </td>
      <td className="p-4 text-right">
        <div className="inline-flex items-center gap-1">
          <Link
            href={`/attendance?sessionId=${session.id}`}
            className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
            title="Điểm danh"
          >
            <ClipboardCheck className="h-4 w-4" />
          </Link>
          <Link
            href={`/sessions/${session.id}`}
            className="rounded p-1.5 text-emerald-600 hover:bg-emerald-50"
            title="Chi tiết / Nhận xét / Checklist"
          >
            <ListChecks className="h-4 w-4" />
          </Link>
          <Link
            href={`/sessions/${session.id}/edit`}
            className="rounded p-1.5 text-purple-600 hover:bg-purple-50"
            title="Sửa"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="rounded p-1.5 text-red-600 hover:bg-red-50 disabled:opacity-50"
            title="Xoá"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
