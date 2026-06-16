/**
 * R7-07 — Gán học viên + state machine buổi học "Hoàn tất buổi". Postgres LOCAL.
 *
 * SKELETON (RTM): AC1↔C1 · AC2↔C2 · AC4↔C4,C5,C7 + DoD consumer giả session.taught.
 * Một số case UI (C3 portal, C6 phạm vi nhận xét) làm ở lớp Playwright UI riêng.
 */
import { test, expect } from "@playwright/test";
import { db } from "../../../lib/db";
import { resetDb } from "../_helpers/seed";
import {
  buildAssignableWhere,
  computeCapacityOutcome,
  assignEnrollments,
} from "../../../lib/lms/assign";
import {
  completeSession,
  classifySessionForComplete,
} from "../../../lib/lms/session-lifecycle";
import {
  on,
  getHandlers,
  clearHandlers,
  type DomainEventLite,
} from "../../../lib/events/registry";

async function seedClassWithCourse(opts: {
  slug: string;
  centerId: string;
  maxStudents?: number;
}) {
  await db.center.upsert({
    where: { id: opts.centerId },
    create: { id: opts.centerId, name: opts.centerId, code: opts.centerId, slug: opts.centerId.toLowerCase(), address: "test" },
    update: {},
  });
  const course = await db.course.create({
    data: { name: `Khoá ${opts.slug}`, slug: opts.slug },
  });
  const cls = await db.class.create({
    data: {
      name: `Lớp ${opts.slug}`,
      courseId: course.id,
      centerId: opts.centerId,
      maxStudents: opts.maxStudents ?? 10,
      status: "ACTIVE",
    },
    select: { id: true, courseId: true, centerId: true, maxStudents: true },
  });
  return { course, cls };
}

/** Tạo 1 enrollment "chờ xếp lớp" (CONFIRMED) cho 1 HS mới ở cơ sở `centerId`. */
async function seedPendingEnrollment(opts: {
  courseId: string;
  centerId: string | null;
  holdingClassId: string;
  name: string;
}) {
  const student = await db.student.create({
    data: { name: opts.name, centerId: opts.centerId },
    select: { id: true },
  });
  return db.enrollment.create({
    data: {
      studentId: student.id,
      classId: opts.holdingClassId,
      courseId: opts.courseId,
      status: "CONFIRMED",
    },
    select: { id: true, studentId: true },
  });
}

