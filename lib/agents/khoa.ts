// lib/agents/khoa.ts — khoá của Cổng dữ liệu agent (spec §4.1, §4.6). THUẦN, không chạm DB.
//
// Bốn loại chuỗi, tiền tố cố định để máy quét lộ khoá (gitleaks) nhận ra:
//   agc_            mã client        — không bí mật, lưu thường
//   srk_test_/live_ mật khẩu client  — CHỈ lưu bản băm HMAC-SHA256(pepper, …)
//   sra_            token truy cập   — CHỈ lưu bản băm, sống ngắn
// Khoá ký `srs_` (công cụ GHI) thuộc Đợt 6 và cố ý CHƯA có ở đây: cách lưu nó đang
// chờ quyết định (BA §5 X2 — luật "secret chỉ nằm trong env").
//
// ⚠️ KHÔNG BAO GIỜ in giá trị của các chuỗi này ra log, lỗi, Sentry hay URL.
import { createHmac, randomBytes } from "crypto";

export type MoiTruongCong = "test" | "live";

export const TIEN_TO = {
  client: "agc_",
  matKhauTest: "srk_test_",
  matKhauLive: "srk_live_",
  token: "sra_",
} as const;

/** Độ dài tối thiểu của pepper — cùng ngưỡng với khoá ký phiên (`lib/security/signing-key.ts`). */
export const DO_DAI_PEPPER_TOI_THIEU = 32;

/** base64url của `soByte` byte ngẫu nhiên từ CSPRNG. 32 byte = 256 bit (spec §4.1). */
export function chuoiNgauNhien(soByte = 32): string {
  return randomBytes(soByte).toString("base64url");
}

export function sinhMaClient(): string {
  return TIEN_TO.client + chuoiNgauNhien(16);
}

export function sinhMatKhauClient(moiTruong: MoiTruongCong): string {
  return (moiTruong === "live" ? TIEN_TO.matKhauLive : TIEN_TO.matKhauTest) + chuoiNgauNhien(32);
}

export function sinhToken(): string {
  return TIEN_TO.token + chuoiNgauNhien(32);
}

/**
 * Bản băm để LƯU và để TRA: HMAC-SHA256(pepper, giá trị), dạng hex.
 *
 * Tra theo bản băm (`WHERE secretHash = …`) thay vì đọc ra rồi so: DB không bao giờ giữ
 * bản rõ, và phép so nằm trong chỉ mục nên không lộ độ dài tiền tố khớp.
 * Pepper sai khuôn thì NÉM — đường gọi phải bắt và từ chối (fail closed, spec nguyên tắc 7),
 * không được "băm tạm bằng pepper rỗng".
 */
export function bamBiMat(giaTri: string, pepper: string): string {
  if (typeof pepper !== "string" || pepper.length < DO_DAI_PEPPER_TOI_THIEU) {
    throw new Error("Pepper của cổng agent thiếu hoặc quá ngắn.");
  }
  return createHmac("sha256", pepper).update(giaTri, "utf8").digest("hex");
}

/** Mật khẩu client thuộc môi trường nào (theo tiền tố). Sai khuôn → null. */
export function moiTruongCuaMatKhau(matKhau: string): MoiTruongCong | null {
  if (matKhau.startsWith(TIEN_TO.matKhauLive)) return "live";
  if (matKhau.startsWith(TIEN_TO.matKhauTest)) return "test";
  return null;
}

/**
 * Môi trường đang chạy. Theo đúng khuôn của `lib/auth.ts` (đọc `VERCEL_TARGET_ENV` trước):
 * `VERCEL_ENV` chỉ trả production|preview|development nên KHÔNG phân biệt được môi trường
 * tuỳ biến "test" với nhau — nhưng ở đây ta chỉ cần biết "có phải production không".
 *
 * Chỉ ĐÚNG giá trị "production" mới là `live`. Mọi thứ khác (test, preview, máy dev) là `test`:
 * khoá `srk_live_` không bao giờ mở được cổng ngoài production, đó là chiều an toàn.
 */
export function moiTruongHienTai(env: Record<string, string | undefined> = process.env): MoiTruongCong {
  const ten = (env.VERCEL_TARGET_ENV ?? env.VERCEL_ENV ?? "").trim().toLowerCase();
  return ten === "production" ? "live" : "test";
}

/** Pepper của cổng, hoặc null nếu thiếu/quá ngắn (đường gọi phải từ chối). */
export function docPepperCong(env: Record<string, string | undefined> = process.env): string | null {
  const p = env.AGENT_GATEWAY_PEPPER;
  return typeof p === "string" && p.length >= DO_DAI_PEPPER_TOI_THIEU ? p : null;
}

/** `Authorization: Basic base64(id:secret)` → cặp. Sai khuôn → null (không nói sai phần nào). */
export function tachBasicAuth(header: string | null | undefined): { clientId: string; matKhau: string } | null {
  if (!header) return null;
  const m = /^Basic\s+([A-Za-z0-9+/=_-]+)\s*$/i.exec(header);
  if (!m) return null;
  let giaiMa: string;
  try {
    giaiMa = Buffer.from(m[1], "base64").toString("utf8");
  } catch {
    return null;
  }
  const i = giaiMa.indexOf(":");
  if (i <= 0 || i === giaiMa.length - 1) return null;
  return { clientId: giaiMa.slice(0, i), matKhau: giaiMa.slice(i + 1) };
}

/** `Authorization: Bearer sra_…` → token. Không đúng tiền tố → null. */
export function tachBearer(header: string | null | undefined): string | null {
  if (!header) return null;
  const m = /^Bearer\s+(\S+)\s*$/i.exec(header);
  if (!m || !m[1].startsWith(TIEN_TO.token)) return null;
  return m[1];
}
