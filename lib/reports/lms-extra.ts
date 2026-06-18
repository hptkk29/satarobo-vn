// lib/reports/lms-extra.ts — LMS-16: các chiều báo cáo còn thiếu (THUẦN, test được).
// hiệu-suất-GV · cohort tiến độ · churn/drop-off · doanh-thu-vs-mục-tiêu.
// Theo pattern lib/reports/*: hàm THUẦN nhận record phẳng, page lo query + truyền vào.

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function pct(num: number, den: number): number {
  return den > 0 ? round1((num / den) * 100) : 0;
}

// ─── 1) Hiệu suất giáo viên ───────────────────────────────────────────────────
export interface TeacherClassStat {
  teacherId: string;
  teacherName: string;
  classId: string;
  sessionsCompleted: number;
  attendancePresent: number;
  attendanceTotal: number;
  examScoreSum: number; // tổng điểm đã chuẩn hoá 0..10
  examScoreCount: number;
  studentCount: number;
}

export interface TeacherPerfRow {
  teacherId: string;
  teacherName: string;
  classes: number;
  sessionsCompleted: number;
  students: number;
  attendanceRate: number; // %
  avgExamScore: number | null; // 0..10
}

export function computeTeacherPerformance(rows: TeacherClassStat[]): TeacherPerfRow[] {
  const byTeacher = new Map<string, TeacherPerfRow & { _attP: number; _attT: number; _sum: number; _cnt: number }>();
  for (const r of rows) {
    let t = byTeacher.get(r.teacherId);
    if (!t) {
      t = {
        teacherId: r.teacherId,
        teacherName: r.teacherName,
        classes: 0,
        sessionsCompleted: 0,
        students: 0,
        attendanceRate: 0,
        avgExamScore: null,
        _attP: 0,
        _attT: 0,
        _sum: 0,
        _cnt: 0,
      };
      byTeacher.set(r.teacherId, t);
    }
    t.classes += 1;
    t.sessionsCompleted += r.sessionsCompleted;
    t.students += r.studentCount;
    t._attP += r.attendancePresent;
    t._attT += r.attendanceTotal;
    t._sum += r.examScoreSum;
    t._cnt += r.examScoreCount;
  }
  return [...byTeacher.values()]
    .map((t) => ({
      teacherId: t.teacherId,
      teacherName: t.teacherName,
      classes: t.classes,
      sessionsCompleted: t.sessionsCompleted,
      students: t.students,
      attendanceRate: pct(t._attP, t._attT),
      avgExamScore: t._cnt > 0 ? round1(t._sum / t._cnt) : null,
    }))
    .sort((a, b) => b.sessionsCompleted - a.sessionsCompleted);
}

// ─── 2) Cohort tiến độ (theo tháng bắt đầu học) ───────────────────────────────
export interface CohortEnrollment {
  startMonth: string; // "YYYY-MM"
  status: string;
  sessionsCompleted: number;
  sessionsTotal: number;
}
export interface CohortRow {
  cohort: string;
  count: number;
  avgProgress: number; // %
  activeRate: number; // % còn STUDYING/CONFIRMED
}

const COHORT_ACTIVE = new Set(["CONFIRMED", "STUDYING", "ACTIVE", "PAUSED"]);

export function computeCohortProgress(rows: CohortEnrollment[]): CohortRow[] {
  const m = new Map<string, { count: number; progSum: number; active: number }>();
  for (const r of rows) {
    const g = m.get(r.startMonth) ?? { count: 0, progSum: 0, active: 0 };
    g.count += 1;
    g.progSum += r.sessionsTotal > 0 ? (r.sessionsCompleted / r.sessionsTotal) * 100 : 0;
    if (COHORT_ACTIVE.has(r.status)) g.active += 1;
    m.set(r.startMonth, g);
  }
  return [...m.entries()]
    .map(([cohort, g]) => ({
      cohort,
      count: g.count,
      avgProgress: g.count > 0 ? round1(g.progSum / g.count) : 0,
      activeRate: pct(g.active, g.count),
    }))
    .sort((a, b) => a.cohort.localeCompare(b.cohort));
}

// ─── 3) Churn / drop-off ──────────────────────────────────────────────────────
export interface ChurnEnrollment {
  status: string;
}
const CHURNED = new Set(["WITHDREW", "CANCELLED"]);

export function computeChurn(rows: ChurnEnrollment[]): {
  total: number;
  churned: number;
  completed: number;
  active: number;
  churnRate: number; // %
} {
  let churned = 0;
  let completed = 0;
  let active = 0;
  for (const r of rows) {
    if (CHURNED.has(r.status)) churned += 1;
    else if (r.status === "COMPLETED") completed += 1;
    else active += 1;
  }
  return { total: rows.length, churned, completed, active, churnRate: pct(churned, rows.length) };
}

// ─── 4) Doanh thu vs mục tiêu (KPI) ───────────────────────────────────────────
export interface RevenueActual {
  period: string; // "YYYY-MM"
  revenue: number;
}
export interface RevenueTargetRow {
  period: string;
  target: number;
}
export interface RevenueVsTargetRow {
  period: string;
  revenue: number;
  target: number;
  attainment: number; // % đạt mục tiêu
  gap: number; // revenue - target (âm = thiếu)
}

export function computeRevenueVsTarget(
  actuals: RevenueActual[],
  targets: RevenueTargetRow[],
): RevenueVsTargetRow[] {
  const targetMap = new Map(targets.map((t) => [t.period, t.target]));
  const periods = new Set<string>([...actuals.map((a) => a.period), ...targets.map((t) => t.period)]);
  const revMap = new Map(actuals.map((a) => [a.period, a.revenue]));
  return [...periods]
    .sort()
    .map((period) => {
      const revenue = revMap.get(period) ?? 0;
      const target = targetMap.get(period) ?? 0;
      return {
        period,
        revenue,
        target,
        attainment: target > 0 ? round1((revenue / target) * 100) : 0,
        gap: revenue - target,
      };
    });
}
