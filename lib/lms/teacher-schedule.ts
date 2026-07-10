// lib/lms/teacher-schedule.ts — #06 (L6): dữ liệu phủ màn "Lịch dạy" site GV
// (buổi Trial + ca làm việc + ngày nghỉ) — port visual từ mock satarobo-ui-giaovien.
//
// Vì sao đọc `db` trần ở đây (app/(teacher)/** bị ESLint chặn import @/lib/db):
// • TrialClassSession ∉ SCOPED_MODELS → scopedDb pass-through, không có auto-scope;
//   WHERE teacherId = chính GV (own-rows) là ranh giới an toàn — chỉ buổi Trial MÌNH
//   dạy, kể cả khi lớp Trial ở cơ sở khác (GV dạy nhiều cơ sở, câu 47).
// • ShiftRegistration ∈ SCOPED_MODELS nhưng đây là CA CỦA CHÍNH MÌNH (unique
//   userId+date); nếu đi qua scopedDb, record centerId null / khác cơ sở sẽ bị ẩn oan
//   dù vẫn là ca của GV. WHERE userId = mình là own-rows, không rò dữ liệu ai khác.
// • Holiday ∈ SCOPED_MODELS và ∉ NULL_IS_GLOBAL_MODELS → scopedDb inject
//   `centerId IN (...)` sẽ ẩn NHẦM ngày nghỉ TOÀN HỆ THỐNG (centerId null). Tự lọc
//   OR-null theo visibleCenterIds của actor (đúng semantics "null = toàn hệ thống").
//
// ⚠️ Câu 46: các hàm chỉ trả tên lớp/giờ/ngày — KHÔNG đụng học viên/phụ huynh.
// ⚠️ @db.Date: tham số from/to là mốc UTC 00:00 của NGÀY VN, khoảng nửa mở [from, to).
import "server-only";
import type { ShiftRegStatus, TrialSessionStatus, WorkShift, HolidayType } from "@prisma/client";
import { db } from "@/lib/db";

/** Buổi Trial GV phụ trách trong [from, to) — bỏ buổi đã hủy. */
export type TeacherTrialSessionRow = {
  id: string;
  date: Date; // @db.Date → UTC 00:00 của ngày
  startTime: string;
  endTime: string;
  status: TrialSessionStatus;
  trialClassName: string;
};

export async function getTeacherTrialSessions(
  teacherId: string,
  from: Date,
  to: Date,
): Promise<TeacherTrialSessionRow[]> {
  const rows = await db.trialClassSession.findMany({
    where: {
      teacherId, // own-rows: chỉ buổi CHÍNH GV dạy
      status: { not: "CANCELLED" },
      date: { gte: from, lt: to },
    },
    select: {
      id: true,
      date: true,
      startTime: true,
      endTime: true,
      status: true,
      // Nested include không bị auto-scope (giới hạn scopedDb) — ở đây chỉ lấy TÊN lớp
      // Trial của buổi mình dạy, không phải dữ liệu học viên/lead.
      trialClass: { select: { name: true } },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    take: 200,
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    startTime: r.startTime,
    endTime: r.endTime,
    status: r.status,
    trialClassName: r.trialClass.name,
  }));
}

/** Ca làm việc CỦA CHÍNH GV trong [from, to). Enum ShiftRegStatus (REGISTERED /
 * LEAVE_REQUESTED / APPROVED) không có trạng thái hủy → lấy đủ cả 3, caller tự
 * đánh dấu LEAVE_REQUESTED (xin nghỉ khẩn) nếu cần. */
export type TeacherShiftRow = {
  date: Date; // @db.Date → UTC 00:00 của ngày
  shifts: WorkShift[];
  status: ShiftRegStatus;
};

export async function getOwnShiftRegistrations(
  userId: string,
  from: Date,
  to: Date,
): Promise<TeacherShiftRow[]> {
  return db.shiftRegistration.findMany({
    where: { userId, date: { gte: from, lt: to } },
    select: { date: true, shifts: true, status: true },
    orderBy: { date: "asc" },
    take: 100, // 1 record/ngày (unique userId+date) — 100 phủ dư lưới tháng 42 ô
  });
}

/** Ngày nghỉ hiển thị cho GV: TOÀN HỆ THỐNG (centerId null) HOẶC thuộc cơ sở actor
 * nhìn thấy. Range-overlap với [from, to): holiday [date, endDate ?? date] giao khoảng. */
export type TeacherHolidayRow = {
  name: string;
  date: Date; // @db.Date
  endDate: Date | null; // @db.Date — null = nghỉ 1 ngày
  type: HolidayType;
};

export async function getVisibleHolidays(
  visibleCenterIds: string[],
  from: Date,
  to: Date,
): Promise<TeacherHolidayRow[]> {
  return db.holiday.findMany({
    where: {
      AND: [
        { date: { lt: to } }, // bắt đầu trước khi khoảng kết thúc
        {
          // kết thúc (endDate, hoặc chính date nếu nghỉ 1 ngày) sau khi khoảng bắt đầu
          OR: [{ endDate: { gte: from } }, { endDate: null, date: { gte: from } }],
        },
        { OR: [{ centerId: null }, { centerId: { in: visibleCenterIds } }] },
      ],
    },
    select: { name: true, date: true, endDate: true, type: true },
    orderBy: { date: "asc" },
    take: 50,
  });
}
