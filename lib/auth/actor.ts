// lib/auth/actor.ts — A0-03: ActorResolver (Doc 15 §2.4, OI-5/OI-7).
// Tách 2 lớp: buildActor() THUẦN (test không cần DB) + resolveActor() DB-backed
// (React.cache → 1 query/request). Quyền resolve per-request từ DB, KHÔNG nằm trong JWT.
import { cache } from "react";
import { db } from "@/lib/db";
import { ACTION_REGISTRY } from "@/lib/auth/action-registry";
import { getSubtreeCenterIds } from "@/lib/org/org-tree";
import type { OrgUnitNode } from "@/lib/org/types";

export type ScopeType =
  | "GLOBAL"
  | "CENTER"
  | "CLASS"
  | "OWN"
  | "CHILDREN"
  | "ASSIGNED";

/** 1 permission đã "nở" theo role + orgUnit của actor. */
export type PermEntry = {
  action: string;
  scopeType: ScopeType;
  orgUnitId: string;
  roleCode: string;
  /** Chỉ cho CENTER: "ALL" (role HO/ROOT — cross-center theo chức năng) hoặc list centerId subtree. */
  centerScope: "ALL" | string[] | null;
};

export type Actor = {
  userId: string;
  isSuperAdmin: boolean;
  /** Có ≥1 role tại OrgUnit type HO/ROOT → cross-center theo chức năng (A0-04 bypass scope). */
  isHoLevel: boolean;
  orgRoles: { orgUnitId: string; roleCode: string }[];
  permissions: PermEntry[];
  visibleCenterIds: string[];
  grantsAllow: Set<string>;
  assignedClassIds: Set<string>;
};

/** Đối tượng bị kiểm tra quyền (tùy action mà cần field nào). */
export type Target = {
  centerId?: string | null;
  createdById?: string | null;
  parentUserId?: string | null;
  classId?: string | null;
} | null;

export type UserOrgRoleRow = {
  orgUnitId: string;
  status: string; // AssignStatus
  effectiveFrom: Date;
  effectiveTo: Date | null;
  role: {
    code: string;
    isActive: boolean;
    permissions: { action: string; scopeType: ScopeType }[];
  };
};

const isLiveNode = (n: OrgUnitNode): boolean =>
  n.deletedAt == null && n.isActive !== false;
const isHoRoot = (n: OrgUnitNode | undefined): boolean =>
  n?.type === "HO" || n?.type === "ROOT";

function allCenterIds(orgNodes: OrgUnitNode[]): string[] {
  return orgNodes
    .filter((n) => n.type === "CENTER" && isLiveNode(n) && n.centerId)
    .map((n) => n.centerId as string);
}

/**
 * Xây Actor THUẦN từ dữ liệu đã nạp — lọc role hiệu lực (status ACTIVE,
 * RoleDef.isActive, effectiveFrom<=now<=effectiveTo). Không chạm DB.
 */
export function buildActor(input: {
  userId: string;
  rows: UserOrgRoleRow[];
  orgNodes: OrgUnitNode[];
  grants?: { action: string; grant: "ALLOW" | "DENY" }[];
  assignedClassIds?: string[];
  now?: Date;
  validActions?: Set<string>;
}): Actor {
  const now = input.now ?? new Date();
  const orgById = new Map(input.orgNodes.map((n) => [n.id, n]));
  const everyCenter = allCenterIds(input.orgNodes);
  const validActions = input.validActions ?? new Set(ACTION_REGISTRY);

  // Lọc role ĐANG hiệu lực (T7).
  const liveRows = input.rows.filter(
    (r) =>
      r.status === "ACTIVE" &&
      r.role.isActive &&
      r.effectiveFrom <= now &&
      (r.effectiveTo == null || r.effectiveTo >= now),
  );

  const isSuperAdmin = liveRows.some(
    (r) => r.role.code === "SUPER_ADMIN" && isHoRoot(orgById.get(r.orgUnitId)),
  );
  // HO-level = bất kỳ role nào tại HO/ROOT (cross-center theo chức năng).
  const isHoLevel = liveRows.some((r) => isHoRoot(orgById.get(r.orgUnitId)));

  const orgRoles = liveRows.map((r) => ({ orgUnitId: r.orgUnitId, roleCode: r.role.code }));

  const permissions: PermEntry[] = [];
  const visible = new Set<string>();

  for (const r of liveRows) {
    const node = orgById.get(r.orgUnitId);
    const hoRoot = isHoRoot(node);
    // visibleCenterIds: HO/ROOT → mọi center (cross-center theo chức năng); CENTER → subtree.
    const rowCenters = hoRoot
      ? everyCenter
      : getSubtreeCenterIds(input.orgNodes, r.orgUnitId);
    rowCenters.forEach((c) => visible.add(c));

    for (const p of r.role.permissions) {
      permissions.push({
        action: p.action,
        scopeType: p.scopeType,
        orgUnitId: r.orgUnitId,
        roleCode: r.role.code,
        centerScope:
          p.scopeType === "CENTER" ? (hoRoot ? "ALL" : rowCenters) : null,
      });
    }
  }

  const grantsAllow = new Set(
    (input.grants ?? [])
      .filter((g) => g.grant === "ALLOW" && validActions.has(g.action))
      .map((g) => g.action),
  );

  return {
    userId: input.userId,
    isSuperAdmin,
    isHoLevel,
    orgRoles,
    permissions,
    visibleCenterIds: [...visible],
    grantsAllow,
    assignedClassIds: new Set(input.assignedClassIds ?? []),
  };
}

export async function resolveActorUncached(userId: string): Promise<Actor> {
  const now = new Date();
  const [rows, orgUnits, grants, classes] = await Promise.all([
    db.userOrgRole.findMany({
      where: {
        userId,
        status: "ACTIVE",
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      include: { role: { include: { permissions: true } } },
    }),
    db.orgUnit.findMany({ where: { deletedAt: null } }),
    db.userPermissionGrant.findMany({
      where: { userId },
      select: { action: true, grant: true },
    }),
    db.class.findMany({
      where: { OR: [{ teacherId: userId }, { assistantId: userId }] },
      select: { id: true },
    }),
  ]);

  const orgNodes: OrgUnitNode[] = orgUnits.map((o) => ({
    id: o.id,
    code: o.code,
    type: o.type as OrgUnitNode["type"],
    parentId: o.parentId,
    centerId: o.centerId,
    isActive: o.isActive,
    deletedAt: o.deletedAt,
  }));

  return buildActor({
    userId,
    now,
    orgNodes,
    rows: rows.map((r) => ({
      orgUnitId: r.orgUnitId,
      status: r.status,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
      role: {
        code: r.role.code,
        isActive: r.role.isActive,
        permissions: r.role.permissions.map((p) => ({
          action: p.action,
          scopeType: p.scopeType as ScopeType,
        })),
      },
    })),
    grants: grants.map((g) => ({ action: g.action, grant: g.grant })),
    assignedClassIds: classes.map((c) => c.id),
  });
}

/** Resolve Actor cho 1 user — React.cache → 1 lần truy vấn/request (AC11). */
export const resolveActor = cache(resolveActorUncached);
