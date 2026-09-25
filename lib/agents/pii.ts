// lib/agents/pii.ts — che dữ liệu cá nhân TRƯỚC KHI trả cho agent (spec §6). THUẦN.
//
// ── KHÁC `lib/lead/pii.ts` Ở ĐÂU, VÀ VÌ SAO KHÔNG DÙNG CHUNG ─────────────────────────
// `lib/lead/pii.ts` che MỘT PHẦN cho màn admin ("Nguyễn T. L.", "0905•••456") để người
// không có `leads:view-pii` vẫn phân biệt được lead. Agent thì KHÔNG cần phân biệt bằng
// mắt, và spec đòi nhãn TOÀN PHẦN (`[TÊN_PH]`, `[SĐT]`…) + mã băm SĐT để phát hiện trùng.
// Sửa `lib/lead/pii.ts` cho agent là đổi hành vi của mọi màn admin đang dùng nó (BA §10).
// Chỉ TÁI DÙNG hai biểu thức "trông giống liên hệ" — nguồn duy nhất của câu hỏi đó.
//
// ⚠️ Đây là rào chống TIỆN TAY, không chống cố ý (cùng lời cảnh báo ở `lib/lead/pii.ts`):
// khách gõ số tách cụm lạ, gửi ảnh chụp danh thiếp… vẫn lọt. Đừng bán nó như bảo đảm.
import { createHmac } from "crypto";
import { canonicalPhone } from "@/lib/phone";
import { DO_DAI_PEPPER_TOI_THIEU } from "./khoa";

export const NHAN = {
  TEN_PH: "[TÊN_PH]",
  TEN_CON: "[TÊN_CON]",
  SDT: "[SĐT]",
  EMAIL: "[EMAIL]",
  DIA_CHI: "[ĐỊA_CHỈ]",
  CCCD: "[CCCD]",
  SO_TK: "[SỐ_TK]",
  ANH: "[ẢNH]",
  TEP: "[TỆP]",
} as const;

/** Pepper RIÊNG cho mã băm SĐT (spec §6: "pepper_riêng") — KHÔNG dùng chung pepper của khoá. */
export function docPepperSdt(env: Record<string, string | undefined> = process.env): string | null {
  const p = env.AGENT_PII_PEPPER;
  return typeof p === "string" && p.length >= DO_DAI_PEPPER_TOI_THIEU ? p : null;
}

/**
 * `sdt_ma_hoa` (spec §6): 16 ký tự đầu của HMAC-SHA256(pepper_riêng, SĐT dạng E.164).
 * Hai lead cùng số ⇒ cùng mã, dù DB lưu "0905…", "84905…" hay "+84 905…" — nên chuẩn hoá
 * TRƯỚC khi băm. Số không hợp lệ/rỗng ⇒ `null` (khuôn lead cho phép null).
 *
 * `pepper` là tham số BẮT BUỘC, không mặc định, không tự đọc env: người gọi phải tự lấy và
 * tự từ chối khi thiếu — băm bằng pepper rỗng là cho ai cũng dò ngược được từ danh bạ.
 */
export function maHoaSdt(sdt: string | null | undefined, pepper: string): string | null {
  if (pepper.length < DO_DAI_PEPPER_TOI_THIEU) throw new Error("Pepper SĐT thiếu hoặc quá ngắn.");
  const chuan = canonicalPhone(sdt);
  if (!chuan) return null;
  return createHmac("sha256", pepper).update(`+${chuan}`, "utf8").digest("hex").slice(0, 16);
}

