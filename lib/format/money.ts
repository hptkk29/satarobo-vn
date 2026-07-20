// LIB-07 — format tiền VND. 1 nguồn thay ~7 chỗ inline `x.toLocaleString("vi-VN") + "đ"`.
// KHÁC formatVnd (lib/utils.ts) dùng style:"currency" → glyph "₫". Bản này dùng "đ"
// (thường trong email/PDF/notification). withSpace giữ ĐÚNG khoảng trắng từng call-site
// cũ (một số " đ", một số "đ") → behavior-preserving.

/** "1.000.000 đ" (withSpace=true, mặc định) hoặc "1.000.000đ" (false). */
export function formatVndPlain(amount: number, withSpace = true): string {
  return amount.toLocaleString("vi-VN") + (withSpace ? " đ" : "đ");
}

/**
 * Rút gọn tiền cho TRỤC biểu đồ (tránh nhãn 8 chữ số "10000000" bị cắt):
 *   10.000.000 → "10tr" · 7.500.000 → "7,5tr" · 1.500.000.000 → "1,5 tỷ" · 900 → "900".
 * Chỉ dùng cho hiển thị trục/nhãn gọn — số đầy đủ vẫn ở tooltip/bảng.
 */
export function formatVndCompact(amount: number): string {
  const abs = Math.abs(amount);
  const trim = (n: number) =>
    Number(n.toFixed(1)).toLocaleString("vi-VN"); // 7.5 → "7,5", 10 → "10"
  if (abs >= 1_000_000_000) return `${trim(amount / 1_000_000_000)} tỷ`;
  if (abs >= 1_000_000) return `${trim(amount / 1_000_000)}tr`;
  if (abs >= 1_000) return `${trim(amount / 1_000)}k`;
  return String(Math.round(amount));
}
