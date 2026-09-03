// Bộ format ngày/giờ vi-VN dùng chung (cluster dedup — trước đây lặp inline
// `new Date(x).toLocaleDateString("vi-VN", …)` ở >60 nơi).
//
// ⚠️ Behavior-preserving: KHÔNG set `timeZone` — giữ nguyên hành vi cũ (dùng
// timezone môi trường chạy, y như code inline). Đừng thêm timeZone vào đây vì
// sẽ làm lệch output so với trước.

export type DateInput = Date | string | number;

/** Múi giờ VN — chỉ dùng cho các hàm CÓ GHIM múi bên dưới. */
const VN_TZ = "Asia/Ho_Chi_Minh";

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
 * `HH:mm dd/MM/yyyy` theo giờ VIỆT NAM — mốc có kèm GIỜ cho người đọc.
 *
 * Khác `formatDateTimeVN` ở hai điểm, cả hai đều cố ý:
 *
 *   1. **GHIM `Asia/Ho_Chi_Minh`.** Các hàm trên trong file này cố tình không set
 *      `timeZone` để giữ nguyên hành vi cũ. Nhưng Vercel chạy **UTC** còn máy dev
 *      chạy +07: một lead nhận lúc 00:30 giờ VN in ra ngày HÔM TRƯỚC trên prod và
 *      đúng ngày trên máy lập trình viên — lỗi "chạy máy tôi thì được" kinh điển.
 *      Mốc có giờ mà không ghim múi thì sai nhiều hơn đúng, nên hàm MỚI này ghim.
 *   2. **GIỜ ĐỨNG TRƯỚC NGÀY.** Trong ngày cao điểm, thứ Sale cần là thứ tự nhận
 *      lead trong cùng một ngày; để giờ ở cuối thì phải đọc hết chuỗi mới thấy nó.
 *
 * Định dạng khớp ĐÚNG cột "Ngày nhận lead" trên bảng `/leads` — cùng một mốc thì
 * phải in ra cùng một chuỗi, kẻo người dùng tưởng là hai mốc khác nhau.
 */
export function formatDateTimeVNZoned(input: DateInput): string {
  const d = new Date(input);
  const gio = d.toLocaleTimeString("vi-VN", {
    timeZone: VN_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
  const ngay = d.toLocaleDateString("vi-VN", {
    timeZone: VN_TZ,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${gio} ${ngay}`;
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
