import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { EmployeeForm } from "@/components/admin/nhan-su/employee-form";

export const metadata = { title: "Sửa nhân sự | Admin" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditEmployeePage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "employees:edit")) redirect("/admin/dashboard");

  const { id } = await params;
  const employee = await db.employee.findUnique({ where: { id } });
  if (!employee) notFound();

  const [centers, managers] = await Promise.all([
    db.center.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.employee.findMany({
      where: { isActive: true, NOT: { id } },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, jobTitle: true },
    }),
  ]);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Sửa: {employee.fullName}</h1>
        <p className="mt-1 text-sm text-gray-500 font-mono">{employee.employeeCode}</p>
      </div>

      <EmployeeForm
        mode="edit"
        initial={employee}
        centers={centers}
        managers={managers}
        userRole={session.user.role}
      />
    </div>
  );
}
