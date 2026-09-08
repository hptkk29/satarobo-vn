// tests/cham-cong/import.spec.ts — L1 cổng ra: "QLCS tự import Sheet T09 qua UI, 15 con số khớp".
// Test tích hợp trên Postgres LOCAL (satarobo_test); tự SKIP nếu DATABASE_URL không trỏ local.
//   pnpm exec vitest run tests/cham-cong   (nạp .env.test)
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseWorkbook, countCodes } from "../../lib/cham-cong/sheet-parse";
import { applyImport, buildImportPreview, type ImportMapping } from "../../lib/cham-cong/import-core";
import { seedShiftTemplates } from "../../lib/cham-cong/seed-core";
import type { CenterMap } from "../../lib/cham-cong/place";

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? "";
const isLocal = /(@|\/\/)(localhost|127\.0\.0\.1)[:/]/.test(DB_URL) && /satarobo_test|ci_test/.test(DB_URL);
const d = isLocal ? describe : describe.skip;
if (!isLocal) console.warn(`[cham-cong/import] SKIP: DATABASE_URL không trỏ Postgres local satarobo_test`);

const FIXTURE = path.join(process.cwd(), "tests/fixtures/cham-cong/lich-phan-ca-2026-08-29.xlsx");
const TAG = "cc-import";

