// lib/lms/attendance-rate.ts — R3-04: tỉ lệ chuyên cần + sinh học bù (THUẦN, source-of-truth).
import type { AttendanceStatus } from "@prisma/client";

/** C4.2 — attendanceRate = (PRESENT + LATE) / tổng buổi COMPLETED. THUẦN, chia-0 an toàn. */
export function computeAttendanceRate(counts: {
  present: number;
  late: number;
  totalCompleted: number;
}): number {
  if (counts.totalCompleted <= 0) return 0;
  return (counts.present + counts.late) / counts.totalCompleted;
}

/** Đếm theo danh sách trạng thái (tiện cho query trả status[]). THUẦN. */
export function rateFromStatuses(statuses: AttendanceStatus[]): number {
  const present = statuses.filter((s) => s === "PRESENT").length;
  const late = statuses.filter((s) => s === "LATE").length;
  return computeAttendanceRate({ present, late, totalCompleted: statuses.length });
}

/** C4.3 — vắng KHÔNG phép → cần học bù. EXCUSED (có phép) không tạo MakeupNeed. THUẦN. */
export function needsMakeup(status: AttendanceStatus): boolean {
  return status === "ABSENT";
}
