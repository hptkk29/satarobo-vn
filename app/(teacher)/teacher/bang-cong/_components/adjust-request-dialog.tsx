// app/(teacher)/teacher/bang-cong/_components/adjust-request-dialog.tsx — #06 (L6).
//
// Dialog nhỏ "Yêu cầu chỉnh công" — TÁI DÙNG action admin createAdjustmentRequest
// (app/(admin)/admin/cham-cong/chinh-cong/_actions): gate hr_attendance:checkin,
// matrix v1 CÓ TEACHER → GV gửi được, KHÔNG nới quyền gì mới. GV không tự sửa
// công — chỉ gửi yêu cầu kèm lý do, quản lý cơ sở duyệt (hr_attendance:adjust).
// Server gate lại lần nữa trong action; nút này chỉ hiện khi page check pass.
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FilePen } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ONgay } from "../../_components/ui/o-ngay";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createAdjustmentRequest } from "@/app/(admin)/admin/cham-cong/chinh-cong/_actions";

export function AdjustRequestDialog({ defaultDate }: { defaultDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [date, setDate] = useState(defaultDate);
  const [requested, setRequested] = useState("");
  const [reason, setReason] = useState("");
  // Lỗi hiện NGAY TẠI Ô, không chỉ toast: toast trôi mất sau vài giây và không nói
  // được ô nào sai, còn trình đọc màn hình thì không nối được nó với ô nhập
  // (QA vòng 1, BUG-039).
  const [loiNgay, setLoiNgay] = useState<string | null>(null);
  const [loiLyDo, setLoiLyDo] = useState<string | null>(null);

  function submit() {
    const thieuNgay = !date ? "Chọn ngày công cần chỉnh." : null;
    const thieuLyDo =
      reason.trim().length < 5
        ? "Nêu lý do chi tiết hơn — tối thiểu 5 ký tự."
        : null;
    setLoiNgay(thieuNgay);
    setLoiLyDo(thieuLyDo);
    if (thieuNgay || thieuLyDo) {
      // Vẫn giữ toast cho người đang nhìn chỗ khác, nhưng nó không còn là kênh DUY NHẤT.
      toast.error(thieuNgay ?? thieuLyDo!);
      return;
    }
    startTransition(async () => {
      const res = await createAdjustmentRequest({ date, requested, reason });
      if (res.ok) {
        toast.success("Đã gửi yêu cầu chỉnh công — chờ quản lý duyệt");
        setRequested("");
        setReason("");
        setLoiNgay(null);
        setLoiLyDo(null);
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi gửi yêu cầu");
      }
    });
  }

  return (
    <>
      {/* Dialog controlled (open/onOpenChange) theo pattern session-actions.tsx
          của site GV — không dùng DialogTrigger. */}
      <Button variant="outline" onClick={() => setOpen(true)}>
        <FilePen className="mr-1.5 h-4 w-4" /> Yêu cầu chỉnh công
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yêu cầu chỉnh công</DialogTitle>
            <DialogDescription>
              Bạn không tự sửa công — gửi yêu cầu kèm lý do, quản lý cơ sở sẽ
              duyệt.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ONgay
              id="adjust-date"
              label="Ngày công cần chỉnh"
              value={date}
              required
              disabled={pending}
              error={loiNgay}
              onChange={(v) => {
                setDate(v);
                setLoiNgay(null);
              }}
            />
            <div className="space-y-1.5">
              <Label htmlFor="adjust-requested">Đề nghị (không bắt buộc)</Label>
              <Input
                id="adjust-requested"
                type="text"
                placeholder="Vd: giờ vào 07:30, giờ ra 17:30"
                value={requested}
                disabled={pending}
                maxLength={500}
                onChange={(e) => setRequested(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adjust-reason">
                Lý do / giải trình
                <span className="ml-0.5 text-state-danger-ink" aria-hidden>
                  *
                </span>
              </Label>
              <Textarea
                id="adjust-reason"
                rows={3}
                placeholder="Vì sao cần chỉnh công ngày này…"
                value={reason}
                disabled={pending}
                maxLength={2000}
                required
                aria-required
                aria-invalid={loiLyDo ? true : undefined}
                aria-describedby={loiLyDo ? "adjust-reason-loi" : undefined}
                className={cn(loiLyDo && "border-state-danger-ink")}
                onChange={(e) => {
                  setReason(e.target.value);
                  setLoiLyDo(null);
                }}
              />
              {loiLyDo && (
                <p
                  id="adjust-reason-loi"
                  className="text-xs font-medium text-state-danger-ink"
                >
                  {loiLyDo}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            {/* Nút Huỷ tường minh: trước đó chỉ có dấu X ở góc, mà đó là thứ người
                dùng phải ĐOÁN ra (QA vòng 1, BUG-039). */}
            <Button
              variant="ghost"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Huỷ
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Đang gửi…" : "Gửi yêu cầu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
