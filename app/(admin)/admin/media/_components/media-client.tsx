"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, Check, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  uploadClassMedia,
  reviewMedia,
  deleteMedia,
  getClassStudentsForTag,
} from "../actions";

type Opt = { id: string; label: string };
type MediaItem = {
  id: string;
  fileUrl: string;
  caption: string | null;
  status: string;
  className: string;
  uploadedByName: string | null;
  tagNames: string[];
  createdAt: string;
};

const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-orange-400 focus:outline-none";

export function MediaClient({
  items,
  classes,
  canApprove,
}: {
  items: MediaItem[];
  classes: Opt[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [classId, setClassId] = useState("");
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [tagged, setTagged] = useState<string[]>([]);
  const [caption, setCaption] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);

  async function onClass(id: string) {
    setClassId(id);
    setTagged([]);
    if (!id) return setStudents([]);
    setStudents(await getClassStudentsForTag(id));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) return toast.error("Chỉ chọn ảnh");
    setUploading(true);
    try {
      const sign = await fetch("/api/admin/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "image",
          filename: f.name,
          mimeType: f.type,
          sizeBytes: f.size,
        }),
      });
      if (!sign.ok) throw new Error("Không ký được URL");
      const { uploadUrl, publicUrl } = (await sign.json()) as {
        uploadUrl: string;
        publicUrl: string;
      };
      const put = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": f.type },
        body: f,
      });
      if (!put.ok) throw new Error("Tải ảnh thất bại");
      setFileUrl(publicUrl);
      setFileName(f.name);
      toast.success("Đã tải ảnh");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi tải ảnh");
    } finally {
      setUploading(false);
    }
  }

  function submit() {
    if (!classId) return toast.error("Chọn lớp");
    if (!fileUrl) return toast.error("Tải ảnh trước");
    startTransition(async () => {
      const res = await uploadClassMedia({
        classId,
        fileUrl,
        fileName,
        caption,
        studentIds: tagged,
      });
      if (res.ok) {
        toast.success("Đã đăng ảnh");
        setFileUrl("");
        setFileName("");
        setCaption("");
        setTagged([]);
        router.refresh();
      } else toast.error(res.error ?? "Lỗi");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-700">
          Đăng ảnh lớp
        </h2>
        <div className="space-y-3">
          <select value={classId} onChange={(e) => onClass(e.target.value)} className={inputCls}>
            <option value="">— Chọn lớp —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>

          {fileUrl ? (
            <img src={fileUrl} alt="preview" className="h-40 w-full rounded-lg object-cover" />
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-6 text-sm text-gray-500 hover:bg-gray-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {uploading ? "Đang tải…" : "Chọn ảnh"}
              <input type="file" accept="image/*" onChange={onFile} className="hidden" />
            </label>
          )}

          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            rows={2}
            placeholder="Chú thích (tuỳ chọn)"
            className={inputCls}
          />

          {students.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">
                Gắn thẻ học sinh (phụ huynh được tag mới thấy ảnh)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {students.map((s) => {
                  const on = tagged.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        setTagged((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))
                      }
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                        on ? "bg-orange-500 text-white" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={pending || uploading}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            Đăng ảnh
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-700">
          Thư viện ({items.length})
        </h2>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">Chưa có ảnh.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((m) => (
              <div key={m.id} className="overflow-hidden rounded-lg border border-gray-100">
                <img src={m.fileUrl} alt={m.caption ?? ""} className="h-28 w-full object-cover" />
                <div className="p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">{m.className}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        m.status === "APPROVED"
                          ? "bg-emerald-100 text-emerald-700"
                          : m.status === "REJECTED"
                            ? "bg-rose-100 text-rose-700"
                            : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {m.status === "APPROVED" ? "Duyệt" : m.status === "REJECTED" ? "Từ chối" : "Chờ"}
                    </span>
                  </div>
                  {m.caption && <p className="mt-1 line-clamp-2 text-xs text-gray-600">{m.caption}</p>}
                  {m.tagNames.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-gray-400">Tag: {m.tagNames.join(", ")}</p>
                  )}
                  {canApprove && (
                    <div className="mt-1.5 flex gap-2">
                      {m.status !== "APPROVED" && (
                        <button
                          type="button"
                          onClick={() =>
                            startTransition(async () => {
                              await reviewMedia({ id: m.id, decision: "APPROVED" });
                              router.refresh();
                            })
                          }
                          className="text-emerald-600 hover:text-emerald-700"
                          aria-label="Duyệt"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                      )}
                      {m.status !== "REJECTED" && (
                        <button
                          type="button"
                          onClick={() =>
                            startTransition(async () => {
                              await reviewMedia({ id: m.id, decision: "REJECTED" });
                              router.refresh();
                            })
                          }
                          className="text-amber-600 hover:text-amber-700"
                          aria-label="Từ chối"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          startTransition(async () => {
                            await deleteMedia(m.id);
                            router.refresh();
                          })
                        }
                        className="text-rose-600 hover:text-rose-700"
                        aria-label="Xoá"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
