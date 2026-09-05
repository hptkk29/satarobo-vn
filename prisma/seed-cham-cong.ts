// prisma/seed-cham-cong.ts — SEED NỀN module chấm công v3 (chạy 1 lần, idempotent).
//
//   pnpm db:seed:cham-cong          # upsert 21 mã ca + 8 loại nghỉ + WorkLocation cho CS1/CS2
//
// Sau lần này, nguồn sự thật là DB và người vận hành sửa trên màn danh mục (PHẦN 6b):
// upsert KHÔNG đè các cột người dùng đã sửa (chỉ tạo mới khi thiếu; cập nhật tên/segments
// chỉ khi `--force`). WorkLocation: 1 dòng cho mỗi Center có `code` CS1/CS2 — KHÔNG tạo cho
// Hội sở (HO chấm ở cơ sở nào cũng được, Q-04). Toạ độ để trống → geofence tắt (Q-02).
//
// Chạy trên PROD qua workflow GitHub (máy dev không có chuỗi kết nối prod).
import { PrismaClient } from "@prisma/client";
import { LEAVE_TYPE_CATALOG, SHIFT_CATALOG } from "../lib/cham-cong/catalog";

const force = process.argv.includes("--force");
const db = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL });

async function seedTemplates(): Promise<{ created: number; updated: number }> {
  let created = 0;
  let updated = 0;
  for (const e of SHIFT_CATALOG) {
    const existing = await db.shiftTemplate.findFirst({ where: { code: e.code, centerId: null } });
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
    } else if (force) {
      await db.shiftTemplate.update({ where: { id: existing.id }, data });
      updated += 1;
    }
  }
  return { created, updated };
}

async function seedLeaveTypes(): Promise<number> {
  let n = 0;
  for (const [i, l] of LEAVE_TYPE_CATALOG.entries()) {
    const existing = await db.leaveType.findUnique({ where: { code: l.code } });
    if (existing && !force) continue;
    await db.leaveType.upsert({
      where: { code: l.code },
      create: { ...l, displayOrder: i + 1 },
      update: { ...l, displayOrder: i + 1 },
    });
    n += 1;
  }
  return n;
}

async function seedWorkLocations(): Promise<number> {
  const centers = await db.center.findMany({
    where: { code: { in: ["CS1", "CS2"] }, isActive: true },
    select: { id: true, code: true, name: true, latitude: true, longitude: true, allowedRadiusMeters: true },
  });
  let n = 0;
  for (const c of centers) {
    const code = c.code as string;
    const existing = await db.workLocation.findUnique({ where: { code } });
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

async function main() {
  const t = await seedTemplates();
  const l = await seedLeaveTypes();
  const w = await seedWorkLocations();
  console.log(
    `[seed-cham-cong] ShiftTemplate: +${t.created} tạo, ${t.updated} cập nhật${force ? " (--force)" : ""} · LeaveType: ${l} · WorkLocation: +${w}`,
  );
}

main()
  .catch((e) => {
    console.error("[seed-cham-cong] lỗi:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
