"use client";

/**
 * Site Sale — điều khiển break-glass "Xem đầy đủ CCCD PH & địa chỉ".
 *
 * ── BẢN ĐÔI CỦA `PiiRevealControl` trong
 *    `app/(admin)/admin/payments/_components/payments-client.tsx` ────────────
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Việc mở PII vẫn gọi ĐÚNG một Server Action
 *    `revealPaymentsPii` của khu quản trị — nơi có `assertPermission
 *    ('payments:view-pii')`, bắt buộc lý do ≥10 ký tự, GHI NHẬT KÝ
 *    `payments.pii-unmasked` TRƯỚC khi trả dữ liệu thô, rồi mới truy vấn lại qua
 *    `scopedDb`. Nhân bản LOGIC là cách chắc chắn nhất để một khu ghi log còn khu
 *    kia thì không.
 *
 * Câu chữ giữ nguyên 100%: nhãn nút, tiêu đề hộp thoại, đoạn giải thích, nhãn ô
 * lý do, đếm ký tự, hai nút cuối, và cả hai câu toast.
 */
import { useState, useTransition } from "react";
import { Eye, EyeOff, Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  revealPaymentsPii,
  type PaymentRow,
} from "@/app/(admin)/admin/payments/_actions";

/** Chép từ bản admin — server cũng chặn ở đúng con số này (`breakGlassSchema`). */
const TOI_THIEU_LY_DO = 10;

/** Nút cảnh báo: viền + chữ tone `warning`, nền chỉ hiện khi di chuột. */
const LOP_NUT_CANH_BAO = cn(
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium",
  "border-state-warning-soft text-state-warning-ink transition-colors",
  "hover:bg-state-warning-soft",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-warning)]/35",
  "disabled:opacity-50",
);

export function MoXemPii({
  daMo,
  khiMo,
  khiAn,
}: {
  daMo: boolean;
  khiMo: (dong: PaymentRow[]) => void;
  khiAn: () => void;
}) {
  const [mo, setMo] = useState(false);
  const [lyDo, setLyDo] = useState("");
  const [pending, start] = useTransition();

  if (daMo) {
    return (
      <button type="button" onClick={khiAn} className={LOP_NUT_CANH_BAO}>
        <EyeOff aria-hidden="true" className="size-4" />
        Ẩn lại
      </button>
    );
  }

  function gui() {
    if (lyDo.trim().length < TOI_THIEU_LY_DO) {
      toast.error(`Vui lòng nhập lý do tối thiểu ${TOI_THIEU_LY_DO} ký tự`);
      return;
    }
    start(async () => {
      // 1 đường DUY NHẤT: reveal vừa ghi nhật ký vừa trả dòng thô (server đã
      // kiểm lý do ≥10 + log trước khi trả).
      const res = await revealPaymentsPii({}, lyDo.trim());
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Đã mở xem đầy đủ. Hành động này đã được ghi log.");
      setMo(false);
      setLyDo("");
      khiMo(res.rows);
    });
  }

  return (
    <>
      <button type="button" onClick={() => setMo(true)} className={LOP_NUT_CANH_BAO}>
        <Eye aria-hidden="true" className="size-4" />
        Xem đầy đủ
      </button>

      <Dialog open={mo} onOpenChange={(o) => !pending && setMo(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert aria-hidden="true" className="size-5 text-state-warning-ink" />
              Xem đầy đủ CCCD phụ huynh &amp; địa chỉ
            </DialogTitle>
            <DialogDescription>
              CCCD phụ huynh và địa chỉ đang được che mặc định. Mở xem đầy đủ là hành
              động có kiểm soát — bắt buộc nhập lý do và sẽ được ghi log riêng (ai, lúc
              nào, lý do gì).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="ly-do-pii" className="text-xs">
              Lý do (tối thiểu {TOI_THIEU_LY_DO} ký tự)
            </Label>
            <Textarea
              id="ly-do-pii"
              value={lyDo}
              onChange={(e) => setLyDo(e.target.value)}
              placeholder="Ví dụ: đối soát hóa đơn/công nợ tháng 07 cho phụ huynh..."
              rows={3}
              disabled={pending}
            />
            <p className="text-xs tabular-nums text-muted-foreground">
              {lyDo.trim().length}/{TOI_THIEU_LY_DO}
            </p>
          </div>

          <DialogFooter>
            <button
              type="button"
              onClick={() => setMo(false)}
              disabled={pending}
              className={cn(
                "h-9 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground",
                "transition-colors hover:bg-[color:var(--surface-chim)] disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30",
              )}
            >
              Huỷ
            </button>
            <button
              type="button"
              onClick={gui}
              disabled={pending || lyDo.trim().length < TOI_THIEU_LY_DO}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-lg px-4 text-sm font-medium transition-colors",
                "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
                "hover:bg-[color:var(--primary-dark)] disabled:opacity-50",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 focus-visible:ring-offset-2",
              )}
            >
              {pending && <Loader2 aria-hidden="true" className="size-4 animate-spin" />}
              Xác nhận xem đầy đủ
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
