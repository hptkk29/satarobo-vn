/**
 * Cấu hình giờ làm chuẩn + helper tính công (FIX 6).
 *
 * Chỉnh giờ làm / dung sai ở ĐÂY, không sửa rải rác. Dữ liệu chấm công lưu UTC;
 * mọi hiển thị/tính toán quy về Asia/Ho_Chi_Minh (UTC+7, KHÔNG có DST nên dùng
 * offset cố định là chính xác).
 */

export const VN_TIME_ZONE = "Asia/Ho_Chi_Minh";
const VN_OFFSET_MIN = 7 * 60; // UTC+7 cố định

/** Ca làm trong ngày (giờ tường VN). Tổng 8h, nghỉ trưa 11:30–13:30. */
export const WORK_SHIFTS = [
  { label: "Ca sáng", start: "07:30", end: "11:30" },
  { label: "Ca chiều", start: "13:30", end: "17:30" },
] as const;

export const WORK_SCHEDULE = {
  /** Tổng giờ công chuẩn / ngày. */
  standardHours: 8,
  /** Dung sai (phút) cho đi muộn / về sớm / đủ giờ. */
  toleranceMinutes: 5,
  /** Mốc tính "đi muộn" (giờ tường VN) = giờ vào ca sáng + dung sai. */
  lateAfter: "07:35",
  /** Mốc tính "về sớm" (giờ tường VN) = giờ tan ca chiều − dung sai. */
  earlyLeaveBefore: "17:25",
} as const;

/** "HH:MM" → số phút từ 00:00. */
function hmToMinutes(hm: string): number {
  const [h, m] = hm.split(":").map(Number);
  return h * 60 + m;
}

/** Phút-trong-ngày theo giờ tường VN của một mốc thời gian UTC. */
export function vnMinutesOfDay(date: Date): number {
  const totalVnMinutes = Math.floor(date.getTime() / 60000) + VN_OFFSET_MIN;
  return ((totalVnMinutes % 1440) + 1440) % 1440;
}

const SHIFT_RANGES = WORK_SHIFTS.map((s) => ({
  start: hmToMinutes(s.start),
  end: hmToMinutes(s.end),
}));

/** Giao của [a,b] với [c,d], tính bằng phút (≥0). */
function overlap(a: number, b: number, c: number, d: number): number {
  return Math.max(0, Math.min(b, d) - Math.max(a, c));
}

/**
 * Giờ công THỰC = tổng phần giao của [check-in, check-out] với 2 ca (đã loại
 * nghỉ trưa vì nghỉ trưa nằm ngoài 2 ca). Trả về số giờ (làm tròn 2 chữ số).
 * Giả định check-in/out cùng 1 ngày VN (chấm công trong ngày).
 */
export function computeWorkedHours(checkIn: Date | null, checkOut: Date | null): number {
  if (!checkIn || !checkOut) return 0;
  const ci = vnMinutesOfDay(checkIn);
  const co = vnMinutesOfDay(checkOut);
  if (co <= ci) return 0;
  const worked = SHIFT_RANGES.reduce(
    (sum, s) => sum + overlap(ci, co, s.start, s.end),
    0,
  );
  return Math.round((worked / 60) * 100) / 100;
}

export type AttendanceTag = {
  label: string;
  tone: "ok" | "warn" | "danger";
};

/**
 * Suy ra trạng thái chấm công (có thể nhiều tag cùng lúc). Dung sai 5'.
 */
export function deriveAttendanceStatus(input: {
  checkIn: Date | null;
  checkOut: Date | null;
  geofenceFlag: boolean;
}): { workedHours: number; tags: AttendanceTag[] } {
  const { checkIn, checkOut, geofenceFlag } = input;
  const tags: AttendanceTag[] = [];
  const workedHours = computeWorkedHours(checkIn, checkOut);

  if (geofenceFlag) tags.push({ label: "Ngoài vùng", tone: "danger" });

  if (!checkIn) {
    if (tags.length === 0) tags.push({ label: "—", tone: "warn" });
    return { workedHours, tags };
  }

  if (checkIn && !checkOut) {
    tags.push({ label: "Thiếu check-out", tone: "warn" });
    return { workedHours, tags };
  }

  const late = vnMinutesOfDay(checkIn) > hmToMinutes(WORK_SCHEDULE.lateAfter);
  const earlyLeave =
    checkOut !== null &&
    vnMinutesOfDay(checkOut) < hmToMinutes(WORK_SCHEDULE.earlyLeaveBefore);
  const enough =
    workedHours >= WORK_SCHEDULE.standardHours - WORK_SCHEDULE.toleranceMinutes / 60;

  if (late) tags.push({ label: "Đi muộn", tone: "warn" });
  if (earlyLeave) tags.push({ label: "Về sớm", tone: "warn" });

  if (!enough) {
    tags.push({ label: `Thiếu giờ · ${workedHours}h`, tone: "danger" });
  } else if (!late && !earlyLeave && !geofenceFlag) {
    tags.push({ label: "Đủ công", tone: "ok" });
  } else if (tags.filter((t) => t.label !== "Ngoài vùng").length === 0) {
    tags.push({ label: "Đủ công", tone: "ok" });
  }

  return { workedHours, tags };
}

/** Format giờ HH:MM theo GMT+7. */
export function formatVNTime(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: VN_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