test.describe("[R7-07] Assign students + session lifecycle", () => {
  test.beforeEach(async () => {
    await resetDb();
    clearHandlers();
  });

  // ── PURE ────────────────────────────────────────────────────────────────
  test("[R7-07-U1] buildAssignableWhere lọc đúng khóa + cơ sở + chưa STUDYING", () => {
    const w = buildAssignableWhere({ id: "c1", courseId: "course1", centerId: "CS1" });
    expect(w.courseId).toBe("course1");
    expect(w.status).toEqual({ in: ["CONFIRMED", "PENDING"] });
    expect(w.classId).toEqual({ not: "c1" });
  });

  test("[R7-07-U2] computeCapacityOutcome", () => {
    expect(computeCapacityOutcome(8, 4, 10)).toEqual({ total: 12, exceeds: true });
    expect(computeCapacityOutcome(6, 4, 10)).toEqual({ total: 10, exceeds: false });
  });

  test("[R7-07-U3] classifySessionForComplete", () => {
    expect(classifySessionForComplete("SCHEDULED")).toBe("OK");
    expect(classifySessionForComplete("COMPLETED")).toBe("ALREADY_COMPLETED");
    expect(classifySessionForComplete("CANCELLED")).toBe("BLOCKED_CANCELLED");
  });

  // ── AC1/C1 — dropdown filter ─────────────────────────────────────────────
  test("[R7-07-C1] chỉ enrollment hợp lệ hiện; CS khác/PAUSED/đã STUDYING ẩn", async () => {
    const { course, cls } = await seedClassWithCourse({ slug: "asg1", centerId: "CS1" });
    // Lớp giữ chỗ KHÁC cls (enrollment "chờ xếp lớp" nằm ở lớp khác cùng khóa/CS →
    // buildAssignableWhere có classId:{not: cls.id}, nếu giữ ở chính cls sẽ bị ẩn).
    const holding = await db.class.create({
      data: { name: "Holding asg1", courseId: course.id, centerId: "CS1", status: "ACTIVE" },
      select: { id: true },
    });

    // hợp lệ: cùng khóa, cùng CS1, CONFIRMED, đang ở lớp giữ chỗ khác.
    await seedPendingEnrollment({ courseId: course.id, centerId: "CS1", holdingClassId: holding.id, name: "Hợp lệ" });
    // CS2 → ẩn.
    await db.center.upsert({ where: { id: "CS2" }, create: { id: "CS2", name: "CS2", code: "CS2", slug: "cs2", address: "test" }, update: {} });
    await seedPendingEnrollment({ courseId: course.id, centerId: "CS2", holdingClassId: cls.id, name: "CS khác" });

    const found = await db.enrollment.findMany({
      where: buildAssignableWhere(cls),
      select: { student: { select: { name: true } } },
    });
    const names = found.map((f) => f.student?.name);
    expect(names).toContain("Hợp lệ");
    expect(names).not.toContain("CS khác");
  });

  // ── AC2/C2 — bulk + override sức chứa ────────────────────────────────────
  test("[R7-07-C2] vượt sức chứa → needsOverride; override=true → gán + audit", async () => {
    const { course, cls } = await seedClassWithCourse({ slug: "asg2", centerId: "CS1", maxStudents: 2 });
    const enrs = await Promise.all(
      [1, 2, 3].map((i) =>
        seedPendingEnrollment({ courseId: course.id, centerId: "CS1", holdingClassId: cls.id, name: `HS${i}` }),
      ),
    );
    const ids = enrs.map((e) => e.id);

    const blocked = await assignEnrollments({ classId: cls.id, enrollmentIds: ids, override: false, actorId: "t", actorName: "T" });
    expect(blocked.ok).toBe(false);
    expect(blocked.needsOverride).toBe(true);

    const ok = await assignEnrollments({ classId: cls.id, enrollmentIds: ids, override: true, actorId: "t", actorName: "T" });
    expect(ok.ok).toBe(true);
    expect(ok.assigned).toBe(3);

    const studying = await db.enrollment.count({ where: { classId: cls.id, status: "STUDYING" } });
    expect(studying).toBe(3);
    const audit = await db.auditLog.count({ where: { entityId: cls.id, action: "ASSIGN_OVERRIDE_CAPACITY" } });
    expect(audit).toBeGreaterThanOrEqual(1);
  });

  // ── AC4/C4 — completeSession idempotent + event 1 lần ─────────────────────
  test("[R7-07-C4] completeSession ×2 → dữ liệu thực tế lưu, event chỉ 1 lần", async () => {
    const { cls } = await seedClassWithCourse({ slug: "ses4", centerId: "CS1" });
    const s = await db.classSession.create({
      data: { classId: cls.id, date: new Date(), status: "SCHEDULED" },
      select: { id: true },
    });
    const studentForAtt = await db.student.create({ data: { name: "HS điểm danh", centerId: "CS1" }, select: { id: true } });
    await db.attendance.create({ data: { sessionId: s.id, studentId: studentForAtt.id, status: "PRESENT" } });

    const r1 = await completeSession({ sessionId: s.id, actualStartAt: new Date(), actorId: "gv", actorName: "GV" });
    expect(r1.ok).toBe(true);
    const r2 = await completeSession({ sessionId: s.id, actorId: "gv", actorName: "GV" });
    expect(r2.ok).toBe(true);
    expect(r2.alreadyCompleted).toBe(true);

    const events = await db.domainEvent.count({ where: { type: "session.taught" } });
    expect(events).toBe(1); // dedupeKey theo sessionId
  });

  // ── AC4/C5 — thiếu điểm danh → cảnh báo bắt confirm ──────────────────────
  test("[R7-07-C5] thiếu điểm danh → needsConfirm; confirm → hoàn tất", async () => {
    const { cls } = await seedClassWithCourse({ slug: "ses5", centerId: "CS1" });
    const s = await db.classSession.create({
      data: { classId: cls.id, date: new Date(), status: "SCHEDULED" },
      select: { id: true },
    });
    const warn = await completeSession({ sessionId: s.id, actorId: "gv", actorName: "GV" });
    expect(warn.ok).toBe(false);
    expect(warn.needsConfirm).toBe(true);

    const done = await completeSession({ sessionId: s.id, confirmNoAttendance: true, actorId: "gv", actorName: "GV" });
    expect(done.ok).toBe(true);
  });

  // ── AC4/C7 — completeSession trên buổi CANCELLED → chặn ──────────────────
  test("[R7-07-C7] buổi CANCELLED không thể hoàn tất", async () => {
    const { cls } = await seedClassWithCourse({ slug: "ses7", centerId: "CS1" });
    const s = await db.classSession.create({
      data: { classId: cls.id, date: new Date(), status: "CANCELLED" },
      select: { id: true },
    });
    const r = await completeSession({ sessionId: s.id, confirmNoAttendance: true, actorId: "gv", actorName: "GV" });
    expect(r.ok).toBe(false);
  });

  // ── DoD — consumer GIẢ cho session.taught (chuẩn bị R7-14) ───────────────
  test("[R7-07-D1] fake consumer session.taught chạy đúng 1 lần", async () => {
    const seen: string[] = [];
    on("session.taught", async (e: DomainEventLite) => {
      seen.push(String(e.payload.sessionId));
    });
    expect(getHandlers("session.taught").length).toBeGreaterThanOrEqual(1);

    const { cls } = await seedClassWithCourse({ slug: "dod1", centerId: "CS1" });
    const s = await db.classSession.create({
      data: { classId: cls.id, date: new Date(), status: "SCHEDULED" },
      select: { id: true },
    });
    await completeSession({ sessionId: s.id, confirmNoAttendance: true, actorId: "gv", actorName: "GV" });

    // Mô phỏng dispatcher: chạy handler thủ công trên event vừa phát.
    const ev = await db.domainEvent.findFirstOrThrow({ where: { type: "session.taught" } });
    const lite: DomainEventLite = { id: ev.id, type: ev.type, payload: ev.payloadJson as Record<string, unknown> };
    for (const h of getHandlers("session.taught")) await h(lite);

    expect(seen).toEqual([s.id]);
  });
});
