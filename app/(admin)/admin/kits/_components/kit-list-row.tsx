"use client";

import Link from "next/link";
import Image from "next/image";
import { useTransition } from "react";
import { Pencil, Trash2, Eye, ExternalLink, ImageOff } from "lucide-react";
import { deleteKit, toggleKitAvailable, toggleKitPublished } from "../_actions";

type Row = {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  brand: string;
  series: string;
  code: string | null;
  priceDisplay: string;
  mainImage: string;
  galleryImages: string[];
  isAvailable: boolean;
  isPublished: boolean;
};

export function KitListRow({ kit }: { kit: Row }) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Xoá kit "${kit.title}"?\nHành động này không thể hoàn tác.`)) return;
    startTransition(async () => {
      const res = await deleteKit(kit.id);
      if (res?.error) alert(res.error);
    });
  }

  function handleTogglePublish() {
    startTransition(async () => {
      const res = await toggleKitPublished(kit.id, !kit.isPublished);
      if (res?.error) alert(res.error);
    });
  }

  function handleToggleAvailable() {
    startTransition(async () => {
      const res = await toggleKitAvailable(kit.id, !kit.isAvailable);
      if (res?.error) alert(res.error);
    });
  }

  return (
    <tr className="border-b border-neutral-200 hover:bg-neutral-50">
      <td className="p-4">
        <div className="flex items-center gap-3">
          <div className="relative h-12 w-16 shrink-0 overflow-hidden rounded-lg bg-neutral-100">
            {kit.mainImage ? (
              <Image
                src={kit.mainImage}
                alt={kit.title}
                fill
                sizes="64px"
                className="object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-neutral-300">
                <ImageOff className="h-5 w-5" />
              </div>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-neutral-900 truncate">{kit.title}</div>
            <div className="mt-0.5 text-xs text-neutral-500 truncate">{kit.subtitle}</div>
            <div className="mt-0.5 font-mono text-[10px] text-neutral-400">/hoc-cu#{kit.slug}</div>
          </div>
        </div>
      </td>
      <td className="p-4 text-sm text-neutral-700">
        <div className="font-semibold">{kit.brand}</div>
        <div className="text-xs text-neutral-500">{kit.series}</div>
        {kit.code && (
          <div className="mt-1 inline-block rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] text-neutral-700">
            {kit.code}
          </div>
        )}
      </td>
      <td className="p-4 text-center text-xs text-neutral-600">
        {kit.galleryImages.length}{" "}
        <span className="text-neutral-400">ảnh phụ</span>
      </td>
      <td className="p-4 text-sm text-neutral-700">{kit.priceDisplay}</td>
      <td className="p-4 text-center">
        <div className="flex flex-col items-center gap-1.5">
          <button
            type="button"
            onClick={handleTogglePublish}
            disabled={pending}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
              kit.isPublished
                ? "bg-green-100 text-green-700 hover:bg-green-200"
                : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
            }`}
          >
            {kit.isPublished ? "Published" : "Draft"}
          </button>
          <button
            type="button"
            onClick={handleToggleAvailable}
            disabled={pending}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
              kit.isAvailable
                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                : "bg-red-100 text-red-700 hover:bg-red-200"
            }`}
          >
            {kit.isAvailable ? "Có sẵn" : "Hết hàng"}
          </button>
        </div>
      </td>
      <td className="p-4 text-right">
        <div className="inline-flex items-center gap-1">
          {kit.isPublished && (
            <Link
              href={`/hoc-cu#${kit.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
              title="Xem trên trang công khai"
            >
              <Eye className="h-4 w-4" />
            </Link>
          )}
          <Link
            href={`/admin/kits/${kit.id}/edit`}
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

export function KitSourceLink({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
    >
      <ExternalLink className="h-3 w-3" />
      Source
    </a>
  );
}
