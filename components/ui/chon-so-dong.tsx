"use client";

// CHỌN SỐ DÒNG/TRANG cho bảng PHÂN TRANG Ở TẦNG DB (server-side).
//
// Khác `PhanTrangBang` ở chỗ nào: những màn như /admin/students, /admin/leads, /admin/products,
// /admin/email-logs, /admin/otp-logs vốn ĐÃ cắt trang bằng `skip/take` trong truy vấn, với
// `PAGE_SIZE` HẰNG SỐ trong code. Chúng có nút qua/lại nhưng KHÔNG có chỗ chọn xem bao
// nhiêu dòng — đó chính là chỗ chủ dự án phản ánh 12/08/2026 (mở /admin/students thấy
// thiếu). Không bọc `PhanTrangBang` được, vì server đã chỉ trả về đúng một trang.
//
// Cơ chế: đổi tham số `?size=` trên URL rồi `router.replace`. Đây là điều hướng CLIENT của
// Next — RSC nạp lại đúng phần dữ liệu, KHÔNG tải lại cả trang, người dùng không phải F5.
// `scroll: false` để danh sách không nhảy về đầu trang khi chỉ đổi số dòng.
//
// ⚠️ Đổi số dòng thì PHẢI xoá `page`: đang ở trang 7 với 20 dòng mà chuyển sang 100 dòng
// thì trang 7 không còn tồn tại, người dùng rơi vào bảng trắng.

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useTransition } from "react";
import { MUC_SO_DONG, SO_DONG_MAC_DINH } from "@/lib/ui/phan-trang";
import { cn } from "@/lib/utils";

// ⚠️ `docSoDong` KHÔNG ở file này: Server Component phải gọi được nó, mà file này là
// `"use client"`. Xem lib/ui/phan-trang.ts (sự cố 12/08/2026).

export function ChonSoDong({
  soDong,
  tong,
  tenDonVi = "dòng",
  className,
}: {
  soDong: number;
  /** Tổng bản ghi (sau bộ lọc) — chỉ để hiện cho người dùng biết đang xem trên tổng bao nhiêu. */
  tong?: number;
  tenDonVi?: string;
  className?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, start] = useTransition();
  const id = useId();

  function doi(n: number) {
    const p = new URLSearchParams(searchParams?.toString() ?? "");
    if (n === SO_DONG_MAC_DINH) p.delete("size");
    else p.set("size", String(n));
    p.delete("page"); // xem ghi chú đầu file
    start(() => router.replace(`?${p.toString()}`, { scroll: false }));
  }

  return (
    <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
      <label htmlFor={id} className="whitespace-nowrap">
        Hiển thị
      </label>
      <select
        id={id}
        value={soDong}
        disabled={pending}
        onChange={(e) => doi(Number(e.target.value))}
        className="h-8 rounded-lg border border-border bg-background py-0 pl-2 pr-7 text-sm text-foreground outline-none focus:border-primary disabled:opacity-60"
      >
        {MUC_SO_DONG.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
      {typeof tong === "number" && (
        <span className="whitespace-nowrap">
          / {tong} {tenDonVi}
        </span>
      )}
    </div>
  );
}
