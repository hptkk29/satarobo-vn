import type { WorkShift } from "@prisma/client";

// Đợt 3E — định nghĩa 3 ca + quy tắc đăng ký. Pure (không "use server").
// Chỉnh giờ ca / dung sai ở ĐÂY.

export const SHIFT_ORDER: WorkShift[] = ["CA_SANG", "CA_CHIEU", "CA_TOI"];

export const SHIFT_DEFS: Record<WorkShift, { label: string; start: string; end: string }> = {
  CA_SANG: { label: "Ca sáng", start: "07:30", end: "11:30" },
  CA_CHIEU: { label: "Ca chiều", start: "13:30", end: "17:30" },
  CA_TOI: { label: "Ca tối", start: "17:00", end: "21:00" },
};

export const SHIFT_TONE: Record<WorkShift, string> = {
  CA_SANG: "bg-amber-100 text-amber-700",
  CA_CHIEU: "bg-blue-100 text-blue-700",
  CA_TOI: "bg-indigo-100 text-indigo-700",
};

/** Dung sai có mặt (phút) cho đủ công / đi muộn / về sớm. */
export const SHIFT_TOLERANCE_MIN = 5;

/** Nghỉ trưa (giữa ca sáng và ca chiều) — không tính công. */
export const LUNCH_BREAK = { start: "11:30", end: "13:30" } as const;

export function shiftLabel(s: WorkShift): string {
  return SHIFT_DEFS[s].label;
}

// ── Quy tắc cửa sổ đăng ký (cảnh báo, không khoá cứng giai đoạn đầu) ─────────

/** Đăng ký THÁNG SAU: mở ngày 25–30 (hoặc cuối tháng) của tháng hiện tại. */
export function isNextMonthWindowOpen(now: Date): boolean {
  const d = now.getDate();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return d >= 25 && d <= lastDay;
}

/** Sửa trong tháng: cho phép vào Thứ 7 (6) / Chủ nhật (0). */
export function isWeekendEditWindow(now: Date): boolean {
  const day = now.getDay();
  return day === 0 || day === 6;
}

/** Số ngày từ now tới ngày làm (âm nếu đã qua). */
export function daysUntil(now: Date, workDate: Date): number {
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(workDate.getFullYear(), workDate.getMonth(), workDate.getDate()).getTime();
  return Math.round((b - a) / 86400000);
}

/** Nghỉ/sửa phải trước ngày làm ≥ 2 ngày; sát hơn → cần đánh dấu LEAVE_REQUESTED. */
export function needsLeaveRequest(now: Date, workDate: Date): boolean {
  return daysUntil(now, workDate) < 2;
}

/** Cảnh báo nếu thao tác cho 1 ngày nằm ngoài cửa sổ cho phép. */
export function registrationWindowWarning(now: Date, workDate: Date): string | null {
  const diff = daysUntil(now, workDate);
  if (diff < 0) return "Ngày này đã qua — chỉ quản lý mới chỉnh được.";
  if (diff < 2) {
    return "Sát ngày làm (< 2 ngày): thay đổi sẽ được đánh dấu XIN NGHỈ KHẨN để quản lý sắp người bù.";
  }
  return null;
}
