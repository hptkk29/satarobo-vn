"use client";

/**
 * Site Sale — hai nút hành động của màn "Sinh nhật học viên".
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/sinh-nhat/_components/birthday-actions.tsx` ──
 * Tách bản riêng theo chốt 04/09/2026 (site Sale không dùng chung component với
 * khu quản trị). Bản admin GIỮ NGUYÊN, không sửa.
 *
 * 🔴 ĐƯỜNG GHI KHÔNG ĐƯỢC TÁCH. Cả ba Server Action vẫn là của khu quản trị
 *    (`markBirthdayCelebrated` · `undoBirthdayCelebrated` · `runBirthdayScan`).
 *    Chỉ phần VẼ tách ra. Viết một đường ghi thứ hai cho cùng một việc là dựng
 *    một chỗ nữa để quên `passesScope` — mà chính khối chú thích đầu
 *    `_actions.ts` bên admin đã ghi rõ: thiếu nó là IDOR liên cơ sở (Sale cơ sở A
 *    đánh dấu "đã chúc" cho học viên cơ sở B).
 *
 * ⚠️ `router.refresh()` là BẮT BUỘC, không phải cho chắc. Ba action đó gọi
 *    `revalidatePath("/sinh-nhat")` + `revalidatePath("/dashboard")` — đường SẠCH
 *    của host quản trị, không khớp `/sale/sinh-nhat`. Bỏ `router.refresh()` thì
 *    bấm "Đã chúc" xong bảng vẫn y nguyên cho tới khi tải lại tay, và người dùng
 *    bấm lần hai. (Cùng bài học đã ghi ở `app/(sale)/sale/messenger/_components/
 *    o-tra-loi.tsx`.)
 */
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  markBirthdayCelebrated,
  runBirthdayScan,
  undoBirthdayCelebrated,
} from "@/app/(admin)/admin/sinh-nhat/_actions";

export function NutDaChuc({ id, daChuc }: { id: string; daChuc: boolean }) {
  const router = useRouter();
  const [dangChay, batDau] = useTransition();

  if (daChuc) {
    return (
      <button
        type="button"
        disabled={dangChay}
        onClick={() =>
          batDau(async () => {
            const kq = await undoBirthdayCelebrated(id);
            if (kq.ok) {
              toast.success("Đã bỏ đánh dấu");
              router.refresh();
            } else toast.error(kq.error ?? "Lỗi");
          })
        }
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50"
      >
        Bỏ đánh dấu
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={dangChay}
      onClick={() =>
        batDau(async () => {
          const kq = await markBirthdayCelebrated(id);
          if (kq.ok) {
            toast.success("Đã ghi nhận chúc mừng");
            router.refresh();
          } else toast.error(kq.error ?? "Lỗi");
        })
      }
      className="rounded-lg bg-state-success-ink px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-state-success-ink-hover disabled:opacity-50"
    >
      Đã chúc
    </button>
  );
}

/**
 * Chạy tay 3 pha của cron. Lý do tồn tại giữ nguyên của bản admin: Vercel Cron
 * KHÔNG chạy trên môi trường `test`, không có nút này thì không nghiệm thu được
 * luồng sinh nhật trước khi lên prod.
 *
 * Nút chỉ được vẽ khi người xem có `students:edit` — cùng quyền mà
 * `runBirthdayScan` đòi. Vẽ cho mọi người rồi để server từ chối là dựng một cái
 * nút chỉ để báo lỗi.
 */
export function NutQuetSinhNhat() {
  const router = useRouter();
  const [dangChay, batDau] = useTransition();
  return (
    <button
      type="button"
      disabled={dangChay}
      onClick={() =>
        batDau(async () => {
          const kq = await runBirthdayScan();
          if (kq.ok) {
            // 8 giây: câu tóm tắt dài (quét bao nhiêu HV, gửi bao nhiêu tin) và
            // người dùng phải đọc kịp — chép nguyên lựa chọn của bản admin.
            toast.success(kq.summary ?? "Đã quét xong", { duration: 8000 });
            router.refresh();
          } else toast.error(kq.error ?? "Lỗi");
        })
      }
      className="inline-flex h-9 items-center rounded-lg border border-[color:var(--primary)] px-4 text-sm font-medium text-[color:var(--primary-ink)] transition-colors hover:bg-[color:var(--primary-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40 disabled:opacity-50"
    >
      {dangChay ? "Đang quét…" : "Chạy quét sinh nhật"}
    </button>
  );
}
