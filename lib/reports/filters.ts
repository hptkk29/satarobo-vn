import "server-only";
import { db } from "@/lib/db";
import { getTeachingCenterIds } from "@/lib/org/org-service";
import type { Actor } from "@/lib/auth/actor";

// Bộ lọc dùng chung cho /bao-cao/* — cơ sở (IDOR-safe theo tầm nhìn actor) + khoảng
// ngày. Center KHÔNG scoped (Center=db.center) nên tự lọc theo visibleCenterIds.

export type ReportFilters = {
  /** null = toàn bộ cơ sở trong tầm nhìn. */
  centerId: string | null;
  /** null = không giới hạn. */
  dateFrom: Date | null;
  /** null = không giới hạn; đã set cuối ngày. */
  dateTo: Date | null;
};

export type ReportFilterContext = {
  filters: ReportFilters;
  visibleCenters: { id: string; name: string }[];
  /** "ALL" hoặc centerId đã chọn (cho <select> + cache key). */
  selection: string;
  isGlobalAllowed: boolean;
  /** Giá trị cho <input type=date> (YYYY-MM-DD hoặc ""). */
  dateFromStr: string;
  dateToStr: string;
};

export type ReportFilterSearchParams = {
  center?: string;
  dateFrom?: string;
  dateTo?: string;
};

function parseDateStart(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
function parseDateEnd(s: string | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Giải bộ lọc từ searchParams: danh sách cơ sở CHỌN ĐƯỢC (chỉ cơ sở vận hành trong tầm
 * nhìn actor — loại HO/mồ côi), center đã chọn (chống IDOR qua URL), khoảng ngày.
 */
export async function resolveReportFilters(
  actor: Actor,
  sp: ReportFilterSearchParams,
): Promise<ReportFilterContext> {
  const isGlobalAllowed = actor.isSuperAdmin || actor.isHoLevel;
  const teachingIds = new Set(await getTeachingCenterIds());
  const allCenters = (
    await db.center.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    })
  ).filter((c) => teachingIds.has(c.id));
  const visibleCenters = isGlobalAllowed
    ? allCenters
    : allCenters.filter((c) => actor.visibleCenterIds.includes(c.id));

  const requested = sp.center;
  const defaultSelection = isGlobalAllowed ? "ALL" : (visibleCenters[0]?.id ?? "ALL");
  let selection = defaultSelection;
  if (requested === "ALL" && isGlobalAllowed) selection = "ALL";
  else if (requested && visibleCenters.some((c) => c.id === requested)) selection = requested;

  const centerId = selection === "ALL" ? null : selection;
  const dateFrom = parseDateStart(sp.dateFrom);
  const dateTo = parseDateEnd(sp.dateTo);

  return {
    filters: { centerId, dateFrom, dateTo },
    visibleCenters,
    selection,
    isGlobalAllowed,
    dateFromStr: sp.dateFrom ?? "",
    dateToStr: sp.dateTo ?? "",
  };
}

/** Khoá cache theo bộ lọc (kèm sau actorScopeKey). */
export function reportFilterCacheKey(f: ReportFilters): string {
  return `${f.centerId ?? "ALL"}|${f.dateFrom?.toISOString() ?? ""}|${f.dateTo?.toISOString() ?? ""}`;
}

/** Điều kiện Prisma DateTime từ dateFrom/dateTo (undefined nếu không lọc). */
export function reportDateWhere(
  f: ReportFilters,
): { gte?: Date; lte?: Date } | undefined {
  if (!f.dateFrom && !f.dateTo) return undefined;
  return {
    ...(f.dateFrom ? { gte: f.dateFrom } : {}),
    ...(f.dateTo ? { lte: f.dateTo } : {}),
  };
}
