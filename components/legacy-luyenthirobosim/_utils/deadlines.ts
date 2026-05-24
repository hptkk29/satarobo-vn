/**
 * Rolling deadline đồng bộ với lễ khai trương — countdown đến hết Thứ 7
 * (mốc Sun 00:00). 00:00 Chủ nhật → tự nhảy sang Thứ 7 tuần kế tiếp.
 * Logic chung: lib/opening-date.ts.
 */
import { getOpeningCountdownTarget } from "@/lib/opening-date";

export function getNextDeadline(): Date {
  return getOpeningCountdownTarget(new Date());
}

/**
 * Ngày diễn ra vòng loại RBT2026 — cố định 26/7.
 * Nếu đã qua 26/7 năm hiện tại → đếm tới 20/7 năm sau.
 */
export function getExamDate(): Date {
  const now = new Date();
  const year = now.getFullYear();
  const examThisYear = new Date(year, 6, 26, 0, 0, 0);
  return now > examThisYear
    ? new Date(year + 1, 6, 20, 0, 0, 0)
    : examThisYear;
}
