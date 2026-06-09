// lib/crm/funnel-query.ts — R1-08: đếm funnel L1→L2→L3 + spend (cho computeFunnelMetrics).
// Lọc theo centerIds (scope dashboard). revenue: tích hợp Order ở R2 — tạm 0.
import { db } from "@/lib/db";
import type { FunnelCounts } from "@/lib/crm/marketing-metrics";

export async function getFunnelCounts(opts: {
  centerIds?: string[]; // undefined = toàn hệ thống (SUPER_ADMIN/HO)
} = {}): Promise<FunnelCounts> {
  const centerFilter = opts.centerIds ? { centerId: { in: opts.centerIds } } : {};

  const [l1, l2, l3, spendAgg, revenueAgg] = await Promise.all([
    db.messengerConversation.count({ where: centerFilter }), // L1 = hội thoại
    db.lead.count({ where: { deletedAt: null, qualifiedAt: { not: null }, ...centerFilter } }), // L2
    db.lead.count({ where: { deletedAt: null, convertedAt: { not: null }, ...centerFilter } }), // L3
    db.adsInsightDaily.aggregate({ _sum: { spend: true } }),
    // Doanh thu = đơn đã chốt/hoàn tất (CONFIRMED/COMPLETED).
    db.order.aggregate({
      _sum: { totalAmount: true },
      where: { status: { in: ["CONFIRMED", "COMPLETED"] }, ...centerFilter },
    }),
  ]);

  return {
    l1,
    l2,
    l3,
    spend: spendAgg._sum.spend ?? 0,
    revenue: revenueAgg._sum.totalAmount ?? 0,
  };
}
