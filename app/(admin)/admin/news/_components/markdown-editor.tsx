"use client";

import {
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  useRef,
  useState,
} from "react";
import { Edit3, Eye, ImageIcon, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";

interface MarkdownEditorProps {
  value: string;
  onChange: (next: string) => void;
  onUploadingChange?: (uploading: boolean) => void;
  /** Hidden input name for form submission */
  name?: string;
  rows?: number;
  placeholder?: string;
}

type UploadResponse = {
  success?: boolean;
  url?: string;
  publicUrl?: string;
  error?: string;
};

const MAX_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function MarkdownEditor({
  value,
  onChange,
  onUploadingChange,
  name,
  rows = 18,
  placeholder = "# Tiêu đề chính\n\nNội dung Markdown...",
}: MarkdownEditorProps) {
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const [isUploading, setIsUploading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  function setUploading(next: boolean) {
    setIsUploading(next);
    onUploadingChange?.(next);
  }

  function insertAtCursor(markdown: string, range?: { start: number; end: number }) {
    const textarea = textareaRef.current;
    const start = range?.start ?? textarea?.selectionStart ?? valueRef.current.length;
    const end = range?.end ?? textarea?.selectionEnd ?? start;
    const before = valueRef.current.slice(0, start);
    const after = valueRef.current.slice(end);
    const insertText = `\n\n${markdown}\n\n`;
    const nextValue = before + insertText + after;

    onChange(nextValue);
    valueRef.current = nextValue;

    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const position = start + insertText.length;
      textareaRef.current.selectionStart = position;
      textareaRef.current.selectionEnd = position;
      textareaRef.current.focus();
    });
  }

  function getImageFromClipboard(event: ClipboardEvent<HTMLTextAreaElement>): File | null {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageItem = items.find((item) => item.type.startsWith("image/"));
    return imageItem?.getAsFile() ?? null;
  }

  function validateImage(file: File): string | null {
    if (!ALLOWED_TYPES.has(file.type)) return "Chỉ hỗ trợ ảnh JPG, PNG, WebP hoặc GIF.";
    if (file.size > MAX_SIZE_BYTES) return "Ảnh quá lớn. Tối đa 5MB.";
    return null;
  }

  async function uploadNewsImage(file: File): Promise<string> {
    const validationError = validateImage(file);
    if (validationError) throw new Error(validationError);

    const formData = new FormData();
    formData.append("file", file);

    const res = await fetch("/api/admin/news/upload-image", {
      method: "POST",
      body: formData,
    });
    const data = (await res.json().catch(() => ({}))) as UploadResponse;
    const url = data.url ?? data.publicUrl;

    if (!res.ok || !url) {
      throw new Error(data.error ?? "Không thể upload ảnh. Vui lòng thử lại.");
    }

    return url;
  }

  async function uploadAndInsert(
    file: File,
    range?: { start: number; end: number },
  ) {
    if (isUploading) return;

    try {
      setUploading(true);
      const url = await uploadNewsImage(file);
      insertAtCursor(`![Ảnh tin tức](${url})`, range);
      toast.success("Đã chèn ảnh vào nội dung");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Không thể upload ảnh. Vui lòng thử lại.";
      toast.error(message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const file = getImageFromClipboard(event);
    if (!file) return;

    event.preventDefault();
    const textarea = event.currentTarget;
    void uploadAndInsert(file, {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });
  }

  function handleDrop(event: DragEvent<HTMLTextAreaElement>) {
    const file = Array.from(event.dataTransfer.files).find((item) =>
      item.type.startsWith("image/"),
    );
    if (!file) return;

    event.preventDefault();
    const textarea = event.currentTarget;
    void uploadAndInsert(file, {
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
    });
  }

  function handleFileSelect(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    void uploadAndInsert(file);
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center border-b border-neutral-200 bg-neutral-50">
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
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="ml-2 inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ImageIcon className="h-4 w-4" />
          )}
          {isUploading ? "Đang tải ảnh..." : "Chèn ảnh"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={handleFileSelect}
        />
        <span className="ml-auto px-4 py-2 text-xs text-neutral-500">
          Có thể nhập Markdown, paste ảnh trực tiếp hoặc bấm Chèn ảnh.
        </span>
      </div>

      <div className="p-4">
        {tab === "edit" ? (
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onDragOver={(event) => event.preventDefault()}
            rows={rows}
            placeholder={placeholder}
            className="w-full resize-y rounded-lg border border-neutral-200 bg-white p-3 font-mono text-sm leading-relaxed outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20"
          />
        ) : (
          <div className="prose prose-sm min-h-[20rem] max-w-none rounded-lg border border-neutral-200 bg-neutral-50 p-4 prose-img:mx-auto prose-img:my-4 prose-img:h-auto prose-img:max-w-full prose-img:rounded-xl">
            {value.trim() ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
            ) : (
              <p className="italic text-neutral-400">
                Preview sẽ hiện ở đây - viết Markdown ở tab Edit.
              </p>
            )}
          </div>
        )}
      </div>

      {/* Hidden input for traditional form submission fallback */}
      {name && <input type="hidden" name={name} value={value} />}
    </div>
  );
}
