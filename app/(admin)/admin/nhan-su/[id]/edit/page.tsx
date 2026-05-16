import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { EmployeeForm } from "@/components/admin/nhan-su/employee-form";

export const metadata = { title: "Sửa nhân sự | Admin" };

const TEACHING_DEPARTMENTS = new Set<string>(["GIANG_DAY", "DAO_TAO"]);

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

  const showScheduleLink = TEACHING_DEPARTMENTS.has(employee.department);

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sửa: {employee.fullName}</h1>
          <p className="mt-1 text-sm text-gray-500 font-mono">{employee.employeeCode}</p>
        </div>
        {showScheduleLink && (
          <Link
            href={`/admin/nhan-su/${id}/schedule`}
            className="inline-flex items-center gap-2 rounded-lg border-2 border-orange-200 bg-white px-4 py-2 text-sm font-bold text-orange-600 hover:bg-orange-50"
          >
            <CalendarDays className="h-4 w-4" />
            Xem lịch dạy
          </Link>
        )}
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
