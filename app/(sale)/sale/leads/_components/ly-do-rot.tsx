"use client";

/**
 * Site Sale — hộp thoại hỏi LÝ DO trước khi đẩy lead vào một bậc rơi.
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/leads/_components/ly-do-rot-dialog.tsx` ───
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị. Bản admin giữ nguyên, không sửa.
 *
 * GIỮ NGUYÊN 100% câu chữ: tiêu đề `Chuyển sang "…"`, câu mô tả, chỗ giữ chỗ của
 * ô nhập, ngưỡng 3 ký tự, trần 500 ký tự, hai nút "Huỷ" / "Xác nhận".
 *
 * ── ĐỔI CÁCH BÀY ────────────────────────────────────────────────────────────
 * Nút gõ class từng cái → token tím của `sale.css`; dấu sao bắt buộc đổi từ
 * `text-red-600` (màu rời) sang `--state-danger`. Bài kiểm `ky-luat-mau.test.ts`
 * canh đúng loại vi phạm đó.
 *
 * ⚠️ Hộp thoại này là TIỆN NGHI, không phải hàng rào — `updateLeadStatus` vẫn
 *    kiểm lại lý do ở máy chủ và từ chối nếu thiếu.
 */
import { useEffect, useState } from "react";
import type { LeadStatus } from "@prisma/client";
import { LEAD_STATUS_LABEL } from "@/lib/leads/status";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export function LyDoRotSale({
  status,
  tenLead,
  dangGui,
  onXacNhan,
  onHuy,
}: {
  /** Bậc sắp chuyển tới. `null` = đóng hộp thoại. */
  status: LeadStatus | null;
  tenLead?: string | null;
  dangGui?: boolean;
  onXacNhan: (lyDo: string) => void;
  onHuy: () => void;
}) {
  const [lyDo, setLyDo] = useState("");

  // Mỗi lần mở cho một lead/bậc khác thì xoá chữ cũ — giữ lại là để người dùng
  // vô tình gán lý do của lead trước cho lead sau.
  useEffect(() => {
    if (status) setLyDo("");
  }, [status]);

  const du = lyDo.trim().length >= 3;

  return (
    <Dialog open={status !== null} onOpenChange={(o) => !o && onHuy()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Chuyển sang &quot;{status ? LEAD_STATUS_LABEL[status] : ""}&quot;
          </DialogTitle>
          <DialogDescription>
            {tenLead ? `${tenLead} — ` : ""}Lead rời phễu ở bước này. Ghi lý do để
            báo cáo biết vì sao mất, không chỉ biết mất ở bậc nào.
          </DialogDescription>
        </DialogHeader>

        <label className="block text-sm">
          <span className="mb-1 block font-medium text-foreground">
            Lý do <span className="text-[color:var(--state-danger)]">*</span>
          </span>
          <textarea
            autoFocus
            rows={3}
            value={lyDo}
            maxLength={500}
            onChange={(e) => setLyDo(e.target.value)}
            placeholder="VD: học phí cao hơn dự tính, đã chọn trung tâm khác, chưa sắp được lịch…"
            className={cn(
              "w-full rounded-lg border border-border bg-card p-2.5 text-sm",
              "focus-visible:border-[color:var(--primary)] focus-visible:outline-none",
              "focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/25",
            )}
          />
          <span className="mt-1 block text-xs text-muted-foreground">
            {du ? `${lyDo.trim().length}/500` : "Ít nhất 3 ký tự"}
          </span>
        </label>

        <DialogFooter>
          <button
            type="button"
            onClick={onHuy}
            disabled={dangGui}
            className="h-9 rounded-lg border border-border px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-[color:var(--surface-chim)] disabled:opacity-50"
          >
            Huỷ
          </button>
          <button
            type="button"
            onClick={() => onXacNhan(lyDo.trim())}
            disabled={!du || dangGui}
            className={cn(
              "h-9 rounded-lg px-4 text-sm font-medium transition-colors",
              "bg-[color:var(--primary)] text-[color:var(--primary-foreground)]",
              "hover:bg-[color:var(--primary-dark)] disabled:opacity-50",
            )}
          >
            {dangGui ? "Đang lưu…" : "Xác nhận"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
