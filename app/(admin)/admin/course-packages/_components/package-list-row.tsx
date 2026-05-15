"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Pencil, Trash2 } from "lucide-react";
import { deletePackage } from "../_actions";

export type CoursePackageListItem = {
  id: string;
  slug: string;
  code: string;
  name: string;
  level: string | null;
  lessons: number | null;
  priceOriginal: number | null;
  isPublished: boolean;
  isFeatured: boolean;
};

function formatCurrency(value: number | null) {
  if (value === null) return "--";
  return `${new Intl.NumberFormat("vi-VN").format(value)}d`;
}

export function PackageListRow({ pkg }: { pkg: CoursePackageListItem }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }

    startTransition(async () => {
      setError(null);
      const result = await deletePackage(pkg.id);
      if (result.error) {
        setError(result.error);
      }
    });
  };

  return (
    <tr className="border-b border-gray-100 transition-colors hover:bg-gray-50/70">
      <td className="px-4 py-3">
        <span className="rounded-md bg-gray-100 px-2 py-1 font-mono text-xs text-gray-700">
          {pkg.code}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="font-semibold text-gray-900">{pkg.name}</div>
        <div className="mt-0.5 text-xs text-gray-400">/{pkg.slug}</div>
        {error ? <div className="mt-1 text-xs font-medium text-red-600">{error}</div> : null}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{pkg.level ?? "--"}</td>
      <td className="px-4 py-3 text-right text-sm font-medium tabular-nums text-gray-700">
        {formatCurrency(pkg.priceOriginal)}
      </td>
      <td className="px-4 py-3 text-center text-sm tabular-nums text-gray-600">
        {pkg.lessons ?? "--"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-center gap-1.5">
          {pkg.isPublished ? (
            <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
              Published
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
              Draft
            </span>
          )}
          {pkg.isFeatured ? (
            <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-700">
              Featured
            </span>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1.5">
          <Link
            href={`/admin/course-packages/${pkg.id}/edit`}
            className="rounded-lg p-2 text-[#7C3AED] hover:bg-purple-50"
            aria-label={`Sua ${pkg.code}`}
          >
            <Pencil className="h-4 w-4" />
          </Link>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className={`rounded-lg p-2 hover:bg-red-50 ${
              confirmDelete ? "text-red-700" : "text-red-600"
            } disabled:cursor-not-allowed disabled:opacity-60`}
            aria-label={confirmDelete ? `Xac nhan xoa ${pkg.code}` : `Xoa ${pkg.code}`}
            title={confirmDelete ? "Click lan nua de xoa" : "Xoa"}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}
