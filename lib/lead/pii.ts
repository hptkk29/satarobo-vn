// lib/lead/pii.ts — #11 T2 (OI-4, Kiệt ký 10/07): mask PII lead theo quyền leads:view-pii.
//
// Q7 — PII lead gồm: SĐT, email, tên PH, tên HS (LeadChild), nội dung tư vấn
// (note/handoverNote/LeadActivity). Actor KHÔNG có `leads:view-pii` (v1 matrix:
// SUPER_ADMIN/CENTER_MANAGER/SALES_CSM/MARKETING — MARKETING mở 21/07 cho
// outreach, commit 69876d0; v2 seed tương ứng HO_MARKETING) → thấy bản mask.
//
// Check quyền: dùng `await canViewLeadPii()` (lib/auth/check-permission — qua
// checkPermission, chấm CẢ v1 lẫn v2 theo cờ RBAC_V2_ENABLED). KHÔNG import
// check-permission vào file này: pii.ts là module THUẦN có unit test riêng
// (pii.test.ts) — dính chuỗi next-auth là vỡ môi trường vitest. Mask ở SERVER
// trước khi truyền xuống client (chặn leak qua RSC payload, không chỉ che ở UI).
import { maskPhone, maskEmail } from "@/lib/utils";

export { maskPhone, maskEmail };

/** "Nguyễn Thị Lan" → "Nguyễn T. L." — giữ họ để Marketing vẫn phân biệt được lead. */
export function maskPersonName(name: string | null | undefined): string {
  if (!name) return "";
  const parts = name.trim().split(/\s+/);
  if (parts.length <= 1) return parts[0]?.slice(0, 1) + "•••";
  return parts[0] + " " + parts.slice(1).map((p) => p.slice(0, 1) + ".").join(" ");
}

/** Nội dung tư vấn/ghi chú — ẩn hẳn (không mask từng phần, nội dung tự do dễ lộ). */
export const MASKED_TEXT = "••• (cần quyền xem PII lead — leads:view-pii)";

export function maskFreeText(v: string | null | undefined): string | null {
  if (v == null || v === "") return v ?? null;
  return MASKED_TEXT;
}

/** Bộ field PII chung của Lead — mask 1 lượt, giữ nguyên field khác. */
export function maskLeadPiiFields<
  T extends {
    parentName?: string | null;
    phone?: string | null;
    email?: string | null;
    childName?: string | null;
    note?: string | null;
  },
>(lead: T, canViewPii: boolean): T {
  if (canViewPii) return lead;
  return {
    ...lead,
    ...(lead.parentName != null ? { parentName: maskPersonName(lead.parentName) } : {}),
    ...(lead.phone != null ? { phone: maskPhone(lead.phone) } : {}),
    ...(lead.email != null ? { email: lead.email ? maskEmail(lead.email) : lead.email } : {}),
    ...(lead.childName != null ? { childName: lead.childName ? maskPersonName(lead.childName) : lead.childName } : {}),
    ...(lead.note !== undefined ? { note: maskFreeText(lead.note) } : {}),
  };
}
