"use client";

import Link from "next/link";
import { useTransition } from "react";
import { Pencil, Trash2, Eye } from "lucide-react";
import { deleteNews, toggleNewsPublished } from "../_actions";
import { formatDateVN } from "@/lib/format/date";

type Row = {
  id: string;
  slug: string;
  title: string;
  category: string | null;
  isPublished: boolean;
  isFeatured: boolean;
  publishedAt: Date | null;
};

export function NewsListRow({ news }: { news: Row }) {
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    if (!confirm(`Xoá bài viết "${news.title}"?\nHành động này không thể hoàn tác.`)) return;
    startTransition(async () => {
      const res = await deleteNews(news.id);
      if (res?.error) alert(res.error);
    });
  }

  function handleTogglePublish() {
    startTransition(async () => {
      const res = await toggleNewsPublished(news.id, !news.isPublished);
      if (res?.error) alert(res.error);
    });
  }

  return (
    <tr className="border-b border-neutral-200 hover:bg-neutral-50">
      <td className="p-4">
        <div className="font-bold text-neutral-900">{news.title}</div>
        <div className="mt-0.5 font-mono text-xs text-neutral-500">/tin-tuc/{news.slug}</div>
      </td>
      <td className="p-4">
        {news.category ? (
          <span className="inline-block rounded bg-purple-100 px-2 py-1 text-xs font-medium text-purple-700">
            {news.category}
          </span>
        ) : (
          <span className="text-xs text-neutral-400">—</span>
        )}
      </td>
      <td className="p-4 text-center">
        <button
          type="button"
          onClick={handleTogglePublish}
          disabled={pending}
          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition disabled:opacity-50 ${
            news.isPublished
              ? "bg-green-100 text-green-700 hover:bg-green-200"
              : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
          }`}
        >
          {news.isPublished ? "Đã đăng" : "Nháp"}
        </button>
        {news.isFeatured && (
          <span className="ml-1 inline-block rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-700">
            ★
          </span>
        )}
      </td>
      <td className="p-4 text-sm text-neutral-600">
        {news.publishedAt ? formatDateVN(news.publishedAt) : "—"}
      </td>
      <td className="p-4 text-right">
        <div className="inline-flex items-center gap-1">
          {news.isPublished && (
            <Link
              href={`/tin-tuc/${news.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded p-1.5 text-blue-600 hover:bg-blue-50"
              title="Xem bài"
            >
              <Eye className="h-4 w-4" />
            </Link>
          )}
          <Link
            href={`/news/${news.id}/edit`}
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
