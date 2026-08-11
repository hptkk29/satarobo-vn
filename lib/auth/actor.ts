// lib/auth/actor.ts — A0-03: ActorResolver (Doc 15 §2.4, OI-5/OI-7).
// Tách 2 lớp: buildActor() THUẦN (test không cần DB) + resolveActor() DB-backed
// (React.cache → 1 query/request). Quyền resolve per-request từ DB, KHÔNG nằm trong JWT.
import { cache } from "react";
import { db } from "@/lib/db";
import { ACTION_REGISTRY } from "@/lib/auth/action-registry";
import {
  centerScopeForOrgUnit,
  getSubtreeCenterIds,
  getSubtreeOrgUnitIds,
} from "@/lib/org/org-tree";
import type { OrgUnitNode } from "@/lib/org/types";
// US-02 — type-only (erased khi compile, không tạo cycle runtime với lib/permissions/can.ts).
// GrantRow lấy từ module type-lá (KHÔNG phải lib/permissions/can) — tránh vòng
// actor→can→actor bị dependency-cruiser no-circular chặn ở CI.
import type { GrantRow } from "@/lib/permissions/grant-types";
import { loadPositionRoleRows } from "@/lib/org/positions";

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

// Hai kiểu này ở module lá `actor-types` để cắt vòng import với `lib/org/positions.ts`;
// re-export tại đây nên mọi caller cũ không phải sửa gì.
export type { ScopeType, UserOrgRoleRow } from "./actor-types";
import type { ScopeType, UserOrgRoleRow } from "./actor-types";

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
  /** US-03 — UserGroup.id các nhóm actor là thành viên (chỉ nhóm CHƯA xoá mềm). */
  groupIds?: string[];
  /** Grant từ bảng PermissionGrant MỚI (KHÔNG phải UserPermissionGrant cũ). */
  permissionGrants?: GrantRow[];
  /**
   * Tầm nhìn cơ sở per RoleDef.id cho dataScope UNIT_* — cùng công thức PermEntry.centerScope.
   *
   * P1 · US-05 ĐỔI SHAPE: trước đây là MỘT danh sách nên `can()` không phân biệt nổi
   * UNIT_ONLY với UNIT_AND_BELOW (nợ đã ghi ở documentation/permissions.md). Nay mang cả
   * hai mức, `lib/permissions/can.ts` chọn theo `grant.dataScope`.
   * "ALL" giữ nguyên nghĩa: role đặt tại HO/ROOT → cross-center theo chức năng.
   */
  roleCenterScope?: Record<string, RoleCenterScope>;
};

/** Phạm vi cơ sở của MỘT role, tách 2 mức (BA §2.5). Xem lib/org/org-tree.ts. */
export type RoleCenterScope = "ALL" | { unitOnly: string[]; unitAndBelow: string[] };

/** Đối tượng bị kiểm tra quyền (tùy action mà cần field nào). */
export type Target = {
  centerId?: string | null;
  createdById?: string | null;
  parentUserId?: string | null;
  classId?: string | null;
} | null;

