// lib/attendance/summary.ts — R7-08: 5 chỉ số tiến độ điểm danh của 1 enrollment.
//
// { total, attended (gồm đã-bù), absent, needMakeup, madeUp }.
//  - total          = số buổi CHUẨN của khoá (KHÔNG cộng buổi bù — buổi bù không tăng total).
//  - attended       = có mặt/đi muộn + buổi vắng đã học bù xong (MADE_UP).
//  - madeUp         = buổi vắng đã bù (tập con của attended, báo cáo riêng).
//  - needMakeup     = buổi vắng đang CHỜ bù (NEEDS_MAKEUP).
//  - absent         = buổi vắng KHÔNG bù (không phải made-up / không chờ bù).
// Buổi CANCELLED bị bỏ qua (không tính vắng, không tính học).
//
// Hàm thuần `computeAttendanceSummary` để test bảng biên; wrapper
// `attendanceSummary(enrollmentId)` đọc số liệu thật (ownership do caller bảo đảm,
// theo pattern lib/students/progress.ts).
import { db } from "@/lib/db";
import { getStudentClassProgress } from "@/lib/students/progress";
import type {
  AttendanceStatusValue,
  MakeupStatusValue,
  SessionStatusValue,
} from "@/lib/labels";

export interface AttendanceSummary {
  total: number;
  attended: number;
  absent: number;
  needMakeup: number;
  madeUp: number;
}

export interface AttendanceSummaryItem {
  status: AttendanceStatusValue;
  makeupStatus?: MakeupStatusValue | null;
  sessionStatus?: SessionStatusValue | null;
}

export interface ComputeSummaryInput {
  totalLessons: number;
  attendances: AttendanceSummaryItem[];
}

const PRESENT_SET = new Set<AttendanceStatusValue>(["PRESENT", "LATE"]);
const ABSENT_SET = new Set<AttendanceStatusValue>([
  "ABSENT",
  "EXCUSED",
  "ABSENT_EXCUSED",
  "ABSENT_UNEXCUSED",
]);

export function computeAttendanceSummary(input: ComputeSummaryInput): AttendanceSummary {
  const total = Math.max(0, input.totalLessons);
  let attended = 0;
  let absent = 0;
  let needMakeup = 0;
  let madeUp = 0;

  for (const a of input.attendances) {
    // Buổi hủy không tính (không vắng, không học).
    if (a.sessionStatus === "CANCELLED") continue;

    if (a.makeupStatus === "MADE_UP") {
      madeUp++;
      attended++;
      continue;
    }
    if (PRESENT_SET.has(a.status)) {
      attended++;
      continue;
    }
    if (ABSENT_SET.has(a.status)) {
      if (a.makeupStatus === "NEEDS_MAKEUP") needMakeup++;
      else absent++;
    }
  }

  return { total, attended, absent, needMakeup, madeUp };
}

/**
 * 5 chỉ số thật cho 1 enrollment. total = số buổi chuẩn của khoá (qua
 * getStudentClassProgress — buổi bù không tăng total vì buổi bù thuộc lớp khác,
 * không nằm trong attendances của enrollment này).
 */
export async function attendanceSummary(enrollmentId: string): Promise<AttendanceSummary> {
  const enr = await db.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { studentId: true, classId: true },
  });
  if (!enr) return { total: 0, attended: 0, absent: 0, needMakeup: 0, madeUp: 0 };

  const [{ total }, attendances] = await Promise.all([
    getStudentClassProgress(enr.studentId, enr.classId),
    db.attendance.findMany({
      where: { studentId: enr.studentId, session: { classId: enr.classId } },
      select: { status: true, makeupStatus: true, session: { select: { status: true } } },
    }),
  ]);

  return computeAttendanceSummary({
    totalLessons: total,
    attendances: attendances.map((a) => ({
      status: a.status as AttendanceStatusValue,
      makeupStatus: a.makeupStatus as MakeupStatusValue,
      sessionStatus: a.session.status as SessionStatusValue,
    })),
  });
}
