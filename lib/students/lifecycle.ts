import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { getSetting } from "@/lib/settings/service";

// Default tuning constants — caller async truyền từ SystemSetting "student.*".
export const RENEWAL_WINDOW_DAYS = 90;
export const FREQUENT_ABSENT_THRESHOLD = 3;
export const FREQUENT_ABSENT_WINDOW = 5;

export type LifecycleView =
  | "all"
  | "active"
  | "waiting"
  | "reserved"
  | "frequent-absent"
  | "renewal"
  | "withdrawn";

export const LIFECYCLE_VIEWS: LifecycleView[] = [
  "all",
  "active",
  "waiting",
  "reserved",
  "frequent-absent",
  "renewal",
  "withdrawn",
];

export const LIFECYCLE_VIEW_LABEL: Record<LifecycleView, string> = {
  all: "Tất cả",
  active: "Đang học",
  waiting: "Chờ xếp lớp",
  reserved: "Bảo lưu",
  "frequent-absent": "Vắng nhiều",
  renewal: "Tái tục",
  withdrawn: "Nghỉ học",
};

export const LIFECYCLE_VIEW_DESCRIPTION: Record<LifecycleView, string> = {
  all: "Tất cả học viên (active)",
  active: "Có ít nhất 1 lớp đang học",
  waiting: "Đã đăng ký nhưng chưa được xếp lớp",
  reserved: "Đang bảo lưu (tạm dừng học)",
  "frequent-absent": `Vắng ≥${FREQUENT_ABSENT_THRESHOLD} buổi trong ${FREQUENT_ABSENT_WINDOW} buổi gần nhất`,
  renewal: `Hoàn thành khoá cũ + đăng ký mới trong ${RENEWAL_WINDOW_DAYS} ngày`,
  withdrawn: "Đã nghỉ học hẳn",
};

/**
 * Build Prisma where clause for a lifecycle view.
 *
 * NOTE: "frequent-absent" returns a base filter only (ACTIVE students).
 * Caller MUST apply postFilterFrequentlyAbsent() on the returned IDs to
 * refine — the attendance-rate logic isn't expressible in pure SQL where.
 */
export function buildLifecycleWhere(
  view: LifecycleView,
  baseWhere: Prisma.StudentWhereInput = {},
  renewalWindowDays: number = RENEWAL_WINDOW_DAYS,
): Prisma.StudentWhereInput {
  const base: Prisma.StudentWhereInput = { ...baseWhere, deletedAt: null };

  switch (view) {
    case "all":
      return base;

    case "active":
      return {
        AND: [
          base,
          { status: "ACTIVE" },
          { enrollments: { some: { status: "STUDYING" } } },
        ],
      };

    case "waiting":
      return {
        AND: [
          base,
          { status: "ACTIVE" },
          { enrollments: { none: { status: "STUDYING" } } },
          {
            OR: [
              { enrollments: { none: {} } },
              {
                enrollments: {
                  some: { status: { in: ["PENDING", "CONFIRMED"] } },
                },
              },
            ],
          },
        ],
      };

    case "reserved":
      return {
        AND: [
          base,
          {
            OR: [
              { status: "PAUSED" },
              { reserves: { some: { isActive: true } } },
            ],
          },
        ],
      };

    case "withdrawn":
      return { AND: [base, { status: "INACTIVE" }] };

    case "renewal": {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - renewalWindowDays);
      return {
        AND: [
          base,
          { enrollments: { some: { status: "COMPLETED" } } },
          {
            enrollments: {
              some: {
                enrolledAt: { gte: cutoff },
                status: { in: ["PENDING", "CONFIRMED", "STUDYING"] },
              },
            },
          },
        ],
      };
    }

    case "frequent-absent":
      // Pre-filter to ACTIVE students; final filter in JS.
      return { AND: [base, { status: "ACTIVE" }] };
  }
}

/**
 * Given a list of student IDs, return the subset that are "frequently absent".
 * Frequently absent = at least FREQUENT_ABSENT_THRESHOLD absences within
 * the latest FREQUENT_ABSENT_WINDOW attendance records.
 */
export async function postFilterFrequentlyAbsent(
  studentIds: string[],
  threshold?: number,
  window?: number,
): Promise<Set<string>> {
  if (studentIds.length === 0) return new Set();

  // Đợt 3 — đọc động từ SystemSetting (default = hằng số nếu chưa cấu hình).
  const absentThreshold = threshold ?? (await getSetting("student.frequentAbsentThreshold"));
  const absentWindow = window ?? (await getSetting("student.frequentAbsentWindow"));

  // Generous limit to capture enough recent records per student. At the
  // current attendance volume this is single-digit MB at worst.
  const recentAttendance = await db.attendance.findMany({
    where: { studentId: { in: studentIds } },
    orderBy: [{ studentId: "asc" }, { createdAt: "desc" }],
    select: { studentId: true, status: true },
    take: studentIds.length * absentWindow * 3,
  });

  // Group by student, take latest N per student.
  const byStudent = new Map<string, string[]>();
  for (const a of recentAttendance) {
    if (!byStudent.has(a.studentId)) byStudent.set(a.studentId, []);
    const list = byStudent.get(a.studentId)!;
    if (list.length < absentWindow) list.push(a.status);
  }

  const result = new Set<string>();
  for (const [studentId, statuses] of byStudent.entries()) {
    if (statuses.length < absentWindow) continue;
    const absentCount = statuses.filter((s) => s === "ABSENT").length;
    if (absentCount >= absentThreshold) {
      result.add(studentId);
    }
  }
  return result;
}

/** Get the active reserve for a student (if any). */
export async function getActiveReserve(studentId: string) {
  return db.studentReserve.findFirst({
    where: { studentId, isActive: true },
    orderBy: { startedAt: "desc" },
    include: {
      enrollment: { select: { id: true, class: { select: { name: true } } } },
    },
  });
}
