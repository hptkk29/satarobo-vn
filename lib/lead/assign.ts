import { db } from "@/lib/db";
import { logLeadAudit } from "@/lib/audit/log";
import type { LeadStatus, Prisma } from "@prisma/client";

// =============================================================================
// LEAD AUTO-ASSIGN — round-robin theo cơ sở (Phase T1.3)
// =============================================================================

// Lead "đang mở" = chưa kết thúc → tính tải cho round-robin.
export const TERMINAL_LEAD_STATUSES: LeadStatus[] = [
  "ENROLLED",
  "LOST",
  "DUPLICATE",
];

export type AssigneeLoad = { id: string; openCount: number };
export type Actor = { actorId: string | null; actorName: string };

// ─── Pure functions (test được, không chạm DB) ───────────────────────────────

/** Chọn sale ít lead mở nhất; tie-break theo id để ổn định. */
export function pickAssignee(candidates: AssigneeLoad[]): string | null {
  if (candidates.length === 0) return null;
  return [...candidates].sort(
    (a, b) => a.openCount - b.openCount || a.id.localeCompare(b.id),
  )[0].id;
}

/**
 * Chia danh sách lead cho các sale theo round-robin, cân bằng TRÊN tải hiện có.
 * Trả về Map leadId → assigneeId.
 */
export function distributeRoundRobin(
  leadIds: string[],
  initial: AssigneeLoad[],
): Map<string, string> {
  const result = new Map<string, string>();
  if (initial.length === 0) return result;
  const load = initial.map((a) => ({ ...a }));
  for (const leadId of leadIds) {
    load.sort((a, b) => a.openCount - b.openCount || a.id.localeCompare(b.id));
    const target = load[0];
    result.set(leadId, target.id);
    target.openCount++;
  }
  return result;
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

/** Tải hiện tại của SALES_CSM active (trong cùng cơ sở nếu có centerId). */
export async function getSalesLoad(
  centerId: string | null,
): Promise<AssigneeLoad[]> {
  const sales = await db.user.findMany({
    where: {
      // Đa vai trò (3B): tính cả người có SALES_CSM ở vị trí PHỤ.
      roles: { has: "SALES_CSM" },
      isActive: true,
      deletedAt: null,
      ...(centerId ? { centerId } : {}),
    },
    select: { id: true },
  });
  if (sales.length === 0) return [];

  const counts = await db.lead.groupBy({
    by: ["assignedToId"],
    where: {
      assignedToId: { in: sales.map((s) => s.id) },
      deletedAt: null,
      status: { notIn: TERMINAL_LEAD_STATUSES },
    },
    _count: { id: true },
  });
  const loadMap = new Map(
    counts.map((c) => [c.assignedToId, c._count.id] as const),
  );
  return sales.map((s) => ({ id: s.id, openCount: loadMap.get(s.id) ?? 0 }));
}

/**
 * Tự động gán 1 lead cho SALES_CSM ít tải nhất trong cùng cơ sở.
 * Fallback toàn hệ thống nếu cơ sở không có sale. Ghi audit + activity.
 */
export async function autoAssignLead(
  leadId: string,
  actor: Actor,
): Promise<{ ok: boolean; assignedToId?: string; error?: string }> {
  const lead = await db.lead.findUnique({
    where: { id: leadId },
    select: { id: true, centerId: true, status: true, assignedToId: true },
  });
  if (!lead) return { ok: false, error: "Lead không tồn tại" };

  let load = await getSalesLoad(lead.centerId);
  if (load.length === 0 && lead.centerId) {
    load = await getSalesLoad(null); // fallback: mọi SALES_CSM
  }
  const target = pickAssignee(load);
  if (!target) return { ok: false, error: "Không có SALES_CSM active để gán" };

  const targetUser = await db.user.findUnique({
    where: { id: target },
    select: { name: true },
  });

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
      oldValues: { assignedToId: lead.assignedToId },
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
        content: `Phân công cho ${targetUser?.name ?? target} (round-robin)`,
        metadata: { assignedToId: target } as Prisma.InputJsonValue,
      },
    });
  });

  return { ok: true, assignedToId: target };
}

/**
 * Chia lại toàn bộ lead "đang mở" của 1 sale (vd khi nghỉ việc) cho các sale
 * còn lại theo round-robin. Gọi SAU khi user đã deactivate để getSalesLoad
 * không tính người này.
 */
export async function reassignOpenLeads(
  userId: string,
  actor: Actor,
): Promise<{ ok: boolean; reassigned: number; error?: string }> {
  const leaving = await db.user.findUnique({
    where: { id: userId },
    select: { centerId: true },
  });

  const openLeads = await db.lead.findMany({
    where: {
      assignedToId: userId,
      deletedAt: null,
      status: { notIn: TERMINAL_LEAD_STATUSES },
    },
    select: { id: true },
  });
  if (openLeads.length === 0) return { ok: true, reassigned: 0 };

  let load = await getSalesLoad(leaving?.centerId ?? null);
  // loại trừ chính người đang nghỉ (phòng trường hợp gọi trước khi deactivate)
  load = load.filter((l) => l.id !== userId);
  if (load.length === 0 && leaving?.centerId) {
    load = (await getSalesLoad(null)).filter((l) => l.id !== userId);
  }
  if (load.length === 0) {
    return { ok: false, reassigned: 0, error: "Không còn SALES_CSM để chia" };
  }

  const dist = distributeRoundRobin(
    openLeads.map((l) => l.id),
    load,
  );

  const nameMap = new Map(
    (
      await db.user.findMany({
        where: { id: { in: [...new Set(dist.values())] } },
        select: { id: true, name: true },
      })
    ).map((u) => [u.id, u.name] as const),
  );

  await db.$transaction(async (tx) => {
    for (const [leadId, assigneeId] of dist) {
      await tx.lead.update({
        where: { id: leadId },
        data: { assignedToId: assigneeId },
      });
      await logLeadAudit({
        leadId,
        action: "ASSIGN",
        actorId: actor.actorId,
        actorName: actor.actorName,
        oldValues: { assignedToId: userId },
        newValues: { assignedToId: assigneeId },
        changedFields: ["assignedToId"],
        tx,
      });
      await tx.leadActivity.create({
        data: {
          leadId,
          actorId: actor.actorId,
          actorName: actor.actorName,
          type: "NOTE",
          content: `Chia lại lead → ${nameMap.get(assigneeId) ?? assigneeId} (sale cũ nghỉ)`,
        },
      });
    }
  });

  return { ok: true, reassigned: openLeads.length };
}
