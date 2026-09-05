// lib/cham-cong/seed-core.ts — logic seed nền (dùng chung cho prisma/seed-cham-cong.ts và test).
import type { PrismaClient } from "@prisma/client";
import { LEAVE_TYPE_CATALOG, SHIFT_CATALOG } from "./catalog";

type Db = Pick<PrismaClient, "shiftTemplate" | "leaveType" | "center" | "workLocation">;

export async function seedShiftTemplates(db: Db, opts: { force?: boolean } = {}): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const e of SHIFT_CATALOG) {
    const existing = await db.shiftTemplate.findFirst({ where: { code: e.code, centerId: null }, select: { id: true } });
    const data = {
      name: e.name,
      kind: e.kind,
      segments: e.segments,
      defaultPlace: e.defaultPlace,
      attendanceMode: e.attendanceMode,
      dayCredit: e.dayCredit,
      isLeave: e.isLeave,
      nominalMinutes: e.nominalMinutes,
      payMode: e.payMode,
      amStart: e.amStart ?? null,
      amEnd: e.amEnd ?? null,
      pmStart: e.pmStart ?? null,
      pmEnd: e.pmEnd ?? null,
      pmBreakStart: e.pmBreakStart ?? null,
      pmBreakEnd: e.pmBreakEnd ?? null,
      note: e.note ?? null,
      displayOrder: e.displayOrder,
    };
    if (!existing) {
      await db.shiftTemplate.create({ data: { code: e.code, centerId: null, ...data } });
      created += 1;
    } else if (opts.force) {
      await db.shiftTemplate.update({ where: { id: existing.id }, data });
      updated += 1;
    }
  }
  return { created, updated };
}

export async function seedLeaveTypes(db: Db, opts: { force?: boolean } = {}): Promise<number> {
  let n = 0;
  for (const [i, l] of LEAVE_TYPE_CATALOG.entries()) {
    const existing = await db.leaveType.findUnique({ where: { code: l.code }, select: { id: true } });
    if (existing && !opts.force) continue;
    await db.leaveType.upsert({
      where: { code: l.code },
      create: { ...l, displayOrder: i + 1 },
      update: { ...l, displayOrder: i + 1 },
    });
    n += 1;
  }
  return n;
}

/** 1 WorkLocation cho mỗi Center vận hành (code CS1/CS2…), KHÔNG tạo cho Hội sở (Q-04). */
export async function seedWorkLocations(db: Db): Promise<number> {
  const centers = await db.center.findMany({
    where: { isActive: true, code: { not: null } },
    select: { id: true, code: true, name: true, latitude: true, longitude: true, allowedRadiusMeters: true },
  });
  let n = 0;
  for (const c of centers) {
    const code = c.code as string;
    if (code === "HO") continue;
    const existing = await db.workLocation.findUnique({ where: { code }, select: { id: true } });
    if (existing) continue;
    await db.workLocation.create({
      data: {
        code,
        name: c.name,
        centerId: c.id,
        latitude: c.latitude,
        longitude: c.longitude,
        radiusMeters: c.allowedRadiusMeters ?? 100,
        geofenceEnabled: false,
      },
    });
    n += 1;
  }
  return n;
}
