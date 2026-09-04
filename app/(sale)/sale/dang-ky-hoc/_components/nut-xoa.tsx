"use client";

/**
 * Site Sale — nút xoá đăng ký, xác nhận 2 lần bấm.
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/enrollments/_components/delete-enrollment-button.tsx` ──
 * Quyết định 04/09/2026: màn Sale tách bản riêng để thiết kế lại mà không đụng
 * một pixel nào của khu quản trị.
 *
 * ⚠️ CHỈ NHÂN BẢN LỚP VỎ. Hành vi xoá vẫn gọi ĐÚNG một Server Action
 *    `deleteEnrollmentAction` của khu quản trị — nơi có kiểm quyền
 *    `enrollments:delete`, kiểm cách ly cơ sở (`passesScope`), và chặn xoá khi
 *    đã phát sinh tiền (payments / orderItems / receipts / reserves).
 *    Nhân bản LOGIC xoá là cách chắc chắn nhất để hai khu có hai luật xoá khác
 *    nhau; nhân bản CÁI NÚT thì tệ nhất chỉ là hai cái nút trông khác nhau.
 *
 * Câu chữ giữ nguyên 100%: "Xoá" → "Xác nhận", toast "Đã xoá đăng ký".
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { deleteEnrollmentAction } from "@/app/(admin)/admin/enrollments/_actions";

export function NutXoaDangKy({ id }: { id: string }) {
  const router = useRouter();
  const [xacNhan, setXacNhan] = useState(false);
  const [pending, start] = useTransition();

  function bam() {
    if (!xacNhan) {
      setXacNhan(true);
      return;
    }
    start(async () => {
      const res = await deleteEnrollmentAction(id);
      if (res.ok) {
        toast.success("Đã xoá đăng ký");
        router.refresh();
      } else {
        toast.error(res.error ?? "Lỗi xoá đăng ký");
        setXacNhan(false);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={bam}
      // Rời khỏi nút là quên trạng thái chờ xác nhận — nút "Xác nhận" đứng chờ
      // vô hạn trong một bảng 100 dòng là một cú bấm nhầm đang đợi xảy ra.
      onBlur={() => setXacNhan(false)}
      disabled={pending}
      className={cn(
        "inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-xs font-medium",
        "transition-colors disabled:opacity-50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--state-danger)]/35",
        xacNhan
          ? "border-[color:var(--state-danger)] bg-[color:var(--state-danger)] text-white"
          : "border-border text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-soft)]",
      )}
    >
      <Trash2 aria-hidden="true" className="size-3.5" />
      {xacNhan ? "Xác nhận" : "Xoá"}
    </button>
  );
}
