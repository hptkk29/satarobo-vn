"use client";

import { useState, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { detectCategory, validateFile } from "@/lib/storage/upload-config";
import { submitAssignment } from "../../actions";

type Uploaded = { url: string; name: string; size: number; mime: string };

export function SubmitForm({
  assignmentId,
  allowText,
  allowFile,
  initialText,
  initialFileUrl,
  initialFileName,
  graded,
}: {
  assignmentId: string;
  allowText: boolean;
  allowFile: boolean;
  initialText: string | null;
  initialFileUrl: string | null;
  initialFileName: string | null;
  graded: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initialText ?? "");
  const [file, setFile] = useState<Uploaded | null>(
    initialFileUrl
      ? { url: initialFileUrl, name: initialFileName ?? "Tệp đã nộp", size: 0, mime: "" }
      : null,
  );
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (inputRef.current) inputRef.current.value = "";
    if (!f) return;

    const category = detectCategory(f.type);
    if (!category || (category !== "image" && category !== "document")) {
      toast.error("Chỉ nộp được ảnh hoặc tài liệu (PDF/Word…)");
      return;
    }
    const err = validateFile(category, f.name, f.type, f.size);
    if (err) {
      toast.error(err);
      return;
    }

    setUploading(true);
    try {
      const signRes = await fetch("/api/portal/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          filename: f.name,
          mimeType: f.type,
          sizeBytes: f.size,
        }),
      });
      if (!signRes.ok) {
        const d = (await signRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error || "Không tạo được link tải lên");
      }
      const { uploadUrl, publicUrl } = (await signRes.json()) as {
        uploadUrl: string;
        publicUrl: string;
      };
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": f.type },
        body: f,
      });
      if (!put.ok) throw new Error("Tải file lên thất bại");
      setFile({ url: publicUrl, name: f.name, size: f.size, mime: f.type });
      toast.success("Đã tải file lên");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi tải lên");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (allowText && !text.trim() && !file) {
      toast.error("Nhập nội dung hoặc đính kèm file");
      return;
    }
    if (!allowText && !file) {
      toast.error("Vui lòng đính kèm file bài làm");
      return;
    }
    startTransition(async () => {
      const res = await submitAssignment({
        assignmentId,
        textAnswer: allowText ? text : null,
        fileUrl: file?.url ?? null,
        fileName: file?.name ?? null,
        fileSize: file?.size || null,
        mimeType: file?.mime || null,
      });
      if (res.ok) {
        toast.success(res.status === "LATE" ? "Đã nộp (trễ hạn)" : "Đã nộp bài");
        router.refresh();
      } else {
        toast.error(res.error ?? "Nộp bài thất bại");
      }
    });
  }

  if (graded) {
    return (
      <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">
        Bài đã được chấm — không thể nộp lại.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {allowText && (
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          placeholder="Nhập câu trả lời / mô tả bài làm…"
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none"
        />
      )}

      {allowFile && (
        <div>
          {file ? (
            <div className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5 text-sm">
              <FileText className="h-4 w-4 text-neutral-500" />
              <a
                href={file.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate text-neutral-700 hover:underline"
              >
                {file.name}
              </a>
              <button
                type="button"
                onClick={() => setFile(null)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-300 p-4 text-sm text-neutral-500 hover:border-orange-400 hover:bg-orange-50 disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploading ? "Đang tải lên…" : "Đính kèm ảnh / tài liệu"}
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            onChange={onPick}
            className="hidden"
          />
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending || uploading}
        className="rounded-lg bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
      >
        {pending ? "Đang nộp…" : "Nộp bài"}
      </button>
    </div>
  );
}
