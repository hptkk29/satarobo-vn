// lib/cham-cong/generate-db.ts — Sinh lưới tháng từ khung ca tuần: đọc pattern + ô hiện có,
// lập kế hoạch (generate.ts, thuần), ghi ShiftAssignment, xếp hàng tính lại. Không "use server".
import type { Prisma, PrismaClient } from "@prisma/client";
import type { PlaceToken, ShiftSegment } from "./catalog";
import { planMonthFromPatterns, warnNoWeeklyRest, type ExistingCell, type PatternRow } from "./generate";
import { resolvePlace, type CenterMap } from "./place";
import { markAttendanceDaysDirtyMany } from "./recompute";

export type GenerateDb = Pick<PrismaClient, "shiftTemplate" | "shiftWeeklyPattern" | "shiftAssignment">;

export type GenerateResult = {
  created: number;
  replaced: number;
  kept: number;
  cleared: number;
  skippedProtected: number;
  skippedNoPermission: number;
  unknownCode: number;
  people: number;
  restWarnings: { userId: string; from: string; to: string }[];
  warnings: string[];
};

function unitOfCenter(centerId: string, map: CenterMap): string {
  if (centerId === map.hoCenterId) return "HO";
  return Object.entries(map.byCode).find(([, c]) => c.centerId === centerId)?.[0] ?? "HO";
}

export async function generateMonthAssignments(opts: {
  db: GenerateDb;
  periodKey: string; // "YYYY-MM"
  centerMap: CenterMap;
  /** Chỉ sinh cho người có pattern ở các khối này (centerId); rỗng = mọi khối có quyền. */
  centerIds?: string[];
  canWriteCenter: (centerId: string) => boolean;
  actorUserId: string;
  onlyUserIds?: string[];
}): Promise<GenerateResult> {
  const m = /^(\d{4})-(\d{2})$/.exec(opts.periodKey);
  if (!m) throw new Error(`periodKey không hợp lệ: ${opts.periodKey}`);
  const year = Number(m[1]);
  const month1 = Number(m[2]);
  const from = new Date(Date.UTC(year, month1 - 1, 1));
  const to = new Date(Date.UTC(year, month1, 0));

  const patternsRaw = await opts.db.shiftWeeklyPattern.findMany({
    where: {
      ...(opts.centerIds?.length ? { centerId: { in: opts.centerIds } } : {}),
      ...(opts.onlyUserIds?.length ? { userId: { in: opts.onlyUserIds } } : {}),
    },
    select: { userId: true, centerId: true, weekday: true, templateCode: true, effectiveFrom: true, effectiveTo: true },
  });
  const patterns: PatternRow[] = patternsRaw.map((p) => ({
    userId: p.userId,
    unit: unitOfCenter(p.centerId, opts.centerMap),
    weekday: p.weekday,
    templateCode: p.templateCode,
    effectiveFrom: p.effectiveFrom,
    effectiveTo: p.effectiveTo,
  }));
  const userIds = [...new Set(patterns.map((p) => p.userId))];
  const existingRaw = await opts.db.shiftAssignment.findMany({
    where: { userId: { in: userIds }, workDate: { gte: from, lte: to }, status: "ACTIVE" },
    select: { id: true, userId: true, workDate: true, templateCode: true, centerId: true, source: true },
  });
  const existing: ExistingCell[] = existingRaw.map((e) => ({
    userId: e.userId,
    workDate: e.workDate,
    templateCode: e.templateCode,
    centerUnit: unitOfCenter(e.centerId, opts.centerMap),
    source: e.source,
  }));
  const existingId = new Map(existingRaw.map((e) => [`${e.userId}|${e.workDate.toISOString().slice(0, 10)}`, e]));

  const templates = await opts.db.shiftTemplate.findMany({
    where: { isActive: true, centerId: null },
    select: { id: true, code: true, segments: true, defaultPlace: true, attendanceMode: true, dayCredit: true, isLeave: true, nominalMinutes: true },
  });
  const tpl = new Map(templates.map((t) => [t.code, t]));

  const plan = planMonthFromPatterns({ year, month1, patterns, existing, onlyUserIds: opts.onlyUserIds });
  const result: GenerateResult = { created: 0, replaced: 0, kept: 0, cleared: 0, skippedProtected: 0, skippedNoPermission: 0, unknownCode: 0, people: userIds.length, restWarnings: [], warnings: [] };
  const changed: { userId: string; workDate: Date }[] = [];

  for (const cell of plan) {
    const key = `${cell.userId}|${cell.workDate.toISOString().slice(0, 10)}`;
    const ex = existingId.get(key);
    if (cell.action === "SKIP_PROTECTED") {
      result.skippedProtected += 1;
      continue;
    }
    if (cell.action === "KEEP") {
      result.kept += 1;
      continue;
    }
    if (cell.action === "CLEAR") {
      if (ex && opts.canWriteCenter(ex.centerId)) {
        await opts.db.shiftAssignment.updateMany({ where: { id: ex.id }, data: { status: "CANCELLED" } });
        result.cleared += 1;
        changed.push({ userId: cell.userId, workDate: cell.workDate });
      } else if (ex) result.skippedNoPermission += 1;
      continue;
    }
    const t = tpl.get(cell.code);
    if (!t) {
      result.unknownCode += 1;
      result.warnings.push(`Mã "${cell.code}" không có trong danh mục (người ${cell.userId}, ${key.split("|")[1]})`);
      continue;
    }
    const place = resolvePlace({ segments: (t.segments as ShiftSegment[] | null) ?? [], defaultPlace: t.defaultPlace as PlaceToken, homeUnit: cell.unit || "HO", map: opts.centerMap });
    if (!opts.canWriteCenter(place.centerId)) {
      result.skippedNoPermission += 1;
      continue;
    }
    if (ex) {
      if (!opts.canWriteCenter(ex.centerId)) {
        result.skippedNoPermission += 1;
        continue;
      }
      await opts.db.shiftAssignment.updateMany({ where: { id: ex.id }, data: { status: "CANCELLED" } });
    }
    const orgUnitId = place.centerId === opts.centerMap.hoCenterId ? null : (Object.values(opts.centerMap.byCode).find((c) => c.centerId === place.centerId)?.orgUnitId ?? null);
    await opts.db.shiftAssignment.create({
      data: {
        userId: cell.userId,
        centerId: place.centerId,
        orgUnitId,
        workDate: cell.workDate,
        templateId: t.id,
        templateCode: t.code,
        segments: place.segments as unknown as Prisma.InputJsonValue,
        placeMode: place.placeMode,
        allowedOrgUnitIds: place.allowedOrgUnitIds,
        attendanceMode: t.attendanceMode,
        dayCredit: t.dayCredit,
        isLeave: t.isLeave,
        nominalMinutes: t.nominalMinutes,
        sourceCells: cell.sourceCells as Prisma.InputJsonValue,
        source: "PATTERN",
        createdById: opts.actorUserId,
      },
    });
    if (ex) result.replaced += 1;
    else result.created += 1;
    changed.push({ userId: cell.userId, workDate: cell.workDate });
  }
  result.restWarnings = warnNoWeeklyRest(plan);
  await markAttendanceDaysDirtyMany(changed, { reason: "generate" });
  return result;
}
