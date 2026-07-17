// lib/org/org-service.ts — Tầng DB-backed cho OrgUnit (ticket A0-01 §3).
// Gọi lại rule THUẦN trong orgunit-rules.ts / org-tree.ts (không lặp logic).
// Lỗi nghiệp vụ → OrgRuleError (code EN + message VI). Doc 15 §2.1, OI-1.
import { Prisma, type OrgUnit } from "@prisma/client";
import { updateTag } from "next/cache";
import { db } from "@/lib/db";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { OrgRuleError, type OrgUnitNode, type OrgUnitType } from "./types";
import {
  validateCode,
  validateCenterId,
  validateRootRule,
  wouldCreateCycle,
} from "./orgunit-rules";
import {
  getAncestors as getAncestorsPure,
  getSubtreeCenterIds as getSubtreeCenterIdsPure,
  isAncestor as isAncestorPure,
  selectableOrgUnits,
  type SelectableOrgUnit,
} from "./org-tree";
import type { Actor } from "@/lib/auth/actor";

export type CreateOrgUnitInput = {
  type: OrgUnitType;
  code: string;
  name: string;
  parentId?: string | null;
  address?: string | null;
  centerId?: string | null;
};

export type UpdateOrgUnitInput = Partial<{
  name: string;
  parentId: string | null;
  address: string | null;
}>;

/** Prisma row → node tối giản cho thuật toán cây thuần. */
function toNode(o: OrgUnit): OrgUnitNode {
  return {
    id: o.id,
    code: o.code,
    type: o.type as OrgUnitType,
    parentId: o.parentId,
    centerId: o.centerId,
    isActive: o.isActive,
    deletedAt: o.deletedAt,
  };
}

async function loadNodes(includeDeleted = false): Promise<OrgUnitNode[]> {
  const rows = await db.orgUnit.findMany({
    where: includeDeleted ? {} : { deletedAt: null },
  });
  return rows.map(toNode);
}

function requireName(name: string): string {
  const n = (name ?? "").trim();
  if (n.length === 0) {
    throw new OrgRuleError("ORG_NAME_REQUIRED", "Tên đơn vị không được để trống.", "name");
  }
  return n;
}

async function assertParentUsable(parentId: string): Promise<void> {
  const parent = await db.orgUnit.findUnique({ where: { id: parentId } });
  if (!parent || parent.deletedAt) {
    throw new OrgRuleError(
      "ORG_PARENT_NOT_FOUND",
      "Đơn vị cha không tồn tại hoặc đã bị xoá.",
      "parentId",
    );
  }
}

/** Tạo OrgUnit (V1–V4, V7). code/centerId reuse của bản đã soft-delete: KHÔNG (code unique toàn cục). */
export async function createOrgUnit(input: CreateOrgUnitInput): Promise<OrgUnit> {
  const code = validateCode(input.code); // V2 (+ chuẩn hóa uppercase)
  const name = requireName(input.name);
  const parentId = input.parentId ?? null;
  const centerId = input.centerId ?? null;

  validateCenterId(input.type, centerId); // V7

  const existingRoot = await db.orgUnit.findFirst({
    where: { type: "ROOT", deletedAt: null },
    select: { id: true },
  });
  validateRootRule({ type: input.type, parentId, existingRootId: existingRoot?.id ?? null }); // V3 + V4(parent required)

  if (parentId) await assertParentUsable(parentId); // V4

  const dup = await db.orgUnit.findUnique({ where: { code }, select: { id: true } });
  if (dup) {
    throw new OrgRuleError("ORG_CODE_CONFLICT", `Mã đơn vị "${code}" đã tồn tại.`, "code");
  }

  try {
    const created = await db.orgUnit.create({
      data: { type: input.type, code, name, address: input.address ?? null, parentId, centerId },
    });
    updateTag(CACHE_TAGS.orgTree); // REQ-02: cây org đổi → làm mới cache resolveActor.
    return created;
  } catch (e) {
    // Race T6-01: 2 request cùng code → DB unique bắt (P2002) → CONFLICT, không 500.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new OrgRuleError("ORG_CODE_CONFLICT", `Mã đơn vị "${code}" đã tồn tại.`, "code");
    }
    throw e;
  }
}

export async function getOrgUnit(
  id: string,
  opts: { includeDeleted?: boolean } = {},
): Promise<OrgUnit | null> {
  const row = await db.orgUnit.findUnique({ where: { id } });
  if (!row) return null;
  if (!opts.includeDeleted && row.deletedAt) return null;
  return row;
}

export async function listOrgUnits(
  opts: { includeDeleted?: boolean } = {},
): Promise<OrgUnit[]> {
  return db.orgUnit.findMany({
    where: opts.includeDeleted ? {} : { deletedAt: null },
    orderBy: { code: "asc" },
  });
}

