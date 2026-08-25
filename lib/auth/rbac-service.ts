// lib/auth/rbac-service.ts — A0-02: lõi mutation RBAC động.
// MỌI thay đổi role/permission/assignment đi qua đây: enforce quyền (chỉ SUPER_ADMIN
// cho roles:manage; roles:assign cho gán) + reason bắt buộc + validate registry +
// rule lifecycle + ghi RbacAuditLog. KHÔNG enforce chỉ ở UI (T10).
import { Prisma, type RoleDef, type UserOrgRole } from "@prisma/client";
import { db } from "@/lib/db";
import { can, type UserGrant } from "@/lib/auth/permissions";
import { resolveActor, type Actor } from "@/lib/auth/actor";
import { decidePermissionWithGrant } from "@/lib/auth/permission-decision";
import { isLiveOrgRole } from "@/lib/auth/org-role-sync";
import {
  isHoRootOrgType,
  loiNeoHoRoot,
  roleBlockedAtHoRoot,
} from "@/lib/auth/org-anchor-rules";
import { firstInvalidAction } from "@/lib/auth/action-registry";
import { logRbacAudit } from "@/lib/audit/log";
import { syncCenterClassConversations } from "@/lib/chat/sync-membership";
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
/**
 * OQ-7 (vá 25/08/2026) — CỔNG HÀNH ĐỘNG phải dùng ĐÚNG hệ quyền mà CỔNG TRANG dùng.
 *
 * Trước bản vá: trang `/admin/users/[id]/org-roles` gác bằng `checkPermission("roles:assign")`
 * (đi qua grant → v1/v2 theo cờ `RBAC_V2_ENABLED`), còn `assignUserOrgRole`/`revokeUserOrgRole`
 * gác bằng `can()` **v1 ma trận TĨNH**, nơi `roles:assign` chỉ có `SUPER_ADMIN`
 * (`lib/auth/permissions.ts`). Ma trận v1 chỉ biết enum `Role` legacy (`HR`), KHÔNG biết mã
 * RoleDef `HO_HR`. Hệ quả trên prod (cờ ON): Nhân sự Hội sở VÀO ĐƯỢC trang, thấy toàn bộ
 * RoleDef + cây OrgUnit + phân quyền của mọi người, rồi mọi lần bấm "Gán"/"Thu hồi" đều nhận
 * "Không có quyền gán vai trò cho người dùng." — quyền vừa seed cho `HO_HR`
 * (`prisma/seed-roles.ts`) chết ngay tại điểm enforce, và 3 rào R1/R2/R3 dưới đây chưa từng
 * chạy một lần nào trên đường thật.
 *
 * Sửa: dùng CHÍNH lõi quyết định của `checkPermission` — `decidePermissionWithGrant`
 * (`lib/auth/permission-decision.ts`), tức grant → `evaluatePermission` → `flagOn ? v2 : v1`.
 * Hai cổng từ nay không thể nói ngược nhau: cùng một hàm, cùng một cờ.
 *
 * ⚠️ KHÔNG phải "đổi sang v2": cờ TẮT (local/dev/CI) vẫn trả v1 y như cũ, nên
 * `tests/e2e/a0/rbac.spec.ts` (actor `{ role: "HO_HR" }` không tồn tại trong DB) vẫn bị
 * từ chối đúng như trước. Luật cứng #2 (không đổi hành vi đường cũ) được giữ.
 *
 * ⚠️ `requireManage` (`roles:manage`) CỐ Ý giữ nguyên đường v1 trong đợt này: khoá đó là
 * `SUPER_ADMIN` ở CẢ v1 lẫn seed v2 nên không có khoảng hở đang mở, và đổi nó kéo theo
 * 4 hàm CRUD role ngoài phạm vi bản vá. Xem báo cáo.
 */
function quyetDinhQuyen(actor: RbacActor, resolved: Actor, action: string): boolean {
  return decidePermissionWithGrant({
    sessionUser: toCanUser(actor),
    actor: resolved,
    action,
  });
}

function requireAssign(actor: RbacActor, resolved: Actor): void {
  if (!quyetDinhQuyen(actor, resolved, "roles:assign")) {
    throw new RbacError("FORBIDDEN", "Không có quyền gán vai trò cho người dùng.");
  }
}

