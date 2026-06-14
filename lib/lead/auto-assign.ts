import { db } from "@/lib/db";
import { logLeadAudit } from "@/lib/audit/log";
import type { LeadStatus, Prisma, LeadAssignMode } from "@prisma/client";
import {
  pickRoundRobin,
  pickByCloseRate,
  pickCenterEvenly,
  type SaleStat,
} from "@/lib/lead/assign-strategy";

// Module CRM & Lead PHẦN 2 — chia lead tự động (cơ sở → chế độ) + khoá khi đã tương tác.

export const TERMINAL_LEAD_STATUSES: LeadStatus[] = ["ENROLLED", "LOST", "DUPLICATE"];

export type Actor = { actorId: string | null; actorName: string };

const SYSTEM_META = { system: true } as Prisma.InputJsonValue;

/**
 * Lead "đã có tương tác" của sale (gọi/nhắn/email/bàn giao hoặc ghi chú KHÔNG
 * phải hệ thống) → KHÔNG auto-chia lại.
 */
export async function hasSaleInteraction(leadId: string): Promise<boolean> {
  const n = await db.leadActivity.count({
    where: {
      leadId,
      OR: [
        { type: { in: ["CALL", "MESSAGE", "EMAIL", "HANDOVER"] } },
        { AND: [{ type: "NOTE" }, { NOT: { metadata: { path: ["system"], equals: true } } }] },
      ],
    },
  });
  return n > 0;
}

/** Chế độ chia của 1 cơ sở (mặc định ROUND_ROBIN nếu chưa cấu hình). */
export async function getCenterMode(centerId: string): Promise<LeadAssignMode> {
  const cfg = await db.leadAssignmentConfig.findUnique({
    where: { centerId },
    select: { mode: true },
  });
  return cfg?.mode ?? "ROUND_ROBIN";
}

/** Thống kê sale active trong cơ sở: tải hiện tại + chốt/đã xử lý 30 ngày gần nhất. */
export async function getSaleStats(centerId: string | null): Promise<SaleStat[]> {
  const sales = await db.user.findMany({
    where: { roles: { has: "SALES_CSM" }, isActive: true, deletedAt: null, ...(centerId ? { centerId } : {}) },
    select: { id: true },
  });
  if (sales.length === 0) return [];
  const ids = sales.map((s) => s.id);

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [openCounts, handledGroups] = await Promise.all([
    db.lead.groupBy({
      by: ["assignedToId"],
      where: { assignedToId: { in: ids }, deletedAt: null, status: { notIn: TERMINAL_LEAD_STATUSES } },
      _count: { id: true },
    }),
    db.lead.groupBy({
      by: ["assignedToId", "status"],
      where: {
        assignedToId: { in: ids },
        deletedAt: null,
        status: { in: ["ENROLLED", "LOST"] },
        updatedAt: { gte: since },
      },
      _count: { id: true },
    }),
  ]);

  const openMap = new Map(openCounts.map((c) => [c.assignedToId, c._count.id]));
  const closedMap = new Map<string, number>();
  const handledMap = new Map<string, number>();
  for (const g of handledGroups) {
    if (!g.assignedToId) continue;
    handledMap.set(g.assignedToId, (handledMap.get(g.assignedToId) ?? 0) + g._count.id);
    if (g.status === "ENROLLED") {
      closedMap.set(g.assignedToId, (closedMap.get(g.assignedToId) ?? 0) + g._count.id);
    }
  }

  return sales.map((s) => ({
    id: s.id,
    openCount: openMap.get(s.id) ?? 0,
    closed: closedMap.get(s.id) ?? 0,
    handled: handledMap.get(s.id) ?? 0,
  }));
}

/** Tải lead mở theo cơ sở (cho chia đều giữa các cơ sở vận hành). */
async function getCenterLoads(centerIds: string[]) {
  const counts = await db.lead.groupBy({
    by: ["centerId"],
    where: { centerId: { in: centerIds }, deletedAt: null, status: { notIn: TERMINAL_LEAD_STATUSES } },
    _count: { id: true },
  });
  const map = new Map(counts.map((c) => [c.centerId, c._count.id]));
  return centerIds.map((id) => ({ centerId: id, openCount: map.get(id) ?? 0 }));
}

export type AutoAssignResult = {
  ok: boolean;
  skipped?: boolean;
  assignedToId?: string | null;
  centerId?: string | null;
  mode?: LeadAssignMode;
  error?: string;
};

/**
 * Chia 1 lead MỚI: (1) định cơ sở (lead có cơ sở → giữ; chưa có → chia đều
 * giữa các cơ sở vận hành đang hoạt động); (2) trong cơ sở theo chế độ. Bỏ qua nếu lead đã được gán hoặc đã có
 * tương tác (khoá auto).
 */
