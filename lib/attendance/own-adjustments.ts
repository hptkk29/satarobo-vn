// lib/attendance/own-adjustments.ts — #06 (L6): yêu cầu chỉnh công CỦA CHÍNH MÌNH
// cho màn "Bảng công" site GV (app/(teacher)/teacher/bang-cong).
//
// Vì sao đọc `db` trần ở đây (app/(teacher)/** bị ESLint chặn import @/lib/db):
// TimesheetAdjustmentRequest ∈ SCOPED_MODELS — nếu đi qua scopedDb, record có
// centerId null hoặc thuộc cơ sở CŨ (GV đã chuyển cơ sở) sẽ bị ẩn oan dù vẫn là
// yêu cầu của chính GV. WHERE userId = mình là own-rows: chỉ thấy yêu cầu của
// bản thân, không rò dữ liệu ai khác — cùng lý do với getOwnShiftRegistrations
// trong lib/lms/teacher-schedule.ts (ShiftRegistration cũng ∈ SCOPED_MODELS).
import "server-only";
import type { AdjustStatus } from "@prisma/client";
import { db } from "@/lib/db";

export type OwnAdjustmentRequestRow = {
  id: string;
  date: Date; // @db.Date → UTC 00:00 của ngày
  requested: string | null;
  reason: string;
  status: AdjustStatus;
  reviewNote: string | null;
  createdAt: Date;
};

/** Yêu cầu chỉnh công của CHÍNH user có ngày công trong [from, to) — from/to là
 * dayUtc (UTC 00:00 của ngày VN, so thẳng với cột @db.Date). */
export async function getOwnAdjustmentRequests(
  userId: string,
  from: Date,
  to: Date,
): Promise<OwnAdjustmentRequestRow[]> {
  return db.timesheetAdjustmentRequest.findMany({
    where: { userId, date: { gte: from, lt: to } },
    select: {
      id: true,
      date: true,
      requested: true,
      reason: true,
      status: true,
      reviewNote: true,
      createdAt: true,
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 100, // dư cho 1 tháng — hiếm khi > vài yêu cầu/tháng
  });
}
