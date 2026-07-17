// LIB-07 — format tiền VND. 1 nguồn thay ~7 chỗ inline `x.toLocaleString("vi-VN") + "đ"`.
// KHÁC formatVnd (lib/utils.ts) dùng style:"currency" → glyph "₫". Bản này dùng "đ"
// (thường trong email/PDF/notification). withSpace giữ ĐÚNG khoảng trắng từng call-site
// cũ (một số " đ", một số "đ") → behavior-preserving.

/** "1.000.000 đ" (withSpace=true, mặc định) hoặc "1.000.000đ" (false). */
export function formatVndPlain(amount: number, withSpace = true): string {
  return amount.toLocaleString("vi-VN") + (withSpace ? " đ" : "đ");
}
