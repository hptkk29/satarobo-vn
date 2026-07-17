// Bộ format ngày/giờ vi-VN dùng chung (cluster dedup — trước đây lặp inline
// `new Date(x).toLocaleDateString("vi-VN", …)` ở >60 nơi).
//
// ⚠️ Behavior-preserving: KHÔNG set `timeZone` — giữ nguyên hành vi cũ (dùng
// timezone môi trường chạy, y như code inline). Đừng thêm timeZone vào đây vì
// sẽ làm lệch output so với trước.

export type DateInput = Date | string | number;

/** `dd/M/yyyy` mặc định vi-VN — thay cho `new Date(x).toLocaleDateString("vi-VN")`. */
export function formatDateVN(input: DateInput): string {
  return new Date(input).toLocaleDateString("vi-VN");
}

/** `dd/MM/yyyy` (2 chữ số ngày+tháng) — biến thể có option cố định lặp nhiều nơi. */
export function formatDateDMY(input: DateInput): string {
  return new Date(input).toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Ngày + giờ vi-VN — thay cho `new Date(x).toLocaleString("vi-VN")`. */
export function formatDateTimeVN(input: DateInput): string {
  return new Date(input).toLocaleString("vi-VN");
}
