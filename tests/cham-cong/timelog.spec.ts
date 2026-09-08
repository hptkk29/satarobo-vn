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

  it("điểm ĐÃ bật định vị: trong vùng ghi được; ngoài vùng và thiếu GPS bị CHẶN, không ghi dòng nào", async () => {
    // Đây là chỗ luật đảo chiều so với Q-07 cũ ("ghi luôn + gắn cờ"), và đảo vì QR đổi thiết kế:
    // mã tĩnh dán ở quầy thì ai chụp ảnh cũng quét được, nên định vị là lớp bảo vệ CÒN LẠI duy
    // nhất — gắn cờ thôi thì mã tĩnh + cờ = không chặn gì cả.
    const r1 = await mod.recordTimeLog({ userId, workLocationId: wlId, direction: "CHECK_IN", latitude: 16.0472, longitude: 108.2063 });
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.flags).toEqual(["CHAM_NGOAI_LICH"]); // chưa xếp ca hôm nay

    const r2 = await mod.recordTimeLog({ userId, workLocationId: wlId, direction: "CHECK_IN", latitude: 16.06, longitude: 108.22 });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.rejectReason).toBe("OUTSIDE_GEOFENCE");

    const r3 = await mod.recordTimeLog({ userId, workLocationId: wlId, direction: "CHECK_OUT" });
    expect(r3.ok).toBe(false);
    if (!r3.ok) expect(r3.rejectReason).toBe("NO_GPS");

    // Trùng 2′ vẫn là CỜ chứ không phải chặn — người bấm nhầm hai lần không bị mất lượt.
    const r4 = await mod.recordTimeLog({ userId, workLocationId: wlId, direction: "CHECK_IN", latitude: 16.0472, longitude: 108.2063 });
    expect(r4.ok).toBe(true);
    if (r4.ok) expect(r4.flags).toContain("TRUNG_2_PHUT");

    const rows = await db.staffTimeLog.findMany({ where: { userId, result: "ACCEPTED" } });
    expect(rows).toHaveLength(2); // r1 + r4; hai lượt bị chặn KHÔNG để lại dòng nào
    expect(rows.every((x) => x.centerId === centerId)).toBe(true);
  });

  it("điểm CHƯA khai toạ độ: chạy như cũ — ghi + gắn cờ, không chặn ai", async () => {
    // Chặn vô điều kiện là khoá cửa cả công ty: `geofenceEnabled` mặc định false và toạ độ mặc
    // định null, nên điểm chưa đo thực địa sẽ từ chối mọi người. Khoá hành vi đó lại ở đây.
    const c2 = await db.center.upsert({ where: { slug: `${TAG}-cs3` }, update: {}, create: { slug: `${TAG}-cs3`, name: "CS3 timelog", address: "x", code: `${TAG}-CS3` }, select: { id: true } });
    const wl2 = await db.workLocation.upsert({
      where: { code: `${TAG}-CS3` },
      update: { latitude: null, longitude: null, geofenceEnabled: false, isActive: true },
      create: { code: `${TAG}-CS3`, name: "Quầy CS3", centerId: c2.id, geofenceEnabled: false },
      select: { id: true },
    });
    const u2 = await db.user.create({ data: { email: `nv2@${TAG}.test`, name: "NV chưa toạ độ", role: "SALES_CSM", roles: ["SALES_CSM"], password: "x", centerId: c2.id }, select: { id: true } });
    try {
      const r = await mod.recordTimeLog({ userId: u2.id, workLocationId: wl2.id, direction: "CHECK_IN" });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.flags).toContain("CHUA_TOA_DO");
    } finally {
      await db.staffAttendanceDay.deleteMany({ where: { userId: u2.id } });
      await db.staffTimeLog.deleteMany({ where: { userId: u2.id } });
      await db.user.deleteMany({ where: { id: u2.id } });
    }
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
  // ── HỘI SỞ quét ở CS1 (08/09/2026) — KHOÁ LẠI LÝ DO cờ đang đúng ────────────────
  //
  // Hôm nay người Hội sở quét ở CS1 nhận cờ `CHAM_NGOAI_LICH`. Đó là TÌNH CỜ, không
  // phải thiết kế: prod có 0 `ShiftAssignment` nên ai quét cũng "ngoài lịch". Cờ đó nói
  // về LỊCH ("hôm nay không có ca nào"), không nói gì về NƠI CHỐN.
  //
  // Hai ca dưới dựng ca làm THẬT cho người Hội sở để hành vi không lặng lẽ đổi nghĩa
  // vào ngày Hội sở có ca đầu tiên.
  describe("người Hội sở quét ở cơ sở khác", () => {
    let hoUserId = "";
    let hoCenterId = "";
    const ngay = () => new Date(Date.now() + 30 * 60_000);

    beforeAll(async () => {
      const ho = await db.center.upsert({
        where: { slug: `${TAG}-ho` },
        update: {},
        create: { slug: `${TAG}-ho`, name: "Hội sở timelog", address: "x", code: `${TAG}-HO` },
        select: { id: true },
      });
      hoCenterId = ho.id;
      hoUserId = (
        await db.user.create({
          data: { email: `ho@${TAG}.test`, name: "NV Hội sở", role: "HR", roles: ["HR"], password: "x", centerId: hoCenterId },
          select: { id: true },
        })
      ).id;
    });

    afterAll(async () => {
      await db.staffAttendanceDay.deleteMany({ where: { userId: hoUserId } });
      await db.staffTimeLog.deleteMany({ where: { userId: hoUserId } });
      await db.shiftAssignment.deleteMany({ where: { userId: hoUserId } });
      await db.user.deleteMany({ where: { id: hoUserId } });
    });

    async function xepCa(placeMode: "AT_UNITS" | "ANY_CENTER", workDate: Date) {
      const tpl = await db.shiftTemplate.findFirstOrThrow({ where: { code: "S", centerId: null }, select: { id: true } });
      await db.shiftAssignment.deleteMany({ where: { userId: hoUserId } });
      await db.shiftAssignment.create({
        data: {
          userId: hoUserId,
          centerId: hoCenterId, // ca ở HỘI SỞ
          workDate,
          templateId: tpl.id,
          templateCode: "S",
          segments: [{ start: "07:45", end: "11:30", kind: "WORK", orgUnitIds: [] }],
          placeMode,
          attendanceMode: "REQUIRED",
          dayCredit: 1,
          source: "MANUAL",
        },
      });
    }

    it("ca AT_UNITS ở Hội sở, quét tại CS1 → SAI_NOI_LAM (hành vi ĐÚNG, khoá lại)", async () => {
      const now = ngay();
      const workDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      await xepCa("AT_UNITS", workDate);
      const r = await mod.recordTimeLog({
        userId: hoUserId,
        workLocationId: wlId,
        direction: "CHECK_IN",
        latitude: 16.0471,
        longitude: 108.2062,
        now,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.flags).toContain("SAI_NOI_LAM");
      // CÓ ca ⇒ KHÔNG phải "ngoài lịch". Hai cờ nói hai chuyện khác nhau.
      expect(r.flags).not.toContain("CHAM_NGOAI_LICH");
      // Log ghi NƠI QUÉT, không phải nơi trực thuộc.
      expect(r.centerId).toBe(centerId);
    });

    // ⚠️ TRẠNG THÁI BIẾT LÀ THIẾU — KHÔNG phải hành vi mong muốn.
    //
    // Ca không phải AT_UNITS thì khối kiểm nơi làm bị bỏ hẳn (`timelog.ts:135`), nên
    // người Hội sở quét ở CS1 KHÔNG nhận cờ nào, dù `StaffTimeLog.centerId` ghi CS1.
    // Sự thật "quét ở cơ sở khác nơi trực thuộc" hiện KHÔNG cờ nào diễn đạt.
    //
    // Cờ đúng cho việc đó là `KHAC_CO_SO_TRUC_THUOC` (thiết kế duyệt 08/09, chưa làm —
    // chặn bởi 11 nhân sự `centerId = NULL` trên prod). Khi làm xong, ĐỔI ca test này
    // thành khẳng định cờ mới, đừng xoá nó.
    it("ca ANY_CENTER ở Hội sở, quét tại CS1 → KHÔNG cờ nào (thiếu, chờ KHAC_CO_SO_TRUC_THUOC)", async () => {
      const now = new Date(Date.now() + 90 * 60_000);
      const workDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
      await xepCa("ANY_CENTER", workDate);
      const r = await mod.recordTimeLog({
        userId: hoUserId,
        workLocationId: wlId,
        direction: "CHECK_IN",
        latitude: 16.0471,
        longitude: 108.2062,
        now,
      });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.flags).not.toContain("SAI_NOI_LAM");
      expect(r.flags).not.toContain("CHAM_NGOAI_LICH");
      // Ghi được, và gán về NƠI QUÉT — đây là nửa đúng của cặp "nơi quét vs nơi trực thuộc".
      expect(r.centerId).toBe(centerId);
      expect(r.centerId).not.toBe(hoCenterId);
    });
  });
});
