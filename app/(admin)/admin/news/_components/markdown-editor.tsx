"use client";

import { useState } from "react";
import { Edit3, Eye } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  /** Hidden input name for form submission */
  name?: string;
  rows?: number;
  placeholder?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  name,
  rows = 18,
  placeholder = "# Tiêu đề chính\n\nNội dung Markdown...",
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex border-b border-neutral-200 bg-neutral-50">
        <button
          type="button"
          onClick={() => setTab("edit")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition ${
            tab === "edit"
              ? "bg-white text-orange-600 border-b-2 border-orange-500 -mb-px"
              : "text-neutral-600 hover:text-neutral-900"
          }`}
        >
          <Edit3 className="h-4 w-4" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => setTab("preview")}
          className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition ${
            tab === "preview"
              ? "bg-white text-orange-600 border-b-2 border-orange-500 -mb-px"
              : "text-neutral-600 hover:text-neutral-900"
          }`}
        >
          <Eye className="h-4 w-4" />
          Preview
        </button>
        <span className="ml-auto px-4 py-2 text-xs text-neutral-400">
          Hỗ trợ Markdown (GFM) — heading, list, table, bold, link
        </span>
      </div>

      <div className="p-4">
        {tab === "edit" ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            rows={rows}
            placeholder={placeholder}
            className="w-full rounded-lg border border-neutral-200 bg-white p-3 font-mono text-sm leading-relaxed outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 resize-y"
          />
        ) : (
          <div className="prose prose-sm max-w-none min-h-[20rem] rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            {value.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            ) : (
              <p className="italic text-neutral-400">Preview sẽ hiện ở đây — viết Markdown ở tab Edit.</p>
            )}
          </div>
        )}
      </div>

      {/* Hidden input for traditional form submission fallback */}
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}
