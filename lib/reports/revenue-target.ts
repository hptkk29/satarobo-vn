import "server-only";
import { db } from "@/lib/db";
import type { RevenueTargetRow } from "@/lib/reports/lms-extra";

// LMS-16 — lưu/đọc mục tiêu doanh thu (KPI). Dùng với computeRevenueVsTarget.

export async function getRevenueTargets(
  centerId: string | null,
  periods?: string[],
): Promise<RevenueTargetRow[]> {
  const rows = await db.revenueTarget.findMany({
    where: {
      centerId: centerId ?? null,
      ...(periods && periods.length ? { period: { in: periods } } : {}),
    },
    select: { period: true, amount: true },
    orderBy: { period: "asc" },
  });
  return rows.map((r) => ({ period: r.period, target: r.amount }));
}

export async function setRevenueTarget(input: {
  centerId: string | null;
  period: string; // "YYYY-MM"
  amount: number;
  note?: string | null;
}): Promise<void> {
  const amount = Math.max(0, Math.round(input.amount));
  // Prisma không upsert được trên compound-unique có cột null (centerId) → tự tìm rồi ghi.
  const existing = await db.revenueTarget.findFirst({
    where: { centerId: input.centerId ?? null, period: input.period },
    select: { id: true },
  });
  if (existing) {
    await db.revenueTarget.update({
      where: { id: existing.id },
      data: { amount, note: input.note ?? null },
    });
  } else {
    await db.revenueTarget.create({
      data: { centerId: input.centerId ?? null, period: input.period, amount, note: input.note ?? null },
    });
  }
}
