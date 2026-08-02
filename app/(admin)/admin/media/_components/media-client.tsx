"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload, Loader2, Check, X, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  uploadClassMedia,
  reviewMedia,
  deleteMedia,
  getClassUploadContext,
} from "../actions";
import { formatDateVN } from "@/lib/format/date";

// QA 20/07 — ảnh seed (seed-placeholder://) hoặc URL hỏng không resolve được →
// hiển thị placeholder thay vì icon ảnh vỡ của trình duyệt.
const FALLBACK_IMG =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#f3f4f6"/><text x="50%" y="50%" font-family="sans-serif" font-size="14" fill="#9ca3af" text-anchor="middle" dominant-baseline="middle">Ảnh không tải được</text></svg>',
  );

function swapToFallback(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.src !== FALLBACK_IMG) img.src = FALLBACK_IMG;
}

/**
 * <img> kèm fallback 2 lớp: onError cho lỗi sau hydration + ref callback bắt ảnh
 * ĐÃ hỏng từ lúc SSR (error event bắn trước khi React gắn handler nên onError
 * một mình không đủ — 12 ảnh seed-placeholder:// vẫn vỡ).
 */
function MediaImg({ src, alt, className }: { src: string; alt: string; className: string }) {
  const checkBroken = (img: HTMLImageElement | null) => {
    if (img && img.complete && img.naturalWidth === 0 && img.src !== FALLBACK_IMG) {
      img.src = FALLBACK_IMG;
    }
  };
  return (
    <img src={src} alt={alt} ref={checkBroken} onError={swapToFallback} className={className} />
  );
}

