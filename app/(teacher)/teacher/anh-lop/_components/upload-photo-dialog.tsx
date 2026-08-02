// app/(teacher)/teacher/anh-lop/_components/upload-photo-dialog.tsx — #06 (L6) + KHO ẢNH.
//
// Dialog "Đăng ảnh lớp" — TÁI DÙNG NGUYÊN action admin (app/(admin)/admin/media/
// actions.ts), KHÔNG viết luật consent mới (bất biến C6.2/C6.3). 2 chế độ:
// • "Đưa vào kho" (MẶC ĐỊNH, nhiều ảnh): presign+PUT từng file (concurrency 3,
//   tiến độ x/y, file hỏng báo tên rồi TIẾP TỤC) → uploadClassMediaBatch tạo lô
//   DRAFT (không tag, không hiện portal). Buổi + ngày chụp chọn 1 lần cho cả lô.
//   Gửi PH sau ở khu "Kho ảnh" của trang Ảnh lớp (publishClassMediaAction).
// • "Đăng ngay 1 ảnh" (flow cũ): uploadClassMedia — tag/class-wide ngay, server
//   reject tag HS chưa GRANTED consent (C6.3); GV không có media:approve → PENDING.
// • Presign qua /api/admin/upload-url (TEACHER ∈ allowedRoles của route; path
//   /api/* chạy trên mọi host nên dùng được từ host giaovien) → PUT thẳng lên R2.
// ⚠️ Câu 46: context/payload chỉ chứa TÊN học viên — không SĐT/email/contact PH.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ImagePlus, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getClassUploadContext,
  uploadClassMedia,
  uploadClassMediaBatch,
  type ClassUploadContext,
} from "@/app/(admin)/admin/media/actions";

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-orange-400 focus:outline-none disabled:opacity-50";

// Trần 1 lô — khớp DRAFT_BATCH_MAX server (lib/lms/media-publish.ts); không import
// từ file "use server" (chỉ async function được export qua ranh giới đó).
const BATCH_MAX = 40;

type UploadedFile = { fileUrl: string; fileName: string };

/** Presign qua /api/admin/upload-url → PUT thẳng R2. Ném lỗi khi 1 bước fail. */
async function presignAndPut(f: File): Promise<UploadedFile> {
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
  const put = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": f.type }, body: f });
  if (!put.ok) throw new Error("Tải ảnh thất bại");
  return { fileUrl: publicUrl, fileName: f.name };
}

