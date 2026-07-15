// app/(teacher)/teacher/anh-lop/_components/upload-photo-dialog.tsx — #06 (L6).
//
// Dialog "Đăng ảnh lớp" — TÁI DÙNG NGUYÊN action admin (app/(admin)/admin/media/
// actions.ts), KHÔNG viết luật consent mới (bất biến C6.2/C6.3):
// • getClassUploadContext(classId): gate canUploadToClass server-side (GV lớp
//   teacherId/assistantId → được đăng) + roster tag {id, name} + HS CHƯA consent
//   (banner cảnh báo + disable tag, mirror admin media-client) + buổi gần đây.
// • uploadClassMedia: server reject tag HS chưa GRANTED consent (C6.3); GV không
//   có media:approve → ảnh vào PENDING chờ quản lý duyệt — GV KHÔNG tự duyệt/xoá.
// • Presign qua /api/admin/upload-url (TEACHER ∈ allowedRoles của route; path
//   /api/* chạy trên mọi host nên dùng được từ host giaovien) → PUT thẳng lên R2.
// ⚠️ Câu 46: context/payload chỉ chứa TÊN học viên — không SĐT/email/contact PH.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ImagePlus, Loader2, Upload } from "lucide-react";
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
  type ClassUploadContext,
} from "@/app/(admin)/admin/media/actions";

const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:border-orange-400 focus:outline-none disabled:opacity-50";

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

  const [sessionId, setSessionId] = useState(initialSessionId ?? "");
  const [takenAt, setTakenAt] = useState("");
  const [caption, setCaption] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [tagged, setTagged] = useState<string[]>(initialTagged ?? []);
  const [wholeClass, setWholeClass] = useState(false);

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

  // Presign → PUT thẳng R2 → giữ publicUrl để submit (mirror media-client.onFile).
  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      toast.error("Chỉ chọn ảnh");
      return;
    }
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

  function resetForm() {
    setSessionId("");
    setTakenAt("");
    setCaption("");
    setFileUrl("");
    setFileName("");
    setTagged([]);
    setWholeClass(false);
  }

  function submit() {
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
              Ảnh sẽ ở trạng thái “Chờ duyệt” — quản lý duyệt xong phụ huynh mới xem
              được. Chỉ gắn thẻ học viên đã đồng ý dùng hình ảnh.
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

              {/* Buổi học + ngày chụp (tuỳ chọn — bỏ trống = ảnh mức lớp) */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="media-session">Buổi học (tuỳ chọn)</Label>
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

              {/* Chọn ảnh: presign → PUT R2 → preview */}
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
                  <input type="file" accept="image/*" onChange={onFile} className="hidden" />
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
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={submit}
              disabled={pending || uploading || loadingCtx || ctx === null || blocked}
            >
              {pending ? "Đang đăng…" : "Đăng ảnh"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