d("applyImport — lưới T09/2026 từ Sheet thật", () => {
  const db = new PrismaClient({ datasourceUrl: DB_URL });
  const parsed = parseWorkbook(readFileSync(FIXTURE));
  const t9 = parsed.months.find((m) => m.periodKey === "2026-09")!;
  const names = [...new Set([...parsed.khungCa.map((r) => r.displayName), ...t9.rows.map((r) => r.name)])];
  const mapping: ImportMapping = {};
  let centerMap: CenterMap;
  const userIds: string[] = [];

  beforeAll(async () => {
    // Dọn dấu vết lần trước (không TRUNCATE cả DB — bộ khác có thể đang dùng).
    const oldUsers = await db.user.findMany({ where: { email: { endsWith: `@${TAG}.test` } }, select: { id: true } });
    const ids = oldUsers.map((u) => u.id);
    await db.shiftAssignment.deleteMany({ where: { userId: { in: ids } } });
    await db.shiftWeeklyPattern.deleteMany({ where: { userId: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: ids } } });
    await seedShiftTemplates(db);
    const cs1 = await db.center.upsert({
      where: { slug: `${TAG}-cs1` },
      update: {},
      create: { slug: `${TAG}-cs1`, name: "CS1 test import", address: "x", code: `${TAG}-CS1` },
      select: { id: true },
    });
    const cs2 = await db.center.upsert({
      where: { slug: `${TAG}-cs2` },
      update: {},
      create: { slug: `${TAG}-cs2`, name: "CS2 test import", address: "x", code: `${TAG}-CS2` },
      select: { id: true },
    });
    const ho = await db.center.upsert({
      where: { slug: `${TAG}-ho` },
      update: {},
      create: { slug: `${TAG}-ho`, name: "HO test import", address: "x", code: `${TAG}-HO` },
      select: { id: true },
    });
    centerMap = { byCode: { CS1: { centerId: cs1.id, orgUnitId: null }, CS2: { centerId: cs2.id, orgUnitId: null } }, hoCenterId: ho.id };
    for (const [i, n] of names.entries()) {
      const u = await db.user.create({
        data: { email: `nv${i}@${TAG}.test`, name: n, role: "TEACHER", roles: ["TEACHER"], password: "x" },
        select: { id: true },
      });
      mapping[n] = u.id;
      userIds.push(u.id);
    }
  });

  afterAll(async () => {
    await db.shiftAssignment.deleteMany({ where: { userId: { in: userIds } } });
    await db.shiftWeeklyPattern.deleteMany({ where: { userId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  });

  it("preview: 19 người (Mr Phúc 2 dòng gộp 1), gợi ý theo tên, không mã lạ", async () => {
    const candidates = names.map((n, i) => ({ userId: mapping[n], employeeId: null, fullName: n, userName: n, phone: null, centerCode: i % 2 ? "CS1" : "CS2" }));
    const p = await buildImportPreview(parsed, { db, candidates });
    expect(p.people).toHaveLength(19);
    expect(p.unknownCodes).toEqual([]);
    expect(p.people.find((x) => x.displayName === "Mr Phúc")!.units).toEqual(["CS1", "CS2"]);
    expect(p.people.find((x) => x.displayName === "Thầy Khôi")!.suggestions[0]?.userId).toBe(mapping["Thầy Khôi"]);
  });

  it("áp T09: 15 con số DB = Sheet, tổng ô = 620, D2 gộp vào ca thật ở CS2", async () => {
    const r = await applyImport(parsed, { db, mapping, periodKeys: ["2026-09"], centerMap, canWriteCenter: () => true, actorUserId: userIds[0] });
    expect(r.warnings).toEqual([]);
    expect(r.assignments.skippedNoMapping).toBe(0);
    expect(r.assignments.unknownCode).toBe(0);
    const expected = countCodes(t9);
    const c = r.counts.find((x) => x.periodKey === "2026-09")!;
    expect(c.sheet).toEqual(expected);
    expect(c.db).toEqual(expected);
    // Khung ca: 20 dòng × 7 thứ = 140 ô, trong đó "—"/trống bị xoá thay vì tạo
    expect(r.patterns.skippedNoMapping).toBe(0);
    const patternRows = await db.shiftWeeklyPattern.count({ where: { userId: { in: userIds } } });
    const nonEmpty = parsed.khungCa.reduce((s, row) => s + Object.values(row.byWeekday).filter(Boolean).length, 0);
    expect(patternRows).toBe(nonEmpty);
    // Mr Phúc 3/9: CS1 = D2, CS2 = CG ⇒ một dòng ACTIVE templateCode CG, centerId CS2, sourceCells giữ 2 ô
    const phuc = await db.shiftAssignment.findFirst({
      where: { userId: mapping["Mr Phúc"], workDate: new Date(Date.UTC(2026, 8, 3)), status: "ACTIVE" },
    });
    expect(phuc).toMatchObject({ templateCode: "CG", centerId: centerMap.byCode.CS2.centerId, source: "IMPORT", placeMode: "AT_UNITS" });
    expect(phuc!.sourceCells).toEqual({ CS1: "D2", CS2: "CG" });
    // Ms Huệ (HO) 7/9 = LD ⇒ centerId hoi-so, ANYWHERE, 1 công
    const hue = await db.shiftAssignment.findFirst({ where: { userId: mapping["Ms Huệ"], workDate: new Date(Date.UTC(2026, 8, 7)), status: "ACTIVE" } });
    expect(hue).toMatchObject({ templateCode: "LD", centerId: centerMap.hoCenterId, placeMode: "ANYWHERE", dayCredit: 1 });
    // Mỗi người mỗi ngày đúng 1 ACTIVE
    const active = await db.shiftAssignment.groupBy({ by: ["userId", "workDate"], where: { userId: { in: userIds }, status: "ACTIVE" }, _count: { _all: true } });
    expect(active.every((g) => g._count._all === 1)).toBe(true);
  });

  it("import lại y hệt → không tạo mới, không huỷ (idempotent); ca MANUAL được giữ", async () => {
    const manualUser = mapping["Thầy Khôi"];
    const day = new Date(Date.UTC(2026, 8, 11)); // 11/9: Thầy Khôi có ca T (10/9 trống)
    await db.shiftAssignment.updateMany({ where: { userId: manualUser, workDate: day, status: "ACTIVE" }, data: { source: "MANUAL", templateCode: "SCT" } });
    const r = await applyImport(parsed, { db, mapping, periodKeys: ["2026-09"], centerMap, canWriteCenter: () => true, actorUserId: userIds[0], importKhungCa: false });
    expect(r.assignments.created).toBe(0);
    expect(r.assignments.cancelled).toBe(0);
    expect(r.assignments.keptManual).toBe(1);
    const kept = await db.shiftAssignment.findFirst({ where: { userId: manualUser, workDate: day, status: "ACTIVE" } });
    expect(kept?.templateCode).toBe("SCT");
  });

  it("QLCS chỉ có quyền CS1 → hàng CS2 và HO bị bỏ qua, đếm riêng, không im lặng", async () => {
    const cs1 = centerMap.byCode.CS1.centerId;
    const r = await applyImport(parsed, { db, mapping, periodKeys: ["2026-10"], centerMap, canWriteCenter: (c) => c === cs1, actorUserId: userIds[0], importKhungCa: false });
    expect(r.assignments.skippedNoPermission).toBeGreaterThan(0);
    const t10 = parsed.months.find((m) => m.periodKey === "2026-10")!;
    const from = new Date(Date.UTC(2026, 9, 1));
    const to = new Date(Date.UTC(2026, 9, t10.daysInMonth));
    const rows = await db.shiftAssignment.findMany({ where: { userId: { in: userIds }, workDate: { gte: from, lte: to }, status: "ACTIVE" }, select: { centerId: true } });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((x) => x.centerId === cs1)).toBe(true);
  });
});
