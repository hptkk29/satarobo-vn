import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { KeyRound, ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import {
  isHoRootOrgType,
  isPrivilegedRole,
  laSuperAdminActor,
  listRoles,
  listUserOrgRoles,
  roleBlockedAtHoRoot,
} from "@/lib/auth/rbac-service";
import { OrgRolesManager } from "./_components/org-roles-manager";

export const metadata = { title: "Vai trò theo đơn vị | Admin" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function UserOrgRolesPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("roles:assign"))) {
    redirect("/dashboard?error=unauthorized");
  }

  // User + OrgUnit đều SCOPE_EXEMPT (identity/hạ tầng tổ chức) → sdb pass-through.
  const viewer = await resolveActor(session.user.id);
  const sdb = scopedDb(viewer);

  const user = await sdb.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true },
  });
  if (!user) notFound();

  const [roles, orgUnits, assignments, target] = await Promise.all([
    listRoles(),
    // `type` là dữ liệu của A-01-3: dropdown cần biết đơn vị nào là HO/ROOT để giải thích
    // vì sao lựa chọn bị khoá. Giữ nguyên việc liệt kê MỌI type — §6.1 cần neo được cả
    // REGION cho các cơ sở cùng vùng.
    sdb.orgUnit.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, type: true },
    }),
    listUserOrgRoles(id),
    // A-01-4 — tầm nhìn SUY RA của người ĐANG ĐƯỢC PHÂN VAI (không phải của người mở trang).
    // `resolveActor` là cache() theo request và khoá theo userId nên gọi với id khác actor
    // không đụng cache của viewer.
    resolveActor(id),
  ]);

  const roleById = new Map(roles.map((r) => [r.id, r.code]));
  const orgById = new Map(orgUnits.map((o) => [o.id, o.code]));

  const rows = assignments.map((a) => ({
    orgUnitId: a.orgUnitId,
    roleId: a.roleId,
    orgCode: orgById.get(a.orgUnitId) ?? a.orgUnitId,
    roleCode: roleById.get(a.roleId) ?? a.roleId,
    status: a.status,
    effectiveFrom: a.effectiveFrom.toISOString(),
    effectiveTo: a.effectiveTo ? a.effectiveTo.toISOString() : null,
  }));

  return (
    <div>
      <Link
        href={`/users/${user.id}/edit`}
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" />
        Về hồ sơ tài khoản
      </Link>
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-black text-foreground">
          <KeyRound className="h-7 w-7 text-primary" />
          Vai trò theo đơn vị
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.name ?? user.email} — gán vai trò (RoleDef) theo từng OrgUnit. Mọi
          thay đổi yêu cầu lý do và được ghi nhật ký.
        </p>
      </div>

      <OrgRolesManager
        userId={user.id}
        viewerUserId={session.user.id}
        // MỘT định nghĩa "ai là SUPER_ADMIN" dùng chung với `assertAssignGuards` ở server
        // (`lib/auth/rbac-service.ts`). Trước đây UI đọc `viewer.isSuperAdmin` (v2/DB) còn
        // server đọc `session.user.role` (legacy) ⇒ hai bên nói ngược nhau được: UI mở khoá
        // một lựa chọn mà server từ chối, hoặc khoá thứ server cho phép.
        viewerIsSuperAdmin={laSuperAdminActor({
          role: session.user.role,
          roles: session.user.roles,
          resolved: viewer,
        })}
        soCoSoDangGiu={target.visibleCenterIds.length}
        targetIsHoLevel={target.isHoLevel}
        // Hai cờ dưới do SERVER suy ra từ đúng hàm mà `assignUserOrgRole` dùng để chặn —
        // client chỉ AND hai boolean, không tự định nghĩa lại rào. Đây là lớp GIẢI THÍCH:
        // enforce thật nằm ở `assertAssignGuards` (lib/auth/rbac-service.ts).
        roles={roles.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          capQuyen: isPrivilegedRole(r.permissions),
          chanTaiHoRoot: roleBlockedAtHoRoot(r.code),
        }))}
        orgUnits={orgUnits.map((o) => ({
          id: o.id,
          code: o.code,
          name: o.name,
          laHoRoot: isHoRootOrgType(o.type),
        }))}
        assignments={rows}
      />
    </div>
  );
}
