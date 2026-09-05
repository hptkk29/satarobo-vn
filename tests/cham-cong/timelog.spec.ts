// tests/cham-cong/timelog.spec.ts — L4: vé 120s tiêu nguyên tử + ghi lượt có cờ + ngày được tính lại.
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { seedShiftTemplates } from "../../lib/cham-cong/seed-core";

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const isLocal = /(@|\/\/)(localhost|127\.0\.0\.1)[:/]/.test(DB_URL) && /satarobo_test|ci_test/.test(DB_URL);
const d = isLocal ? describe : describe.skip;
const TAG = "cc-timelog";

d("vé + ghi lượt + tính lại", () => {
  const db = new PrismaClient({ datasourceUrl: DB_URL });
  let userId = "";
  let centerId = "";
  let wlId = "";
  let mod: typeof import("../../lib/cham-cong/timelog");
  let rc: typeof import("../../lib/cham-cong/recompute");

  beforeAll(async () => {
    mod = await import("../../lib/cham-cong/timelog");
    rc = await import("../../lib/cham-cong/recompute");
    await seedShiftTemplates(db);
    const old = await db.user.findMany({ where: { email: { endsWith: `@${TAG}.test` } }, select: { id: true } });
    const ids = old.map((u) => u.id);
    await db.staffAttendanceDay.deleteMany({ where: { userId: { in: ids } } });
    await db.staffTimeLog.deleteMany({ where: { userId: { in: ids } } });
    await db.attendanceTicket.deleteMany({ where: { userId: { in: ids } } });
    await db.shiftAssignment.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    const c = await db.center.upsert({ where: { slug: `${TAG}-cs1` }, update: {}, create: { slug: `${TAG}-cs1`, name: "CS1 timelog", address: "x", code: `${TAG}-CS1` }, select: { id: true } });
    centerId = c.id;
    const wl = await db.workLocation.upsert({
      where: { code: `${TAG}-CS1` },
      update: { latitude: 16.0471, longitude: 108.2062, radiusMeters: 100, geofenceEnabled: true, isActive: true },
      create: { code: `${TAG}-CS1`, name: "Quầy CS1", centerId, latitude: 16.0471, longitude: 108.2062, radiusMeters: 100, geofenceEnabled: true },
      select: { id: true },
    });
    wlId = wl.id;
    userId = (await db.user.create({ data: { email: `nv@${TAG}.test`, name: "NV timelog", role: "SALES_CSM", roles: ["SALES_CSM"], password: "x", centerId }, select: { id: true } })).id;
  });
  afterAll(async () => {
    await db.staffAttendanceDay.deleteMany({ where: { userId } });
    await db.staffTimeLog.deleteMany({ where: { userId } });
    await db.attendanceTicket.deleteMany({ where: { userId } });
    await db.shiftAssignment.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  it("vé: cấp → tiêu được đúng 1 lần; sai nonce / dùng lại / hết hạn đều fail-closed", async () => {
    const t = await mod.issueTicket({ userId, workLocationId: wlId });
    expect(await mod.consumeTicket({ ticketId: t.ticketId, nonce: "sai", userId })).toEqual({ ok: false, reason: "TICKET_INVALID" });
    expect(await mod.consumeTicket({ ticketId: t.ticketId, nonce: t.nonce, userId })).toEqual({ ok: true, workLocationId: wlId });
    expect(await mod.consumeTicket({ ticketId: t.ticketId, nonce: t.nonce, userId })).toEqual({ ok: false, reason: "TICKET_REUSED" });
    const t2 = await mod.issueTicket({ userId, workLocationId: wlId });
    await db.attendanceTicket.update({ where: { id: t2.ticketId }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await mod.consumeTicket({ ticketId: t2.ticketId, nonce: t2.nonce, userId })).toEqual({ ok: false, reason: "TICKET_EXPIRED" });
  });

  it("ghi lượt: trong vùng không cờ; ngoài vùng NGOAI_VUNG vẫn ghi; thiếu GPS THIEU_GPS; không ca CHAM_NGOAI_LICH; trùng 2′ TRUNG_2_PHUT", async () => {
    const r1 = await mod.recordTimeLog({ userId, workLocationId: wlId, direction: "CHECK_IN", latitude: 16.0472, longitude: 108.2063 });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.flags).toEqual(["CHAM_NGOAI_LICH"]); // chưa xếp ca hôm nay
    const r2 = await mod.recordTimeLog({ userId, workLocationId: wlId, direction: "CHECK_IN", latitude: 16.06, longitude: 108.22 });
    if (r2.ok) expect(r2.flags).toEqual(["CHAM_NGOAI_LICH", "NGOAI_VUNG", "TRUNG_2_PHUT"]);
    const r3 = await mod.recordTimeLog({ userId, workLocationId: wlId, direction: "CHECK_OUT" });
    if (r3.ok) expect(r3.flags).toContain("THIEU_GPS");
    const rows = await db.staffTimeLog.findMany({ where: { userId, result: "ACCEPTED" } });
    expect(rows).toHaveLength(3);
    expect(rows.every((x) => x.centerId === centerId)).toBe(true);
  });

  it("có ca S tại cơ sở khác → SAI_NOI_LAM; tính lại ngày ra dòng có cờ chuyển tiếp", async () => {
    const other = await db.center.upsert({ where: { slug: `${TAG}-cs2` }, update: {}, create: { slug: `${TAG}-cs2`, name: "CS2 timelog", address: "x", code: `${TAG}-CS2` }, select: { id: true } });
    const tplS = await db.shiftTemplate.findFirstOrThrow({ where: { code: "S", centerId: null }, select: { id: true } });
    const workDate = (await db.staffTimeLog.findFirstOrThrow({ where: { userId }, select: { workDate: true } })).workDate;
    await db.shiftAssignment.create({ data: { userId, centerId: other.id, workDate, templateId: tplS.id, templateCode: "S", segments: [{ start: "07:45", end: "11:30", kind: "WORK", orgUnitIds: [] }], placeMode: "AT_UNITS", attendanceMode: "REQUIRED", dayCredit: 1, source: "MANUAL" } });
    const r = await mod.recordTimeLog({ userId, workLocationId: wlId, direction: "CHECK_OUT", latitude: 16.0471, longitude: 108.2062, now: new Date(Date.now() + 10 * 60_000) });
    expect(r.ok && r.flags.includes("SAI_NOI_LAM")).toBe(true);
    await rc.recomputeAttendanceDay(userId, workDate);
    const day = await db.staffAttendanceDay.findUniqueOrThrow({ where: { userId_workDate: { userId, workDate } } });
    expect(day.flags).toContain("SAI_NOI_LAM");
    expect(day.dayCreditEarned).toBe(1); // T-01: cờ, không trừ
    // Event hàng đợi đã được xếp
    const ev = await db.domainEvent.count({ where: { type: "hr.attendance_day_dirty", payloadJson: { path: ["userId"], equals: userId } } });
    expect(ev).toBeGreaterThan(0);
  });
});
