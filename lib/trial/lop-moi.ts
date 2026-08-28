// lib/trial/lop-moi.ts — luật THUẦN cho lớp trải nghiệm kiểu mới (28/08/2026).
//
// Chủ dự án 28/08: lớp chỉ còn "tên lớp (tự sinh) · cơ sở · khoá trải nghiệm"; giờ,
// phòng, giáo viên chuyển xuống TỪNG BUỔI. Hai luật mới sinh ra từ đó nằm ở đây, tách
// khỏi Server Action để kiểm được không cần Postgres.
//
// File THUẦN: không import Prisma/auth, client component kéo theo được.

/** Bỏ dấu tiếng Việt rồi giữ lại chữ-số, viết hoa. "Cơ sở 1" → "COSO1". */
function chuanHoaMaCoSo(raw: string): string {
  const khongDau = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
  return khongDau.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
}

/**
 * Tên lớp theo quy ước 28/08: `Cơ sở_Lớp trial số`.
 *
 * Mã cơ sở do người nhập nên đã gặp đủ kiểu ("cs1", "Cơ sở 1", "CS-1"); chuẩn hoá ở
 * đây vì tên lớp đi thẳng vào phiếu gửi phụ huynh. Mã rỗng vẫn ra tên đọc được ("CS_…")
 * thay vì một chuỗi cụt bắt đầu bằng dấu gạch dưới.
 */
export function tenLopTrial(maCoSo: string, so: number): string {
  const ma = chuanHoaMaCoSo(maCoSo) || "CS";
  return `${ma}_Lớp trial ${so}`;
}

export type KhungGio = { startTime: string; endTime: string };

/** "HH:MM" → phút. `null` nếu không đúng định dạng. */
function phut(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  if (!m) return null;
  const h = Number(m[1]);
  const p = Number(m[2]);
  if (h > 23 || p > 59) return null;
  return h * 60 + p;
}

/**
 * Hai khung giờ có ĐÈ LÊN NHAU không — dùng để đánh dấu giáo viên đang bận.
 *
 * Sát nhau KHÔNG tính là trùng: dạy 18:00–19:30 rồi 19:30–21:00 là lịch hợp lệ, đánh
 * dấu bận ở đó là ép người xếp lịch bỏ qua cảnh báo, và cảnh báo bị bỏ qua thường
 * xuyên thì thành vô dụng.
 *
 * Giờ hỏng (thiếu / sai định dạng — buổi cũ có thể có) trả `false` chứ KHÔNG ném: hậu
 * quả đúng của dữ liệu hỏng là "không đánh dấu được", không phải "cả form chết".
 */
export function trungKhungGio(a: KhungGio, b: KhungGio): boolean {
  const a1 = phut(a.startTime);
  const a2 = phut(a.endTime);
  const b1 = phut(b.startTime);
  const b2 = phut(b.endTime);
  if (a1 === null || a2 === null || b1 === null || b2 === null) return false;
  return a1 < b2 && b1 < a2;
}
