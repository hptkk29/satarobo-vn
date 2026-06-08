// lib/auth/rbac-service.ts — A0-02: lõi mutation RBAC động.
// MỌI thay đổi role/permission/assignment đi qua đây: enforce quyền (chỉ SUPER_ADMIN
// cho roles:manage; roles:assign cho gán) + reason bắt buộc + validate registry +
// rule lifecycle + ghi RbacAuditLog. KHÔNG enforce chỉ ở UI (T10).
import { Prisma, type RoleDef, type UserOrgRole } from "@prisma/client";
import { db } from "@/lib/db";
import { can, type UserGrant } from "@/lib/auth/permissions";
import { firstInvalidAction } from "@/lib/auth/action-registry";
import { logRbacAudit } from "@/lib/audit/log";
import {
  assignUserOrgRoleSchema,
  createRoleSchema,
  revokeUserOrgRoleSchema,
  setRolePermissionsSchema,
  updateRoleSchema,
} from "@/lib/validators/role";

/** Actor thực hiện hành động — đủ field để can() + audit. */
export type RbacActor = {
  id: string;
  name: string;
  role?: string | null;
  roles?: string[];
  grants?: UserGrant[];
};

/** Lỗi nghiệp vụ RBAC — code (EN) + message (VI). */
export class RbacError extends Error {
  readonly code: string;
  readonly field?: string;
  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = "RbacError";
    this.code = code;
    this.field = field;
  }
}

function toCanUser(actor: RbacActor) {
  return { role: actor.role ?? null, roles: actor.roles, grants: actor.grants };
}
function requireManage(actor: RbacActor): void {
  if (!can(toCanUser(actor), "roles:manage")) {
    throw new RbacError("FORBIDDEN", "Chỉ SUPER_ADMIN được cấu hình role/quyền.");
  }
}
function requireAssign(actor: RbacActor): void {
  if (!can(toCanUser(actor), "roles:assign")) {
    throw new RbacError("FORBIDDEN", "Không có quyền gán vai trò cho người dùng.");
  }
}

// ─── ROLE CRUD ──────────────────────────────────────────────────────

export async function createRole(actor: RbacActor, input: unknown): Promise<RoleDef> {
  requireManage(actor);
  const { code, name, reason } = createRoleSchema.parse(input);

  const dup = await db.roleDef.findUnique({ where: { code }, select: { id: true } });
  if (dup) throw new RbacError("ROLE_CODE_CONFLICT", `Mã role "${code}" đã tồn tại.`, "code");

  const role = await db.roleDef.create({ data: { code, name } });
  await logRbacAudit({
    entity: "ROLE", entityId: role.id, action: "CREATE",
    actorId: actor.id, actorName: actor.name, reason,
    newValues: { code, name },
  });
  return role;
}

export async function updateRole(
  actor: RbacActor,
  roleId: string,
  input: unknown,
): Promise<RoleDef> {
  requireManage(actor);
  const parsed = updateRoleSchema.parse(input);
  const role = await db.roleDef.findUnique({ where: { id: roleId } });
  if (!role) throw new RbacError("ROLE_NOT_FOUND", "Không tìm thấy role.", "id");

  const data: Prisma.RoleDefUpdateInput = {};
  if (parsed.name !== undefined) data.name = parsed.name;
  if (parsed.isActive !== undefined) data.isActive = parsed.isActive;

  if (parsed.code !== undefined && parsed.code !== role.code) {
    if (role.isSystem) {
      throw new RbacError("ROLE_SYSTEM_IMMUTABLE", "Role hệ thống không được đổi mã.", "code");
    }
    const dup = await db.roleDef.findUnique({ where: { code: parsed.code }, select: { id: true } });
    if (dup) throw new RbacError("ROLE_CODE_CONFLICT", `Mã role "${parsed.code}" đã tồn tại.`, "code");
    data.code = parsed.code;
  }

  const updated = await db.roleDef.update({ where: { id: roleId }, data });
  await logRbacAudit({
    entity: "ROLE", entityId: roleId, action: "UPDATE",
    actorId: actor.id, actorName: actor.name, reason: parsed.reason,
    oldValues: { code: role.code, name: role.name, isActive: role.isActive },
    newValues: { code: updated.code, name: updated.name, isActive: updated.isActive },
  });
  return updated;
}

export async function deleteRole(
  actor: RbacActor,
  roleId: string,
  reason: string,
): Promise<void> {
  requireManage(actor);
  if (!reason || reason.trim().length < 3) {
    throw new RbacError("REASON_REQUIRED", "Lý do xóa role là bắt buộc.", "reason");
  }
  const role = await db.roleDef.findUnique({ where: { id: roleId } });
  if (!role) throw new RbacError("ROLE_NOT_FOUND", "Không tìm thấy role.", "id");
  if (role.isSystem) {
    throw new RbacError("ROLE_SYSTEM_IMMUTABLE", "Role hệ thống không được xóa.", "id");
  }
  const inUse = await db.userOrgRole.count({ where: { roleId } });
  if (inUse > 0) {
    throw new RbacError(
      "ROLE_IN_USE",
      `Role đang được gán cho ${inUse} người dùng — hãy thu hồi trước khi xóa.`,
      "id",
    );
  }
  await db.roleDef.delete({ where: { id: roleId } }); // RolePermission cascade
  await logRbacAudit({
    entity: "ROLE", entityId: roleId, action: "DELETE",
    actorId: actor.id, actorName: actor.name, reason,
    oldValues: { code: role.code, name: role.name },
  });
}

