// lib/security/ma-hoa.ts — mã hoá hai chiều AES-256-GCM cho dữ liệu PHẢI đọc lại được.
//
// Chỉ dùng khi bắt buộc đọc lại bản rõ (vd bí mật TOTP của người dùng — phải có bản rõ để
// tính mã). Thứ chỉ cần SO KHỚP (mật khẩu, token) thì BĂM, đừng mã hoá.
//
// Khoá nằm ở biến môi trường (luật cứng Nền Hệ thống #9), mỗi môi trường một khoá riêng.
// Mất khoá = mất mọi bản mã hoá bằng nó; đổi khoá phải có đợt mã hoá lại.
//
// Khuôn bản mã: "v1.<iv>.<tag>.<ciphertext>" (base64url). Tiền tố phiên bản để sau này đổi
// thuật toán không phải đoán bản mã cũ thuộc đời nào.
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const PHIEN_BAN = "v1";

/**
 * Đọc khoá 32 byte từ env: nhận base64/base64url (44/43 ký tự) hoặc hex (64 ký tự).
 * Thiếu hoặc sai độ dài → `null`; đường gọi phải từ chối, không được dùng khoá tạm.
 */
export function docKhoaMaHoa(
  tenBien: string,
  env: Record<string, string | undefined> = process.env,
): Buffer | null {
  const raw = env[tenBien]?.trim();
  if (!raw) return null;
  const khoa = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  return khoa.length === 32 ? khoa : null;
}

export function maHoa(banRo: string, khoa: Buffer): string {
  if (khoa.length !== 32) throw new Error("Khoá mã hoá phải đúng 32 byte.");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", khoa, iv);
  const ct = Buffer.concat([c.update(banRo, "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return [PHIEN_BAN, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

/** Ném lỗi nếu bản mã bị sửa, sai khoá, hoặc sai khuôn (GCM kiểm toàn vẹn). */
export function giaiMa(banMa: string, khoa: Buffer): string {
  if (khoa.length !== 32) throw new Error("Khoá mã hoá phải đúng 32 byte.");
  const phan = banMa.split(".");
  if (phan.length !== 4 || phan[0] !== PHIEN_BAN) throw new Error("Bản mã sai khuôn.");
  const [, ivS, tagS, ctS] = phan;
  const d = createDecipheriv("aes-256-gcm", khoa, Buffer.from(ivS, "base64url"));
  d.setAuthTag(Buffer.from(tagS, "base64url"));
  return Buffer.concat([d.update(Buffer.from(ctS, "base64url")), d.final()]).toString("utf8");
}
