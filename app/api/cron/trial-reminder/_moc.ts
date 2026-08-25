// Phần TÍNH TOÁN thuần của cron nhắc buổi trải nghiệm — tách khỏi `route.ts` để test
// được mà không phải dựng Prisma/Next. Không import gì chạm DB, mạng hay `server-only`.

import { vnParts } from "@/lib/time/vn";

/**
 * Mốc bắt đầu THẬT của một buổi.
 *
 * ⚠️ Hai nửa dữ liệu nằm ở hai quy ước khác nhau, ghép sai là lệch 7 tiếng:
 *   - `date` là cột `@db.Date` ⇒ Prisma trả về **UTC 00:00 của NGÀY VN** (vd buổi ngày
 *     26/08 giờ VN → `2026-08-26T00:00:00.000Z`), KHÔNG phải nửa đêm giờ VN;
 *   - `startTime` là chuỗi "HH:mm" đọc theo ĐỒNG HỒ VN.
 * Nên: lấy mốc UTC-midnight, cộng giờ-phút VN, rồi trừ 7 tiếng để về UTC thật.
 * Kết quả trùng đúng `vnDateAt(y, m, d, hh, mm)`.
 *
 * Trả `null` khi `startTime` sai định dạng — buổi hỏng dữ liệu thì bỏ qua, không đoán.
 */
export function mocBatDau(date: Date, startTime: string): Date | null {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(startTime);
  if (!m) return null;
  const ms =
    date.getTime() + (Number(m[1]) * 60 + Number(m[2])) * 60_000 - 7 * 3_600_000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type TenMoc = "1-ngay" | "2-gio";

/** Cửa sổ nhắc, tính bằng GIỜ còn lại tới lúc buổi bắt đầu: `[tuGio, denGio)`. */
export interface Moc {
  ten: TenMoc;
  tuGio: number;
  denGio: number;
}

/**
 * ⚠️ VÌ SAO CỬA SỔ RỘNG HƠN MỐC DANH NGHĨA — nhưng chỉ rộng hơn MỘT CHÚT (lỗi #21):
 *
 * Cron chạy nhịp cố định `0 * * * *` (mỗi giờ, `vercel.json`) và Vercel Cron không đảm
 * bảo đúng phút — có thể trễ vài phút. Cửa sổ HẸP HƠN nhịp cron sẽ để buổi rơi vào khe
 * giữa hai lần chạy và KHÔNG BAO GIỜ được nhắc. Nên cửa sổ phải ≥ 1h, đặt ĐỐI XỨNG
 * quanh mốc danh nghĩa: "1 ngày" lấy 23h–25h (2h, có dự phòng), "2 giờ" lấy 1,5h–2,5h
 * (đúng 1h — biên tối thiểu; nới rộng nữa thì chuông "sắp bắt đầu" phát từ 3,5h trước,
 * mất hết ý nghĩa của mốc này).
 *
 * Ngược lại, rộng quá cũng sai: bản cũ để 12h–36h và 1h–3h. Vì `dedupeKey` là vĩnh viễn,
 * chuông phát ở LẦN CHẠM MÉP TRÊN ĐẦU TIÊN — tức ~36 tiếng trước buổi cho mốc "1 ngày",
 * trong khi nội dung lại in "ngày mai" còn buổi thật ở NGÀY KIA.
 *
 * Hệ quả có chủ đích: một buổi có thể lọt vào cửa sổ ở HAI lần chạy liên tiếp. Không sao —
 * `dedupeKey` gồm cả tên mốc nên lần thứ hai chỉ chạm lại bản ghi cũ, không kêu hai lần.
 */
export const MOC: readonly Moc[] = [
  { ten: "1-ngay", tuGio: 23, denGio: 25 },
  { ten: "2-gio", tuGio: 1.5, denGio: 2.5 },
];

/** Mốc khớp với số giờ còn lại, hoặc `undefined` nếu buổi chưa/đã qua cửa sổ. */
export function chonMoc(conBaoLauGio: number): Moc | undefined {
  return MOC.find((m) => conBaoLauGio >= m.tuGio && conBaoLauGio < m.denGio);
}

/**
 * Nhãn thời điểm THẬT theo đồng hồ VN, thay cho chữ tương đối ("ngày mai", "2 tiếng nữa").
 * Chữ tương đối luôn có nguy cơ lệch với cửa sổ cron; ngày-giờ thật thì không bao giờ sai.
 */
export function nhanThoiDiem(batDau: Date): { gio: string; ngay: string } {
  const p = vnParts(batDau);
  return {
    gio: `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`,
    ngay: `${String(p.day).padStart(2, "0")}/${String(p.month + 1).padStart(2, "0")}`,
  };
}
