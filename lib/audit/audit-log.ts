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

// ─── #05 — Viewer hợp nhất (filter + cursor + mask mặc định + break-glass) ─────
// Query chính của trang /admin/audit-log: đọc bảng AuditLog HỢP NHẤT (KHÔNG 5 bảng
// legacy), lọc orgUnitId theo actor (câu 13 BGĐ: mỗi người chỉ xem cơ sở mình),
// mask PII (SĐT/email) mặc định cho MỌI người. Bản UNMASK chỉ trả khi caller đã
// verify quyền `audit-logs:view-pii` (break-glass) ở tầng server action.

export type UnifiedAuditFilters = {
  dateFrom?: string;
  dateTo?: string;
  actorId?: string;
  action?: string;
  module?: string;
  /** Tìm trong entityType + entityId. */
  entitySearch?: string;
  /** Tìm trong reason. */
  freeText?: string;
};

export type UnifiedAuditRow = {
  id: string;
  createdAt: Date;
  actorId: string | null;
  actorName: string;
  module: string;
  entityType: string;
  entityId: string;
  action: string;
  changedFields: string[];
  reason: string | null;
  orgUnitId: string | null;
  ip: string | null;
  userAgent: string | null;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  /** true = PII đã che (mặc định); false = đã break-glass mở đầy đủ cho phiên xem. */
  piiMasked: boolean;
};

export const UNIFIED_AUDIT_PAGE_SIZE = 20;

function encodeAuditCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ c: createdAt.toISOString(), i: id }),
  ).toString("base64");
}

function decodeAuditCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const d = JSON.parse(Buffer.from(cursor, "base64").toString()) as {
      c: string;
      i: string;
    };
    return { createdAt: new Date(d.c), id: d.i };
  } catch {
    return null;
  }
}

function buildUnifiedAuditWhere(
  scope: string[] | "ALL",
  filters: UnifiedAuditFilters,
): Prisma.AuditLogWhereInput {
  const AND: Prisma.AuditLogWhereInput[] = [];
  if (scope !== "ALL") AND.push({ orgUnitId: { in: scope } });
  if (filters.dateFrom) AND.push({ createdAt: { gte: new Date(filters.dateFrom) } });
  if (filters.dateTo) {
    const to = new Date(filters.dateTo);
    to.setHours(23, 59, 59, 999);
    AND.push({ createdAt: { lte: to } });
  }
  if (filters.actorId) AND.push({ actorId: filters.actorId });
  if (filters.action) AND.push({ action: filters.action });
  if (filters.module) AND.push({ module: filters.module });
  if (filters.entitySearch) {
    const s = filters.entitySearch.trim();
    AND.push({
      OR: [
        { entityId: { contains: s, mode: "insensitive" } },
        { entityType: { contains: s, mode: "insensitive" } },
      ],
    });
  }
  if (filters.freeText) {
    AND.push({ reason: { contains: filters.freeText, mode: "insensitive" } });
  }
  return AND.length ? { AND } : {};
}

/**
 * Query viewer hợp nhất — scope theo orgUnit của actor + mask PII mặc định.
 * `opts.unmask=true` CHỈ được truyền sau khi server action đã verify quyền
 * `audit-logs:view-pii` (break-glass). Trả cursor keyset (createdAt,id) desc.
 */
export async function queryUnifiedAuditLogs(
  actor: Actor,
  filters: UnifiedAuditFilters,
  cursor: string | null,
  opts: { take?: number; unmask?: boolean } = {},
): Promise<{ items: UnifiedAuditRow[]; nextCursor: string | null }> {
  const scope = visibleOrgUnitIds(actor);
  // Actor center-level nhưng không có org nào nhìn thấy → rỗng (an toàn, không lộ).
  if (scope !== "ALL" && scope.length === 0) return { items: [], nextCursor: null };

  const take = opts.take ?? UNIFIED_AUDIT_PAGE_SIZE;
  const baseWhere = buildUnifiedAuditWhere(scope, filters);
  const decoded = cursor ? decodeAuditCursor(cursor) : null;
  const where: Prisma.AuditLogWhereInput = decoded
    ? {
        AND: [
          baseWhere,
          {
            OR: [
              { createdAt: { lt: decoded.createdAt } },
              { AND: [{ createdAt: decoded.createdAt }, { id: { lt: decoded.id } }] },
            ],
          },
        ],
      }
    : baseWhere;

  const rows = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
  });

  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;
  const last = page[page.length - 1];
  const nextCursor = hasMore && last ? encodeAuditCursor(last.createdAt, last.id) : null;

  const unmask = opts.unmask ?? false;
  const items: UnifiedAuditRow[] = page.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    actorId: r.actorId,
    actorName: r.actorName,
    module: r.module,
    entityType: r.entityType,
    entityId: r.entityId,
    action: r.action,
    changedFields: r.changedFields,
    reason: r.reason,
    orgUnitId: r.orgUnitId,
    ip: r.ip,
    userAgent: r.userAgent,
    // maskAuditValues(values, canViewPii): unmask=true → giữ nguyên; false → che.
    oldValues: maskAuditValues(r.oldValues as Record<string, unknown> | null, unmask),
    newValues: maskAuditValues(r.newValues as Record<string, unknown> | null, unmask),
    piiMasked: !unmask,
  }));

  return { items, nextCursor };
}

/**
 * Ghi log RIÊNG mỗi lần break-glass mở PII (câu 13 BGĐ: ai – lúc nào – lý do gì).
 * Immutable như mọi AuditLog. Caller PHẢI verify quyền `audit-logs:view-pii` +
 * validate reason (>=10 ký tự) TRƯỚC khi gọi.
 */
export async function recordPiiUnmask(
  actor: AuditActor,
  reason: string,
  meta?: { ip?: string | null; userAgent?: string | null },
): Promise<AuditLog> {
  return writeAudit({
    actor,
    module: "audit",
    entityType: "AuditLog",
    entityId: "*",
    action: "audit.pii-unmasked",
    reason,
    ip: meta?.ip ?? null,
    userAgent: meta?.userAgent ?? null,
  });
}
