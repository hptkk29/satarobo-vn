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
    <tr className="border-b border-border hover:bg-muted">
      <td className="p-4">
        <div className="font-bold text-foreground">{center.name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{center.address}</div>
      </td>
      <td className="p-4 text-sm">
        <div className="space-y-1">
          {center.phone ? (
            <div className="inline-flex items-center gap-1 text-foreground">
              <Phone className="h-3 w-3 text-primary" />
              <a href={`tel:${center.phone}`} className="hover:text-primary">
                {center.phone}
              </a>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {center.email && (
            <div className="inline-flex items-center gap-1 text-foreground">
              <Mail className="h-3 w-3 text-primary" />
              <a href={`mailto:${center.email}`} className="hover:text-primary break-all">
                {center.email}
              </a>
            </div>
          )}
        </div>
      </td>
      <td className="p-4 text-center text-sm">
        <div className="flex flex-wrap items-center justify-center gap-1">
          <span
            className="inline-block rounded bg-state-info-soft px-1.5 py-0.5 text-xs font-medium text-state-info-ink"
            title="Lớp học"
          >
            {center.counts.classes} lớp
          </span>
          <span
            className="inline-block rounded bg-primary-soft px-1.5 py-0.5 text-xs font-medium text-primary"
            title="Học viên"
          >
            {center.counts.students} HV
          </span>
          <span
            className="inline-block rounded bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground"
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
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${ center.isActive ? "bg-state-success-soft text-state-success-ink hover:bg-state-success-soft" : "bg-muted text-muted-foreground hover:bg-muted" }`}
        >
          {center.isActive ? "Đang hoạt động" : "Đã đóng"}
        </button>
      </td>
      <td className="p-4 text-right">
        <div className="inline-flex items-center gap-1">
          <Link
            href={`/centers/${center.id}/edit`}
            className="rounded p-1.5 text-primary hover:bg-primary-soft"
            title="Sửa"
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            disabled={pending}
            className="rounded p-1.5 text-state-danger-ink hover:bg-state-danger-soft disabled:opacity-50"
            title="Xoá"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
