import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { EmployeeForm } from "@/components/admin/nhan-su/employee-form";
import {
  ChangeRoleDialog,
  ROLE_LABEL,
  type Role,
} from "@/components/admin/nhan-su/change-role-dialog";
import { UserAccountSection } from "./_components/user-account-section";

export const metadata = { title: "Sửa nhân sự | Admin" };

const TEACHING_DEPARTMENTS = new Set<string>(["GIANG_DAY", "DAO_TAO"]);

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditEmployeePage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "employees:edit")) redirect("/dashboard");

  const { id } = await params;
  const employee = await db.employee.findUnique({
    where: { id },
    include: {
      userAccount: {
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          _count: { select: { permissionGrants: true } },
        },
      },
    },
  });
  if (!employee) notFound();

  const canManageUsers = can(session.user, "users:manage");

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

  const isSuperAdmin = session.user.role === "SUPER_ADMIN";
  const canViewAudit = ["SUPER_ADMIN", "CENTER_MANAGER"].includes(session.user.role);
  const showScheduleLink = TEACHING_DEPARTMENTS.has(employee.department);

  const auditLogs = canViewAudit
    ? await db.roleAuditLog.findMany({
        where: { employeeId: id },
        orderBy: { createdAt: "desc" },
        take: 20,
      })
    : [];

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sửa: {employee.fullName}</h1>
          <p className="mt-1 text-sm text-gray-500 font-mono">{employee.employeeCode}</p>
          {employee.userAccount && (
            <p className="mt-1 text-xs text-gray-500">
              User: {employee.userAccount.email} · Vai trò hiện tại:{" "}
              <strong className="text-gray-700">
                {ROLE_LABEL[employee.userAccount.role as Role] ?? employee.userAccount.role}
              </strong>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && employee.userAccount && (
            <ChangeRoleDialog
              employeeId={employee.id}
              employeeName={employee.fullName}
              currentRole={employee.userAccount.role as Role}
            />
          )}
          {showScheduleLink && (
            <Link
              href={`/nhan-su/${id}/schedule`}
              className="inline-flex items-center gap-2 rounded-lg border-2 border-orange-200 bg-white px-4 py-2 text-sm font-bold text-orange-600 hover:bg-orange-50"
            >
              <CalendarDays className="h-4 w-4" />
              Xem lịch dạy
            </Link>
          )}
        </div>
      </div>

      <EmployeeForm
        mode="edit"
        initial={employee}
        centers={centers}
        managers={managers}
        userRole={session.user.role}
      />

      {canManageUsers && (
        <UserAccountSection
          employeeId={employee.id}
          employeeName={employee.fullName}
          existingUser={employee.userAccount}
        />
      )}

      {canViewAudit && auditLogs.length > 0 && (
        <section className="mt-8 border-t pt-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-900">
            Lịch sử thay đổi vai trò
          </h2>
          <div className="space-y-2">
            {auditLogs.map((log) => (
              <div
                key={log.id}
                className="border-l-2 border-amber-400 pl-3 py-2 bg-amber-50/50 rounded-r"
              >
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-medium text-gray-700">
                    {ROLE_LABEL[log.fromRole as Role] ?? log.fromRole}
                  </span>
                  <span className="text-gray-400">→</span>
                  <span className="font-semibold text-amber-700">
                    {ROLE_LABEL[log.toRole as Role] ?? log.toRole}
                  </span>
                  <span className="text-xs text-gray-500 ml-auto">
                    {new Date(log.createdAt).toLocaleString("vi-VN")}
                  </span>
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Bởi: <strong>{log.changedByName}</strong>
                </div>
                {log.reason && (
                  <div className="text-xs text-gray-700 mt-1 italic">
                    &ldquo;{log.reason}&rdquo;
                  </div>
                )}
              </div>
            ))}
          </div>
          {auditLogs.length === 20 && (
            <p className="text-xs text-gray-500 mt-2">
              Hiển thị 20 thay đổi gần nhất.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
