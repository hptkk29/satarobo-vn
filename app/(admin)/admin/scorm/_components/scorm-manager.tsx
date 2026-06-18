"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, CheckCircle2, Archive, Star, Play, GraduationCap } from "lucide-react";
import {
  createScormPackage,
  confirmUpload,
  publishScorm,
  activateForLesson,
  archiveScorm,
} from "../_actions";

export type LessonOption = { id: string; label: string };

export type PackageRow = {
  id: string;
  name: string;
  status: "UPLOADING" | "PROCESSING" | "FAILED" | "TESTING" | "PUBLISHED" | "ARCHIVED";
  version: number;
  scormVersion: "SCORM_12" | "SCORM_2004" | null;
  isActiveForLesson: boolean;
  sizeBytes: number | null;
  fileCount: number | null;
  error: string | null;
  lessonId: string;
  lessonLabel: string;
  /** Số GV đã mở/giảng gói (delivery tracking — KHÔNG liên quan HV). */
  deliveredTeacherCount: number;
  /** Nhãn trạng thái giảng gần nhất (VI) — null nếu chưa GV nào mở. */
  deliveryStatusLabel: string | null;
};

const STATUS_STYLE: Record<PackageRow["status"], string> = {
  UPLOADING: "bg-sky-100 text-sky-700",
  PROCESSING: "bg-indigo-100 text-indigo-700",
  FAILED: "bg-rose-100 text-rose-700",
  TESTING: "bg-amber-100 text-amber-700",
  PUBLISHED: "bg-emerald-100 text-emerald-700",
  ARCHIVED: "bg-gray-100 text-gray-500",
};

function fmtSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Upload zip qua presigned PUT với progress (XHR). Reject khi lỗi mạng/HTTP. */
function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/zip");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Upload thất bại (HTTP ${xhr.status})`));
    xhr.onerror = () => reject(new Error("Lỗi mạng khi upload"));
    xhr.send(file);
  });
}

export function ScormManager({
  packages,
  lessons,
}: {
  packages: PackageRow[];
  lessons: LessonOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const [lessonId, setLessonId] = useState("");
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const groups = useMemo(() => {
    const m = new Map<string, { label: string; rows: PackageRow[] }>();
    for (const p of packages) {
      const g = m.get(p.lessonId) ?? { label: p.lessonLabel, rows: [] };
      g.rows.push(p);
      m.set(p.lessonId, g);
    }
    return Array.from(m.values());
  }, [packages]);

  async function handleUpload() {
    if (!lessonId) return toast.error("Chọn buổi học");
    if (!name.trim()) return toast.error("Nhập tên gói");
    if (!file) return toast.error("Chọn tệp .zip");

    setUploading(true);
    setProgress(0);
    try {
      const created = await createScormPackage({
        lessonId,
        name: name.trim(),
        fileName: file.name,
        mimeType: file.type || "application/zip",
        sizeBytes: file.size,
      });
      if (!created.ok) {
        toast.error(created.error);
        return;
      }
      await putWithProgress(created.data!.uploadUrl, file, setProgress);
      const confirmed = await confirmUpload(created.data!.id);
      if (!confirmed.ok) {
        toast.error(confirmed.error);
        return;
      }
      toast.success("Đã tải lên — đang giải nén & đọc manifest");
      setName("");
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Lỗi upload");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function act(fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  function onActivate(p: PackageRow, hasActiveOther: boolean) {
    let reason: string | undefined;
    if (hasActiveOther) {
      const r = window.prompt("Đổi bản đang dùng của buổi — nhập lý do:");
      if (r === null) return; // huỷ
      if (!r.trim()) return toast.error("Cần nêu lý do");
      reason = r.trim();
    }
    act(() => activateForLesson(p.id, reason), "Đã đặt làm bản đang dùng");
  }

  return (
    <div className="space-y-6">
      {/* Upload */}
      <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Tải gói SCORM</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <select
            value={lessonId}
            onChange={(e) => setLessonId(e.target.value)}
            disabled={uploading}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">— Chọn buổi học —</option>
            {lessons.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tên gói (vd: Bài 1 — Robot cơ bản)"
            disabled={uploading}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <input
          ref={fileRef}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          disabled={uploading}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-orange-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-orange-600"
        />

        {uploading && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-orange-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">Đang tải lên… {progress}%</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
        >
          <UploadCloud className="h-4 w-4" /> {uploading ? "Đang xử lý…" : "Tải lên"}
        </button>
      </section>

      {/* Danh sách theo buổi */}
      {groups.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          Chưa có gói SCORM nào.
        </p>
      ) : (
        groups.map((g) => {
          const hasActive = g.rows.some((r) => r.isActiveForLesson);
          return (
            <section key={g.label} className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">{g.label}</h3>
              <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
                <ul className="divide-y divide-gray-100">
                  {g.rows.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{p.name}</span>
                          <span className="text-xs text-gray-400">v{p.version}</span>
                          {p.isActiveForLesson && (
                            <span className="inline-flex items-center gap-1 rounded bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-orange-700">
                              <Star className="h-3 w-3" /> Đang dùng
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                          <span className={`rounded px-1.5 py-0.5 ${STATUS_STYLE[p.status]}`}>
                            {p.status}
                          </span>
                          {p.scormVersion && <span>{p.scormVersion.replace("_", " ")}</span>}
                          <span>· {fmtSize(p.sizeBytes)}</span>
                          {p.fileCount != null && <span>· {p.fileCount} tệp</span>}
                          {p.deliveredTeacherCount > 0 && (
                            <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 font-medium text-violet-700">
                              <GraduationCap className="h-3 w-3" /> Đã giảng:{" "}
                              {p.deliveredTeacherCount} GV
                              {p.deliveryStatusLabel ? ` · ${p.deliveryStatusLabel}` : ""}
                            </span>
                          )}
                          {p.status === "FAILED" && p.error && (
                            <span className="text-rose-600">· {p.error}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {p.status === "TESTING" && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => act(() => publishScorm(p.id), "Đã phát hành")}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-200 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" /> Phát hành
                          </button>
                        )}
                        {p.status === "PUBLISHED" && !p.isActiveForLesson && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => onActivate(p, hasActive)}
                            className="inline-flex items-center gap-1 rounded-md border border-orange-200 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-60"
                          >
                            <Play className="h-3.5 w-3.5" /> Đặt đang dùng
                          </button>
                        )}
                        {p.status !== "ARCHIVED" && (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => act(() => archiveScorm(p.id), "Đã lưu trữ")}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
                          >
                            <Archive className="h-3.5 w-3.5" /> Lưu trữ
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
