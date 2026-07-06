import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { getSelectableOrgUnits } from "@/lib/org/org-service";
import { EmployeeForm } from "@/components/admin/nhan-su/employee-form";

export const metadata = { title: "Thêm nhân sự | Admin" };

export default async function NewEmployeePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("employees:create"))) redirect("/dashboard");

  // Tính next employee code (SR.NV.001, SR.NV.002, ...)
  const lastEmployee = await db.employee.findFirst({
    where: { employeeCode: { startsWith: "SR.NV." } },
    orderBy: { employeeCode: "desc" },
  });

  let nextCode = "SR.NV.001";
  if (lastEmployee) {
    const match = lastEmployee.employeeCode.match(/SR\.NV\.E?(\d+)/);
    if (match) {
      const num = parseInt(match[1]) + 1;
      nextCode = `SR.NV.${String(num).padStart(3, "0")}`;
    }
  }

  const actor = await resolveActor(session.user.id);
  const [orgUnits, managers, departments] = await Promise.all([
    getSelectableOrgUnits(actor),
    db.employee.findMany({
      where: { isActive: true },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, jobTitle: true },
    }),
    db.departmentDef.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { code: true, name: true, isTeaching: true },
    }),
  ]);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Thêm nhân sự mới</h1>
        <p className="mt-1 text-sm text-gray-500">
          Mã NV tự động đề xuất: <code className="font-mono">{nextCode}</code>
        </p>
      </div>

      <EmployeeForm
        mode="create"
        defaultCode={nextCode}
        orgUnits={orgUnits.map((o) => ({ id: o.orgUnitId, name: o.name }))}
        managers={managers}
        departments={departments}
        userRole={session.user.role}
      />
    </div>
  );
}