/**
 * "Ai là SUPER_ADMIN" — MỘT định nghĩa duy nhất cho cả server lẫn UI.
 *
 * Trước bản vá có hai định nghĩa khác nguồn: service đọc `session.user.role/roles` (legacy
 * v1), còn trang truyền `viewer.isSuperAdmin` của `resolveActor` (v2/DB) xuống
 * `OrgRolesManager`. Hai nguồn lệch nhau nghĩa là UI mở khoá một lựa chọn mà server sẽ từ
 * chối (hoặc ngược lại, khoá thứ server cho phép). Hợp (OR) hai vế là đúng chiều: người
 * mang vai `SUPER_ADMIN` ở `UserOrgRole` thì `can()` v2 vốn đã cho họ mọi thứ.
 */
export function laSuperAdminActor(input: {
  role?: string | null;
  roles?: readonly string[];
  resolved?: { isSuperAdmin: boolean } | null;
}): boolean {
  if (input.resolved?.isSuperAdmin) return true;
  return input.role === "SUPER_ADMIN" || (input.roles?.includes("SUPER_ADMIN") ?? false);
}

/** Actor có tư cách SUPER_ADMIN — nguồn duy nhất để miễn R1/R2 + SEC-M13. */
function isSuperActor(actor: RbacActor, resolved: Actor): boolean {
  return laSuperAdminActor({ role: actor.role, roles: actor.roles, resolved });
}

// ─── RÀO CHỐNG NHÂN BẢN QUYỀN (A PRD §6.10, OQ-7 24/08/2026) ────────
// Bối cảnh: `roles:assign` được MỞ cho `HO_HR`. Nó là quyền CẤP QUYỀN, nên mở trần
// nghĩa là Nhân sự Hội sở tự gán cho mình gần như mọi vai — không phải vì ai có ý xấu,
// mà vì hệ thống không có gì ngăn. Ba rào dưới đây phải lên CÙNG đợt với việc seed quyền.
//
// ⚠️ Cả 3 rào nằm ở SERVICE, không phải ở form. Trang gán vai nhận `orgUnitId`/`roleId`
// thô từ client (`_components/org-roles-manager.tsx`), nên chặn ở dropdown chỉ là lớp
// GIẢI THÍCH cho người dùng — không phải lớp enforce.

/**
 * R1 — quyền "cấp quyền". Vai nào mang một trong số này thì chỉ SUPER_ADMIN mới gán
 * (và mới thu hồi) được. Kiểm theo QUYỀN của vai đích lấy từ DB, **không** theo tên vai:
 * tên đổi được, quyền mới là thứ gây hại. Cùng blocklist với màn per-user
 * (`app/(admin)/admin/users/[id]/permissions/_actions.ts`).
 */
const PRIVILEGE_ACTION_PREFIXES: readonly string[] = ["roles:"];
const PRIVILEGE_ACTIONS: readonly string[] = ["users:manage"];

export function isPrivilegedRole(permissions: readonly { action: string }[]): boolean {
  return permissions.some(
    (p) =>
      PRIVILEGE_ACTION_PREFIXES.some((prefix) => p.action.startsWith(prefix)) ||
      PRIVILEGE_ACTIONS.includes(p.action),
  );
}

/**
 * A-01-3 (bất biến `L-A5`) — vai bị cấm neo tại `HO`/`ROOT`.
 *
 * `isHoLevel` bật chỉ cần MỘT dòng vai tại HO/ROOT (`lib/auth/actor.ts:255`), và khi đó
 * `visibleCenterIds` = **mọi** cơ sở còn sống. Neo `CENTER_MANAGER` ở HO "cho tiện" biến
 * một QLCS thành người thấy toàn hệ thống — im lặng, không thông báo gì.
 *
 * ⚠️ LUẬT ĐÃ CHUYỂN sang `lib/auth/org-anchor-rules.ts` (25/08/2026) vì nó có HAI đường
 * ghi: đường gán tay ở file này, VÀ `reconcileUserOrgRoles` (`lib/auth/org-role-sync.ts`)
 * chạy khi admin sửa ô "Đơn vị" ở /admin/users/[id]/edit hay /admin/nhan-su — đường sau
 * trước đây KHÔNG có rào nào. Re-export ở đây để `app/(admin)/admin/users/[id]/org-roles/page.tsx`
 * và mọi caller cũ không phải đổi import.
 */
export { isHoRootOrgType, roleBlockedAtHoRoot } from "@/lib/auth/org-anchor-rules";

