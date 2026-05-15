"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteEnrollment } from "../_actions";

type EnrollmentStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "CANCELLED";

type Row = {
  id: string;
  studentName: string;
  studentPhone: string | null;
  className: string;
  courseName: string;
  status: EnrollmentStatus;
  tuition: number | null;
  paidAt: Date | null;
  startDate: Date | null;
  endDate: Date | null;
};

const STATUS_STYLE: Record<EnrollmentStatus, string> = {
  ACTIVE: "bg-green-100 text-green-700",
  PAUSED: "bg-amber-100 text-amber-700",
  COMPLETED: "bg-blue-100 text-blue-700",
  CANCELLED: "bg-red-100 text-red-700",
};

const STATUS_LABEL: Record<EnrollmentStatus, string> = {
  ACTIVE: "Đang học",
  PAUSED: "Tạm ngừng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Đã huỷ",
};

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("vi-VN");
}

function formatVnd(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

export function EnrollmentListRow({ enrollment }: { enrollment: Row }) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Xoá đăng ký của "${enrollment.studentName}" tại lớp "${enrollment.className}"?`))
      return;
    startTransition(async () => {
      const res = await deleteEnrollment(enrollment.id);
      if (res?.error) alert(res.error);
    });
  }

  return (
    <tr className="border-b border-neutral-200 hover:bg-neutral-50">
      <td className="p-4">
        <div className="font-bold text-neutral-900">{enrollment.studentName}</div>
        {enrollment.studentPhone && (
          <div className="mt-0.5 font-mono text-xs text-neutral-500">{enrollment.studentPhone}</div>
        )}
      </td>
      <td className="p-4">
        <div className="font-semibold text-neutral-900">{enrollment.className}</div>
        <div className="mt-0.5 text-xs text-neutral-500">{enrollment.courseName}</div>
      </td>
      <td className="p-4 text-center">
        <span
          className={`inline-block rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLE[enrollment.status]}`}
        >
          {STATUS_LABEL[enrollment.status]}
        </span>
      </td>
      <td className="p-4 text-right text-sm tabular-nums text-neutral-700">
        <div>{formatVnd(enrollment.tuition)}</div>
        {enrollment.paidAt && (
          <div className="mt-0.5 text-xs text-green-600">Đã trả {formatDate(enrollment.paidAt)}</div>
        )}
      </td>
      <td className="p-4 text-sm tabular-nums text-neutral-600">
        <div>{formatDate(enrollment.startDate)}</div>
        {enrollment.endDate && (
          <div className="text-xs text-neutral-400">→ {formatDate(enrollment.endDate)}</div>
        )}
      </td>
      <td className="p-4 text-right">
        <div className="inline-flex items-center gap-1">
          <Link
            href={`/admin/enrollments/${enrollment.id}/edit`}
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