export async function autoAssignNewLead(leadId: string, actor: Actor): Promise<AutoAssignResult> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, centerId: true, status: true, assignedToId: true },
  });
  if (!lead) return { ok: false, error: "Lead không tồn tại" };
  if (lead.assignedToId) return { ok: true, skipped: true, assignedToId: lead.assignedToId };
  if (await hasSaleInteraction(leadId)) return { ok: true, skipped: true };

  // (1) Cơ sở — chia đều cho MỌI cơ sở vận hành đang hoạt động (CS3/CS4 thêm
  // không cần sửa code). HO không có row Center nên tự loại khỏi phân phối lead.
  let centerId = lead.centerId;
  if (!centerId) {
    const cs = await db.center.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    if (cs.length > 0) {
      const loads = await getCenterLoads(cs.map((c) => c.id));
      centerId = pickCenterEvenly(loads);
      if (centerId) await db.lead.update({ where: { id: leadId }, data: { centerId } });
    }
  }

  // (2) Chế độ trong cơ sở.
  const mode = centerId ? await getCenterMode(centerId) : "ROUND_ROBIN";
  if (mode === "MANUAL") {
    return { ok: true, assignedToId: null, centerId, mode }; // chờ quản lý gán tay
  }

  let stats = await getSaleStats(centerId);
  if (stats.length === 0 && centerId) stats = await getSaleStats(null); // fallback toàn hệ thống
  const target = mode === "CLOSE_RATE" ? pickByCloseRate(stats) : pickRoundRobin(stats);
  if (!target) return { ok: true, assignedToId: null, centerId, mode }; // không có sale → để trống

  const targetUser = await db.user.findUnique({ where: { id: target }, select: { name: true } });
  await db.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: {
        assignedToId: target,
        ...(lead.status === "NEW" ? { status: "ASSIGNED" as LeadStatus } : {}),
      },
    });
    await logLeadAudit({
      leadId,
      action: "ASSIGN",
      actorId: actor.actorId,
      actorName: actor.actorName,
      oldValues: { assignedToId: null },
      newValues: { assignedToId: target },
      changedFields: ["assignedToId"],
      tx,
    });
    await tx.leadActivity.create({
      data: {
        leadId,
        actorId: actor.actorId,
        actorName: actor.actorName,
        type: "NOTE",
        content: `Tự động chia cho ${targetUser?.name ?? target} (${mode === "CLOSE_RATE" ? "tỷ lệ chốt" : "luân phiên"})`,
        metadata: SYSTEM_META,
      },
    });
  });

  return { ok: true, assignedToId: target, centerId, mode };
}

/**
 * Chuyển lead sang cơ sở mới → chia theo CHẾ ĐỘ cơ sở mới (PHẦN 3). KHÔNG bị
 * khoá tương tác (đây là chuyển có chủ đích). Trả về sale được chọn (hoặc null
 * nếu MANUAL / không có sale).
 */
export async function reassignForCenter(
  centerId: string,
  excludeSaleId?: string | null,
): Promise<string | null> {
  const mode = await getCenterMode(centerId);
  if (mode === "MANUAL") return null;
  let stats = (await getSaleStats(centerId)).filter((s) => s.id !== excludeSaleId);
  if (stats.length === 0) stats = (await getSaleStats(null)).filter((s) => s.id !== excludeSaleId);
  return mode === "CLOSE_RATE" ? pickByCloseRate(stats) : pickRoundRobin(stats);
}

/** Quản lý gán tay 1 lead cho 1 sale cụ thể. */
export async function manualAssignLead(
  leadId: string,
  saleId: string,
  actor: Actor,
): Promise<{ ok: boolean; error?: string }> {
  const [lead, sale] = await Promise.all([
    db.lead.findUnique({ where: { id: leadId }, select: { id: true, assignedToId: true, status: true } }),
    db.user.findFirst({ where: { id: saleId, roles: { has: "SALES_CSM" }, deletedAt: null }, select: { id: true, name: true } }),
  ]);
  if (!lead) return { ok: false, error: "Lead không tồn tại" };
  if (!sale) return { ok: false, error: "Sale không hợp lệ" };

  await db.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: {
        assignedToId: saleId,
        ...(lead.status === "NEW" ? { status: "ASSIGNED" as LeadStatus } : {}),
      },
    });
    await logLeadAudit({
      leadId,
      action: "ASSIGN",
      actorId: actor.actorId,
      actorName: actor.actorName,
      oldValues: { assignedToId: lead.assignedToId },
      newValues: { assignedToId: saleId },
      changedFields: ["assignedToId"],
      tx,
    });
    await tx.leadActivity.create({
      data: {
        leadId,
        actorId: actor.actorId,
        actorName: actor.actorName,
        type: "NOTE",
        content: `Gán tay cho ${sale.name ?? saleId}`,
        metadata: SYSTEM_META,
      },
    });
  });

  return { ok: true };
}
