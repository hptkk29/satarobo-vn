// Module Quản lý học viên PHẦN 1 — số buổi học (tổng / đã học / còn lại).
//
// Tổng số buổi = số Lesson trong giáo trình (Curriculum active) của khoá lớp.
// Đã học      = buổi có mặt (PRESENT/LATE) + buổi vắng-có-bù đã bù xong (MADE_UP).
// Còn lại     = tổng − đã học.
// Vắng không bù = buổi ABSENT/EXCUSED chưa bù (PHẦN 2).
//
// Hàm thuần `computeStudentProgress` để test; wrapper `getStudentClassProgress`
// lấy số liệu thật + vị trí buổi theo LỊCH THỰC (ClassSession đã trừ/dời nghỉ).

import { db } from "@/lib/db";

export type AttendanceLiteStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED";
export type MakeupStatusLite = "NONE" | "NEEDS_MAKEUP" | "MADE_UP";

export interface AttendanceProgressItem {
  status: AttendanceLiteStatus;
  /** PHẦN 2 — mặc định NONE khi cột chưa tồn tại. */
  makeupStatus?: MakeupStatusLite | null;
}

export interface StudentProgress {
  /** Tổng số buổi của khoá (số lesson giáo trình). */
  total: number;
  /** Đã học = có mặt + vắng-có-bù. */
  attended: number;
  /** Còn lại = tổng − đã học (không âm). */
  remaining: number;
  /** Vắng KHÔNG bù. */
  absentNoMakeup: number;
  /** Số buổi đã diễn ra theo lịch thực (date ≤ hôm nay). */
  sessionsHeld: number;
  /** Buổi đang/sắp học (1..total) — để hiển thị "buổi X / N". */
  currentSession: number;
}

const PRESENT_STATUSES = new Set<AttendanceLiteStatus>(["PRESENT", "LATE"]);

export interface ComputeProgressInput {
  totalLessons: number;
  /** Số buổi đã diễn ra theo lịch thực. */
  sessionsHeld: number;
  attendances: AttendanceProgressItem[];
}

export function computeStudentProgress(input: ComputeProgressInput): StudentProgress {
  const total = Math.max(0, input.totalLessons);
  let attended = 0;
  let absentNoMakeup = 0;

  for (const a of input.attendances) {
    const madeUp = a.makeupStatus === "MADE_UP";
    if (PRESENT_STATUSES.has(a.status) || madeUp) {
      attended++;
    } else if (a.status === "ABSENT" || a.status === "EXCUSED") {
      absentNoMakeup++;
    }
  }

  const remaining = Math.max(0, total - attended);
  const sessionsHeld = Math.max(0, input.sessionsHeld);
  // Buổi "đang học" = buổi kế tiếp chưa diễn ra; nếu đã hết thì = total.
  const currentSession =
    total === 0 ? 0 : Math.min(total, sessionsHeld < total ? sessionsHeld + 1 : total);

  return { total, attended, remaining, absentNoMakeup, sessionsHeld, currentSession };
}

/**
 * Tổng số buổi của khoá ứng với lớp.
 * Ưu tiên Course.totalSessions (số buổi CHUẨN cam kết), fallback đếm Curriculum
 * lessons, cuối cùng 0. (Đợt 6 #1+2 — lớp chưa soạn giáo trình vẫn ra đúng N.)
 */
async function getTotalLessons(classId: string): Promise<number> {
  const cls = await db.class.findUnique({
    where: { id: classId },
    select: { course: { select: { id: true, totalSessions: true } } },
  });
  if (!cls?.course) return 0;
  if (cls.course.totalSessions != null) return cls.course.totalSessions;

  const curriculum = await db.curriculum.findFirst({
    where: { courseId: cls.course.id, isActive: true },
    orderBy: { version: "desc" },
    select: { _count: { select: { lessons: true } } },
  });
  return curriculum?._count.lessons ?? 0;
}

/**
 * Tiến độ buổi học của 1 HS trong 1 lớp — đọc số liệu thật.
 * sessionsHeld lấy từ ClassSession (date ≤ hôm nay) = LỊCH THỰC đã dời nghỉ.
 */
export async function getStudentClassProgress(
  studentId: string,
  classId: string,
): Promise<StudentProgress> {
  const now = new Date();
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

  const [totalLessons, sessionsHeld, attendances] = await Promise.all([
    getTotalLessons(classId),
    db.classSession.count({ where: { classId, date: { lte: todayEnd } } }),
    db.attendance.findMany({
      where: { studentId, session: { classId } },
      select: { status: true, makeupStatus: true },
    }),
  ]);

  return computeStudentProgress({
    totalLessons,
    sessionsHeld,
    attendances: attendances.map((a) => ({
      status: a.status as AttendanceLiteStatus,
      makeupStatus: a.makeupStatus as MakeupStatusLite,
    })),
  });
}

export interface StudentAbsence {
  date: Date;
  className: string;
  status: AttendanceLiteStatus;
  makeupStatus: MakeupStatusLite;
  absenceReason: string | null;
}

/** Chi tiết buổi vắng (ABSENT/EXCUSED) của HS — ngày, lý do, trạng thái bù. */
export async function getStudentAbsences(studentId: string): Promise<StudentAbsence[]> {
  const rows = await db.attendance.findMany({
    where: { studentId, status: { in: ["ABSENT", "EXCUSED"] } },
    select: {
      status: true,
      makeupStatus: true,
      absenceReason: true,
      session: { select: { date: true, class: { select: { name: true } } } },
    },
    orderBy: { session: { date: "desc" } },
  });
  return rows.map((r) => ({
    date: r.session.date,
    className: r.session.class.name,
    status: r.status as AttendanceLiteStatus,
    makeupStatus: r.makeupStatus as MakeupStatusLite,
    absenceReason: r.absenceReason,
  }));
}
