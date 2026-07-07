// R7-15 — Học bạ ReportCard: transition guards, số liệu, snapshot freeze, T5 scope.
// THUẦN — import từ report-card-core (không db / server-only).
import { describe, it, expect } from "vitest";

import {
  actorCapabilities,
  buildPublishedSnapshot,
  canEditReportCardContent,
  checkEnrollmentScope,
  checkTransition,
  computeAssignmentSummary,
  computeAttendanceRate,
  computeExamAverage,
  isReportCardEditable,
  latestSkillLevels,
  normalizePeriodComments,
  parsePublishedSnapshot,
  type ReportCardMetrics,
} from "@/lib/lms/report-card-core";
import { can } from "@/lib/auth/permissions";

describe("[R7-15] transition guard matrix", () => {
  it("[C4] GV (manage) nộp DRAFT→PENDING_REVIEW: OK", () => {
    expect(checkTransition({ from: "DRAFT", to: "PENDING_REVIEW", capabilities: ["manage"] }).ok).toBe(true);
  });

  it("[C4] GV publish thẳng DRAFT→PUBLISHED: CHẶN (cạnh không tồn tại)", () => {
    const r = checkTransition({ from: "DRAFT", to: "PUBLISHED", capabilities: ["manage", "review"] });
    expect(r.ok).toBe(false);
  });

  it("[C4] QL (review) phát hành PENDING_REVIEW→PUBLISHED: OK", () => {
    expect(checkTransition({ from: "PENDING_REVIEW", to: "PUBLISHED", capabilities: ["review"] }).ok).toBe(true);
  });

  it("[C4] GV (chỉ manage) KHÔNG được phát hành: CHẶN (thiếu capability)", () => {
    const r = checkTransition({ from: "PENDING_REVIEW", to: "PUBLISHED", capabilities: ["manage"] });
    expect(r.ok).toBe(false);
  });

  it("[C4] trả lại PENDING_REVIEW→DRAFT cần lý do", () => {
    expect(checkTransition({ from: "PENDING_REVIEW", to: "DRAFT", capabilities: ["review"] }).ok).toBe(false);
    expect(
      checkTransition({ from: "PENDING_REVIEW", to: "DRAFT", capabilities: ["review"], reason: "thiếu nhận xét" }).ok,
    ).toBe(true);
  });

  it("[C4] thu hồi PUBLISHED→RECALLED cần lý do (review)", () => {
    expect(checkTransition({ from: "PUBLISHED", to: "RECALLED", capabilities: ["review"] }).ok).toBe(false);
    expect(
      checkTransition({ from: "PUBLISHED", to: "RECALLED", capabilities: ["review"], reason: "sai điểm" }).ok,
    ).toBe(true);
  });

  it("[C4] RECALLED→PENDING_REVIEW (nộp lại) bởi GV (manage): OK", () => {
    expect(checkTransition({ from: "RECALLED", to: "PENDING_REVIEW", capabilities: ["manage"] }).ok).toBe(true);
  });

  it("nội dung chỉ sửa được ở DRAFT/RECALLED", () => {
    expect(isReportCardEditable("DRAFT")).toBe(true);
    expect(isReportCardEditable("RECALLED")).toBe(true);
    expect(isReportCardEditable("PENDING_REVIEW")).toBe(false);
    expect(isReportCardEditable("PUBLISHED")).toBe(false);
  });
});

describe("[#17] recall-edit-by-role (câu 55): siết quyền sửa sau phát hành", () => {
  // Capability suy từ ma trận v1 (permissions.ts) — hành vi go-live (RBAC_V2 flag OFF).
  const caps = (role: "TRAINING" | "TEACHER" | "CENTER_MANAGER" | "SUPER_ADMIN") =>
    actorCapabilities({
      manage: can(role, "report-cards:manage"),
      review: can(role, "report-cards:review"),
    });

  it("TRAINING (Toại) SỬA được học bạ ĐÃ THU HỒI (RECALLED) — có review", () => {
    expect(canEditReportCardContent("RECALLED", caps("TRAINING"))).toBe(true);
  });

  it("CENTER_MANAGER SỬA được học bạ ĐÃ THU HỒI (QL cơ sở)", () => {
    expect(canEditReportCardContent("RECALLED", caps("CENTER_MANAGER"))).toBe(true);
  });

  it("TEACHER (GV) BỊ CHẶN sửa học bạ đã THU HỒI (chỉ có manage, thiếu review)", () => {
    expect(canEditReportCardContent("RECALLED", caps("TEACHER"))).toBe(false);
  });

  it("GV vẫn viết được DRAFT (manage) — không đụng đánh giá buổi", () => {
    expect(canEditReportCardContent("DRAFT", caps("TEACHER"))).toBe(true);
  });

  it("PENDING_REVIEW / PUBLISHED khoá nội dung với mọi vai (kể cả reviewer)", () => {
    expect(canEditReportCardContent("PENDING_REVIEW", caps("CENTER_MANAGER"))).toBe(false);
    expect(canEditReportCardContent("PUBLISHED", caps("SUPER_ADMIN"))).toBe(false);
    expect(canEditReportCardContent("PUBLISHED", caps("TRAINING"))).toBe(false);
  });
});