type Opt = { id: string; label: string };
type SessionOpt = { id: string; label: string; date: string };
type MediaItem = {
  id: string;
  fileUrl: string;
  caption: string | null;
  status: string;
  className: string;
  uploadedByName: string | null;
  tagNames: string[];
  takenAt: string | null;
  hasSession: boolean;
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
  const [nonConsent, setNonConsent] = useState<{ id: string; name: string }[]>([]);
  const [sessions, setSessions] = useState<SessionOpt[]>([]);
  const [sessionId, setSessionId] = useState("");
  const [takenAt, setTakenAt] = useState("");
  const [tagged, setTagged] = useState<string[]>([]);
  const [wholeClass, setWholeClass] = useState(false);
  const [caption, setCaption] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [blocked, setBlocked] = useState(false);
  // QA 20/07 — xoá ảnh phải qua xác nhận (trước đây xoá ngay 1 click, không confirm).
  const [deleteTarget, setDeleteTarget] = useState<MediaItem | null>(null);
  // KHO ẢNH (DRAFT): mặc định thư viện GIỮ NHƯ CŨ (ẩn kho); chọn "Trong kho" để QL
  // nhìn ảnh GV chưa gửi — VIEW-ONLY, không duyệt/xoá (đường rời kho là GV gửi).
  const [statusFilter, setStatusFilter] = useState<"ACTIVE" | "DRAFT">("ACTIVE");
  const visible = items.filter((m) =>
    statusFilter === "DRAFT" ? m.status === "DRAFT" : m.status !== "DRAFT",
  );

  function handleDeleteConfirm() {
    const target = deleteTarget;
    if (!target) return;
    startTransition(async () => {
      const res = await deleteMedia(target.id);
      if (!res.ok) {
        toast.error(res.error ?? "Không xoá được ảnh");
        setDeleteTarget(null);
        return;
      }
      toast.success("Đã xoá ảnh");
      setDeleteTarget(null);
      router.refresh();
    });
  }

  const nonConsentIds = new Set(nonConsent.map((s) => s.id));

  async function onClass(id: string) {
    setClassId(id);
    setTagged([]);
    setWholeClass(false);
    setSessionId("");
    setTakenAt("");
    if (!id) {
      setStudents([]);
      setNonConsent([]);
      setSessions([]);
      setBlocked(false);
      return;
    }
    const ctx = await getClassUploadContext(id);
    setBlocked(!ctx.canUpload);
    setStudents(ctx.students);
    setNonConsent(ctx.nonConsent);
    setSessions(ctx.sessions);
    if (!ctx.canUpload) toast.error("Bạn không phụ trách lớp này");
  }

  function onSession(id: string) {
    setSessionId(id);
    // Mặc định ngày chụp = ngày buổi đã chọn (có thể chỉnh tay).
    const ses = sessions.find((s) => s.id === id);
    if (ses && !takenAt) setTakenAt(ses.date.slice(0, 10));
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
    if (!wholeClass && tagged.length === 0) {
      return toast.error('Gắn thẻ học sinh hoặc chọn "Ảnh chung cả lớp"');
    }
    startTransition(async () => {
      const res = await uploadClassMedia({
        classId,
        fileUrl,
        fileName,
        caption,
        // Ảnh chung cả lớp = đánh dấu isClassWide (không gắn thẻ HS cụ thể).
        isClassWide: wholeClass,
        studentIds: wholeClass ? [] : tagged,
        classSessionId: sessionId || null,
        takenAt: takenAt ? new Date(takenAt).toISOString() : null,
      });
      if (res.ok) {
        toast.success("Đã đăng ảnh");
        setFileUrl("");
        setFileName("");
        setCaption("");
        setTagged([]);
        setWholeClass(false);
        setSessionId("");
        setTakenAt("");
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

          {blocked && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700">
              Bạn không phụ trách lớp này nên không thể đăng ảnh.
            </div>
          )}

          {/* Banner cảnh báo HS chưa đồng ý dùng hình ảnh (consent). */}
          {classId && !blocked && nonConsent.length > 0 && (
            <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-semibold">Học viên CHƯA đồng ý dùng hình ảnh:</p>
                <p className="mt-0.5">{nonConsent.map((s) => s.name).join(", ")}</p>
                <p className="mt-1 text-amber-700">
                  Vui lòng làm mờ thủ công hoặc loại các em này khỏi khung hình. Không
                  thể gắn thẻ các em này.
                </p>
              </div>
            </div>
          )}

          {classId && !blocked && sessions.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              <select
                value={sessionId}
                onChange={(e) => onSession(e.target.value)}
                className={inputCls}
              >
                <option value="">— Buổi học (tuỳ chọn) —</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={takenAt}
                onChange={(e) => setTakenAt(e.target.value)}
                className={inputCls}
                aria-label="Ngày chụp"
              />
            </div>
          )}

          {fileUrl ? (
            <MediaImg
              src={fileUrl}
              alt="preview"
              className="h-40 w-full rounded-lg object-cover"
            />
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
            <div className="space-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-700">
                <input
                  type="checkbox"
                  checked={wholeClass}
                  onChange={(e) => {
                    setWholeClass(e.target.checked);
                    if (e.target.checked) setTagged([]);
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-orange-500 focus:ring-orange-400"
                />
                Ảnh chung cả lớp (mọi phụ huynh trong lớp đều xem được)
              </label>

              {!wholeClass && (
                <div>
                  <p className="mb-1 text-xs font-medium text-gray-500">
                    Gắn thẻ học sinh (chỉ phụ huynh được gắn thẻ mới thấy ảnh)
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {students.map((s) => {
                      const on = tagged.includes(s.id);
                      const noConsent = nonConsentIds.has(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          disabled={noConsent}
                          title={noConsent ? "Chưa đồng ý dùng hình ảnh" : undefined}
                          onClick={() =>
                            setTagged((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id]))
                          }
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                            noConsent
                              ? "cursor-not-allowed bg-gray-100 text-gray-300 line-through"
                              : on
                                ? "bg-orange-500 text-white"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={pending || uploading || blocked}
            className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            Đăng ảnh
          </button>
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-gray-700">
            Thư viện ({visible.length})
          </h2>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "ACTIVE" | "DRAFT")}
            className="rounded-lg border border-gray-300 px-2 py-1 text-xs focus:border-orange-400 focus:outline-none"
            aria-label="Lọc trạng thái ảnh"
          >
            <option value="ACTIVE">Chờ duyệt / Đã duyệt / Từ chối</option>
            <option value="DRAFT">Trong kho (GV chưa gửi)</option>
          </select>
        </div>
        {statusFilter === "DRAFT" && visible.length > 0 && (
          <p className="mb-2 rounded-lg bg-sky-50 p-2 text-xs text-sky-700">
            Ảnh trong kho do giáo viên tải lên, CHƯA gửi phụ huynh — chỉ xem. Khi giáo
            viên gửi, ảnh sẽ vào hàng chờ duyệt.
          </p>
        )}
        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {statusFilter === "DRAFT" ? "Kho trống." : "Chưa có ảnh."}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {visible.map((m) => (
              <div key={m.id} className="overflow-hidden rounded-lg border border-gray-100">
                <MediaImg
                  src={m.fileUrl}
                  alt={m.caption ?? ""}
                  className="h-28 w-full object-cover"
                />
                <div className="p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">{m.className}</span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        m.status === "APPROVED"
                          ? "bg-emerald-100 text-emerald-700"
                          : m.status === "REJECTED"
                            ? "bg-rose-100 text-rose-700"
                            : m.status === "DRAFT"
                              ? "bg-sky-100 text-sky-700"
                              : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {m.status === "APPROVED"
                        ? "Duyệt"
                        : m.status === "REJECTED"
                          ? "Từ chối"
                          : m.status === "DRAFT"
                            ? "Trong kho"
                            : "Chờ"}
                    </span>
                  </div>
                  {m.takenAt && (
                    <p className="mt-0.5 text-[10px] text-gray-400">
                      Buổi {formatDateVN(m.takenAt)}
                    </p>
                  )}
                  {m.caption && <p className="mt-1 line-clamp-2 text-xs text-gray-600">{m.caption}</p>}
                  {m.tagNames.length > 0 && (
                    <p className="mt-0.5 text-[10px] text-gray-400">Tag: {m.tagNames.join(", ")}</p>
                  )}
                  {/* DRAFT = view-only với QL: không duyệt/từ chối/xoá (server cũng chặn reviewMedia DRAFT) */}
                  {canApprove && m.status !== "DRAFT" && (
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
                        onClick={() => setDeleteTarget(m)}
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

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => {
          if (!o) setDeleteTarget(null);
        }}
        pending={pending}
        title="Xoá ảnh này?"
        description={
          deleteTarget ? (
            <>
              Ảnh của lớp <strong>{deleteTarget.className}</strong>
              {deleteTarget.caption ? ` — "${deleteTarget.caption}"` : ""} sẽ bị xoá
              vĩnh viễn (phụ huynh cũng không còn thấy). Hành động không thể hoàn tác.
            </>
          ) : undefined
        }
        confirmLabel="Xoá ảnh"
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
}
