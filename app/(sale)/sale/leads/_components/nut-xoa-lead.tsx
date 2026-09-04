"use client";

/**
 * Site Sale — nút xoá lead, xác nhận 2 lần bấm.
 *
 * ── BẢN ĐÔI CỦA `DeleteCell` trong
 *    `app/(admin)/admin/leads/_components/leads-table.tsx` ────────────────────
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Hành vi xoá vẫn gọi ĐÚNG một Server Action `deleteLead`
 *    của khu quản trị — nơi kiểm `leads:delete`, kiểm cách ly cơ sở
 *    (`passesScope`) và xoá mềm. Nhân bản LOGIC xoá là cách chắc chắn nhất để hai
 *    khu có hai luật xoá khác nhau; nhân bản CÁI NÚT thì tệ nhất chỉ là hai cái
 *    nút trông khác nhau.
 *
 * GIỮ NGUYÊN 100% câu chữ: "Xoá" → "Xác nhận?".
 *
 * ── ĐỔI CÁCH BÀY / HÀNH VI NHỎ (không đổi nội dung) ─────────────────────────
 * 1. `alert()` của trình duyệt → `toast.error` — cả site đã dùng `sonner`, một
 *    hộp thoại xám của hệ điều hành giữa bảng là dấu hiệu rõ nhất của vá tạm.
 * 2. Bản admin nhả trạng thái chờ xác nhận sau 4 giây bằng `setTimeout`; ở đây
 *    nhả khi con trỏ RỜI nút (`onBlur`) — cùng khuôn với `NutXoaDangKy`. Đồng hồ
 *    4 giây làm nút tự đổi chữ dưới tay người đang đọc dòng khác; rời nút là ý
 *    định rõ ràng hơn nhiều.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deleteLead } from "@/app/(admin)/admin/leads/actions";

export function NutXoaLead({ id, tenLead }: { id: string; tenLead: string }) {
  const router = useRouter();
  const [xacNhan, setXacNhan] = useState(false);
  const [pending, start] = useTransition();

  function bam() {
    if (!xacNhan) {
      setXacNhan(true);
      return;
    }
    start(async () => {
      const res = await deleteLead(id);
      if (res.ok) {
        toast.success("Đã xoá lead");
        // Action chỉ revalidate `/leads` (đường khu quản trị) — màn này ở
        // `/sale/leads`, nên phải tự kéo lại dữ liệu.
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi xoá lead");
        setXacNhan(false);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        bam();
      }}
      onBlur={() => setXacNhan(false)}
      disabled={pending}
      aria-label={xacNhan ? `Xác nhận xoá ${tenLead}` : `Xoá ${tenLead}`}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium",
        "transition-colors disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-danger)]/35",
        xacNhan
          ? "border-[color:var(--state-danger)] bg-[color:var(--state-danger)] text-white"
          : "border-border text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-soft)]",
      )}
    >
      {pending ? (
        <Loader2 aria-hidden="true" className="size-3.5 animate-spin" />
      ) : (
        <Trash2 aria-hidden="true" className="size-3.5" />
      )}
      {xacNhan ? "Xác nhận?" : "Xoá"}
    </button>
  );
}
