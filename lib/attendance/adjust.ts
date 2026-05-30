// Module Chấm công PHẦN 4 — quy tắc thời gian chỉnh bản ghi công.
//
// CENTER_MANAGER: chỉnh được trong VÒNG 2 NGÀY kể từ ngày công; quá 2 ngày → khoá.
// SUPER_ADMIN: chỉnh được KHÔNG giới hạn thời gian.
// Pure — không "use server".

export const MANAGER_EDIT_WINDOW_DAYS = 2;

export interface CanAdjustInput {
  isSuperAdmin: boolean;
  isCenterManager: boolean;
  workDate: Date;
  now: Date;
}

export type CanAdjustResult = { ok: true } | { ok: false; reason: string };

/** Số ngày (làm tròn) từ workDate tới now (≥0 nếu now sau workDate). */
export function daysSinceWork(workDate: Date, now: Date): number {
  const a = Date.UTC(workDate.getFullYear(), workDate.getMonth(), workDate.getDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((b - a) / 86400000);
}

export function canAdjustTimesheet(input: CanAdjustInput): CanAdjustResult {
  if (input.isSuperAdmin) return { ok: true };
  if (!input.isCenterManager) return { ok: false, reason: "Không có quyền chỉnh công" };

  const days = daysSinceWork(input.workDate, input.now);
  if (days > MANAGER_EDIT_WINDOW_DAYS) {
    return {
      ok: false,
      reason: `Quá ${MANAGER_EDIT_WINDOW_DAYS} ngày kể từ ngày công — quản lý không chỉnh được (cần admin cấp cao).`,
    };
  }
  return { ok: true };
}

/** Ghép ngày (yyyy-mm-dd) + giờ (HH:mm) theo GMT+7 → Date (UTC). null nếu rỗng. */
export function combineVNDateTime(dateStr: string, hhmm: string | null | undefined): Date | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const hh = m[1].padStart(2, "0");
  const d = new Date(`${dateStr}T${hh}:${m[2]}:00+07:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
