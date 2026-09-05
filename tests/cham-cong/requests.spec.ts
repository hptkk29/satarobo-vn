// tests/cham-cong/requests.spec.ts — L5: đơn từ dùng chung + duyệt trong transaction (T-05/T-06/T-07).
// Phần thuần chạy mọi nơi; phần DB cần Postgres LOCAL (satarobo_test), tự SKIP nếu không có.
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedLeaveTypes, seedShiftTemplates } from "../../lib/cham-cong/seed-core";

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const isLocal = /(@|\/\/)(localhost|127\.0\.0\.1)[:/]/.test(DB_URL) && /satarobo_test|ci_test/.test(DB_URL);
const d = isLocal ? describe : describe.skip;
if (!isLocal) console.warn(`[cham-cong/requests] SKIP: DATABASE_URL không trỏ Postgres local satarobo_test`);

const TAG = "cc-req";
const utc = (y: number, m: number, dd: number) => new Date(Date.UTC(y, m - 1, dd));

describe("requests — thuần", () => {
  it("isSubmittedLate: dưới N ngày báo trước = muộn, hồi tố = muộn, đủ ngày = không", async () => {
    const { isSubmittedLate } = await import("../../lib/cham-cong/requests");
    const now = new Date("2026-09-10T03:00:00Z"); // 10:00 VN 10/09
    expect(isSubmittedLate(utc(2026, 9, 11), now, 2)).toBe(true);
    expect(isSubmittedLate(utc(2026, 9, 12), now, 2)).toBe(false);
    expect(isSubmittedLate(utc(2026, 9, 9), now, 2)).toBe(true);
    expect(isSubmittedLate(utc(2026, 9, 10), now, 0)).toBe(false);
  });
  it("vnTimeOn: 'HH:mm' giờ VN trên ngày công → mốc UTC đúng; giờ sai → null", async () => {
    const { vnTimeOn } = await import("../../lib/cham-cong/requests");
    expect(vnTimeOn(utc(2026, 9, 8), "07:45")?.toISOString()).toBe("2026-09-08T00:45:00.000Z");
    expect(vnTimeOn(utc(2026, 9, 8), "01:00")?.toISOString()).toBe("2026-09-07T18:00:00.000Z");
    expect(vnTimeOn(utc(2026, 9, 8), "25:00")).toBeNull();
    expect(vnTimeOn(utc(2026, 9, 8), "abc")).toBeNull();
  });
  it("periodKeysBetween gom đúng các tháng của khoảng ngày", async () => {
    const { periodKeysBetween } = await import("../../lib/cham-cong/requests");
    expect(periodKeysBetween(utc(2026, 9, 29), utc(2026, 10, 2))).toEqual(["2026-09", "2026-10"]);
    expect(periodKeysBetween(utc(2026, 9, 1), utc(2026, 9, 1))).toEqual(["2026-09"]);
  });
});

