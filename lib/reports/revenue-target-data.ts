// lib/reports/revenue-target-data.ts — #10 (Dashboard đa vai trò, câu 16).
// Nạp RevenueTarget theo tầm nhìn cơ sở của actor. TÁCH khỏi revenue-target.ts (thuần,
// test không cần DB) vì hàm này CHẠM DB. Ghép với buildRevenueTargetReport (thuần) ở page.
import { db } from "@/lib/db";
import type { Actor } from "@/lib/auth/actor";
import type { RevenueTargetRow } from "@/lib/reports/revenue-target";

/**
 * Mục tiêu doanh thu (RevenueTarget) trong phạm vi của actor.
 * RevenueTarget ∈ SCOPE_EXEMPT (config KPI, centerId null = toàn hệ thống) → scopedDb
 * KHÔNG auto-scope; phải scope TAY:
 *  - HO/SUPER (cross-center theo chức năng) → mục tiêu TOÀN HỆ THỐNG (centerId = null).
 *  - center-level → mục tiêu các cơ sở trong `visibleCenterIds` (cách ly cơ sở).
 */
export async function getRevenueTargets(actor: Actor): Promise<RevenueTargetRow[]> {
  const where =
    actor.isSuperAdmin || actor.isHoLevel
      ? { centerId: null }
      : { centerId: { in: actor.visibleCenterIds } };
  const rows = await db.revenueTarget.findMany({
    where,
    select: { centerId: true, period: true, targetAmount: true },
  });
  return rows.map((t) => ({ centerId: t.centerId, period: t.period, targetAmount: t.targetAmount }));
}