/** Cập nhật (đổi parent → V5/V6 chống cycle, V4 parent hợp lệ). */
export async function updateOrgUnit(id: string, input: UpdateOrgUnitInput): Promise<OrgUnit> {
  const self = await db.orgUnit.findUnique({ where: { id } });
  if (!self || self.deletedAt) {
    throw new OrgRuleError("ORG_NOT_FOUND", "Không tìm thấy đơn vị.", "id");
  }

  const data: Prisma.OrgUnitUpdateInput = {};
  if (input.name !== undefined) data.name = requireName(input.name);
  if (input.address !== undefined) data.address = input.address;

  if (input.parentId !== undefined && input.parentId !== self.parentId) {
    const newParentId = input.parentId;
    if (newParentId) await assertParentUsable(newParentId); // V4
    const nodes = await loadNodes(true);
    if (wouldCreateCycle(nodes, id, newParentId)) {
      throw new OrgRuleError(
        "ORG_CYCLE",
        "Không thể đặt đơn vị cha tạo thành vòng lặp.",
        "parentId",
      );
    }
    data.parent = newParentId
      ? { connect: { id: newParentId } }
      : { disconnect: true };
  }

  const updated = await db.orgUnit.update({ where: { id }, data });
  updateTag(CACHE_TAGS.orgTree); // REQ-02
  return updated;
}

/** Soft-delete (V8: chặn nếu còn con đang sống — vd xoá ROOT khi còn HO/CS). */
export async function softDeleteOrgUnit(id: string): Promise<OrgUnit> {
  const self = await db.orgUnit.findUnique({ where: { id } });
  if (!self || self.deletedAt) {
    throw new OrgRuleError("ORG_NOT_FOUND", "Không tìm thấy đơn vị.", "id");
  }
  const liveChildren = await db.orgUnit.count({
    where: { parentId: id, deletedAt: null },
  });
  if (liveChildren > 0) {
    throw new OrgRuleError(
      "ORG_HAS_CHILDREN",
      "Không thể xoá đơn vị còn đơn vị con đang hoạt động.",
      "id",
    );
  }
  const deleted = await db.orgUnit.update({
    where: { id },
    data: { deletedAt: new Date(), isActive: false },
  });
  updateTag(CACHE_TAGS.orgTree); // REQ-02
  return deleted;
}

// ─── Tree helpers (DB-backed wrap thuật toán thuần) ───

/** Mọi centerId thuộc subtree (AC5): ROOT→[CS...], CENTER→[chính nó], HO→[] (OI-1). */
export async function getSubtreeCenterIds(orgUnitId: string): Promise<string[]> {
  const nodes = await loadNodes(false);
  return getSubtreeCenterIdsPure(nodes, orgUnitId);
}

/** Đường từ node lên ROOT (gồm chính nó). */
export async function getAncestors(orgUnitId: string): Promise<OrgUnitNode[]> {
  const nodes = await loadNodes(true);
  return getAncestorsPure(nodes, orgUnitId);
}

export async function isAncestor(a: string, b: string): Promise<boolean> {
  const nodes = await loadNodes(true);
  return isAncestorPure(nodes, a, b);
}

/**
 * Đơn vị tổ chức actor được phép chọn/lọc — NGUỒN DUY NHẤT cho mọi center-picker FE/BE.
 * Thay cho list cứng ["CS1","CS2"] và bảng Center: gồm cả HO (Doc 15 OI-1).
 * `opts.types: ["CENTER"]` khi chỉ cần cơ sở vận hành (gán lead/lớp); mặc định gồm HO.
 */
export async function getSelectableOrgUnits(
  actor: Actor,
  opts: { types?: OrgUnitType[]; includeDeleted?: boolean } = {},
): Promise<SelectableOrgUnit[]> {
  const rows = await db.orgUnit.findMany({
    where: opts.includeDeleted ? {} : { deletedAt: null },
  });
  const nodes = rows.map((o) => ({ ...toNode(o), name: o.name }));
  return selectableOrgUnits(
    nodes,
    {
      isSuperAdmin: actor.isSuperAdmin,
      isHoLevel: actor.isHoLevel,
      visibleCenterIds: actor.visibleCenterIds,
      roleOrgUnitIds: actor.orgRoles.map((r) => r.orgUnitId),
    },
    opts,
  );
}

// ─── PR-B dual-write: map Center.id ↔ OrgUnit.id ──────────────────────────────
// Giai đoạn 2-phase: mọi write set CẢ centerId + orgUnitId. OrgUnit.centerId @unique
// nên ánh xạ 1-1 (chỉ type=CENTER có centerId; HO/ROOT centerId=null).

/** Center.id → OrgUnit.id. null nếu centerId rỗng hoặc không OrgUnit nào trỏ tới. */
export async function orgUnitIdForCenter(
  centerId: string | null | undefined,
): Promise<string | null> {
  if (!centerId) return null;
  const ou = await db.orgUnit.findFirst({
    where: { centerId, deletedAt: null },
    select: { id: true },
  });
  return ou?.id ?? null;
}

/** OrgUnit.id → Center.id. HO/ROOT (centerId=null) → null (đơn vị không có Center). */
export async function centerIdForOrgUnit(
  orgUnitId: string | null | undefined,
): Promise<string | null> {
  if (!orgUnitId) return null;
  const ou = await db.orgUnit.findUnique({
    where: { id: orgUnitId },
    select: { centerId: true },
  });
  return ou?.centerId ?? null;
}
