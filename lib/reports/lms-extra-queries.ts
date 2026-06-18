import "server-only";
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/actor";
import { monthKeyVN } from "@/lib/reports/trung-tam";
import { getRevenueTargets } from "@/lib/reports/revenue-target";
import {
  computeTeacherPerformance,
  computeCohortProgress,
  computeChurn,
  computeRevenueVsTarget,
  type TeacherClassStat,
  type CohortEnrollment,
  type RevenueActual,
} from "@/lib/reports/lms-extra";

// LMS-16 — tầng query: gom dữ liệu (scope theo cơ sở actor) → feed pure functions.

const ATTENDED = new Set(["PRESENT", "LATE"]);
const EXAM_DONE = ["SUBMITTED", "GRADED", "REVIEWED"] as const;

function centerWhere(actor: Actor): { in: string[] } | undefined {
  if (actor.isSuperAdmin || actor.isHoLevel) return undefined; // mọi cơ sở
  return { in: actor.visibleCenterIds };
}

export async function getLmsReports(actor: Actor) {
  const cw = centerWhere(actor);
  const classWhere = { deletedAt: null, ...(cw ? { centerId: cw } : {}) };

  const classes = await db.class.findMany({
    where: classWhere,
    select: {
      id: true,
      teacherId: true,
      teacher: { select: { name: true } },
      _count: { select: { enrollments: true } },
    },
  });
  const classIds = classes.map((c) => c.id);
  const teacherClasses = classes.filter((c) => c.teacherId);

  // Session completed theo class.
  const sessByClass = new Map<string, { total: number; completed: number }>();
  if (classIds.length) {
    const rows = await db.classSession.groupBy({
      by: ["classId", "status"],
      where: { classId: { in: classIds }, status: { not: "CANCELLED" } },
      _count: true,
    });
    for (const r of rows) {
      const g = sessByClass.get(r.classId) ?? { total: 0, completed: 0 };
      g.total += r._count;
      if (r.status === "COMPLETED") g.completed += r._count;
      sessByClass.set(r.classId, g);
    }
  }

  // Attendance theo class.
  const attByClass = new Map<string, { present: number; total: number }>();
  if (classIds.length) {
    const atts = await db.attendance.findMany({
      where: { session: { classId: { in: classIds } } },
      select: { status: true, session: { select: { classId: true } } },
      take: 5000,
    });
    for (const a of atts) {
      const cid = a.session?.classId;
      if (!cid) continue;
      const g = attByClass.get(cid) ?? { present: 0, total: 0 };
      g.total += 1;
      if (ATTENDED.has(a.status)) g.present += 1;
      attByClass.set(cid, g);
    }
  }

  // Điểm thi (chuẩn hoá 10) theo class.
  const examByClass = new Map<string, { sum: number; count: number }>();
  if (classIds.length) {
    const attempts = await db.examAttempt.findMany({
      where: { exam: { classId: { in: classIds } }, status: { in: [...EXAM_DONE] } },
      select: { totalScore: true, exam: { select: { classId: true, totalPoints: true } } },
      take: 5000,
    });
    for (const a of attempts) {
      const cid = a.exam?.classId;
      if (!cid || a.totalScore == null) continue;
      const pts = a.exam?.totalPoints && a.exam.totalPoints > 0 ? a.exam.totalPoints : 10;
      const g = examByClass.get(cid) ?? { sum: 0, count: 0 };
      g.sum += (a.totalScore / pts) * 10;
      g.count += 1;
      examByClass.set(cid, g);
    }
  }

  const teacherStats: TeacherClassStat[] = teacherClasses.map((c) => {
    const s = sessByClass.get(c.id) ?? { total: 0, completed: 0 };
    const a = attByClass.get(c.id) ?? { present: 0, total: 0 };
    const e = examByClass.get(c.id) ?? { sum: 0, count: 0 };
    return {
      teacherId: c.teacherId!,
      teacherName: c.teacher?.name ?? "(GV)",
      classId: c.id,
      sessionsCompleted: s.completed,
      attendancePresent: a.present,
      attendanceTotal: a.total,
      examScoreSum: e.sum,
      examScoreCount: e.count,
      studentCount: c._count.enrollments,
    };
  });

  // Enrollment cho cohort + churn.
  const enrollments = await db.enrollment.findMany({
    where: classIds.length ? { classId: { in: classIds } } : { id: "__none__" },
    select: { status: true, createdAt: true, classId: true },
    take: 10000,
  });
  const cohortRows: CohortEnrollment[] = enrollments.map((e) => {
    const s = sessByClass.get(e.classId) ?? { total: 0, completed: 0 };
    return {
      startMonth: monthKeyVN(e.createdAt),
      status: e.status,
      sessionsCompleted: s.completed,
      sessionsTotal: s.total,
    };
  });

  // Doanh thu thực theo tháng (Payment confirmed).
  const payments = await db.payment.findMany({
    where: { accountantStatus: "CONFIRMED", deletedAt: null, ...(cw ? { centerId: cw } : {}) },
    select: { amount: true, paidDate: true },
    take: 20000,
  });
  const revMap = new Map<string, number>();
  for (const p of payments) {
    const k = monthKeyVN(p.paidDate);
    revMap.set(k, (revMap.get(k) ?? 0) + p.amount);
  }
  const actuals: RevenueActual[] = [...revMap.entries()].map(([period, revenue]) => ({ period, revenue }));
  const targets = await getRevenueTargets(null, actuals.map((a) => a.period));

  return {
    teacherPerformance: computeTeacherPerformance(teacherStats),
    cohort: computeCohortProgress(cohortRows),
    churn: computeChurn(enrollments.map((e) => ({ status: e.status }))),
    revenueVsTarget: computeRevenueVsTarget(actuals, targets),
  };
}
