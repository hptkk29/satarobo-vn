import { db } from "@/lib/db";
import { logLeadAudit } from "@/lib/audit/log";
import type { Prisma } from "@prisma/client";

// =============================================================================
// Cụm C2 — Bàn giao lead hàng loạt khi sale nghỉ. KHÔNG sửa record user cũ;
// chỉ đổi assignedToId trên lead + ghi LeadAssignmentHistory + audit + chuyển task.
// =============================================================================

// Trạng thái "đã đóng" — khi lọc onlyActive thì loại các lead này.
const TERMINAL_STATUSES = ["ENROLLED", "LOST", "DUPLICATE"] as const;

export interface HandoverFilters {
  statuses?: string[]; // lọc theo LeadStatus cụ thể
  campaign?: string | null; // lọc theo utmCampaign
  onlyActive?: boolean; // chỉ lead chưa đóng
}

/** Đếm số lead sẽ bị ảnh hưởng (để preview trước khi chạy). */
export async function previewHandover(
  fromUserId: string,
  filters: HandoverFilters,
): Promise<number> {
  return db.lead.count({ where: resolveWhere(fromUserId, filters) });
}

function resolveWhere(fromUserId: string, filters: HandoverFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { assignedToId: fromUserId, deletedAt: null };
  const and: Prisma.LeadWhereInput[] = [];
  if (filters.statuses && filters.statuses.length > 0) {
    and.push({ status: { in: filters.statuses as never } });
  }
  if (filters.campaign) {
    and.push({ utmCampaign: filters.campaign });
  }
  if (filters.onlyActive) {
    and.push({ status: { notIn: [...TERMINAL_STATUSES] as never } });
  }
  if (and.length) where.AND = and;
  return where;
}

export async function bulkReassignLeads(params: {
  fromUserId: string;
  toUserId: string;
  filters: HandoverFilters;
  actorId: string | null;
  actorName: string;
  reason?: string | null;
}): Promise<{ ok: boolean; error?: string; moved: number; tasksMoved: number }> {
  if (params.fromUserId === params.toUserId) {
    return { ok: false, error: "Sale nhận trùng sale bàn giao", moved: 0, tasksMoved: 0 };
  }
  const toUser = await db.user.findFirst({
    where: { id: params.toUserId, isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!toUser) return { ok: false, error: "Sale nhận không hợp lệ", moved: 0, tasksMoved: 0 };

  const where = resolveWhere(params.fromUserId, params.filters);
  const leads = await db.lead.findMany({ where, select: { id: true } });
  if (leads.length === 0) return { ok: true, moved: 0, tasksMoved: 0 };

  let tasksMoved = 0;

  // Xử lý từng lead (history + audit cần per-record). KHÔNG đụng user cũ.
  for (const lead of leads) {
    await db.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          assignedToId: params.toUserId,
          handoverNote: params.reason ?? undefined,
        },
      });
      await tx.leadAssignmentHistory.create({
        data: {
          leadId: lead.id,
          fromUserId: params.fromUserId,
          toUserId: params.toUserId,
          assignedById: params.actorId,
          reason: params.reason ?? null,
        },
      });
      // Chuyển luôn task đang mở của sale cũ sang sale mới.
      const tRes = await tx.leadTask.updateMany({
        where: { leadId: lead.id, assignedToId: params.fromUserId, status: "OPEN" },
        data: { assignedToId: params.toUserId, assignedToName: toUser.name ?? null },
      });
      tasksMoved += tRes.count;

      await logLeadAudit({
        leadId: lead.id,
        action: "ASSIGN",
        actorId: params.actorId,
        actorName: params.actorName,
        oldValues: { assignedToId: params.fromUserId },
        newValues: { assignedToId: params.toUserId },
        changedFields: ["assignedToId"],
        reason: params.reason ?? "Bàn giao lead",
        tx,
      });
    });
  }

  return { ok: true, moved: leads.length, tasksMoved };
}