export async function setRolePermissions(
  actor: RbacActor,
  roleId: string,
  input: unknown,
): Promise<void> {
  requireManage(actor);
  const { permissions, reason } = setRolePermissionsSchema.parse(input);

  const role = await db.roleDef.findUnique({
    where: { id: roleId },
    include: { permissions: true },
  });
  if (!role) throw new RbacError("ROLE_NOT_FOUND", "Không tìm thấy role.", "id");

  const bad = firstInvalidAction(permissions.map((p) => p.action));
  if (bad) {
    throw new RbacError("ACTION_INVALID", `Action "${bad}" không có trong registry.`, "action");
  }

  await db.$transaction([
    db.rolePermission.deleteMany({ where: { roleId } }),
    db.rolePermission.createMany({
      data: permissions.map((p) => ({ roleId, action: p.action, scopeType: p.scopeType })),
      skipDuplicates: true,
    }),
  ]);

  await logRbacAudit({
    entity: "PERMISSION", entityId: roleId, action: "UPDATE",
    actorId: actor.id, actorName: actor.name, reason,
    oldValues: { permissions: role.permissions.map((p) => `${p.action}:${p.scopeType}`) },
    newValues: { permissions: permissions.map((p) => `${p.action}:${p.scopeType}`) },
  });
}

// ─── USER × ORG × ROLE ASSIGNMENT ───────────────────────────────────

export async function assignUserOrgRole(
  actor: RbacActor,
  input: unknown,
): Promise<UserOrgRole> {
  requireAssign(actor);
  const parsed = assignUserOrgRoleSchema.parse(input);

  const org = await db.orgUnit.findUnique({ where: { id: parsed.orgUnitId } });
  if (!org || org.deletedAt) {
    throw new RbacError("ORG_INVALID", "Đơn vị không tồn tại hoặc đã bị xoá.", "orgUnitId");
  }
  const role = await db.roleDef.findUnique({ where: { id: parsed.roleId }, select: { id: true } });
  if (!role) throw new RbacError("ROLE_NOT_FOUND", "Không tìm thấy role.", "roleId");
  const user = await db.user.findUnique({ where: { id: parsed.userId }, select: { id: true } });
  if (!user) throw new RbacError("USER_NOT_FOUND", "Không tìm thấy người dùng.", "userId");

  const key = {
    userId_orgUnitId_roleId: {
      userId: parsed.userId,
      orgUnitId: parsed.orgUnitId,
      roleId: parsed.roleId,
    },
  };
  const assignment = await db.userOrgRole.upsert({
    where: key,
    update: {
      effectiveFrom: parsed.effectiveFrom ?? new Date(),
      effectiveTo: parsed.effectiveTo ?? null,
      status: "ACTIVE",
      grantedById: actor.id,
    },
    create: {
      userId: parsed.userId,
      orgUnitId: parsed.orgUnitId,
      roleId: parsed.roleId,
      effectiveFrom: parsed.effectiveFrom ?? new Date(),
      effectiveTo: parsed.effectiveTo ?? null,
      grantedById: actor.id,
    },
  });

  await logRbacAudit({
    entity: "ASSIGNMENT", entityId: `${parsed.userId}:${parsed.orgUnitId}:${parsed.roleId}`,
    action: "ASSIGN", actorId: actor.id, actorName: actor.name, reason: parsed.reason,
    newValues: {
      userId: parsed.userId, orgUnitId: parsed.orgUnitId, roleId: parsed.roleId,
      effectiveFrom: assignment.effectiveFrom, effectiveTo: assignment.effectiveTo, status: assignment.status,
    },
  });
  return assignment;
}

export async function revokeUserOrgRole(
  actor: RbacActor,
  input: unknown,
): Promise<UserOrgRole> {
  requireAssign(actor);
  const parsed = revokeUserOrgRoleSchema.parse(input);
  const key = {
    userId_orgUnitId_roleId: {
      userId: parsed.userId,
      orgUnitId: parsed.orgUnitId,
      roleId: parsed.roleId,
    },
  };
  const existing = await db.userOrgRole.findUnique({ where: key });
  if (!existing) throw new RbacError("ASSIGNMENT_NOT_FOUND", "Không tìm thấy phân quyền.", "roleId");

  const updated = await db.userOrgRole.update({
    where: key,
    data: { status: "EXPIRED", effectiveTo: new Date() },
  });
  await logRbacAudit({
    entity: "ASSIGNMENT", entityId: `${parsed.userId}:${parsed.orgUnitId}:${parsed.roleId}`,
    action: "REVOKE", actorId: actor.id, actorName: actor.name, reason: parsed.reason,
    oldValues: { status: existing.status },
    newValues: { status: updated.status, effectiveTo: updated.effectiveTo },
  });
  return updated;
}

// ─── READ helpers (cho UI) ──────────────────────────────────────────

export async function listRoles(): Promise<
  (RoleDef & { permissions: { action: string; scopeType: string }[]; _count: { userRoles: number } })[]
> {
  return db.roleDef.findMany({
    orderBy: [{ isSystem: "desc" }, { code: "asc" }],
    include: {
      permissions: { select: { action: true, scopeType: true } },
      _count: { select: { userRoles: true } },
    },
  });
}

export async function listUserOrgRoles(userId: string): Promise<UserOrgRole[]> {
  return db.userOrgRole.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
}
