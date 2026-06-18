import { describe, it, expect } from "vitest";
import {
  computeTeacherPerformance,
  computeCohortProgress,
  computeChurn,
  computeRevenueVsTarget,
} from "@/lib/reports/lms-extra";

describe("[LMS-16] hiệu suất GV", () => {
  it("gộp theo GV: lớp, buổi, chuyên cần, điểm TB", () => {
    const r = computeTeacherPerformance([
      { teacherId: "t1", teacherName: "A", classId: "c1", sessionsCompleted: 5, attendancePresent: 8, attendanceTotal: 10, examScoreSum: 16, examScoreCount: 2, studentCount: 4 },
      { teacherId: "t1", teacherName: "A", classId: "c2", sessionsCompleted: 3, attendancePresent: 2, attendanceTotal: 10, examScoreSum: 0, examScoreCount: 0, studentCount: 2 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ classes: 2, sessionsCompleted: 8, students: 6 });
    expect(r[0].attendanceRate).toBe(50); // 10/20
    expect(r[0].avgExamScore).toBe(8); // 16/2
  });
});

describe("[LMS-16] cohort tiến độ", () => {
  it("gộp theo tháng bắt đầu", () => {
    const r = computeCohortProgress([
      { startMonth: "2026-01", status: "STUDYING", sessionsCompleted: 5, sessionsTotal: 10 },
      { startMonth: "2026-01", status: "WITHDREW", sessionsCompleted: 1, sessionsTotal: 10 },
    ]);
    expect(r[0].cohort).toBe("2026-01");
    expect(r[0].count).toBe(2);
    expect(r[0].avgProgress).toBe(30); // (50 + 10)/2
    expect(r[0].activeRate).toBe(50);
  });
});

describe("[LMS-16] churn", () => {
  it("tỉ lệ rút/hủy", () => {
    const r = computeChurn([
      { status: "STUDYING" },
      { status: "WITHDREW" },
      { status: "CANCELLED" },
      { status: "COMPLETED" },
    ]);
    expect(r).toMatchObject({ total: 4, churned: 2, completed: 1, active: 1 });
    expect(r.churnRate).toBe(50);
  });
});

describe("[LMS-16] doanh thu vs mục tiêu", () => {
  it("attainment + gap", () => {
    const r = computeRevenueVsTarget(
      [{ period: "2026-06", revenue: 80 }],
      [{ period: "2026-06", target: 100 }],
    );
    expect(r[0]).toMatchObject({ revenue: 80, target: 100, attainment: 80, gap: -20 });
  });
  it("hợp nhất period từ cả 2 nguồn", () => {
    const r = computeRevenueVsTarget(
      [{ period: "2026-07", revenue: 50 }],
      [{ period: "2026-06", target: 100 }],
    );
    expect(r.map((x) => x.period)).toEqual(["2026-06", "2026-07"]);
  });
});