describe("[R7-15] số liệu (C1)", () => {
  it("chuyên cần 22/48 → 46%", () => {
    expect(computeAttendanceRate({ total: 48, attended: 22, absent: 3, needMakeup: 1, madeUp: 2 })).toBe(46);
  });

  it("tổng 0 buổi → 0%", () => {
    expect(computeAttendanceRate({ total: 0, attended: 0, absent: 0, needMakeup: 0, madeUp: 0 })).toBe(0);
  });

  it("điểm TB bài tập chuẩn hoá thang 10 + đếm passed; bỏ qua attempt chưa chấm", () => {
    const r = computeExamAverage([
      { totalScore: 8, totalPoints: 10, passed: true },
      { totalScore: 6, totalPoints: 10, passed: true },
      { totalScore: 5, totalPoints: 20, passed: false }, // 2.5/10
      { totalScore: null, totalPoints: 10, passed: null }, // chưa chấm → loại khỏi avg
    ]);
    expect(r.count).toBe(3);
    expect(r.passed).toBe(2);
    // (8 + 6 + 2.5)/3 = 5.5
    expect(r.averageScore).toBe(5.5);
  });

  it("không có attempt chấm → averageScore null", () => {
    expect(computeExamAverage([]).averageScore).toBeNull();
  });
});

describe("[LMS-13] bài tập + kỹ năng (W4-a)", () => {
  it("tổng hợp bài tập: đếm nộp/chấm + điểm TB chuẩn hoá thang 10 (chỉ bài đã chấm)", () => {
    const r = computeAssignmentSummary([
      { status: "GRADED", score: 8, totalPoints: 10 }, // 8
      { status: "GRADED", score: 5, totalPoints: 20 }, // 2.5
      { status: "SUBMITTED", score: null, totalPoints: 10 }, // đã nộp, chưa chấm
      { status: "LATE", score: null, totalPoints: 10 }, // nộp trễ
      { status: "NOT_SUBMITTED", score: null, totalPoints: 10 }, // chưa nộp
    ]);
    expect(r.total).toBe(5);
    expect(r.submitted).toBe(4); // SUBMITTED+LATE+GRADED
    expect(r.graded).toBe(2);
    expect(r.averageScore).toBe(5.3); // (8 + 2.5)/2 = 5.25 → 5.3
  });

  it("chưa có bài tập chấm → averageScore null", () => {
    expect(computeAssignmentSummary([]).averageScore).toBeNull();
    expect(computeAssignmentSummary([{ status: "NOT_SUBMITTED", score: null, totalPoints: 10 }]).graded).toBe(0);
  });

  it("kỹ năng: lấy mức MỚI NHẤT mỗi kỹ năng (rows không sắp xếp)", () => {
    const r = latestSkillLevels([
      { skill: "PROGRAMMING", level: "BASIC", assessedAt: "2026-01-01T00:00:00.000Z" },
      { skill: "PROGRAMMING", level: "GOOD", assessedAt: "2026-03-01T00:00:00.000Z" },
      { skill: "TEAMWORK", level: "EXCELLENT", assessedAt: "2026-02-01T00:00:00.000Z" },
    ]);
    expect(r.find((x) => x.skill === "PROGRAMMING")?.level).toBe("GOOD");
    expect(r.find((x) => x.skill === "TEAMWORK")?.level).toBe("EXCELLENT");
    expect(r).toHaveLength(2);
  });
});

