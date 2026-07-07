import { notFound, redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { listRoles, listUserOrgRoles } from "@/lib/auth/rbac-service";
import { OrgRolesManager } from "./_components/org-roles-manager";

export const metadata = { title: "Vai trò theo đơn vị | Admin" };
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export default async function UserOrgRolesPage({ params }: Props) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("roles:assign"))) {
    redirect("/admin/dashboard");
  }

  // User + OrgUnit đều SCOPE_EXEMPT (identity/hạ tầng tổ chức) → sdb pass-through.
  const sdb = scopedDb(await resolveActor(session.user.id));

  const user = await sdb.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true },
  });
  if (!user) notFound();

  const [roles, orgUnits, assignments] = await Promise.all([
    listRoles(),
    sdb.orgUnit.findMany({
      where: { deletedAt: null },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
    listUserOrgRoles(id),
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
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-black text-neutral-900">
          <KeyRound className="h-7 w-7 text-orange-500" />
          Vai trò theo đơn vị
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {user.name ?? user.email} — gán vai trò (RoleDef) theo từng OrgUnit. Mọi
          thay đổi yêu cầu lý do và được ghi nhật ký.
        </p>
      </div>

      <OrgRolesManager
        userId={user.id}
        roles={roles.map((r) => ({ id: r.id, code: r.code, name: r.name }))}
        orgUnits={orgUnits}
        assignments={rows}
      />
    </div>
  );
}
