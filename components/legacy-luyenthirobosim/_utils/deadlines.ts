/**
 * Rolling deadline cho ưu đãi 490k.
 * Mốc trong tháng: 5, 10, 15, 20, 25.
 * Sau ngày 25 → deadline = ngày 2 tháng sau.
 */
export function getNextDeadline(): Date {
  const now = new Date();
  const day = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();
  const milestones = [5, 10, 15, 20, 25];

  for (const m of milestones) {
    if (day <= m) {
      return new Date(year, month, m + 1, 0, 0, 0);
    }
  }
  return new Date(year, month + 1, 2, 0, 0, 0);
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
