// Module Quản lý lớp PHẦN 2 — tính lịch buổi học (pure, testable).
//
// Cho lịch lớp (scheduleDays 0=CN..6=T7) + danh sách ngày nghỉ cơ sở → ngày
// thực của từng buổi 1..N. Buổi rơi vào ngày nghỉ KHÔNG mất — bị dời sang buổi
// học kế tiếp theo lịch (tổng số buổi giữ nguyên).

export function ymdLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface ComputeSessionDatesInput {
  /** Ngày bắt đầu quét (inclusive). */
  from: Date;
  /** 0=CN..6=T7. */
  scheduleDays: number[];
  /** Số buổi cần sinh. */
  count: number;
  /** Tập ngày nghỉ "YYYY-MM-DD" (cơ sở + toàn hệ thống). */
  holidays: Set<string>;
}

/**
 * Ngày thực của `count` buổi đầu tiên kể từ `from`, theo các thứ trong
 * scheduleDays, BỎ QUA ngày nghỉ (dời sang buổi kế). scheduleDays rỗng → [].
 */
export function computeSessionDates(input: ComputeSessionDatesInput): Date[] {
  const { from, scheduleDays, count, holidays } = input;
  const out: Date[] = [];
  if (scheduleDays.length === 0 || count <= 0) return out;

  const days = new Set(scheduleDays.filter((d) => d >= 0 && d <= 6));
  const cur = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  // Giới hạn an toàn: tối đa ~count*8 tuần + đệm.
  const maxIter = count * 7 * 8 + 400;
  let i = 0;
  while (out.length < count && i < maxIter) {
    i++;
    if (days.has(cur.getDay()) && !holidays.has(ymdLocal(cur))) {
      out.push(new Date(cur));
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Mở rộng các khoảng nghỉ (date..endDate) thành tập ngày "YYYY-MM-DD". */
export function expandHolidaySet(
  holidays: { date: Date; endDate: Date | null }[],
): Set<string> {
  const set = new Set<string>();
  for (const h of holidays) {
    const start = new Date(h.date.getFullYear(), h.date.getMonth(), h.date.getDate());
    const end = h.endDate
      ? new Date(h.endDate.getFullYear(), h.endDate.getMonth(), h.endDate.getDate())
      : start;
    const cur = new Date(start);
    let guard = 0;
    while (cur <= end && guard < 400) {
      guard++;
      set.add(ymdLocal(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }
  return set;
}
