"use client";

/**
 * Site Sale — ô chọn ngày của màn "Chấm công".
 *
 * ── BẢN ĐÔI CỦA `app/(admin)/admin/cham-cong/_components/date-nav-input.tsx` ──
 * Tách bản riêng theo chốt 04/09/2026 (site Sale không dùng chung component với
 * khu quản trị). Bản admin GIỮ NGUYÊN, không sửa.
 *
 * 🔴 ĐÂY LÀ LÝ DO CHÍNH PHẢI TÁCH, KHÔNG PHẢI THẨM MỸ. Bản admin đẩy về
 *    `router.push("/cham-cong?date=…")` — ĐƯỜNG SẠCH CỦA HOST QUẢN TRỊ. Bản
 *    mount cũ của site Sale dùng thẳng component đó, nên trên
 *    `sale.satarobo.vn` mỗi lần đổi ngày là `decideRoute` viết lại thành
 *    `/sale/cham-cong` (may) — nhưng trên host "không xác định" (localhost,
 *    test.satarobo.vn) thì `/cham-cong` là **404 trắng trơn**: người dùng đổi
 *    ngày và mất luôn trang. Ở đây đường viết TƯỜNG MINH `/sale/cham-cong`.
 *
 * Hành vi giữ nguyên: đổi giá trị là điều hướng ngay (không có nút "Áp dụng").
 * Trước bản admin để input trong một `<form>` trơ nên đổi ngày KHÔNG nạp lại dữ
 * liệu — nội dung đứng ở ngày cũ. Đừng quay lại hình dạng đó.
 */
import { useRouter } from "next/navigation";

export function OChonNgay({ giaTri }: { giaTri: string }) {
  const router = useRouter();
  return (
    <input
      type="date"
      aria-label="Ngày chấm công"
      defaultValue={giaTri}
      onChange={(e) => {
        if (e.target.value) router.push(`/sale/cham-cong?date=${e.target.value}`);
      }}
      className="h-9 rounded-lg border border-border bg-card px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/30"
    />
  );
}