/** Rào cho đường GÁN. Gọi SAU khi đã nạp `org` + `role` (kèm permissions) từ DB. */
function assertAssignGuards(input: {
  actor: RbacActor;
  actorIsSuper: boolean;
  targetUserId: string;
  role: { code: string; permissions: readonly { action: string }[] };
  org: { type: string };
}): void {
  const { actor, actorIsSuper, targetUserId, role, org } = input;

  // SEC-M13 (rào cũ) — giữ NGUYÊN vị trí đầu tiên để thông điệp cũ không bị R1 nuốt:
  // vai SUPER_ADMIN cũng mang `roles:*`, nên nếu R1 chạy trước thì người dùng nhận một
  // thông báo chung chung thay vì câu nói thẳng "chỉ SUPER_ADMIN gán được SUPER_ADMIN".
  if (role.code === "SUPER_ADMIN" && !actorIsSuper) {
    throw new RbacError(
      "FORBIDDEN_ROLE",
      "Chỉ SUPER_ADMIN mới được gán vai trò SUPER_ADMIN.",
      "roleId",
    );
  }

  // A-01-3 — chặn CỨNG, áp cho MỌI actor kể cả SUPER_ADMIN: user story là "SUPER_ADMIN
  // không VÔ TÌNH biến QLCS thành người thấy toàn hệ thống", nên miễn trừ cho SUPER_ADMIN
  // sẽ bỏ đúng người mà rào này bảo vệ.
  if (roleBlockedAtHoRoot(role.code) && isHoRootOrgType(org.type)) {
    throw new RbacError("ORG_TYPE_FORBIDDEN", loiNeoHoRoot(role.code, org.type), "orgUnitId");
  }

  // R1 — không nhân bản quyền cấp quyền.
  if (!actorIsSuper && isPrivilegedRole(role.permissions)) {
    throw new RbacError(
      "FORBIDDEN_PRIVILEGED_ROLE",
      `Vai ${role.code} mang quyền cấp quyền (roles:* hoặc users:manage) — chỉ SUPER_ADMIN ` +
        "mới được gán vai này.",
      "roleId",
    );
  }

  // R2 — không tự gán cho chính mình.
  // SUPER_ADMIN được miễn CÓ CHỦ ĐÍCH: lý lẽ của rào là "muốn đổi quyền của chính mình thì
  // nhờ SUPER_ADMIN" (§6.10), câu đó vô nghĩa với chính SUPER_ADMIN; và trên prod đang có
  // người vừa là QLCS vừa SUPER_ADMIN (OQ-5) — chặn cứng sẽ khoá tay họ với chính hồ sơ
  // của mình. Với actor không phải SUPER_ADMIN thì rào là tuyệt đối, kể cả vai vô hại.
  if (!actorIsSuper && targetUserId === actor.id) {
    throw new RbacError(
      "SELF_ASSIGN_FORBIDDEN",
      "Không được tự gán vai cho chính mình. Hãy nhờ SUPER_ADMIN gán giúp — việc nhạy cảm " +
        "cần hai người.",
      "userId",
    );
  }
}

/**
 * Rào cho đường THU HỒI — đối ngẫu của SEC-M13 + R1.
 *
 * Vì sao cần: thu hồi cũng là thay đổi quyền. Nếu chỉ rào đường GÁN thì mở `roles:assign`
 * cho HO_HR nghĩa là HR **hạ được** quyền của SUPER_ADMIN (gỡ dòng `UserOrgRole` của họ)
 * — đúng loại leo thang mà §6.10 muốn chặn, chỉ đi ngược chiều.
 */
