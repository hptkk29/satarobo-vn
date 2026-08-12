// lib/ui/phan-trang.ts — HẰNG SỐ + HÀM THUẦN của phân trang, dùng được ở CẢ hai phía.
//
// ⚠️ FILE NÀY KHÔNG ĐƯỢC CÓ `"use client"`. Đó là toàn bộ lý do nó tồn tại.
//
// Sự cố 12/08/2026: `docSoDong()` ban đầu nằm trong `components/ui/chon-so-dong.tsx` —
// một file `"use client"`. Server Component gọi nó thì Next ném ngay lúc chạy:
//   "Attempted to call docSoDong() from the server but docSoDong is on the client."
// `tsc` và `next build` đều XANH, vì đây là ràng buộc RUNTIME của RSC chứ không phải lỗi
// kiểu. Người dùng thấy màn hình lỗi kèm mã digest, còn nguyên nhân thì nằm trong log
// server. Bài học: hằng số và hàm thuần dùng chung phải ở module KHÔNG đánh dấu phía nào.

/** Các mức số dòng/trang người dùng chọn được. */
export const MUC_SO_DONG = [10, 20, 50, 100] as const;

/** Mặc định cho MỌI bảng trong hệ (chủ dự án chốt 11/08/2026). */
export const SO_DONG_MAC_DINH = 20;

/**
 * Đọc `?size=` từ searchParams. Chỉ nhận đúng 4 mức trên; mọi thứ khác → mặc định.
 *
 * Chặt tay là có chủ đích: đây là tham số người dùng gõ thẳng vào thanh địa chỉ, và
 * `?size=99999` sẽ thành `take: 99999` trong truy vấn — một cách làm sập trang bằng URL.
 */
export function docSoDong(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return MUC_SO_DONG.includes(n as (typeof MUC_SO_DONG)[number]) ? n : SO_DONG_MAC_DINH;
}