describe("[R7-15] snapshot freeze (C5)", () => {
  const baseMetrics: ReportCardMetrics = {
    attendance: { total: 48, attended: 22, absent: 3, needMakeup: 1, madeUp: 2, rate: 46 },
    exams: { count: 5, passed: 4, averageScore: 7.2 },
    computedAt: "2026-06-16T00:00:00.000Z",
  };

  it("buildPublishedSnapshot đóng băng — đổi metrics nguồn SAU không ảnh hưởng snapshot", () => {
    const metrics = JSON.parse(JSON.stringify(baseMetrics)) as ReportCardMetrics;
    const snap = buildPublishedSnapshot({
      metrics,
      reportCard: { finalComment: "Tốt", completionStatus: "Hoàn thành", periodComments: [{ period: "Giữa", comment: "Khá" }] },
      scores: [{ criterionId: "c1", level: 4, note: null }],
      criteria: [{ id: "c1", name: "Tư duy" }],
      student: { name: "An", studentCode: "SR1" },
      course: { name: "Sata 1" },
      className: "Lớp A",
      publishedAt: new Date("2026-06-16T10:00:00.000Z"),
    });

    // Mô phỏng điểm bài tập thay đổi SAU phát hành.
    metrics.exams.averageScore = 9.9;

    expect(snap.metrics.exams.averageScore).toBe(7.2); // bản phát hành KHÔNG đổi
    expect(snap.scores[0]).toEqual({ criterionId: "c1", name: "Tư duy", level: 4, note: null });
    expect(snap.publishedAt).toBe("2026-06-16T10:00:00.000Z");
  });

  it("parsePublishedSnapshot round-trip giữ nguyên số liệu đóng băng", () => {
    const snap = buildPublishedSnapshot({
      metrics: baseMetrics,
      reportCard: { finalComment: null, completionStatus: null, periodComments: [] },
      scores: [],
      criteria: [],
      student: { name: "An", studentCode: null },
      course: { name: "Sata 1" },
      className: "Lớp A",
      publishedAt: new Date("2026-06-16T10:00:00.000Z"),
    });
    const view = parsePublishedSnapshot("rc1", "enr1", snap);
    expect(view).not.toBeNull();
    expect(view?.metrics.attendance.rate).toBe(46);
    expect(view?.id).toBe("rc1");
  });

  it("[LMS-13] backward-compat: snapshot CŨ (thiếu assignments/skills) vẫn parse OK", () => {
    // baseMetrics KHÔNG có assignments/skills → mô phỏng học bạ PUBLISHED cũ.
    const oldSnap = buildPublishedSnapshot({
      metrics: baseMetrics,
      reportCard: { finalComment: null, completionStatus: null, periodComments: [] },
      scores: [],
      criteria: [],
      student: { name: "An", studentCode: null },
      course: { name: "Sata 1" },
      className: "Lớp A",
      publishedAt: new Date("2026-06-16T10:00:00.000Z"),
    });
    const view = parsePublishedSnapshot("rc1", "enr1", oldSnap);
    expect(view).not.toBeNull();
    expect(view?.metrics.assignments).toBeUndefined();
    expect(view?.metrics.skills).toBeUndefined();
  });

  it("[LMS-13] snapshot MỚI đóng băng cả assignments + skills", () => {
    const metrics: ReportCardMetrics = {
      ...baseMetrics,
      assignments: { total: 4, submitted: 3, graded: 2, averageScore: 6.5 },
      skills: [{ skill: "PROGRAMMING", level: "GOOD" }],
    };
    const snap = buildPublishedSnapshot({
      metrics,
      reportCard: { finalComment: null, completionStatus: null, periodComments: [] },
      scores: [],
      criteria: [],
      student: { name: "An", studentCode: null },
      course: { name: "Sata 1" },
      className: "Lớp A",
      publishedAt: new Date("2026-06-16T10:00:00.000Z"),
    });
    const view = parsePublishedSnapshot("rc1", "enr1", snap);
    expect(view?.metrics.assignments?.averageScore).toBe(6.5);
    expect(view?.metrics.skills?.[0]).toEqual({ skill: "PROGRAMMING", level: "GOOD" });
  });

  it("parsePublishedSnapshot trả null khi snapshot hỏng", () => {
    expect(parsePublishedSnapshot("rc1", "enr1", null)).toBeNull();
    expect(parsePublishedSnapshot("rc1", "enr1", { foo: 1 })).toBeNull();
  });

  it("normalizePeriodComments lọc rỗng + coerce string", () => {
    expect(normalizePeriodComments([{ period: "A", comment: "x" }, { period: "", comment: "" }, null])).toEqual([
      { period: "A", comment: "x" },
    ]);
    expect(normalizePeriodComments("not-array")).toEqual([]);
  });
});

describe("[R7-15] T5 scope (C6)", () => {
  const sa = (over: Partial<Parameters<typeof checkEnrollmentScope>[0]["actor"]> = {}) => ({
    isSuperAdmin: false,
    isHoLevel: false,
    visibleCenterIds: ["CS1"],
    assignedClassIds: new Set<string>(["CLS1"]),
    ...over,
  });

  it("QL@CS2 duyệt học bạ CS1 → CHẶN (khác cơ sở)", () => {
    const r = checkEnrollmentScope({
      actor: sa({ visibleCenterIds: ["CS2"] }),
      centerId: "CS1",
      classId: "CLS1",
      capabilities: ["review"],
    });
    expect(r.ok).toBe(false);
  });

  it("QL@CS1 duyệt học bạ lớp bất kỳ CS1 → OK (không cần là GV lớp)", () => {
    const r = checkEnrollmentScope({
      actor: sa({ assignedClassIds: new Set() }),
      centerId: "CS1",
      classId: "CLS_X",
      capabilities: ["review"],
    });
    expect(r.ok).toBe(true);
  });

  it("GV (manage) chỉ nhập lớp mình phụ trách", () => {
    expect(
      checkEnrollmentScope({ actor: sa(), centerId: "CS1", classId: "CLS1", capabilities: ["manage"] }).ok,
    ).toBe(true);
    expect(
      checkEnrollmentScope({ actor: sa(), centerId: "CS1", classId: "OTHER", capabilities: ["manage"] }).ok,
    ).toBe(false);
  });

  it("SUPER_ADMIN bỏ qua scope", () => {
    expect(
      checkEnrollmentScope({
        actor: sa({ isSuperAdmin: true, visibleCenterIds: [] }),
        centerId: "CS9",
        classId: "ANY",
        capabilities: ["review"],
      }).ok,
    ).toBe(true);
  });
});
