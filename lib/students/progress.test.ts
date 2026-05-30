import { describe, it, expect } from "vitest";
import { computeStudentProgress } from "./progress";

describe("computeStudentProgress", () => {
  it("đếm có mặt PRESENT + LATE là đã học", () => {
    const r = computeStudentProgress({
      totalLessons: 10,
      sessionsHeld: 3,
      attendances: [{ status: "PRESENT" }, { status: "LATE" }, { status: "PRESENT" }],
    });
    expect(r.total).toBe(10);
    expect(r.attended).toBe(3);
    expect(r.remaining).toBe(7);
    expect(r.absentNoMakeup).toBe(0);
  });

  it("vắng có bù (MADE_UP) tính như đã học; vắng không bù thì không", () => {
    const r = computeStudentProgress({
      totalLessons: 12,
      sessionsHeld: 4,
      attendances: [
        { status: "PRESENT" },
        { status: "ABSENT", makeupStatus: "MADE_UP" },
        { status: "ABSENT", makeupStatus: "NEEDS_MAKEUP" },
        { status: "EXCUSED", makeupStatus: "NONE" },
      ],
    });
    expect(r.attended).toBe(2); // present + made-up
    expect(r.absentNoMakeup).toBe(2); // needs-makeup + excused-no-makeup
    expect(r.remaining).toBe(10);
  });

  it("currentSession = buổi kế tiếp khi còn buổi chưa diễn ra", () => {
    expect(computeStudentProgress({ totalLessons: 12, sessionsHeld: 5, attendances: [] }).currentSession).toBe(6);
    expect(computeStudentProgress({ totalLessons: 12, sessionsHeld: 0, attendances: [] }).currentSession).toBe(1);
  });

  it("currentSession không vượt total khi đã học hết", () => {
    expect(computeStudentProgress({ totalLessons: 8, sessionsHeld: 8, attendances: [] }).currentSession).toBe(8);
    expect(computeStudentProgress({ totalLessons: 8, sessionsHeld: 20, attendances: [] }).currentSession).toBe(8);
  });

  it("total = 0 (chưa có giáo trình) → currentSession 0, remaining 0", () => {
    const r = computeStudentProgress({ totalLessons: 0, sessionsHeld: 3, attendances: [{ status: "PRESENT" }] });
    expect(r.total).toBe(0);
    expect(r.currentSession).toBe(0);
    expect(r.remaining).toBe(0);
  });

  it("remaining không âm khi đã học nhiều hơn total", () => {
    const r = computeStudentProgress({
      totalLessons: 2,
      sessionsHeld: 3,
      attendances: [{ status: "PRESENT" }, { status: "PRESENT" }, { status: "PRESENT" }],
    });
    expect(r.attended).toBe(3);
    expect(r.remaining).toBe(0);
  });
});
