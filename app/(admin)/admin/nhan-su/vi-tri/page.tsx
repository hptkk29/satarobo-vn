// P2 · US-08 — MÀN QUẢN TRỊ VỊ TRÍ CÔNG VIỆC.
//
// Cổng `roles:manage` (chỉ SUPER_ADMIN): vị trí mang bộ vai trò, nên sửa vị trí = sửa
// quyền của mọi người đang giữ nó. Cùng hạng nguy hiểm với sửa RoleDef.
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { ViTriEditor } from "./_components/vi-tri-editor";

export const dynamic = "force-dynamic";

export default async function ViTriPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("roles:manage"))) redirect("/dashboard?error=unauthorized");

  // `scopedDb` chứ không `db` trần (luật R6-F1). Ba model mới KHÔNG nằm trong
  // SCOPED_MODELS nên đi qua đây không bị lọc — vị trí là dữ liệu tổ chức mức hệ thống.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const [positions, orgUnits, roles] = await Promise.all([
    sdb.position.findMany({
      where: { deletedAt: null },
      orderBy: [{ isActive: "desc" }, { title: "asc" }],
      select: {
        id: true,
        title: true,
        orgUnitId: true,
        isManagerial: true,
        isActive: true,
        reportsToPositionId: true,
        roles: { select: { roleId: true } },
        _count: { select: { assignments: true } },
      },
    }),
    sdb.orgUnit.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true, type: true },
    }),
    sdb.roleDef.findMany({
      where: { isActive: true },
      orderBy: { code: "asc" },
      select: { id: true, code: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Vị trí công việc</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Quyền gắn vào <strong>vị trí</strong>, không gắn vào người. Người nghỉ thì gỡ phân
          công — vị trí giữ nguyên bộ quyền cho người kế nhiệm. Cây báo cáo
          (&ldquo;báo cáo cho&rdquo;) là cây riêng, dùng cho luồng duyệt, không dùng để tính
          phạm vi dữ liệu.
        </p>
      </div>

      <ViTriEditor
        positions={positions.map((p) => ({
          id: p.id,
          title: p.title,
          orgUnitId: p.orgUnitId,
          isManagerial: p.isManagerial,
          isActive: p.isActive,
          reportsToPositionId: p.reportsToPositionId,
          roleIds: p.roles.map((r) => r.roleId),
          soNguoiGiu: p._count.assignments,
        }))}
        orgUnits={orgUnits}
        roles={roles}
      />
    </div>
  );
}