/**
 * VAI QUAN HỆ — vai KHÔNG gắn vào đơn vị tổ chức, quyền suy ra từ QUAN HỆ với dữ liệu
 * (con mình, hội thoại mình là thành viên), không từ chỗ đứng trong cây OrgUnit.
 *
 * ⚠️ VÌ SAO PHẢI CÓ — SỰ CỐ ĐO ĐƯỢC 10/08/2026: phụ huynh KHÔNG gửi được tin nào, cả
 * chữ lẫn ảnh, trên test lẫn prod. `sendChatMessageAction` trả `PERMISSION_DENIED` trong
 * khi `permissions.md` ghi rõ "PH ✅ Gửi CHAT". Đo trên DB: **114 tài khoản PARENT, 0
 * dòng `UserOrgRole`**. RBAC v2 lấy quyền DUY NHẤT từ `UserOrgRole` ⇒ `actor.permissions`
 * rỗng ⇒ mọi scope đều vô nghĩa vì không có gì để khớp. Đọc thì vẫn chạy nên lỗi ẩn kỹ:
 * đường đọc chat kiểm theo tư cách THÀNH VIÊN HỘI THOẠI, không qua `can()`.
 *
 * Vì sao KHÔNG vá bằng cách tạo `UserOrgRole` cho từng phụ huynh:
 *  1. Sẽ phải backfill 114 tài khoản cũ VÀ nhớ gắn cho mọi tài khoản tạo sau — quên một
 *     lần là một phụ huynh câm lặng không ai biết. Chủ dự án yêu cầu dứt điểm 10/08.
 *  2. `buildActor` suy `isHoLevel` + `visibleCenterIds` TỪ CHÍNH các dòng `UserOrgRole`.
 *     Gắn phụ huynh vào ROOT là biến họ thành "HO-level, thấy mọi cơ sở" — nới quyền ở
 *     đúng chỗ nguy hiểm nhất, để đổi lấy một thứ họ không cần.
 *
 * Cho nên: vai quan hệ nạp thẳng từ `RoleDef` theo `User.roles`, và **CỐ Ý KHÔNG** đóng
 * góp vào `isHoLevel` / `visibleCenterIds` / `visibleOrgUnitIds`. `centerScope: null` ⇒
 * mọi permission scope CENTER của vai này (nếu ai đó lỡ khai) sẽ KHÔNG BAO GIỜ khớp —
 * fail-closed đúng hướng.
 *
 * RoleDef vẫn là NƠI DUY NHẤT định nghĩa vai này được làm gì: sửa quyền phụ huynh = sửa
 * `prisma/seed-roles.ts` rồi chạy seed, y hệt mọi vai khác.
 */
export const RELATIONSHIP_ROLE_CODES = ["PARENT"] as const;