function assertRevokeGuards(input: {
  actorIsSuper: boolean;
  role: { code: string; permissions: readonly { action: string }[] } | null;
}): void {
  const { actorIsSuper, role } = input;
  if (!role || actorIsSuper) return;

  if (role.code === "SUPER_ADMIN") {
    throw new RbacError(
      "FORBIDDEN_ROLE",
      "Chỉ SUPER_ADMIN mới được thu hồi vai trò SUPER_ADMIN.",
      "roleId",
    );
  }
  if (isPrivilegedRole(role.permissions)) {
    throw new RbacError(
      "FORBIDDEN_PRIVILEGED_ROLE",
      `Vai ${role.code} mang quyền cấp quyền (roles:* hoặc users:manage) — chỉ SUPER_ADMIN ` +
        "mới được thu hồi vai này.",
      "roleId",
    );
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

/**
 * SL-01 (A PRD §10.1) — nguồn gốc dòng `UserOrgRole` do đường GÁN TAY này sinh ra.
 * `reconcileUserOrgRoles` chỉ được thu hồi dòng `AUTO`; dòng gán tay phải tự khai là
 * `MANUAL`, nếu không nó nhận DEFAULT `'AUTO'` và bị một thao tác chỉ-sửa-ô-"Đơn vị"
 * thu hồi mất (chính là lỗ hổng SL-01 mô tả).
 *
 * ⚠️ Nhãn này chỉ được ĐẶT khi đường gán tay thật sự TẠO hoặc HỒI SINH một dòng — KHÔNG
 * phải mỗi lần bấm "Gán". Lý do đầy đủ ở chỗ tính `nhanNguon` trong `assignUserOrgRole`:
 * đổi nhãn của một dòng AUTO đang sống là cướp mất quyền thu hồi của `reconcileUserOrgRoles`,
 * tức hạ vai qua /admin/nhan-su hay /admin/users báo "thành công" mà quyền vẫn còn nguyên.
 */
const MANUAL_SOURCE = "MANUAL";

export async function assignUserOrgRole(
  actor: RbacActor,
  input: unknown,
): Promise<UserOrgRole> {
  // Quyền TRƯỚC: `resolveActor` chỉ đọc phân quyền của CHÍNH actor, không chạm dòng dữ
  // liệu nghiệp vụ nào.
  const resolved = await resolveActor(actor.id);
  requireAssign(actor, resolved);
  // R3 — `reason` bắt buộc (≥3 ký tự sau trim) do `assignUserOrgRoleSchema` ép
  // (`lib/validators/role.ts:16, :60`). Đặt TRƯỚC mọi truy vấn dữ liệu nghiệp vụ: thiếu
  // lý do thì không được đọc/ghi dòng org/role/user nào.
  const parsed = assignUserOrgRoleSchema.parse(input);
  const actorIsSuper = isSuperActor(actor, resolved);

  const org = await db.orgUnit.findUnique({ where: { id: parsed.orgUnitId } });
  if (!org || org.deletedAt) {
    throw new RbacError("ORG_INVALID", "Đơn vị không tồn tại hoặc đã bị xoá.", "orgUnitId");
  }
  // `permissions` là dữ liệu enforce của R1 — phải đọc từ DB tại CHÍNH chỗ chặn, không
  // được tin cờ nào client gửi lên (`listRoles()` có trả permissions nhưng đó là cho UI).
  const role = await db.roleDef.findUnique({
    where: { id: parsed.roleId },
    select: { id: true, code: true, permissions: { select: { action: true } } },
  });
  if (!role) throw new RbacError("ROLE_NOT_FOUND", "Không tìm thấy role.", "roleId");

  // SEC-M13 (cũ) + A-01-3 + R1 + R2 — xem `assertAssignGuards`.
  assertAssignGuards({
    actor,
    actorIsSuper,
    targetUserId: parsed.userId,
    role,
    org,
  });

  const user = await db.user.findUnique({ where: { id: parsed.userId }, select: { id: true } });
  if (!user) throw new RbacError("USER_NOT_FOUND", "Không tìm thấy người dùng.", "userId");

  const key = {
    userId_orgUnitId_roleId: {
      userId: parsed.userId,
      orgUnitId: parsed.orgUnitId,
      roleId: parsed.roleId,
    },
  };

  // SL-01 (vá 25/08/2026) — `source` CHỈ được đổi khi upsert thật sự HỒI SINH một dòng đã
  // hết hiệu lực.
  //
  // Bản trước ghi `source: MANUAL` ở CẢ nhánh `update`, kèm chú thích khẳng định nhánh đó
  // "hồi sinh một cặp cũ đã EXPIRED". Sai: `upsert` chạy nhánh `update` cho MỌI dòng đã tồn
  // tại ở khoá (userId, orgUnitId, roleId) — kể cả dòng đang ACTIVE do `reconcileUserOrgRoles`
  // sinh (`source = "AUTO"`). Một cú bấm "Gán" trùng cặp đã có (gia hạn / sửa nhầm / bấm cho
  // chắc) lật AUTO → MANUAL VĨNH VIỄN, và từ đó `mayThuHoiDuoc` (`lib/auth/org-role-sync.ts`)
  // KHÔNG BAO GIỜ thu hồi dòng đó nữa: hạ vai ở /admin/nhan-su hay /admin/users báo "thành
  // công", nhật ký không có dòng REVOKE, nhưng người đó đăng nhập lại VẪN là QLCS của cơ sở cũ.
  //
  // Luật mới, đúng bằng câu chú thích cũ tự nhận:
  //   • chưa có dòng          → `create`, ghi MANUAL (DEFAULT của cột là AUTO — quên là im lặng);
  //   • có dòng, CÒN hiệu lực → giữ NGUYÊN nhãn cũ (`undefined` ⇒ Prisma bỏ qua field);
  //   • có dòng, HẾT hiệu lực → hồi sinh ⇒ ghi MANUAL (người vừa nhận trách nhiệm).
  const existing = await db.userOrgRole.findUnique({
    where: key,
    select: { status: true, effectiveFrom: true, effectiveTo: true },
  });
  const conHieuLuc = existing != null && isLiveOrgRole(existing, new Date());
  const nhanNguon = conHieuLuc ? undefined : MANUAL_SOURCE;

  // US-03 chat — gán vai CENTER_MANAGER ở OrgUnit cơ sở = đổi QLCS → đồng bộ nhóm
  // lớp của cơ sở trong CÙNG transaction với upsert (F-SYNC "đổi QLCS").
  const assignment = await db.$transaction(async (tx) => {
    const row = await tx.userOrgRole.upsert({
      where: key,
      update: {
        effectiveFrom: parsed.effectiveFrom ?? new Date(),
        effectiveTo: parsed.effectiveTo ?? null,
        status: "ACTIVE",
        grantedById: actor.id,
        source: nhanNguon,
      },
      create: {
        userId: parsed.userId,
        orgUnitId: parsed.orgUnitId,
        roleId: parsed.roleId,
        effectiveFrom: parsed.effectiveFrom ?? new Date(),
        effectiveTo: parsed.effectiveTo ?? null,
        grantedById: actor.id,
        // SL-01 — DEFAULT của cột là 'AUTO'; không ghi tường minh ở đây thì mọi dòng gán
        // tay đội lốt dòng máy-sinh và SL-01 vô hiệu (prisma/schema.prisma model UserOrgRole).
        source: MANUAL_SOURCE,
      },
    });
    if (role.code === "CENTER_MANAGER" && org.centerId) {
      await syncCenterClassConversations(tx, org.centerId);
    }
    return row;
  }, { timeout: 30_000, maxWait: 10_000 });

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
  const resolved = await resolveActor(actor.id);
  requireAssign(actor, resolved);
  // R3 — `reason` bắt buộc cho cả đường thu hồi (`lib/validators/role.ts:72`).
  const parsed = revokeUserOrgRoleSchema.parse(input);
  const actorIsSuper = isSuperActor(actor, resolved);
  const key = {
    userId_orgUnitId_roleId: {
      userId: parsed.userId,
      orgUnitId: parsed.orgUnitId,
      roleId: parsed.roleId,
    },
  };

  // Nạp `role` (kèm permissions) + `org` TRƯỚC khi đụng dòng phân quyền: `role` vừa là dữ
  // liệu enforce của rào thu hồi, vừa là thứ quyết định có đồng bộ nhóm chat hay không.
  // US-03 chat — thu hồi vai CENTER_MANAGER ở OrgUnit cơ sở = đổi QLCS → đồng bộ nhóm
  // lớp của cơ sở trong CÙNG transaction với update (F-SYNC "đổi QLCS").
  const [role, org] = await Promise.all([
    db.roleDef.findUnique({
      where: { id: parsed.roleId },
      select: { code: true, permissions: { select: { action: true } } },
    }),
    db.orgUnit.findUnique({ where: { id: parsed.orgUnitId }, select: { centerId: true } }),
  ]);
  // Đối ngẫu SEC-M13 + R1 — xem `assertRevokeGuards`.
  assertRevokeGuards({ actorIsSuper, role });

  const existing = await db.userOrgRole.findUnique({ where: key });
  if (!existing) throw new RbacError("ASSIGNMENT_NOT_FOUND", "Không tìm thấy phân quyền.", "roleId");

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.userOrgRole.update({
      where: key,
      data: { status: "EXPIRED", effectiveTo: new Date() },
    });
    if (role?.code === "CENTER_MANAGER" && org?.centerId) {
      await syncCenterClassConversations(tx, org.centerId);
    }
    return row;
  }, { timeout: 30_000, maxWait: 10_000 });
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
