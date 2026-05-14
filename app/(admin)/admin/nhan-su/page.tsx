import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { EmployeesAdminTable } from "@/components/admin/nhan-su/employees-admin-table";
import type { Department } from "@prisma/client";

export const metadata = { title: "Quản lý nhân sự | Admin" };

const DEPARTMENTS: Department[] = [
  "BAN_GIAM_DOC",
  "DAO_TAO",
  "MARKETING",
  "KINH_DOANH",
  "IT",
  "HANH_CHANH_NHAN_SU",
  "KE_TOAN",
];

interface PageProps {
  searchParams: Promise<{ department?: string; active?: string }>;
}

export default async function EmployeesAdminPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  if (!can(session.user.role, "employees:view-all")) {
    redirect("/admin/dashboard");
  }

  const params = await searchParams;
  const where: { department?: Department; isActive?: boolean } = {};
  if (params.department && DEPARTMENTS.includes(params.department as Department)) {
    where.department = params.department as Department;
  }
  if (params.active === "true") where.isActive = true;
  if (params.active === "false") where.isActive = false;

  const [employees, departmentCounts] = await Promise.all([
    db.employee.findMany({
      where,
      orderBy: [{ displayOrder: "asc" }, { fullName: "asc" }],
      include: {
        center: { select: { name: true } },
        manager: { select: { fullName: true } },
        _count: { select: { honors: true } },
      },
    }),
    db.employee.groupBy({
      by: ["department"],
      _count: { id: true },
      where: { isActive: true },
    }),
  ]);

  const canCreate = can(session.user.role, "employees:create");
  const canDelete = can(session.user.role, "employees:delete");

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý nhân sự</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tổng {employees.length} nhân sự
            {params.department && ` · ${params.department.replace(/_/g, " ")}`}
            {params.active === "false" && " · đã nghỉ"}
          </p>
        </div>
        {canCreate && (
          <Link
            href="/admin/nhan-su/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Thêm nhân sự
          </Link>
        )}
      </div>

      {/* Department filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/admin/nhan-su"
          className={`rounded-full px-3 py-1 text-xs font-semibold ${
            !params.department ? "bg-[#7C3AED] text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          Tất cả
        </Link>
        {departmentCounts.map((d) => (
          <Link
            key={d.department}
            href={`/admin/nhan-su?department=${d.department}`}
            className={`rounded-full px-3 py-1 text-xs font-semibold ${
              params.department === d.department
                ? "bg-[#7C3AED] text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {d.department.replace(/_/g, " ")} ({d._count.id})
          </Link>
        ))}
      </div>

      <EmployeesAdminTable employees={employees} canDelete={canDelete} />
    </div>
  );
}
