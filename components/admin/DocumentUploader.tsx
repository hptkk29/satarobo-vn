"use client";

import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import {
  File as FileIcon,
  FileAudio,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Image as ImageIcon,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { detectCategory } from "@/lib/storage/upload-config";

export interface UploadedFile {
  url: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

interface Props {
  value: UploadedFile | null;
  onChange: (file: UploadedFile | null) => void;
  helperText?: string;
  disabled?: boolean;
}

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; progress: number; filename: string }
  | { status: "error"; message: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function getIcon(mime: string) {
  if (mime.startsWith("video/")) return FileVideo;
  if (mime.startsWith("audio/")) return FileAudio;
  if (mime.startsWith("image/")) return ImageIcon;
  if (mime === "application/pdf") return FileText;
  if (mime.includes("presentation") || mime.includes("powerpoint")) return FileText;
  if (mime.includes("sheet") || mime.includes("excel") || mime.includes("csv"))
    return FileSpreadsheet;
  if (mime.includes("word") || mime === "text/plain") return FileText;
  return FileIcon;
}

const ACCEPT = {
  // PDF / Office / text
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
  "text/plain": [".txt"],
  "text/csv": [".csv"],
  // Image
  "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif", ".svg"],
  // Video
  "video/*": [".mp4", ".webm", ".mov", ".avi"],
  // Audio
  "audio/*": [".mp3", ".wav", ".ogg", ".m4a"],
};

interface PresignResponse {
  uploadUrl?: string;
  url?: string;
  publicUrl?: string;
  key?: string;
  error?: string;
}

export function DocumentUploader({
  value,
  onChange,
  helperText,
  disabled = false,
}: Props) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const upload = useCallback(
    async (file: File) => {
      const category = detectCategory(file.type);
      if (!category) {
        setState({
          status: "error",
          message: `MIME type không hỗ trợ: ${file.type || "(không rõ)"}`,
        });
        return;
      }

      try {
        const presignRes = await fetch("/api/admin/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            category,
            filename: file.name,
            mimeType: file.type,
            sizeBytes: file.size,
          }),
        });

        if (!presignRes.ok) {
          const err = (await presignRes.json().catch(() => ({}))) as PresignResponse;
          throw new Error(err.error || "Không lấy được URL upload");
        }

        const data = (await presignRes.json()) as PresignResponse;
        const uploadUrl = data.uploadUrl ?? data.url;
        const publicUrl =
          data.publicUrl ??
          (data.key ? `https://cdn.satarobo.vn/${data.key}` : null);

        if (!uploadUrl || !publicUrl) {
          throw new Error("Server trả về dữ liệu không hợp lệ");
        }

        setState({ status: "uploading", progress: 0, filename: file.name });

        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;

        await new Promise<void>((resolve, reject) => {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const progress = Math.round((e.loaded / e.total) * 100);
              setState({ status: "uploading", progress, filename: file.name });
            }
          });
          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload thất bại: HTTP ${xhr.status}`));
          });
          xhr.addEventListener("error", () =>
            reject(new Error("Lỗi mạng khi upload")),
          );
          xhr.addEventListener("abort", () =>
            reject(new Error("Đã huỷ upload")),
          );
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });

        onChange({
          url: publicUrl,
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type,
        });
        setState({ status: "idle" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Lỗi không xác định";
        setState({ status: "error", message });
      }
    },
    [onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    multiple: false,
    disabled: disabled || state.status === "uploading",
    onDrop: (files) => {
      if (files[0]) upload(files[0]);
    },
    onDropRejected: (rejections) => {
      const reason = rejections[0]?.errors[0]?.code;
      if (reason === "file-too-large") {
        setState({ status: "error", message: "File quá lớn." });
      } else if (reason === "file-invalid-type") {
        setState({ status: "error", message: "Định dạng file không hỗ trợ." });
      } else {
        setState({ status: "error", message: "File không hợp lệ." });
      }
    },
  });

  function handleRemove() {
    if (!value) return;
    if (!confirm("Bỏ file hiện tại? (file vẫn còn trên R2 — cleanup defer)")) {
      return;
    }
    onChange(null);
    setState({ status: "idle" });
  }

  if (value && state.status !== "uploading") {
    const Icon = getIcon(value.mimeType);
    return (
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
        <div className="flex items-start gap-3">
          <Icon className="h-10 w-10 flex-shrink-0 text-blue-500" />
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-medium text-neutral-900">
              {value.fileName}
            </p>
            <p className="mt-0.5 text-xs text-neutral-500">
              {formatBytes(value.fileSize)} · {value.mimeType || "—"}
            </p>
            <a
              href={value.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs font-semibold text-blue-600 hover:underline"
            >
              Mở file ↗
            </a>
          </div>
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled}
            aria-label="Bỏ file"
            className="rounded-md p-1 text-neutral-500 hover:bg-neutral-200 disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {state.status === "error" && (
          <p className="mt-2 text-xs text-red-600">{state.message}</p>
        )}
        {helperText && (
          <p className="mt-2 text-xs text-neutral-500">{helperText}</p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={
          "cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-colors " +
          (isDragActive
            ? "border-[#7C3AED] bg-purple-50"
            : state.status === "uploading"
              ? "border-neutral-300 bg-neutral-50"
              : "border-neutral-300 hover:border-purple-400 hover:bg-purple-50/40")
        }
      >
        <input {...getInputProps()} />
        {state.status === "uploading" ? (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#7C3AED]" />
            <p className="mt-2 text-sm font-medium text-neutral-700">
              Đang tải lên {state.filename}... ({state.progress}%)
            </p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
              <div
                className="h-full bg-[#7C3AED] transition-all"
                style={{ width: `${state.progress}%` }}
              />
            </div>
          </>
        ) : (
          <>
            <Upload className="mx-auto h-8 w-8 text-neutral-400" />
            <p className="mt-2 text-sm font-medium text-neutral-700">
              {isDragActive ? "Thả file vào đây" : "Click hoặc kéo file vào đây"}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              PDF / Office / Video / Audio / Image — giới hạn theo loại file.
            </p>
          </>
        )}
      </div>
      {state.status === "error" && (
        <p className="text-xs text-red-600">{state.message}</p>
      )}
      {helperText && !disabled && state.status !== "error" && (
        <p className="text-xs text-neutral-500">{helperText}</p>
      )}
    </div>
  );
}