export type RelationshipRole = {
  code: string;
  isActive: boolean;
  permissions: { action: string; scopeType: ScopeType }[];
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
  /** US-02 — grant bảng MỚI (PermissionGrant) đã query theo roleIds/groupIds của actor. */
  permissionGrants?: GrantRow[];
  /** US-03 — UserGroup.id của các nhóm actor đang là thành viên (nhóm CHƯA xoá mềm). */
  groupIds?: string[];
  /** Vai KHÔNG gắn đơn vị (xem {@link RELATIONSHIP_ROLE_CODES}). */
  relationshipRoles?: RelationshipRole[];
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
  // US-02 — RoleDef.id đang hiệu lực + tầm nhìn cơ sở per role (cho dataScope UNIT_*).
  const roleIdSet = new Set<string>();
  const roleCenterScope: Record<string, RoleCenterScope> = {};

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

    // US-02/US-05 — roleCenterScope: CÙNG công thức PermEntry.centerScope (hoRoot → "ALL");
    // ngược lại tách 2 mức qua centerScopeForOrgUnit (P1). Role gán ở nhiều orgUnit →
    // "ALL" thắng, còn lại hợp (union) TỪNG MỨC — không trộn hai mức vào nhau, vì trộn là
    // đúng cái làm UNIT_ONLY nở ra bằng UNIT_AND_BELOW.
    if (r.roleId) {
      roleIdSet.add(r.roleId);
      const prev = roleCenterScope[r.roleId];
      if (hoRoot || prev === "ALL") {
        roleCenterScope[r.roleId] = "ALL";
      } else {
        const scope = centerScopeForOrgUnit(input.orgNodes, r.orgUnitId);
        const prevObj = prev ?? { unitOnly: [], unitAndBelow: [] };
        roleCenterScope[r.roleId] = {
          unitOnly: [...new Set([...prevObj.unitOnly, ...scope.unitOnly])],
          unitAndBelow: [...new Set([...prevObj.unitAndBelow, ...scope.unitAndBelow])],
        };
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

  // Vai quan hệ: CHỈ đổ permission vào, KHÔNG chạm `visible`/`visibleOrg`/`isHoLevel`/
  // `orgRoles` — đó là chỗ suy ra tầm nhìn theo cây tổ chức, mà vai này không đứng ở
  // đâu trong cây cả. `orgUnitId: ""` là dấu hiệu "không thuộc đơn vị nào".
  for (const role of input.relationshipRoles ?? []) {
    if (!role.isActive) continue;
    for (const p of role.permissions) {
      permissions.push({
        action: p.action,
        scopeType: p.scopeType,
        orgUnitId: "",
        roleCode: role.code,
        centerScope: null,
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
    groupIds: input.groupIds ?? [], // US-03 — membership nhóm (caller đã lọc nhóm sống)
    permissionGrants: input.permissionGrants ?? [],
    roleCenterScope,
  };
}

/**
 * Vai quan hệ của user, suy TỪ `User.role`/`User.roles` — không cần `UserOrgRole`.
 * Trả mảng rỗng (không truy vấn RoleDef) với người không mang vai nào trong
 * {@link RELATIONSHIP_ROLE_CODES}, tức đại đa số nhân viên: đường nóng không tốn thêm gì.
 */
async function loadRelationshipRoles(userId: string): Promise<RelationshipRole[]> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { role: true, roles: true },
  });
  if (!user) return [];
  const codes = new Set<string>([user.role as string, ...(user.roles as string[])]);
  const wanted = RELATIONSHIP_ROLE_CODES.filter((c) => codes.has(c));
  if (wanted.length === 0) return [];

  const defs = await db.roleDef.findMany({
    where: { code: { in: [...wanted] } },
    select: { code: true, isActive: true, permissions: true },
  });
  return defs.map((d) => ({
    code: d.code,
    isActive: d.isActive,
    permissions: d.permissions.map((p) => ({
      action: p.action,
      scopeType: p.scopeType as ScopeType,
    })),
  }));
}

export async function resolveActorUncached(userId: string): Promise<Actor> {
  const now = new Date();
  const [rows, orgNodes, grants, classes, groupMemberships, relationshipRoles, positionRows] =
    await Promise.all([
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
    // US-03 — membership nhóm, CHỈ nhóm còn sống (group.deletedAt null): nhóm xoá mềm
    // → grant GROUP của nó vô hiệu ngay lần resolve kế, không cần dọn PermissionGrant.
    db.userGroupMember.findMany({
      where: { userId, group: { deletedAt: null } },
      select: { groupId: true },
    }),
      loadRelationshipRoles(userId),
      // P2 · US-08 — vai hưởng QUA VỊ TRÍ. Trả về cùng khuôn `UserOrgRoleRow` nên nhập
      // thẳng vào `rows` bên dưới; mọi logic scope của `buildActor` áp dụng y hệt, không
      // có đường quyền thứ hai để trôi lệch. Xem khối chú thích đầu lib/org/positions.ts.
      loadPositionRoleRows(userId, now),
    ]);

  // US-02/US-03 — query grant (phụ thuộc roleIds/groupIds nên nằm SAU Promise.all):
  // grant bảng MỚI PermissionGrant theo ROLE ∪ GROUP; cả hai rỗng → skip (PARENT
  // không tốn query).
  const roleIds = [...new Set(rows.map((r) => r.roleId))];
  const groupIds = groupMemberships.map((m) => m.groupId);
  const permissionGrants =
    roleIds.length === 0 && groupIds.length === 0
      ? []
      : await db.permissionGrant.findMany({
          where: {
            OR: [
              ...(roleIds.length > 0
                ? [{ subjectType: "ROLE" as const, subjectId: { in: roleIds } }]
                : []),
              ...(groupIds.length > 0
                ? [{ subjectType: "GROUP" as const, subjectId: { in: groupIds } }]
                : []),
            ],
          },
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
    groupIds,
    relationshipRoles,
    rows: [
      ...rows.map((r) => ({
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
      ...positionRows,
    ],
    grants: grants.map((g) => ({ action: g.action, grant: g.grant })),
    assignedClassIds: classes.map((c) => c.id),
  });
}

/** Resolve Actor cho 1 user — React.cache → 1 lần truy vấn/request (AC11). */
export const resolveActor = cache(resolveActorUncached);
