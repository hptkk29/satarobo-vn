// R7-17 — Báo cáo lớp trải nghiệm (THUẦN). Pure, không cần DB.
import { describe, it, expect } from "vitest";
import {
  pct,
  presentCountByEnrollment,
  buildTrialReport,
  type TrialClassRec,
  type TrialEnrollmentRec,
  type TrialAttendanceRec,
} from "@/lib/reports/trial";

describe("[R7-17] pct", () => {
  it("d=0 → 0 (kỳ chưa có data, không chia 0)", () => {
    expect(pct(5, 0)).toBe(0);
  });
  it("làm tròn 1 chữ số", () => {
    expect(pct(1, 3)).toBe(33.3);
    expect(pct(2, 3)).toBe(66.7);
    expect(pct(3, 4)).toBe(75);
  });
});

describe("[R7-17] presentCountByEnrollment", () => {
  it("chỉ đếm PRESENT theo enrollment", () => {
    const m = presentCountByEnrollment([
      { trialEnrollmentId: "e1", status: "PRESENT" },
      { trialEnrollmentId: "e1", status: "PRESENT" },
      { trialEnrollmentId: "e1", status: "ABSENT" },
      { trialEnrollmentId: "e2", status: "PRESENT" },
    ]);
    expect(m.get("e1")).toBe(2);
    expect(m.get("e2")).toBe(1);
    expect(m.get("e3")).toBeUndefined();
  });
});

// ── Fixtures: 2 cơ sở, sessionCount=2 mỗi lớp ───────────────────────────────
const classes: TrialClassRec[] = [
  { id: "c1", centerId: "CS1", capacity: 4, status: "RUNNING", sessionCount: 2 },
  { id: "c2", centerId: "CS2", capacity: 2, status: "COMPLETED", sessionCount: 2 },
];

// CS1: e1 ATTENDED+REGISTERED dự đủ 2; e2 ATTENDED chưa đăng ký dự 1; e3 WITHDRAWN
// CS2: e4 ATTENDED+ENROLLED dự đủ 2; e5 IN_PROGRESS dự 1
const enrollments: TrialEnrollmentRec[] = [
  { id: "e1", trialClassId: "c1", leadChildId: "k1", status: "COMPLETED", leadChildTrialStatus: "ATTENDED", leadStatus: "REGISTERED" },
  { id: "e2", trialClassId: "c1", leadChildId: "k2", status: "ACTIVE", leadChildTrialStatus: "ATTENDED", leadStatus: "AWAITING_DECISION" },
  { id: "e3", trialClassId: "c1", leadChildId: "k3", status: "WITHDRAWN", leadChildTrialStatus: "SCHEDULED", leadStatus: "TRIAL_SCHEDULED" },
  { id: "e4", trialClassId: "c2", leadChildId: "k4", status: "COMPLETED", leadChildTrialStatus: "ATTENDED", leadStatus: "ENROLLED" },
  { id: "e5", trialClassId: "c2", leadChildId: "k5", status: "ACTIVE", leadChildTrialStatus: "IN_PROGRESS", leadStatus: "TRIAL_IN_PROGRESS" },
];

const attendances: TrialAttendanceRec[] = [
  { trialEnrollmentId: "e1", status: "PRESENT" },
  { trialEnrollmentId: "e1", status: "PRESENT" },
  { trialEnrollmentId: "e2", status: "PRESENT" },
  { trialEnrollmentId: "e2", status: "ABSENT" },
  { trialEnrollmentId: "e4", status: "PRESENT" },
  { trialEnrollmentId: "e4", status: "PRESENT" },
  { trialEnrollmentId: "e5", status: "PRESENT" },
];

describe("[R7-17] buildTrialReport", () => {
  const r = buildTrialReport({ classes, enrollments, attendances });

  it("totals: sĩ số lấp đầy (filled = không WITHDRAWN / tổng capacity)", () => {
    expect(r.totals.classes).toBe(2);
    expect(r.totals.enrollments).toBe(5);
    expect(r.totals.capacity).toBe(6); // 4 + 2
    expect(r.totals.filled).toBe(4); // e3 WITHDRAWN không tính
    expect(r.totals.fillRate).toBe(pct(4, 6)); // 66.7
  });

  it("dự đủ N buổi: chỉ e1 + e4 đạt PRESENT>=2", () => {
    expect(r.attendance.total).toBe(5);
    expect(r.attendance.full).toBe(2);
    expect(r.attendance.fullRate).toBe(pct(2, 5)); // 40
  });

  it("chuyển đổi ATTENDED → REGISTERED/ENROLLED", () => {
    expect(r.conversion.attended).toBe(3); // k1,k2,k4
    expect(r.conversion.registered).toBe(2); // k1 REGISTERED, k4 ENROLLED
    expect(r.conversion.rate).toBe(pct(2, 3)); // 66.7
  });

  it("phễu trạng thái học thử theo child", () => {
    expect(r.funnel.scheduled).toBe(1); // k3
    expect(r.funnel.inProgress).toBe(1); // k5
    expect(r.funnel.attended).toBe(3); // k1,k2,k4
  });

  it("phân bố trạng thái enrollment", () => {
    expect(r.enrollmentStatus.active).toBe(2);
    expect(r.enrollmentStatus.completed).toBe(2);
    expect(r.enrollmentStatus.withdrawn).toBe(1);
  });

  it("theo cơ sở: CS1 vs CS2 tách biệt", () => {
    const cs1 = r.byCenter.find((c) => c.centerId === "CS1")!;
    const cs2 = r.byCenter.find((c) => c.centerId === "CS2")!;
    expect(cs1.capacity).toBe(4);
    expect(cs1.filled).toBe(2); // e1,e2 (e3 withdrawn)
    expect(cs1.attended).toBe(2); // k1,k2
    expect(cs1.registered).toBe(1); // k1
    expect(cs1.fullAttendance).toBe(1); // e1
    expect(cs2.attended).toBe(1); // k4
    expect(cs2.registered).toBe(1); // k4 ENROLLED
    expect(cs2.conversionRate).toBe(100);
    expect(cs2.fullAttendance).toBe(1); // e4
  });

  it("kỳ rỗng → 0, không lỗi chia 0", () => {
    const empty = buildTrialReport({ classes: [], enrollments: [], attendances: [] });
    expect(empty.totals.fillRate).toBe(0);
    expect(empty.conversion.rate).toBe(0);
    expect(empty.byCenter).toEqual([]);
  });
});
