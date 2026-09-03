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

// ─── Kanban lead ──────────────────────────────────────────────────────────────

/**
 * Số thẻ hiển thị TỐI ĐA trong MỘT cột Kanban.
 *
 * Vì sao mặc định 10 mà không phải 20 như bảng: cột Kanban xếp DỌC và có 10 cột nằm
 * ngang. Một cột 50 thẻ đẩy trang dài ra tới mức muốn xem cột kế bên phải cuộn dọc về
 * đầu rồi cuộn ngang — đúng cái làm người dùng bỏ chế độ Kanban. Mười thẻ là vừa một
 * màn hình, và người cần xem sâu hơn thì có ô chọn ngay trên đầu.
 *
 * Mức chọn dùng chung `MUC_SO_DONG` với bảng (10/20/50/100), chỉ khác GIÁ TRỊ MẶC ĐỊNH.
 */
export const SO_THE_MOI_COT_MAC_DINH = 10;

/**
 * Đọc `?size=` cho Kanban. Dùng CHUNG tham số với bảng — đổi số ở chế độ này rồi bấm
 * sang chế độ kia thì giữ nguyên lựa chọn, không phải đặt lại.
 *
 * Chặt tay như `docSoDong`: chỉ nhận đúng 4 mức, mọi thứ khác về mặc định.
 */
export function docSoTheMoiCot(raw: string | string[] | undefined): number {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return MUC_SO_DONG.includes(n as (typeof MUC_SO_DONG)[number]) ? n : SO_THE_MOI_COT_MAC_DINH;
}
