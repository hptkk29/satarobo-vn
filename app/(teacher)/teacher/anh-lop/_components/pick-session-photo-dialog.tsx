// pick-session-photo-dialog.tsx — nút "Chọn ảnh" ở phiếu nhận xét (25/08).
//
// Thay cho nút "Tải ảnh" cũ (mỗi học viên một lượt upload riêng). Nay giáo viên tải cả
// loạt ảnh của buổi ở màn Ảnh lớp, QLCS duyệt từng tấm, rồi ở ĐÂY chỉ việc CHỌN xem tấm
// nào là của em nào. Hộp thoại này KHÔNG tải file — nó ghi/gỡ MediaStudentTag.
//
// Chỉ bày ảnh APPROVED của ĐÚNG buổi đang nhận xét: gắn thẻ chính là thứ quyết định phụ
// huynh nào xem được ảnh (lib/portal/photos.ts), nên bày ảnh chưa duyệt ở đây là hứa với
// giáo viên một việc QLCS có thể từ chối.
//
// ⚠️ C6.3 — em chưa đồng ý dùng hình ảnh thì KHÔNG gắn thẻ được (server chặn lại, ở đây
// chỉ khoá nút + nói lý do). GỠ thẻ vẫn cho phép: đó là cách sửa sai sau khi phụ huynh
// thu hồi đồng ý (C6.4).
// ⚠️ Câu 46: payload chỉ có cờ "ảnh này đã gắn em đang xét chưa" — không kèm tên/id em
// khác, nên mở hộp thoại của em A không lộ được em B có trong ảnh.
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Images, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getSessionPhotoPicker,
  toggleMediaStudentTagAction,
  type SessionPhotoPickerItem,
} from "@/app/(admin)/admin/media/actions";

export function PickSessionPhotoDialog({
  classId,
  classSessionId,
  studentId,
  studentName,
}: {
  classId: string;
  classSessionId: string;
  studentId: string;
  studentName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [canTag, setCanTag] = useState(true);
  const [consentGranted, setConsentGranted] = useState(true);
  const [items, setItems] = useState<SessionPhotoPickerItem[]>([]);
  // Chỉ refresh trang khi thực sự có thay đổi — cột "Đã có / Chưa có" tính ở server,
  // mà refresh mỗi lần đóng hộp thoại thì bảng nhấp nháy cả khi giáo viên chỉ mở ra xem.
  const [dirty, setDirty] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await getSessionPhotoPicker({
        classId,
        classSessionId,
        studentId,
      });
      setCanTag(res.canTag);
      setConsentGranted(res.consentGranted);
      setItems(res.items);
      setLoaded(true);
    } catch {
      toast.error("Không tải được ảnh của buổi — thử lại");
    } finally {
      setLoading(false);
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !loaded && !loading) void load();
    if (!next && dirty) {
      setDirty(false);
      router.refresh();
    }
  }

  function toggle(item: SessionPhotoPickerItem) {
    if (!item.tagged && !consentGranted) {
      toast.error("Học viên chưa đồng ý dùng hình ảnh — không chọn ảnh được");
      return;
    }
    startTransition(async () => {
      const res = await toggleMediaStudentTagAction({
        mediaId: item.id,
        studentId,
        tagged: !item.tagged,
      });
      if (!res.ok) {
        toast.error(res.error ?? "Không lưu được lựa chọn");
        return;
      }
      setItems((prev) =>
        prev.map((m) => (m.id === item.id ? { ...m, tagged: !item.tagged } : m)),
      );
      setDirty(true);
      toast.success(
        item.tagged
          ? `Đã bỏ ảnh khỏi ${studentName}`
          : `Đã chọn ảnh cho ${studentName}`,
      );
    });
  }

  const chosen = items.filter((m) => m.tagged).length;

  return (
    <>
      <Button onClick={() => onOpenChange(true)} size="sm" variant="outline">
        <Images className="mr-1 h-3.5 w-3.5" aria-hidden />
        Chọn ảnh
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Chọn ảnh cho {studentName}</DialogTitle>
            <DialogDescription>
              Ảnh của buổi này đã được quản lý cơ sở duyệt. Bấm vào ảnh để chọn
              (bấm lại để bỏ) — phụ huynh chỉ xem được ảnh có gắn thẻ con mình.
            </DialogDescription>
          </DialogHeader>

          {loading || !loaded ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang tải
              ảnh của buổi…
            </div>
          ) : !canTag ? (
            <div className="rounded-lg border border-state-danger-soft bg-state-danger-soft p-3 text-sm text-state-danger-ink dark:border-state-danger">
              Bạn không phụ trách lớp này nên không chọn được ảnh.
            </div>
          ) : items.length === 0 ? (
            // Lưới rỗng không nói được vì sao rỗng: ảnh có thể chưa tải lên, hoặc đã tải
            // mà QLCS chưa duyệt. Nói cả hai khả năng + chỉ đường đi tiếp.
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              <p className="font-semibold text-foreground">
                Buổi này chưa có ảnh nào được duyệt.
              </p>
              <p className="text-muted-foreground">
                Ảnh phải được tải lên ở trang Ảnh lớp và được quản lý cơ sở duyệt
                thì mới chọn được ở đây.
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href={`/teacher/anh-lop?classId=${classId}`}>
                  Mở trang Ảnh lớp để tải ảnh
                </Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {!consentGranted && (
                <div className="flex gap-2 rounded-lg border border-state-warning-soft bg-state-warning-soft p-2.5 text-xs text-state-warning-ink dark:border-state-warning">
                  <AlertTriangle
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden
                  />
                  <p>
                    {studentName} chưa đồng ý dùng hình ảnh — không chọn ảnh cho
                    em này được. Bạn vẫn bỏ được ảnh đã chọn trước đó.
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Đã chọn {chosen}/{items.length} ảnh của buổi.
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {items.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    aria-pressed={m.tagged}
                    aria-label={
                      m.tagged
                        ? `Bỏ ảnh này khỏi ${studentName}`
                        : `Chọn ảnh này cho ${studentName}`
                    }
                    disabled={pending || (!m.tagged && !consentGranted)}
                    onClick={() => toggle(m)}
                    className={cn(
                      "relative overflow-hidden rounded-lg border-2 text-left transition-colors disabled:opacity-50",
                      m.tagged
                        ? "border-primary"
                        : "border-transparent hover:border-border",
                    )}
                  >
                    <img
                      src={m.url}
                      alt={m.caption ?? "Ảnh buổi học"}
                      className="aspect-square w-full object-cover"
                    />
                    {m.tagged && (
                      <span className="absolute left-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-white">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                      </span>
                    )}
                    {m.isClassWide && (
                      // Ảnh chung cả lớp đã tới mọi phụ huynh trong lớp rồi — nói ra để
                      // giáo viên không đi gắn thẻ thừa cho từng em.
                      <span className="block truncate bg-state-info-soft px-1.5 py-0.5 text-[10px] font-semibold text-state-info-ink">
                        Chung cả lớp
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