// ── Văn bản tự do ────────────────────────────────────────────────────────────────
// Rộng hơn `lib/lead/pii.ts` có chủ đích: màn admin chỉ che di động liền mạch (che rộng thì
// "học phí 2500000" bị đục), còn ở đây thà che thừa — agent không cần con số liên lạc nào.
//   · SĐT: 0/84/+84 rồi 9–10 chữ số, CHO PHÉP cách/chấm/gạch/ngoặc giữa các nhóm
//     ("0905 123 456", "+84 905.123.456", "(0905) 123 456"). Gồm cả số cố định 11 số.
//   · CCCD: dãy đúng 12 chữ số. Chạy TRƯỚC SĐT.
//   · CMND cũ 9 số: CHỈ khi đi sau từ khoá (CMND/CMT/chứng minh). Che mọi dãy 9 số là đục
//     luôn số tiền ("115200000"), mà hội thoại tư vấn nói về học phí suốt.
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const CCCD_RE = /(?<![0-9])[0-9]{12}(?![0-9])/g;
const CMND_RE = /((?:CMND|CMT|chứng minh(?: nhân dân| thư)?)\s*(?:số\s*)?[:.]?\s*)[0-9]{9}(?![0-9])/giu;
const SDT_RE = /(?<![0-9])\(?(?:\+?84|0)(?:[\s.()-]{0,2}[0-9]){9,10}(?![0-9])/g;

function thoatRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Các cách gọi một tên đã biết: tên đầy đủ, hai chữ cuối, chữ cuối ("Nguyễn Phương Quỳnh Anh"
 * → "Nguyễn Phương Quỳnh Anh", "Quỳnh Anh", "Anh"). Dài trước ngắn sau để "Quỳnh Anh" không
 * bị cắt thành "Quỳnh [TÊN_CON]".
 *
 * Chữ cuối một mình (vd "Anh", "Lan") chỉ khớp khi VIẾT HOA: "anh" viết thường giữa câu là đại
 * từ, che nó là đục nát hội thoại. Chấp nhận che thừa "Anh ơi" đầu câu — lộ tên bé còn tệ hơn.
 */
function mauTen(ten: string): { mau: RegExp }[] {
  const tu = ten.trim().split(/\s+/).filter(Boolean);
  if (tu.length === 0) return [];
  const bien = (s: string) => `(?<![\\p{L}\\p{N}])${s}(?![\\p{L}\\p{N}])`;
  const ra: { mau: RegExp }[] = [];
  // Tên nhiều chữ: khớp không phân biệt hoa thường (người gõ "nguyễn văn an" vẫn bị che).
  if (tu.length >= 2) ra.push({ mau: new RegExp(bien(tu.map(thoatRegex).join("\\s+")), "giu") });
  if (tu.length >= 3) {
    ra.push({ mau: new RegExp(bien(tu.slice(-2).map(thoatRegex).join("\\s+")), "giu") });
  }
  // Chữ cuối (kể cả tên chỉ có một chữ): chỉ khớp dạng VIẾT HOA chữ đầu. Chữ cuối một ký tự
  // ("Nguyễn Văn A") thì bỏ — che mọi chữ "A" viết hoa là đục nát văn bản.
  const cuoi = tu[tu.length - 1];
  if (cuoi.length >= 2) {
    const hoa = cuoi.charAt(0).toLocaleUpperCase("vi") + cuoi.slice(1);
    ra.push({ mau: new RegExp(bien(thoatRegex(hoa)), "gu") });
  }
  return ra;
}

/**
 * Che một đoạn văn tự do (tin nhắn, bản ghi cuộc gọi, ghi chú) — spec §6 dòng 321:
 * email, CCCD, SĐT bằng regex; tên phụ huynh / tên con ĐÃ BIẾT của đúng lead đó bằng nhãn.
 */
export function cheVanBan(
  vanBan: string,
  tenDaBiet: { phuHuynh?: readonly (string | null | undefined)[]; con?: readonly (string | null | undefined)[] } = {},
): string {
  let s = vanBan
    .replace(EMAIL_RE, NHAN.EMAIL)
    .replace(CCCD_RE, NHAN.CCCD)
    .replace(CMND_RE, `$1${NHAN.CCCD}`)
    .replace(SDT_RE, NHAN.SDT);
  const cap: { ten: string; nhan: string }[] = [
    ...(tenDaBiet.phuHuynh ?? []).filter((t): t is string => !!t?.trim()).map((ten) => ({ ten, nhan: NHAN.TEN_PH })),
    ...(tenDaBiet.con ?? []).filter((t): t is string => !!t?.trim()).map((ten) => ({ ten, nhan: NHAN.TEN_CON })),
  ];
  // Tên dài trước: che "Nguyễn Văn An" trước khi che "An".
  cap.sort((a, b) => b.ten.length - a.ten.length);
  for (const { ten, nhan } of cap) {
    for (const { mau } of mauTen(ten)) s = s.replace(mau, nhan);
  }
  return s;
}

/** Tệp đính kèm trong hội thoại: chỉ trả NHÃN, không bao giờ trả link (spec §6). */
export function nhanTepDinhKem(loaiMime: string | null | undefined): string {
  return loaiMime?.toLowerCase().startsWith("image/") ? NHAN.ANH : NHAN.TEP;
}

/** Kiểm một chuỗi còn lọt liên hệ không — cùng ba phép dò của máy kiểm `kiem-khuon.mjs`. */
export function conLotLienHe(s: string): boolean {
  return /(?:\+?84|\b0)\d{9}\b/.test(s) || /[\w.+-]+@[\w-]+\.[\w.]+/.test(s) || /\b\d{12}\b/.test(s);
}
