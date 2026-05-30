// Module Chấm công PHẦN 2 — format Excel lịch ca (export = import, round-trip).
//
// Cột CHUẨN (đúng thứ tự, export & import dùng chung):
//   [Mã NV | Tên | Ngày | Ca | Ghi chú]
//   - Mã NV : email nhân viên (khoá duy nhất).
//   - Ngày  : yyyy-mm-dd.
//   - Ca    : "Sáng/Chiều/Tối", nhiều ca cách dấu phẩy (vd "Sáng, Chiều").
// Pure — không "use server", không phụ thuộc xlsx (chỉ map/validate ô).

import type { WorkShift } from "@prisma/client";

export const SHIFT_EXCEL_COLUMNS = ["Mã NV", "Tên", "Ngày", "Ca", "Ghi chú"] as const;

/** Nhãn xuất file cho mỗi ca. */
export const SHIFT_EXPORT_LABEL: Record<WorkShift, string> = {
  CA_SANG: "Sáng",
  CA_CHIEU: "Chiều",
  CA_TOI: "Tối",
};

const SHIFT_EXPORT_ORDER: WorkShift[] = ["CA_SANG", "CA_CHIEU", "CA_TOI"];

// Chấp nhận nhiều biến thể khi import (có/không dấu, có/không "ca ").
const SHIFT_PARSE_MAP: Record<string, WorkShift> = {
  "sáng": "CA_SANG",
  "sang": "CA_SANG",
  "ca sáng": "CA_SANG",
  "ca_sang": "CA_SANG",
  "chiều": "CA_CHIEU",
  "chieu": "CA_CHIEU",
  "ca chiều": "CA_CHIEU",
  "ca_chieu": "CA_CHIEU",
  "tối": "CA_TOI",
  "toi": "CA_TOI",
  "ca tối": "CA_TOI",
  "ca_toi": "CA_TOI",
};

/** WorkShift[] → ô "Sáng, Chiều" (theo thứ tự ca chuẩn). */
export function shiftsToCell(shifts: WorkShift[]): string {
  const set = new Set(shifts);
  return SHIFT_EXPORT_ORDER.filter((s) => set.has(s))
    .map((s) => SHIFT_EXPORT_LABEL[s])
    .join(", ");
}

/** Ô "Sáng, Chiều" → WorkShift[] | lỗi. Rỗng → [] (xin nghỉ cả ngày). */
export function parseShiftCell(raw: unknown): { shifts: WorkShift[] } | { error: string } {
  const text = raw == null ? "" : String(raw).trim();
  if (text === "") return { shifts: [] };

  const out: WorkShift[] = [];
  const seen = new Set<WorkShift>();
  for (const part of text.split(/[,;/]+/)) {
    const key = part.trim().toLowerCase();
    if (key === "") continue;
    const shift = SHIFT_PARSE_MAP[key];
    if (!shift) return { error: `Ca không hợp lệ: "${part.trim()}" (chỉ Sáng/Chiều/Tối)` };
    if (!seen.has(shift)) {
      seen.add(shift);
      out.push(shift);
    }
  }
  return { shifts: out };
}

/** Kiểm tra ô ngày yyyy-mm-dd hợp lệ → trả về chuỗi chuẩn hoá hoặc lỗi. */
export function parseDateCell(raw: unknown): { date: string } | { error: string } {
  const text = raw == null ? "" : String(raw).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return { error: `Ngày không hợp lệ: "${text}" (cần yyyy-mm-dd)` };
  const d = new Date(`${text}T00:00:00`);
  if (Number.isNaN(d.getTime())) return { error: `Ngày không tồn tại: "${text}"` };
  return { date: text };
}
