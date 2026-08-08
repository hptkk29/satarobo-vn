// lib/auth/actor.ts — A0-03: ActorResolver (Doc 15 §2.4, OI-5/OI-7).
// Tách 2 lớp: buildActor() THUẦN (test không cần DB) + resolveActor() DB-backed
// (React.cache → 1 query/request). Quyền resolve per-request từ DB, KHÔNG nằm trong JWT.
import { cache } from "react";
import { db } from "@/lib/db";
import { ACTION_REGISTRY } from "@/lib/auth/action-registry";
import { getSubtreeCenterIds, getSubtreeOrgUnitIds } from "@/lib/org/org-tree";
import type { OrgUnitNode } from "@/lib/org/types";
// US-02 — type-only (erased khi compile, không tạo cycle runtime với lib/permissions/can.ts).
import type { GrantRow } from "@/lib/permissions/can";

// REQ-02 (REVERTED) — cây OrgUnit đọc TRẦN mỗi request. Trước đây bọc unstable_cache
// (TTL 300s) nhưng: (a) bảng OrgUnit RẤT NHỎ (HO+CS1+CS2…) → full-scan không đáng kể,
// lợi ích cache ~0; (b) mutation NGOÀI app (SQL/seed e2e) không invalidate được cache
// trong server → resolveActor trả cây STALE → sai visibleCenterIds → scope rỗng (đã làm
// smoke mobile-chrome đỏ: inbox rỗng do actor thấy center cũ). Bỏ cache = an toàn đúng đắn.
async function getOrgTree(): Promise<OrgUnitNode[]> {
  const orgUnits = await db.orgUnit.findMany({ where: { deletedAt: null } });
  return orgUnits.map((o) => ({
    id: o.id,
    code: o.code,
    type: o.type as OrgUnitNode["type"],
    parentId: o.parentId,
    centerId: o.centerId,
    isActive: o.isActive,
    deletedAt: null,
  }));
}

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
  /**
   * Tầm nhìn cơ sở của CHÍNH permission này: "ALL" khi role gắn ở HO/ROOT (cross-center
   * theo chức năng — Doc 15 §2), ngược lại là list centerId trong subtree của orgUnit.
   * Gán cho MỌI perm (không riêng scopeType CENTER) — `getModelVisibleCenterIds` gom
   * union theo prefix action của model, nhờ đó một người kiêm TRAINING@HO + CM@CS1
   * thấy học viên/lớp cả 2 cơ sở nhưng chỉ thấy lead/doanh thu CS1.
   */
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
  /**
   * OrgUnit IDs actor nhìn thấy (Phase 0 migrate Center→OrgUnit). Song song với
   * visibleCenterIds; scopedDb sẽ chuyển sang dùng field này ở Phase D. HO/ROOT →
   * mọi đơn vị; CENTER → subtree theo orgUnitId.
   */
  visibleOrgUnitIds: string[];
  grantsAllow: Set<string>;
  assignedClassIds: Set<string>;
  // ── US-02 (Nền Hệ thống P0) — ADDITIVE OPTIONAL: nạp sẵn cho engine lib/permissions/can.ts.
  // Optional có chủ đích: ~35 file dựng Actor literal (system-actor, test cũ) không vỡ.
  /** RoleDef.id của các role ĐANG hiệu lực (đối chiếu PermissionGrant subjectType=ROLE). */
  roleIds?: string[];
  /** UserGroup.id — rỗng tới US-03. */
  groupIds?: string[];
  /** Grant từ bảng PermissionGrant MỚI (KHÔNG phải UserPermissionGrant cũ). */
  permissionGrants?: GrantRow[];
  /** Tầm nhìn cơ sở per RoleDef.id cho dataScope UNIT_ONLY — cùng công thức PermEntry.centerScope. */
  roleCenterScope?: Record<string, "ALL" | string[]>;
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
  /** US-02 — RoleDef.id (optional additive: test/caller cũ không truyền vẫn compile). */
  roleId?: string;
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
  /** US-02 — grant bảng MỚI (PermissionGrant) đã query theo roleIds của actor. */
  permissionGrants?: GrantRow[];
}): Actor {
  const now = input.now ?? new Date();
  const orgById = new Map(input.orgNodes.map((n) => [n.id, n]));
  const everyCenter = allCenterIds(input.orgNodes);
  const everyOrgUnit = input.orgNodes.filter(isLiveNode).map((n) => n.id);
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
  const visibleOrg = new Set<string>();
  // US-02 — RoleDef.id đang hiệu lực + tầm nhìn cơ sở per role (cho dataScope UNIT_ONLY).
  const roleIdSet = new Set<string>();
  const roleCenterScope: Record<string, "ALL" | string[]> = {};

  for (const r of liveRows) {
    const node = orgById.get(r.orgUnitId);
    const hoRoot = isHoRoot(node);
    // visibleCenterIds: HO/ROOT → mọi center (cross-center theo chức năng); CENTER → subtree.
    const rowCenters = hoRoot
      ? everyCenter
      : getSubtreeCenterIds(input.orgNodes, r.orgUnitId);
    rowCenters.forEach((c) => visible.add(c));
    // visibleOrgUnitIds (song song): HO/ROOT → mọi đơn vị; còn lại → subtree orgUnitId.
    const rowOrgUnits = hoRoot
      ? everyOrgUnit
      : getSubtreeOrgUnitIds(input.orgNodes, r.orgUnitId);
    rowOrgUnits.forEach((o) => visibleOrg.add(o));

    // US-02 — roleCenterScope: CÙNG công thức PermEntry.centerScope (hoRoot → "ALL",
    // ngược lại subtree centerIds); role gán ở nhiều orgUnit → "ALL" thắng, else union.
    if (r.roleId) {
      roleIdSet.add(r.roleId);
      const prev = roleCenterScope[r.roleId];
      if (hoRoot || prev === "ALL") {
        roleCenterScope[r.roleId] = "ALL";
      } else {
        roleCenterScope[r.roleId] = [...new Set([...(prev ?? []), ...rowCenters])];
      }
    }

    for (const p of r.role.permissions) {
      permissions.push({
        action: p.action,
        scopeType: p.scopeType,
        orgUnitId: r.orgUnitId,
        roleCode: r.role.code,
        centerScope: hoRoot ? "ALL" : rowCenters,
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
    visibleOrgUnitIds: [...visibleOrg],
    grantsAllow,
    assignedClassIds: new Set(input.assignedClassIds ?? []),
    // US-02 — additive: engine mới (lib/permissions/can.ts) đọc các field này.
    roleIds: [...roleIdSet],
    groupIds: [], // US-03 mới có nhóm
    permissionGrants: input.permissionGrants ?? [],
    roleCenterScope,
  };
}

export async function resolveActorUncached(userId: string): Promise<Actor> {
  const now = new Date();
  const [rows, orgNodes, grants, classes] = await Promise.all([
    db.userOrgRole.findMany({
      where: {
        userId,
        status: "ACTIVE",
        effectiveFrom: { lte: now },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
      },
      include: { role: { include: { permissions: true } } },
    }),
    getOrgTree(), // REQ-02: cây OrgUnit cache cross-request (thay findMany mỗi request).
    db.userPermissionGrant.findMany({
      where: { userId },
      select: { action: true, grant: true },
    }),
    // QA 21/07 — lớp XOÁ MỀM không còn là "lớp được gán": thiếu filter này site GV
    // vẫn hiện lớp đã xoá ở grid Ảnh lớp/Lớp của tôi + ownership vẫn nhận buổi của nó.
    db.class.findMany({
      where: { deletedAt: null, OR: [{ teacherId: userId }, { assistantId: userId }] },
      select: { id: true },
    }),
  ]);

  // US-02 — query thứ 5 (phụ thuộc roleIds từ rows nên nằm SAU Promise.all): grant bảng
  // MỚI PermissionGrant theo role. subjectType GROUP query ở US-03 khi có UserGroup.
  const roleIds = [...new Set(rows.map((r) => r.roleId))];
  const permissionGrants =
    roleIds.length === 0
      ? []
      : await db.permissionGrant.findMany({
          where: { subjectType: "ROLE", subjectId: { in: roleIds } },
          select: {
            subjectType: true,
            subjectId: true,
            permissionKey: true,
            effect: true,
            dataScope: true,
            fieldMask: true,
          },
        });

  return buildActor({
    userId,
    now,
    orgNodes,
    permissionGrants,
    rows: rows.map((r) => ({
      orgUnitId: r.orgUnitId,
      roleId: r.roleId,
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