d("requests — DB thật", () => {
  const db = new PrismaClient({ datasourceUrl: DB_URL });
  let cs1 = "";
  let cs2 = "";
  let gv = ""; // nhà CS1
  let tv = ""; // nhà CS1, người nhận ca
  let ho = ""; // Hội sở
  let tplS = "";
  let tplD1 = "";
  let leaveId = "";
  let requests: typeof import("../../lib/cham-cong/requests");
  const d8 = utc(2026, 9, 8);
  const d9 = utc(2026, 9, 9);
  const d10 = utc(2026, 9, 10);
  const actor = { id: "", name: "QL test" };

  async function cleanup() {
    const users = await db.user.findMany({ where: { email: { endsWith: `@${TAG}.test` } }, select: { id: true } });
    const ids = users.map((u) => u.id);
    await db.workRequest.deleteMany({ where: { requesterId: { in: ids } } });
    await db.domainEvent.deleteMany({ where: { dedupeKey: { startsWith: "attday:" }, payloadJson: { path: ["userId"], string_contains: "" } } }).catch(() => undefined);
    await db.staffAttendanceDay.deleteMany({ where: { userId: { in: ids } } });
    await db.staffTimeLog.deleteMany({ where: { userId: { in: ids } } });
    await db.shiftAssignment.deleteMany({ where: { userId: { in: ids } } });
    await db.attendancePeriod.deleteMany({ where: { centerId: { in: [cs1, cs2].filter(Boolean) } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }

  beforeAll(async () => {
    requests = await import("../../lib/cham-cong/requests");
    await seedShiftTemplates(db);
    await seedLeaveTypes(db);
    const c1 = await db.center.upsert({ where: { slug: `${TAG}-cs1` }, update: {}, create: { slug: `${TAG}-cs1`, name: "CS1 req", address: "x", code: `${TAG}-CS1` }, select: { id: true } });
    const c2 = await db.center.upsert({ where: { slug: `${TAG}-cs2` }, update: {}, create: { slug: `${TAG}-cs2`, name: "CS2 req", address: "x", code: `${TAG}-CS2` }, select: { id: true } });
    cs1 = c1.id;
    cs2 = c2.id;
    await cleanup();
    const mk = (email: string, name: string, centerId: string | null) =>
      db.user.create({ data: { email: `${email}@${TAG}.test`, name, role: "TEACHER", roles: ["TEACHER"], password: "x", centerId }, select: { id: true } });
    gv = (await mk("gv", "GV req", cs1)).id;
    tv = (await mk("tv", "TV req", cs1)).id;
    ho = (await mk("ho", "HO req", null)).id;
    actor.id = (await mk("ql", "QL req", cs1)).id;
    tplS = (await db.shiftTemplate.findFirstOrThrow({ where: { code: "S", centerId: null }, select: { id: true } })).id;
    tplD1 = (await db.shiftTemplate.findFirstOrThrow({ where: { code: "CG", centerId: null }, select: { id: true } })).id;
    leaveId = (await db.leaveType.findFirstOrThrow({ where: { paidRatio: { gt: 0 } }, select: { id: true } })).id;
    // GV có ca S ở CS2 ngày 08 (GV nhà CS1 xuống CS2 làm) — cơ sở nhận đơn phải là CS2.
    const seg = [{ start: "07:45", end: "11:30", kind: "WORK", orgUnitIds: [] }];
    await db.shiftAssignment.createMany({
      data: [
        { userId: gv, centerId: cs2, workDate: d8, templateId: tplS, templateCode: "S", segments: seg, source: "IMPORT" },
        { userId: gv, centerId: cs1, workDate: d9, templateId: tplS, templateCode: "S", segments: seg, source: "IMPORT" },
        { userId: tv, centerId: cs1, workDate: d9, templateId: tplD1, templateCode: "CG", segments: seg, source: "IMPORT" },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await db.$disconnect();
  });

  const base = {
    startTime: null, endTime: null, hours: null, className: null, classId: null, targetUserId: null,
    requesterNewTemplateId: null, targetNewTemplateId: null, leaveTypeId: null, requestedInAt: null, requestedOutAt: null,
    chosenCenterId: null, detail: null, reason: "test",
  };

  it("cơ sở nhận đơn = cơ sở của ca ngày áp dụng (CS2), không phải cơ sở nhà (CS1)", async () => {
    const r = await requests.resolveRequestCenter(gv, d8);
    expect(r).toMatchObject({ centerId: cs2, via: "ASSIGNMENT" });
    const r2 = await requests.resolveRequestCenter(gv, d10);
    expect(r2).toMatchObject({ centerId: cs1, via: "HOME" });
  });

  it("người Hội sở không chọn cơ sở ⇒ từ chối; chọn CS1 ⇒ đơn vào CS1", async () => {
    const bad = await requests.submitAttendanceRequest({ ...base, requesterId: ho, kind: "OT", fromDate: d10, toDate: null, startTime: "18:00", endTime: "20:00" });
    expect(bad.ok).toBe(false);
    const ok = await requests.submitAttendanceRequest({ ...base, requesterId: ho, kind: "OT", fromDate: d10, toDate: null, startTime: "18:00", endTime: "20:00", chosenCenterId: cs1 });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.centerId).toBe(cs1);
  });

  it("nộp trùng (cùng loại, cùng ngày, đang chờ) bị chặn; nộp muộn được cắm cờ", async () => {
    const now = new Date("2026-09-09T03:00:00Z");
    const a = await requests.submitAttendanceRequest({ ...base, requesterId: gv, kind: "LATE_EARLY", fromDate: d10, toDate: null, startTime: "08:30", now });
    expect(a.ok && a.submittedLate).toBe(true);
    const b = await requests.submitAttendanceRequest({ ...base, requesterId: gv, kind: "LATE_EARLY", fromDate: d10, toDate: null, startTime: "08:30", now });
    expect(b.ok).toBe(false);
  });

  it("SHIFT_SWAP duyệt: đổi ca CẢ HAI người trên lưới trong một tx, nguồn SWAP, notify 2 người", async () => {
    const s = await requests.submitAttendanceRequest({ ...base, requesterId: gv, kind: "SHIFT_SWAP", fromDate: d9, toDate: null, requesterNewTemplateId: tplD1, targetUserId: tv, targetNewTemplateId: tplS });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const r = await requests.decideRequest({ requestId: s.id, decision: "APPROVED", note: null, actor, canWriteCenter: (c) => c === cs1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.notify.map((n) => n.userId).sort()).toEqual([gv, tv].sort());
    const a = await db.shiftAssignment.findFirstOrThrow({ where: { userId: gv, workDate: d9, status: "ACTIVE" } });
    expect(a).toMatchObject({ templateCode: "CG", source: "SWAP", sourceRequestId: s.id });
    const b = await db.shiftAssignment.findFirstOrThrow({ where: { userId: tv, workDate: d9, status: "ACTIVE" } });
    expect(b).toMatchObject({ templateCode: "S", source: "SWAP" });
    const req = await db.workRequest.findUniqueOrThrow({ where: { id: s.id } });
    expect(req.status).toBe("APPROVED");
    expect(req.appliedAt).not.toBeNull();
    // Duyệt lần hai ⇒ đã xử lý.
    const again = await requests.decideRequest({ requestId: s.id, decision: "APPROVED", note: null, actor, canWriteCenter: () => true });
    expect(again.ok).toBe(false);
  });

  it("T-05: áp thất bại (không có quyền ở cơ sở của ca) ⇒ rollback trạng thái, đơn vẫn PENDING + applyError", async () => {
    // GV có ca ở CS2 ngày 08; người duyệt chỉ có quyền CS2 (cơ sở nhận đơn) nhưng KHÔNG có quyền CS1
    // — mã CG defaultPlace HOME ⇒ ca mới rơi về CS1 ⇒ setAssignmentCell từ chối ⇒ cả quyết định phải lùi.
    const s = await requests.submitAttendanceRequest({ ...base, requesterId: gv, kind: "SHIFT_SWAP", fromDate: d8, toDate: null, requesterNewTemplateId: tplD1 });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.centerId).toBe(cs2);
    const r = await requests.decideRequest({ requestId: s.id, decision: "APPROVED", note: null, actor, canWriteCenter: (c) => c === cs2 });
    expect(r.ok).toBe(false);
    const req = await db.workRequest.findUniqueOrThrow({ where: { id: s.id } });
    expect(req.status).toBe("PENDING");
    expect(req.reviewedById).toBeNull();
    expect(req.applyError).toMatch(/quyền/);
    const a = await db.shiftAssignment.findFirstOrThrow({ where: { userId: gv, workDate: d8, status: "ACTIVE" } });
    expect(a.templateCode).toBe("S"); // ca cũ còn nguyên
  });

  it("LEAVE 2 ngày duyệt ⇒ ghi P cả 2 ngày (nguồn LEAVE); TIMESHEET_FIX ⇒ 2 mốc MANUAL_ADJUST + event tính lại", async () => {
    const d11 = utc(2026, 9, 11);
    const d12 = utc(2026, 9, 12);
    const l = await requests.submitAttendanceRequest({ ...base, requesterId: tv, kind: "LEAVE", fromDate: d11, toDate: d12, leaveTypeId: leaveId });
    expect(l.ok).toBe(true);
    if (!l.ok) return;
    const rl = await requests.decideRequest({ requestId: l.id, decision: "APPROVED", note: "ok", actor, canWriteCenter: (c) => c === cs1 });
    expect(rl.ok).toBe(true);
    const cells = await db.shiftAssignment.findMany({ where: { userId: tv, workDate: { in: [d11, d12] }, status: "ACTIVE" } });
    expect(cells.map((c) => c.templateCode)).toEqual(["P", "P"]);
    expect(cells.every((c) => c.source === "LEAVE" && c.isLeave)).toBe(true);

    const f = await requests.submitAttendanceRequest({ ...base, requesterId: tv, kind: "TIMESHEET_FIX", fromDate: d9, toDate: null, requestedInAt: "07:40", requestedOutAt: "11:35" });
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    const rf = await requests.decideRequest({ requestId: f.id, decision: "APPROVED", note: null, actor, canWriteCenter: (c) => c === cs1 });
    expect(rf.ok).toBe(true);
    const logs = await db.staffTimeLog.findMany({ where: { userId: tv, workDate: d9 }, orderBy: { loggedAt: "asc" } });
    expect(logs.map((x) => [x.direction, x.source, x.loggedAt.toISOString()])).toEqual([
      ["CHECK_IN", "MANUAL_ADJUST", "2026-09-09T00:40:00.000Z"],
      ["CHECK_OUT", "MANUAL_ADJUST", "2026-09-09T04:35:00.000Z"],
    ]);
    expect(logs.every((x) => x.adjustRequestId === f.id && x.reviewStatus === "CONFIRMED")).toBe(true);
    const ev = await db.domainEvent.findFirst({ where: { type: "hr.attendance_day_dirty", dedupeKey: { startsWith: `attday:${tv}:2026-09-09:` } } });
    expect(ev).not.toBeNull();
  });

  it("từ chối: chỉ đổi trạng thái, không chạm lưới; đơn vào kỳ đã KHOÁ bị từ chối nhận", async () => {
    const s = await requests.submitAttendanceRequest({ ...base, requesterId: gv, kind: "SHIFT_SWAP", fromDate: d10, toDate: null, requesterNewTemplateId: tplD1 });
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const r = await requests.decideRequest({ requestId: s.id, decision: "REJECTED", note: "bận", actor, canWriteCenter: (c) => c === cs1 });
    expect(r.ok && r.applied).toBe(false);
    expect((await db.workRequest.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("REJECTED");
    expect(await db.shiftAssignment.findFirst({ where: { userId: gv, workDate: d10, status: "ACTIVE" } })).toBeNull();

    await db.attendancePeriod.create({ data: { centerId: cs1, periodKey: "2026-08", status: "LOCKED" } });
    const late = await requests.submitAttendanceRequest({ ...base, requesterId: gv, kind: "TIMESHEET_FIX", fromDate: utc(2026, 8, 20), toDate: null, requestedInAt: "08:00" });
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error).toMatch(/chốt sổ/);
  });
});
