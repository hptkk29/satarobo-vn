// BGĐ 31/07 — GIỜ HỌC THEO TỪNG THỨ (lớp 2 ca khác giờ: 17h30-T2 & 08h-T6).
//
// 2-phase: `ClassScheduleSlot` là nguồn CHÍNH; lớp chưa có slot → suy từ
// `Class.scheduleDays` + `startTime/endTime` chung (hành vi cũ, không vỡ dữ liệu).
// MỌI nơi cần "buổi thứ X mấy giờ" đọc qua đây, KHÔNG đọc thẳng Class.startTime.
//
// THUẦN (không đụng DB / Prisma) để dùng chung form client + server + test.

export interface ClassTimeSlot {
  /** 0=CN … 6=T7 */
  weekday: number;
  /** "HH:mm" */
  startTime: string;
  endTime: string | null;
}

export interface ResolveSlotsInput {
  scheduleDays: number[];
  /** Giờ chung cả tuần (lớp cũ / lớp 1 ca). */
  startTime?: string | null;
  endTime?: string | null;
  /** Slot riêng theo thứ — có phần tử thì THẮNG giờ chung. */
  slots?: { weekday: number; startTime: string; endTime?: string | null }[] | null;
}

const isWeekday = (d: number) => Number.isInteger(d) && d >= 0 && d <= 6;

/** T2..T7 trước, CN cuối (đọc theo tuần học thay vì 0..6). */
function byWeekOrder(a: number, b: number): number {
  return (a === 0 ? 7 : a) - (b === 0 ? 7 : b);
}

/**
 * Lịch hiệu lực của lớp: mỗi thứ học 1 ca, kèm giờ của ĐÚNG thứ đó.
 *
 * - Tập THỨ lấy từ `scheduleDays` (nguồn chính); rỗng thì lấy từ slot.
 * - Giờ mỗi thứ: slot của thứ đó → lùi về giờ chung (`startTime/endTime`).
 *   ⇒ đặt giờ riêng cho MỘT thứ không làm mất các thứ còn lại.
 * - Không có thứ nào → [] (lớp chưa có lịch).
 */
export function resolveClassSlots(input: ResolveSlotsInput): ClassTimeSlot[] {
  const byDay = new Map<number, { startTime: string; endTime: string | null }>();
  for (const s of input.slots ?? []) {
    if (!isWeekday(s.weekday) || !s.startTime) continue;
    if (byDay.has(s.weekday)) continue; // unique(classId, weekday) — phòng dữ liệu bẩn
    byDay.set(s.weekday, { startTime: s.startTime, endTime: s.endTime ?? null });
  }

  const declared = [...new Set(input.scheduleDays.filter(isWeekday))];
  const days = (declared.length > 0 ? declared : [...byDay.keys()]).sort(byWeekOrder);

  return days.map((weekday) => {
    const slot = byDay.get(weekday);
    return {
      weekday,
      startTime: slot?.startTime ?? input.startTime ?? "",
      endTime: slot ? slot.endTime : (input.endTime ?? null),
    };
  });
}

/** Các thứ lớp học (0=CN…6=T7), thứ tự tuần học. */
export function slotWeekdays(slots: ClassTimeSlot[]): number[] {
  return slots.map((s) => s.weekday);
}

/** Giờ bắt đầu của 1 thứ cụ thể; không học thứ đó → null. */
export function startTimeForWeekday(slots: ClassTimeSlot[], weekday: number): string | null {
  return slots.find((s) => s.weekday === weekday)?.startTime || null;
}

/** Giờ kết thúc của 1 thứ cụ thể. */
export function endTimeForWeekday(slots: ClassTimeSlot[], weekday: number): string | null {
  return slots.find((s) => s.weekday === weekday)?.endTime ?? null;
}

/** "HH:mm" → {h, m}; không hợp lệ → 00:00. */
export function parseHm(time: string | null | undefined): { h: number; m: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec((time ?? "").trim());
  if (!m) return { h: 0, m: 0 };
  return { h: Number(m[1]), m: Number(m[2]) };
}

/** Gắn giờ của ĐÚNG thứ vào 1 ngày (dùng khi sinh buổi học). */
export function applySlotTimeToDate(date: Date, slots: ClassTimeSlot[]): Date {
  const { h, m } = parseHm(startTimeForWeekday(slots, date.getDay()));
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), h, m);
}
