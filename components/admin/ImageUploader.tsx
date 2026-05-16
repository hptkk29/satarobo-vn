"use client";

import { useState, useRef, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, X, Image as ImageIcon, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

const MAX_SIZE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export interface ImageUploaderProps {
  value?: string | null;
  onChange: (url: string | null) => void;
  prefix?: string;
  aspect?: "square" | "video" | "free";
  disabled?: boolean;
  required?: boolean;
  label?: string;
  helperText?: string;
}

type UploadState =
  | { status: "idle" }
  | { status: "uploading"; progress: number; filename: string }
  | { status: "error"; message: string };

interface PresignResponse {
  uploadUrl?: string;
  url?: string;
  publicUrl?: string;
  key?: string;
  error?: string;
}

export function ImageUploader({
  value,
  onChange,
  prefix = "uploads/images",
  aspect = "square",
  disabled = false,
  required = false,
  label,
  helperText,
}: ImageUploaderProps) {
  const [state, setState] = useState<UploadState>({ status: "idle" });
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const upload = useCallback(
    async (file: File) => {
      if (!file.type.startsWith("image/")) {
        setState({ status: "error", message: "File phải là ảnh (JPG/PNG/WebP/GIF)" });
        return;
      }
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setState({ status: "error", message: `Định dạng ${file.type} không hỗ trợ.` });
        return;
      }
      if (file.size > MAX_SIZE_BYTES) {
        const sizeMB = (file.size / 1024 / 1024).toFixed(1);
        setState({
          status: "error",
          message: `File quá lớn. Tối đa 10MB. File của bạn: ${sizeMB}MB`,
        });
        return;
      }

      try {
        const presignRes = await fetch("/api/admin/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            contentLength: file.size,
            prefix,
            mimeType: file.type,
            sizeBytes: file.size,
            category: "image",
          }),
        });

        if (!presignRes.ok) {
          const err = (await presignRes.json().catch(() => ({}))) as PresignResponse;
          throw new Error(err.error || "Không lấy được URL upload");
        }

        const data = (await presignRes.json()) as PresignResponse;
        const uploadUrl = data.uploadUrl ?? data.url;
        const publicUrl =
          data.publicUrl ?? (data.key ? `https://cdn.satarobo.vn/${data.key}` : null);

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
          xhr.addEventListener("error", () => reject(new Error("Lỗi mạng khi upload")));
          xhr.addEventListener("abort", () => reject(new Error("Đã huỷ upload")));
          xhr.open("PUT", uploadUrl);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.send(file);
        });

        onChange(publicUrl);
        setState({ status: "idle" });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Lỗi không xác định";
        setState({ status: "error", message });
      }
    },
    [prefix, onChange],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [".jpg", ".jpeg", ".png", ".webp", ".gif"] },
    maxFiles: 1,
    maxSize: MAX_SIZE_BYTES,
    multiple: false,
    disabled: disabled || state.status === "uploading",
    onDrop: (files) => {
      if (files[0]) upload(files[0]);
    },
    onDropRejected: (rejections) => {
      const reason = rejections[0]?.errors[0]?.code;
      if (reason === "file-too-large") {
        setState({ status: "error", message: "File quá lớn. Tối đa 10MB." });
      } else if (reason === "file-invalid-type") {
        setState({ status: "error", message: "File phải là ảnh." });
      } else {
        setState({ status: "error", message: "File không hợp lệ." });
      }
    },
  });

  const handleRemove = async () => {
    if (!value || !confirm("Xoá ảnh hiện tại?")) return;
    try {
      await fetch("/api/admin/upload-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: value }),
      });
    } catch {
      // ignore — still clear local value
    }
    onChange(null);
    setState({ status: "idle" });
  };

  const handleCancel = () => {
    xhrRef.current?.abort();
    setState({ status: "idle" });
  };

  const aspectClass = {
    square: "aspect-square",
    video: "aspect-video",
    free: "min-h-[200px]",
  }[aspect];

  return (
    <div className="space-y-2">
      {label && (
        <label className="text-sm font-medium">
          {label}
          {required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}

      {value && state.status === "idle" && (
        <div className="relative inline-block group">
          <img
            src={value}
            alt="Preview"
            className={cn(
              "rounded-lg border object-cover max-w-[300px]",
              aspectClass,
            )}
          />
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors rounded-lg flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
            <Button type="button" variant="secondary" size="sm" {...getRootProps()}>
              <Upload className="h-4 w-4 mr-1" />
              Đổi
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={handleRemove}>
              <X className="h-4 w-4 mr-1" />
              Xoá
            </Button>
          </div>
          <input {...getInputProps()} />
        </div>
      )}

      {!value && state.status === "idle" && (
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
            isDragActive ? "border-primary bg-primary/5" : "border-gray-300 hover:border-gray-400",
            disabled && "opacity-50 cursor-not-allowed",
          )}
        >
          <input {...getInputProps()} />
          <ImageIcon className="h-10 w-10 mx-auto text-gray-400 mb-2" />
          <p className="text-sm font-medium">
            {isDragActive ? "Thả ảnh vào đây..." : "Kéo thả ảnh hoặc click để chọn"}
          </p>
          <p className="text-xs text-gray-500 mt-1">JPG, PNG, WebP, GIF — tối đa 10MB</p>
        </div>
      )}

      {state.status === "uploading" && (
        <div className="border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm flex-1 truncate">{state.filename}</span>
            <Button type="button" variant="ghost" size="sm" onClick={handleCancel}>
              Huỷ
            </Button>
          </div>
          <Progress value={state.progress} />
          <p className="text-xs text-gray-500 text-right">{state.progress}%</p>
        </div>
      )}

      {state.status === "error" && (
        <div className="border-2 border-red-300 bg-red-50 rounded-lg p-4 flex items-start gap-2">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700">{state.message}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setState({ status: "idle" })}
            >
              Thử lại
            </Button>
          </div>
        </div>
      )}

      {helperText && state.status === "idle" && (
        <p className="text-xs text-gray-500">{helperText}</p>
      )}
    </div>
  );
}
