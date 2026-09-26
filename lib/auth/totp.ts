// lib/auth/totp.ts — mã xác thực 2 lớp theo thời gian (TOTP, RFC 6238 trên HOTP RFC 4226).
// THUẦN, không chạm DB, không thêm thư viện: chỉ `crypto` của Node.
//
// Dùng cho xác thực 2 lớp của người giữ quyền Cổng dữ liệu agent (spec §0 nguyên tắc 2,
// câu 5 mục 15). Khác hẳn `lib/otp/*`: đó là mã MỘT LẦN GỬI QUA KÊNH (Zalo/email) cho
// kích hoạt và quên mật khẩu — lộ kênh là lộ mã. TOTP sinh ngay trên điện thoại của người
// dùng từ một bí mật chung, không đi qua mạng.
//
// Tham số cố định theo mặc định mà mọi ứng dụng xác thực hiểu (Google Authenticator,
// Microsoft Authenticator, 1Password…): SHA-1, 6 chữ số, bước 30 giây. Đổi bất kỳ tham số
// nào là mã trên điện thoại không còn khớp — đừng "nâng cấp" lên SHA-256 ở đây.
import { createHmac, randomBytes } from "crypto";

const BANG_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export const BUOC_GIAY = 30;
export const SO_CHU_SO = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BANG_BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BANG_BASE32[(value << (5 - bits)) & 31];
  return out;
}

/** Nhận cả chữ thường, dấu cách, dấu `=` đệm (người dùng hay gõ tay kiểu đó). Ký tự lạ → ném. */
export function base32Decode(s: string): Buffer {
  const sach = s.toUpperCase().replace(/[\s=]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of sach) {
    const idx = BANG_BASE32.indexOf(ch);
    if (idx < 0) throw new Error("Chuỗi base32 không hợp lệ.");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** Bí mật mới: 20 byte (160 bit — đúng độ dài khoá HMAC-SHA1 mà RFC 4226 khuyến nghị). */
export function sinhBiMatTotp(): string {
  return base32Encode(randomBytes(20));
}

/** HOTP (RFC 4226 §5.3): HMAC-SHA1 → cắt động → `soChuSo` chữ số. */
export function maHotp(khoa: Buffer, boDem: number, soChuSo = SO_CHU_SO): string {
  const msg = Buffer.alloc(8);
  // Bộ đếm 64 bit big-endian. Số bước TOTP còn xa mới vượt 2^53 nên tách hai nửa là đủ.
  msg.writeUInt32BE(Math.floor(boDem / 0x1_0000_0000), 0);
  msg.writeUInt32BE(boDem >>> 0, 4);
  const h = createHmac("sha1", khoa).update(msg).digest();
  const o = h[h.length - 1] & 0x0f;
  const nhiPhan =
    ((h[o] & 0x7f) << 24) | ((h[o + 1] & 0xff) << 16) | ((h[o + 2] & 0xff) << 8) | (h[o + 3] & 0xff);
  return String(nhiPhan % 10 ** soChuSo).padStart(soChuSo, "0");
}

/** Số bước (bộ đếm TOTP) tại một thời điểm. */
export function buocTaiThoiDiem(thoiDiemMs: number): number {
  return Math.floor(thoiDiemMs / 1000 / BUOC_GIAY);
}

export function maTotp(biMatBase32: string, thoiDiemMs: number, soChuSo = SO_CHU_SO): string {
  return maHotp(base32Decode(biMatBase32), buocTaiThoiDiem(thoiDiemMs), soChuSo);
}

/**
 * Kiểm một mã người dùng gõ. Trả SỐ BƯỚC đã khớp (để người gọi lưu làm `buocDaDungCuoi`),
 * hoặc `null` nếu sai.
 *
 * - `cuaSo` = số bước lệch cho phép mỗi phía (mặc định 1 ⇒ ±30 giây) — bù đồng hồ điện
 *   thoại lệch và người gõ chậm.
 * - `buocDaDungCuoi`: mã của một bước đã dùng thì KHÔNG nhận lại (chống phát lại — người
 *   nhìn trộm màn hình không dùng lại được mã vừa gõ). Bước phải LỚN HƠN hẳn bước đã dùng.
 * - So sánh từng ứng viên đủ cả vòng, không thoát sớm theo vị trí ký tự.
 */
export function kiemMaTotp(
  biMatBase32: string,
  ma: string,
  thoiDiemMs: number,
  opts: { cuaSo?: number; buocDaDungCuoi?: number | null } = {},
): number | null {
  const sach = ma.replace(/\s/g, "");
  if (!/^\d{6}$/.test(sach)) return null;
  let khoa: Buffer;
  try {
    khoa = base32Decode(biMatBase32);
  } catch {
    return null;
  }
  // Bí mật rỗng/cụt thì HMAC vẫn chạy và vẫn ra mã — nhận nó là mở cửa cho ai đoán mã.
  if (khoa.length < 10) return null;
  const hienTai = buocTaiThoiDiem(thoiDiemMs);
  const cuaSo = opts.cuaSo ?? 1;
  let khop: number | null = null;
  for (let d = -cuaSo; d <= cuaSo; d++) {
    const buoc = hienTai + d;
    if (buoc < 0) continue;
    if (opts.buocDaDungCuoi != null && buoc <= opts.buocDaDungCuoi) continue;
    if (maHotp(khoa, buoc) === sach && khop === null) khop = buoc;
  }
  return khop;
}

/** Chuỗi `otpauth://` để ứng dụng xác thực quét (hoặc gõ tay bí mật). */
export function uriOtpAuth(opts: { biMat: string; taiKhoan: string; nhaPhatHanh: string }): string {
  const nhan = encodeURIComponent(`${opts.nhaPhatHanh}:${opts.taiKhoan}`);
  const q = new URLSearchParams({
    secret: opts.biMat,
    issuer: opts.nhaPhatHanh,
    algorithm: "SHA1",
    digits: String(SO_CHU_SO),
    period: String(BUOC_GIAY),
  });
  return `otpauth://totp/${nhan}?${q.toString()}`;
}
