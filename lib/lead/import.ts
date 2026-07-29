// Module CRM & Lead PHẦN 1 — format file Excel nhập lead (CHUẨN cho skill AI).
//
// Cột CỐ ĐỊNH (đúng thứ tự) — đây là CHUẨN file mẫu import lead:
//   [Tên phụ huynh | SĐT | Email | Tên con | Tuổi con | Cơ sở (mã CS, để trống)
//    | Khoá quan tâm | Nguồn | Ghi chú]
// Pure — không "use server", testable. Mã cơ sở chỉ chuẩn hoá format; tính hợp lệ
// (CS1/CS2/CS3…) do call-site validate động theo Center active (không hardcode).

import { canonicalPhone, isValidPhoneVN } from "@/lib/phone";

export const LEAD_IMPORT_CENTER_HEADER = "Cơ sở (mã CS, để trống)";

export const LEAD_IMPORT_COLUMNS = [
  "Tên phụ huynh",
  "SĐT",
  "Email",
  "Tên con",
  "Tuổi con",
  LEAD_IMPORT_CENTER_HEADER,
  "Khoá quan tâm",
  "Nguồn",
  "Ghi chú",
] as const;

// AUTH-SĐT P1 — 3 hàm dưới đây từng là bản chuẩn hoá RIÊNG của luồng import
// (cho ra `0…`, đối nghịch với `lib/crm/lead-qualify.ts` cho ra `84…`). Nay chỉ
// còn là lớp mỏng bọc `lib/phone.ts`. Giữ tên cũ để 4 call-site import/precheck
// không phải đổi, nhưng **đầu ra đã là canonical `84XXXXXXXXX`**.
export { PHONE_VN_RE as PHONE_VN } from "@/lib/phone";

/**
 * Chuẩn hoá SĐT về canonical. Chuỗi không hợp lệ trả về **dạng đã bỏ ký tự
 * trình bày** (không phải rỗng) để `parseLeadImportRow` phân biệt được
 * "thiếu SĐT" với "SĐT sai định dạng" khi báo lỗi cho người import.
 */
export function normalizePhone(raw: unknown): string {
  return canonicalPhone(raw) ?? String(raw ?? "").replace(/[\s .\-()]/g, "").trim();
}

export function isValidPhone(phone: string): boolean {
  return isValidPhoneVN(phone);
}

/** Tuổi con: số nguyên 3–18 hoặc null (rỗng). */
export function parseChildAge(raw: unknown): { age: number | null } | { error: string } {
  if (raw === null || raw === undefined || String(raw).trim() === "") return { age: null };
  const n = typeof raw === "number" ? raw : parseInt(String(raw).trim(), 10);
  if (!Number.isFinite(n) || n < 3 || n > 18) return { error: "Tuổi con phải từ 3 đến 18" };
  return { age: n };
}

/**
 * Chuẩn hoá mã cơ sở nhập tay → mã in hoa (vd "CS1") hoặc null (để trống).
 * KHÔNG hardcode danh sách CS hợp lệ — call-site resolve theo Center active.
 * Chỉ chặn format rõ ràng sai (ký tự lạ) để báo lỗi sớm.
 */
export function normalizeCenterCode(raw: unknown): { code: string | null } | { error: string } {
  const s = String(raw ?? "").trim().toUpperCase().replace(/\s+/g, "");
  if (s === "") return { code: null };
  if (!/^[A-Z0-9_]{2,16}$/.test(s)) {
    return { error: `Mã cơ sở không hợp lệ (nhận: "${raw}")` };
  }
  return { code: s };
}

/**
 * Cơ sở MẶC ĐỊNH khi ô "Cơ sở" để trống (26/07). Người chỉ nhìn thấy 1 cơ sở (QL cơ
 * sở / sale cơ sở) → lead tự về cơ sở đó; nhìn thấy nhiều cơ sở mà có cơ sở gốc trong
 * danh sách → dùng cơ sở gốc; HO/SUPER_ADMIN ("ALL") → null như cũ (lead không gắn cơ sở).
 * THUẦN để test không cần DB.
 */
export function resolveDefaultCenterId(
  visibleCenterIds: "ALL" | readonly string[],
  ownCenterId: string | null | undefined,
): string | null {
  if (visibleCenterIds === "ALL") return null;
  if (visibleCenterIds.length === 1) return visibleCenterIds[0] ?? null;
  if (ownCenterId && visibleCenterIds.includes(ownCenterId)) return ownCenterId;
  return null;
}

export interface ParsedLeadRow {
  parentName: string;
  phone: string;
  email: string | null;
  childName: string | null;
  childAge: number | null;
  centerCode: string | null; // mã CS (resolve hợp lệ ở DB) / null
  courseRaw: string | null; // khoá quan tâm (resolve ở DB)
  source: string;
  note: string | null;
}

function cell(raw: Record<string, unknown>, key: string): string {
  return String(raw[key] ?? "").trim();
}

/** Validate 1 dòng (phần thuần): tên + SĐT + tuổi + cơ sở. Course resolve ở DB. */
export function parseLeadImportRow(
  raw: Record<string, unknown>,
): { ok: true; data: ParsedLeadRow } | { ok: false; error: string } {
  const parentName = cell(raw, "Tên phụ huynh");
  if (parentName.length < 2) return { ok: false, error: "Thiếu tên phụ huynh" };

  const phone = normalizePhone(raw["SĐT"]);
  if (!phone) return { ok: false, error: "Thiếu SĐT" };
  if (!isValidPhone(phone)) return { ok: false, error: `SĐT không hợp lệ: "${cell(raw, "SĐT")}"` };

  const ageRes = parseChildAge(raw["Tuổi con"]);
  if ("error" in ageRes) return { ok: false, error: ageRes.error };

  const centerRes = normalizeCenterCode(raw[LEAD_IMPORT_CENTER_HEADER]);
  if ("error" in centerRes) return { ok: false, error: centerRes.error };

  const email = cell(raw, "Email") || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: `Email không hợp lệ: "${email}"` };
  }

  return {
    ok: true,
    data: {
      parentName,
      phone,
      email,
      childName: cell(raw, "Tên con") || null,
      childAge: ageRes.age,
      centerCode: centerRes.code,
      courseRaw: cell(raw, "Khoá quan tâm") || null,
      source: cell(raw, "Nguồn") || "Import Excel",
      note: cell(raw, "Ghi chú") || null,
    },
  };
}
