"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Pencil, Trash2, Phone, Mail } from "lucide-react";
import { deleteCenter, toggleCenterActive } from "../_actions";

type Row = {
  id: string;
  name: string;
  address: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  counts: {
    classes: number;
    students: number;
    employees: number;
  };
};

export function CenterListRow({ center }: { center: Row }) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (
      !confirm(
        `Xoá cơ sở "${center.name}"?\nLưu ý: chỉ xoá được khi không còn user/lead/lớp/HV/nhân sự liên kết.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteCenter(center.id);
      if (res?.error) alert(res.error);
    });
  }

  function handleToggleActive() {
    startTransition(async () => {
      const res = await toggleCenterActive(center.id, !center.isActive);
      if (res?.error) alert(res.error);
    });
  }

  return (
    <tr className="border-b border-neutral-200 hover:bg-neutral-50">
      <td className="p-4">
        <div className="font-bold text-neutral-900">{center.name}</div>
        <div className="mt-0.5 text-xs text-neutral-500 line-clamp-1">{center.address}</div>
      </td>
      <td className="p-4 text-sm">
        <div className="space-y-1">
          {center.phone ? (
            <div className="inline-flex items-center gap-1 text-neutral-700">
              <Phone className="h-3 w-3 text-orange-500" />
              <a href={`tel:${center.phone}`} className="hover:text-orange-600">
                {center.phone}
              </a>
            </div>
          ) : (
            <span className="text-neutral-400">—</span>
          )}
          {center.email && (
            <div className="inline-flex items-center gap-1 text-neutral-700">
              <Mail className="h-3 w-3 text-purple-500" />
              <a href={`mailto:${center.email}`} className="hover:text-orange-600 break-all">
                {center.email}
              </a>
            </div>
          )}
        </div>
      </td>
      <td className="p-4 text-center text-sm">
        <div className="flex flex-wrap items-center justify-center gap-1">
          <span
            className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700"
            title="Lớp học"
          >
            {center.counts.classes} lớp
          </span>
          <span
            className="inline-block rounded bg-purple-100 px-1.5 py-0.5 text-xs font-medium text-purple-700"
            title="Học viên"
          >
            {center.counts.students} HV
          </span>
          <span
            className="inline-block rounded bg-neutral-100 px-1.5 py-0.5 text-xs font-medium text-neutral-700"
            title="Nhân sự"
          >
            {center.counts.employees} NS
          </span>
        </div>
      </td>
      <td className="p-4 text-center">
        <button
          type="button"
          onClick={handleToggleActive}
          disabled={pending}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
            center.isActive
              ? "bg-green-100 text-green-700 hover:bg-green-200"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
          }`}
        >
          {center.isActive ? "Đang hoạt động" : "Đã đóng"}
        </button>
      </td>
      <td className="p-4 text-right">
        <div className="inline-flex items-center gap-1">
          <Link
            href={`/admin/centers/${center.id}/edit`}
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
