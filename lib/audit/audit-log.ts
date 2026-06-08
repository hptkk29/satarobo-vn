// lib/audit/audit-log.ts — A0-06: AuditLog HỢP NHẤT (Doc 15 §8.1).
// writeAudit (immutable — KHÔNG có update/delete), mask PII theo quyền, scope viewer
// theo orgUnit. KHÔNG gọi headers() → dùng được ngoài request (test/cron); ip/UA truyền vào.
import type { Prisma, PrismaClient, AuditLog } from "@prisma/client";
import { db } from "@/lib/db";
import { detectChangedFields } from "@/lib/audit/log";
import type { Actor } from "@/lib/auth/actor";

type TxClient = Prisma.TransactionClient;

/** Actor tối thiểu cho audit (id+name); System → actorId null. */
export type AuditActor = { id: string | null; name: string };

export async function writeAudit(params: {
  actor: AuditActor;
  module: string;
  entityType: string;
  entityId: string;
  action: string;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  changedFields?: string[];
  reason?: string;
  orgUnitId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  tx?: TxClient;
}): Promise<AuditLog> {
  const client: PrismaClient | TxClient = params.tx ?? db;
  const changedFields =
    params.changedFields ??
    (params.oldValues || params.newValues
      ? detectChangedFields(
          (params.oldValues ?? {}) as Record<string, unknown>,
          (params.newValues ?? {}) as Record<string, unknown>,
        )
      : []);
  return client.auditLog.create({
    data: {
      actorId: params.actor.id,
      actorName: params.actor.name,
      module: params.module,
      entityType: params.entityType,
      entityId: params.entityId,
      action: params.action,
      oldValues: (params.oldValues ?? undefined) as Prisma.InputJsonValue | undefined,
      newValues: (params.newValues ?? undefined) as Prisma.InputJsonValue | undefined,
      changedFields,
      reason: params.reason ?? null,
      orgUnitId: params.orgUnitId ?? null,
      ip: params.ip ?? null,
      userAgent: params.userAgent ?? null,
    },
  });
}

// ─── Mask PII ───────────────────────────────────────────────────────────────
const PII_KEY_RE = /(phone|sdt|mobile|email|tel)/i;

function maskValue(v: unknown): unknown {
  if (typeof v !== "string" || v.length === 0) return v;
  if (v.includes("@")) {
    const [u, d] = v.split("@");
    return `${(u ?? "").slice(0, 2)}***@${d ?? ""}`;
  }
  return v.length <= 4 ? "***" : `${v.slice(0, 2)}***${v.slice(-2)}`;
}

/** Mask field PII (SĐT/email) trong object nếu actor KHÔNG có quyền xem PII. */
export function maskAuditValues(
  values: Record<string, unknown> | null | undefined,
  canViewPii: boolean,
): Record<string, unknown> | null {
  if (!values) return null;
  if (canViewPii) return values;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = PII_KEY_RE.test(k) ? maskValue(v) : v;
  }
  return out;
}

// ─── Scoped viewer query ──────────────────────────────────────────────────────
/** orgUnitId actor được xem log: SUPER_ADMIN/HO → tất cả; còn lại → org của role mình. */
export function visibleOrgUnitIds(actor: Actor): string[] | "ALL" {
  if (actor.isSuperAdmin || actor.isHoLevel) return "ALL";
  return [...new Set(actor.orgRoles.map((r) => r.orgUnitId))];
}

export async function getAuditLogsScoped(
  actor: Actor,
  opts: { entityType?: string; module?: string; take?: number } = {},
): Promise<AuditLog[]> {
  const scope = visibleOrgUnitIds(actor);
  const where: Prisma.AuditLogWhereInput = {
    ...(opts.entityType ? { entityType: opts.entityType } : {}),
    ...(opts.module ? { module: opts.module } : {}),
    ...(scope === "ALL" ? {} : { orgUnitId: { in: scope } }),
  };
  return db.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 100,
  });
}