export function UploadPhotoDialog({
  classId,
  // Preselect (dùng ở phiếu nhận xét buổi: "Tải ảnh" 1 HV cho đúng buổi). compact =
  // nút nhỏ nhãn "Tải ảnh" thay "Đăng ảnh lớp".
  initialSessionId,
  initialTagged,
  compact = false,
}: {
  classId: string;
  initialSessionId?: string;
  initialTagged?: string[];
  compact?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  // Bối cảnh upload từ action admin — null = chưa tải (tải lười khi mở dialog).
  const [ctx, setCtx] = useState<ClassUploadContext | null>(null);
  const [loadingCtx, setLoadingCtx] = useState(false);

  // "Tải ảnh" từ phiếu nhận xét preselect tag 1 HV → flow cũ; còn lại mặc định KHO.
  const [mode, setMode] = useState<"batch" | "single">(
    initialTagged && initialTagged.length > 0 ? "single" : "batch",
  );

  const [sessionId, setSessionId] = useState(initialSessionId ?? "");
  const [takenAt, setTakenAt] = useState("");
  const [caption, setCaption] = useState("");
  // Single (flow cũ): 1 ảnh + tag/class-wide.
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [tagged, setTagged] = useState<string[]>(initialTagged ?? []);
  const [wholeClass, setWholeClass] = useState(false);
  // Batch (kho): danh sách file đã PUT xong + tiến độ đang tải.
  const [batchFiles, setBatchFiles] = useState<UploadedFile[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const uploading = progress !== null;

  const nonConsentIds = new Set((ctx?.nonConsent ?? []).map((s) => s.id));
  // Server nói không được đăng (không phụ trách / lớp ngoài tầm nhìn) → khoá form.
  const blocked = ctx !== null && !ctx.canUpload;

  async function loadContext() {
    setLoadingCtx(true);
    try {
      const c = await getClassUploadContext(classId);
      setCtx(c);
      if (!c.canUpload) toast.error("Bạn không thể đăng ảnh cho lớp này");
    } catch {
      toast.error("Không tải được thông tin lớp — thử lại");
    } finally {
      setLoadingCtx(false);
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && ctx === null && !loadingCtx) void loadContext();
  }

  function onSession(id: string) {
    setSessionId(id);
    // Mặc định ngày chụp = ngày buổi đã chọn (chỉnh tay được) — mirror media-client.
    const ses = ctx?.sessions.find((s) => s.id === id);
    if (ses && !takenAt) setTakenAt(ses.date.slice(0, 10));
  }

  // Chọn file: batch = nhiều file, concurrency 3, file hỏng báo tên và TIẾP TỤC;
  // single = 1 file như flow cũ.
  async function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files ? [...e.target.files] : [];
    if (e.target) e.target.value = "";
    if (list.length === 0) return;
    // Đang tải lô → chặn lượt chọn mới (input hidden trong label vẫn bấm được dù
    // nút submit đã khoá): 2 lượt chồng nhau làm vượt trần lô + cờ uploading của
    // lượt trước tắt sớm + ảnh "ma" chen vào sau khi reset form (review 02/08).
    if (uploading) {
      toast.error("Đang tải lô ảnh — chờ xong rồi chọn thêm");
      return;
    }

    const images = list.filter((f) => f.type.startsWith("image/"));
    if (images.length < list.length) toast.error("Bỏ qua file không phải ảnh");
    if (images.length === 0) return;

    if (mode === "single") {
      const f = images[0]!;
      setProgress({ done: 0, total: 1 });
      try {
        const up = await presignAndPut(f);
        setFileUrl(up.fileUrl);
        setFileName(up.fileName);
        toast.success("Đã tải ảnh");
      } catch (err) {
        toast.error(err instanceof Error ? `${f.name}: ${err.message}` : "Lỗi tải ảnh");
      } finally {
        setProgress(null);
      }
      return;
    }

    const room = BATCH_MAX - batchFiles.length;
    if (room <= 0) {
      toast.error(`Tối đa ${BATCH_MAX} ảnh mỗi lô — gửi lô này trước rồi tải tiếp`);
      return;
    }
    const queue = images.slice(0, room);
    if (queue.length < images.length) {
      toast.error(`Chỉ nhận thêm ${room} ảnh (tối đa ${BATCH_MAX}/lô)`);
    }

    setProgress({ done: 0, total: queue.length });
    const okFiles: UploadedFile[] = [];
    const failed: string[] = [];
    let next = 0;
    // Worker pool concurrency 3 — không bắn 40 PUT cùng lúc (mạng lớp học yếu).
    const worker = async () => {
      while (next < queue.length) {
        const f = queue[next++]!;
        try {
          okFiles.push(await presignAndPut(f));
        } catch {
          failed.push(f.name);
        } finally {
          setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, queue.length) }, () => worker()));
    setProgress(null);
    if (okFiles.length > 0) setBatchFiles((prev) => [...prev, ...okFiles]);
    if (failed.length > 0) {
      toast.error(`Không tải được ${failed.length} ảnh: ${failed.join(", ")}`);
    }
    if (okFiles.length > 0) toast.success(`Đã tải ${okFiles.length} ảnh`);
  }

  function resetForm() {
    setSessionId(initialSessionId ?? "");
    setTakenAt("");
    setCaption("");
    setFileUrl("");
    setFileName("");
    setTagged(initialTagged ?? []);
    setWholeClass(false);
    setBatchFiles([]);
  }

  // Gửi lô vào KHO (DRAFT) — buổi + ngày chụp áp cho cả lô; tag chọn sau ở Kho ảnh.
  function submitBatch() {
    if (batchFiles.length === 0) {
      toast.error("Tải ảnh trước");
      return;
    }
    startTransition(async () => {
      const res = await uploadClassMediaBatch({
        classId,
        files: batchFiles,
        classSessionId: sessionId || null,
        takenAt: takenAt ? new Date(takenAt).toISOString() : null,
      });
      if (res.ok) {
        toast.success(
          `Đã đưa ${res.count ?? batchFiles.length} ảnh vào kho — vào "Kho ảnh" chọn ảnh gửi phụ huynh`,
        );
        resetForm();
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi đưa ảnh vào kho");
      }
    });
  }

  // Flow cũ: đăng ngay 1 ảnh có tag/class-wide (PENDING chờ duyệt).
  function submitSingle() {
    if (!fileUrl) {
      toast.error("Tải ảnh trước");
      return;
    }
    if (!wholeClass && tagged.length === 0) {
      toast.error('Gắn thẻ học viên hoặc chọn "Ảnh chung cả lớp"');
      return;
    }
    startTransition(async () => {
      const res = await uploadClassMedia({
        classId,
        fileUrl,
        fileName,
        caption,
        // Ảnh chung cả lớp = isClassWide (không gắn thẻ HS cụ thể) — như admin.
        isClassWide: wholeClass,
        studentIds: wholeClass ? [] : tagged,
        classSessionId: sessionId || null,
        takenAt: takenAt ? new Date(takenAt).toISOString() : null,
      });
      if (res.ok) {
        toast.success("Đã đăng ảnh — chờ quản lý duyệt");
        resetForm();
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi đăng ảnh");
      }
    });
  }

  return (
    <>
      {/* Dialog controlled (open/onOpenChange) theo pattern site GV — không DialogTrigger */}
      <Button
        onClick={() => onOpenChange(true)}
        size={compact ? "sm" : "default"}
        variant={compact ? "outline" : "default"}
      >
        <ImagePlus className={compact ? "mr-1 h-3.5 w-3.5" : "mr-1.5 h-4 w-4"} aria-hidden />
        {compact ? "Tải ảnh" : "Đăng ảnh lớp"}
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Đăng ảnh lớp</DialogTitle>
            <DialogDescription>
              {mode === "batch"
                ? "Ảnh vào KHO (chưa gửi phụ huynh) — sau đó bạn chọn ảnh, gắn thẻ học viên và gửi ở khu Kho ảnh."
                : "Ảnh sẽ ở trạng thái “Chờ duyệt” — quản lý duyệt xong phụ huynh mới xem được. Chỉ gắn thẻ học viên đã đồng ý dùng hình ảnh."}
            </DialogDescription>
          </DialogHeader>

          {loadingCtx || ctx === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang tải thông tin lớp…
            </div>
          ) : blocked ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/15 dark:text-rose-300">
              Bạn không phụ trách lớp này nên không thể đăng ảnh.
            </div>
          ) : (
            <div className="space-y-3">
              {/* Chọn chế độ: kho nhiều ảnh (mặc định) / đăng ngay 1 ảnh (flow cũ) */}
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist">
                {(
                  [
                    ["batch", "Đưa vào kho (nhiều ảnh)"],
                    ["single", "Đăng ngay 1 ảnh"],
                  ] as const
                ).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    disabled={pending || uploading}
                    onClick={() => setMode(m)}
                    className={`rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                      mode === m
                        ? "bg-background text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Banner HS CHƯA đồng ý dùng hình ảnh (consent) — mirror admin media-client */}
              {ctx.nonConsent.length > 0 && (
                <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div>
                    <p className="font-semibold">Học viên CHƯA đồng ý dùng hình ảnh:</p>
                    <p className="mt-0.5">{ctx.nonConsent.map((s) => s.name).join(", ")}</p>
                    <p className="mt-1 text-amber-700 dark:text-amber-300">
                      Vui lòng làm mờ thủ công hoặc loại các em này khỏi khung hình.
                      Không thể gắn thẻ các em này.
                    </p>
                  </div>
                </div>
              )}

              {/* Buổi học + ngày chụp — batch: áp CHO CẢ LÔ; single: như cũ */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="media-session">
                    {mode === "batch" ? "Buổi học (cả lô — tuỳ chọn)" : "Buổi học (tuỳ chọn)"}
                  </Label>
                  <select
                    id="media-session"
                    value={sessionId}
                    disabled={pending}
                    onChange={(e) => onSession(e.target.value)}
                    className={selectCls}
                  >
                    <option value="">— Không gắn buổi —</option>
                    {ctx.sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="media-taken-at">Ngày chụp</Label>
                  <Input
                    id="media-taken-at"
                    type="date"
                    value={takenAt}
                    disabled={pending}
                    onChange={(e) => setTakenAt(e.target.value)}
                  />
                </div>
              </div>

              {mode === "batch" ? (
                <>
                  {/* Lưới ảnh đã tải của LÔ + nút gỡ từng ảnh (gỡ khỏi lô, file R2 giữ nguyên) */}
                  {batchFiles.length > 0 && (
                    <div className="grid grid-cols-4 gap-1.5">
                      {batchFiles.map((f, i) => (
                        <div key={`${f.fileUrl}-${i}`} className="group relative">
                          <img
                            src={f.fileUrl}
                            alt={f.fileName}
                            className="aspect-square w-full rounded-md object-cover"
                          />
                          <button
                            type="button"
                            aria-label={`Bỏ ảnh ${f.fileName} khỏi lô`}
                            disabled={pending}
                            onClick={() =>
                              setBatchFiles((prev) => prev.filter((_, j) => j !== i))
                            }
                            className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100"
                          >
                            <X className="h-3 w-3" aria-hidden />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-sm text-muted-foreground hover:bg-muted">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Upload className="h-4 w-4" aria-hidden />
                    )}
                    {progress
                      ? `Đang tải ${progress.done}/${progress.total}…`
                      : batchFiles.length > 0
                        ? `Thêm ảnh (${batchFiles.length}/${BATCH_MAX})`
                        : "Chọn nhiều ảnh"}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={onFiles}
                      disabled={uploading}
                      className="hidden"
                    />
                  </label>
                </>
              ) : (
                <>
                  {/* Chọn ảnh: presign → PUT R2 → preview (flow cũ 1 ảnh) */}
                  {fileUrl ? (
                    <img
                      src={fileUrl}
                      alt="Xem trước ảnh sẽ đăng"
                      className="h-40 w-full rounded-lg object-cover"
                    />
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-sm text-muted-foreground hover:bg-muted">
                      {uploading ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                      ) : (
                        <Upload className="h-4 w-4" aria-hidden />
                      )}
                      {uploading ? "Đang tải…" : "Chọn ảnh"}
                      <input type="file" accept="image/*" onChange={onFiles} disabled={uploading} className="hidden" />
                    </label>
                  )}

                  <div className="space-y-1.5">
                    <Label htmlFor="media-caption">Chú thích (tuỳ chọn)</Label>
                    <Textarea
                      id="media-caption"
                      rows={2}
                      placeholder="Vd: Hoạt động lắp ráp robot buổi 5"
                      value={caption}
                      disabled={pending}
                      maxLength={1000}
                      onChange={(e) => setCaption(e.target.value)}
                    />
                  </div>

                  {ctx.students.length > 0 && (
                    <div className="space-y-2">
                      <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
                        <input
                          type="checkbox"
                          checked={wholeClass}
                          disabled={pending}
                          onChange={(e) => {
                            setWholeClass(e.target.checked);
                            if (e.target.checked) setTagged([]);
                          }}
                          className="h-4 w-4 rounded border-input text-orange-600 focus:ring-orange-400"
                        />
                        Ảnh chung cả lớp (mọi phụ huynh trong lớp đều xem được)
                      </label>

                      {!wholeClass && (
                        <div>
                          <p className="mb-1 text-xs font-medium text-muted-foreground">
                            Gắn thẻ học viên (chỉ phụ huynh được gắn thẻ mới thấy ảnh)
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {ctx.students.map((s) => {
                              const on = tagged.includes(s.id);
                              const noConsent = nonConsentIds.has(s.id);
                              return (
                                <button
                                  key={s.id}
                                  type="button"
                                  disabled={noConsent || pending}
                                  title={noConsent ? "Chưa đồng ý dùng hình ảnh" : undefined}
                                  onClick={() =>
                                    setTagged((p) =>
                                      on ? p.filter((x) => x !== s.id) : [...p, s.id],
                                    )
                                  }
                                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                    noConsent
                                      ? "cursor-not-allowed bg-muted text-muted-foreground/50 line-through"
                                      : on
                                        ? "bg-orange-600 text-white"
                                        : "bg-muted text-muted-foreground hover:bg-muted/70"
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
                </>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={mode === "batch" ? submitBatch : submitSingle}
              disabled={pending || uploading || loadingCtx || ctx === null || blocked}
            >
              {pending
                ? "Đang gửi…"
                : mode === "batch"
                  ? `Đưa vào kho${batchFiles.length > 0 ? ` (${batchFiles.length})` : ""}`
                  : "Đăng ảnh"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
