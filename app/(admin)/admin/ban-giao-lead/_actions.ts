"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { getAuditActor } from "@/lib/audit/log";
import { resolveActor } from "@/lib/auth/actor";
import { getModelVisibleCenterIds } from "@/lib/db-scope";
import { previewHandover, bulkReassignLeads } from "@/lib/lead-handover/service";

// C2 — bàn giao lead. Gate leads:assign (SUPER_ADMIN/CENTER_MANAGER).

const filterSchema = z.object({
  statuses: z.array(z.string()).optional(),
  campaign: z.string().optional().or(z.literal("")),
  onlyActive: z.boolean().optional(),
});

const runSchema = filterSchema.extend({
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
  reason: z.string().trim().max(2000).optional().or(z.literal("")),
});

export async function previewHandoverAction(input: {
  fromUserId: string;
  statuses?: string[];
  campaign?: string;
  onlyActive?: boolean;
}): Promise<{ ok: boolean; error?: string; count?: number }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "leads:assign")) return { ok: false, error: "Không có quyền" };
  if (!input.fromUserId) return { ok: false, error: "Chọn sale bàn giao" };

  // Cách ly cơ sở: CENTER_MANAGER chỉ thấy/bàn giao lead cơ sở mình; SUPER_ADMIN/HO = ALL.
  const actor = await resolveActor(session.user.id);
  const visibleCenterIds = getModelVisibleCenterIds("Lead", actor);

  const count = await previewHandover(
    input.fromUserId,
    {
      statuses: input.statuses,
      campaign: input.campaign || null,
      onlyActive: input.onlyActive,
    },
    visibleCenterIds,
  );
  return { ok: true, count };
}

export async function runHandoverAction(input: unknown): Promise<{ ok: boolean; error?: string; moved?: number; tasksMoved?: number }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "leads:assign")) return { ok: false, error: "Không có quyền" };

  const parsed = runSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;

  const actor = getAuditActor(session);
  // Cách ly cơ sở: chỉ bàn giao lead trong tầm nhìn cơ sở của actor (CS1 không
  // bàn giao lead CS2). SUPER_ADMIN/HO → "ALL".
  const resolved = await resolveActor(session.user.id);
  const visibleCenterIds = getModelVisibleCenterIds("Lead", resolved);
  const res = await bulkReassignLeads({
    fromUserId: d.fromUserId,
    toUserId: d.toUserId,
    filters: { statuses: d.statuses, campaign: d.campaign || null, onlyActive: d.onlyActive },
    actorId: actor.actorId,
    actorName: actor.actorName,
    reason: d.reason || null,
    visibleCenterIds,
  });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/admin/ban-giao-lead");
  return { ok: true, moved: res.moved, tasksMoved: res.tasksMoved };
}
