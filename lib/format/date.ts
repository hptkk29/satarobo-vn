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

/**
 * Ngày cho HIỂN THỊ khi field có thể "không có ngày". Coi các giá trị sentinel là
 * "—" thay vì in "1/1/1970":
 *   - null / undefined / chuỗi rỗng
 *   - Invalid Date (parse thất bại)
 *   - mốc epoch 1970 (seed cũ set `new Date(0)` thay vì null → getTime()=0)
 * Không có ngày vào làm / hạn nộp nào hợp lệ rơi vào năm 1970 nên cắt ở đây an toàn.
 */
export function formatDateOrDash(input: DateInput | null | undefined): string {
  if (input == null || input === "") return "—";
  const d = new Date(input);
  if (Number.isNaN(d.getTime()) || d.getUTCFullYear() <= 1970) return "—";
  return formatDateVN(d);
}
