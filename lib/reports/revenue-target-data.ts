// lib/reports/revenue-target-data.ts — #10 (Dashboard đa vai trò, câu 16).
// Nạp RevenueTarget theo tầm nhìn cơ sở của actor. TÁCH khỏi revenue-target.ts (thuần,
// test không cần DB) vì hàm này CHẠM DB. Ghép với buildRevenueTargetReport (thuần) ở page.
import { db } from "@/lib/db";
import { getModelVisibleCenterIds } from "@/lib/db-scope";
import type { Actor } from "@/lib/auth/actor";
import type { RevenueTargetRow } from "@/lib/reports/revenue-target";

/**
 * Mục tiêu doanh thu (RevenueTarget) trong phạm vi của actor.
 * RevenueTarget ∈ SCOPE_EXEMPT (config KPI, centerId null = toàn hệ thống) → scopedDb
 * KHÔNG auto-scope; phải scope TAY — ĐỒNG BỘ với scope per-model của Payment (doanh thu
 * THỰC trên dashboard cũng scope theo Payment) để actual vs target cùng phạm vi.
 * Vá 24/07: trước đây `isHoLevel → centerId null` nên actor kiểu Toại (TRAINING@HO +
 * CM@CS1) thấy mục tiêu TOÀN CÔNG TY trong khi actual chỉ CS1.
 *  - scope Payment = "ALL" (SUPER_ADMIN / role HO có payments:* toàn hệ) → mục tiêu
 *    TOÀN HỆ THỐNG (centerId = null) — như cũ.
 *  - scope Payment = [centerIds] → mục tiêu của đúng các cơ sở đó (cách ly cơ sở);
 *    cơ sở chưa đặt mục tiêu → không có row → báo cáo hiện "chưa đặt mục tiêu"
 *    (target null), KHÔNG fallback về mục tiêu toàn hệ thống (sai phạm vi so sánh).
 */
export async function getRevenueTargets(actor: Actor): Promise<RevenueTargetRow[]> {
  const scope = getModelVisibleCenterIds("Payment", actor);
  const where =
    scope === "ALL" ? { centerId: null } : { centerId: { in: scope } };
  const rows = await db.revenueTarget.findMany({
    where,
    select: { centerId: true, period: true, targetAmount: true },
  });
  return rows.map((t) => ({ centerId: t.centerId, period: t.period, targetAmount: t.targetAmount }));
}
