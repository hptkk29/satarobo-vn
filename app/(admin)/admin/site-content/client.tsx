"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImageUploader } from "@/components/admin/ImageUploader";
import { saveSiteContentAction } from "./actions";

type FieldType = "text" | "textarea" | "avatar";

interface PageMeta {
  pageKey: string;
  label: string;
}

interface Field {
  key: string;
  label: string;
  type: FieldType;
}

interface Props {
  pages: PageMeta[];
  fields: Field[];
  initialContent: Record<string, Record<string, string>>;
}

export function SiteContentClient({ pages, fields, initialContent }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [activePage, setActivePage] = useState(pages[0].pageKey);
  const [content, setContent] = useState(initialContent);

  const current = content[activePage] || {};

  const update = (contentKey: string, value: string) => {
    setContent((prev) => ({
      ...prev,
      [activePage]: { ...prev[activePage], [contentKey]: value },
    }));
  };

  const save = (contentKey: string) => {
    const value = current[contentKey] ?? "";
    startTransition(async () => {
      const res = await saveSiteContentAction({
        pageKey: activePage,
        contentKey,
        contentValue: value,
      });
      if (res.ok) {
        toast.success(value ? "Đã lưu" : "Đã reset về mặc định");
        router.refresh();
      } else {
        toast.error(res.error || "Lỗi");
      }
    });
  };

  return (
    <div className="flex flex-col md:flex-row gap-6">
      {/* Sidebar: page list */}
      <aside className="md:w-64 shrink-0">
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
          {pages.map((p) => {
            const isActive = activePage === p.pageKey;
            const hasOverride = Object.keys(content[p.pageKey] || {}).length > 0;
            return (
              <button
                key={p.pageKey}
                type="button"
                onClick={() => setActivePage(p.pageKey)}
                className={`w-full text-left px-4 py-3 text-sm border-b border-neutral-100 last:border-b-0 transition-colors ${
                  isActive
                    ? "bg-orange-50 text-orange-700 font-semibold border-l-2 border-orange-500"
                    : "text-neutral-700 hover:bg-neutral-50"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate">{p.label}</span>
                  {hasOverride && (
                    <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
                  )}
                </div>
                <p className="text-xs text-neutral-500 font-normal mt-0.5">
                  /{p.pageKey === "home" ? "" : p.pageKey}
                </p>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Edit panel */}
      <div className="flex-1 space-y-4">
        {fields.map((field) => {
          const value = current[field.key] ?? "";
          return (
            <div
              key={field.key}
              className="bg-white border border-neutral-200 rounded-xl p-5"
            >
              <label className="block text-sm font-semibold text-neutral-900 mb-2">
                {field.label}
                <span className="ml-2 text-xs font-normal text-neutral-400">
                  ({field.key})
                </span>
              </label>

              {field.type === "text" && (
                <input
                  type="text"
                  value={value}
                  onChange={(e) => update(field.key, e.target.value)}
                  placeholder="Để trống = dùng mặc định"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                />
              )}

              {field.type === "textarea" && (
                <textarea
                  rows={3}
                  value={value}
                  onChange={(e) => update(field.key, e.target.value)}
                  placeholder="Để trống = dùng mặc định"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                />
              )}

              {field.type === "avatar" && (
                <ImageUploader
                  value={value}
                  onChange={(url) => update(field.key, url ?? "")}
                  prefix="uploads/images"
                  aspect="video"
                />
              )}

              <div className="flex justify-end mt-3">
                <button
                  type="button"
                  onClick={() => save(field.key)}
                  disabled={isPending}
                  className="rounded bg-orange-500 hover:bg-orange-600 px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
                >
                  {isPending ? "Đang lưu..." : "Lưu"}
                </button>
              </div>
            </div>
          );
        })}

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900">
          <p className="font-semibold mb-1">💡 Lưu ý:</p>
          <ul className="list-disc list-inside text-blue-800 space-y-1">
            <li>Để trống ô và bấm Lưu → reset về giá trị mặc định.</li>
            <li>Public page tự revalidate sau khi lưu.</li>
            <li>Ảnh upload qua R2 (max 10MB, JPG/PNG/WebP/GIF/SVG).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
