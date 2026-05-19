import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Plus, KeyRound } from "lucide-react";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { RoleBadge } from "./_components/role-badge";
import {
  UserStatusToggle,
  UserRowActions,
} from "./_components/user-row-actions";

export const metadata = { title: "Tài khoản đăng nhập | Admin" };
export const dynamic = "force-dynamic";

function formatLogin(date: Date | null): string {
  if (!date) return "Chưa đăng nhập";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function UsersAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "users:manage")) {
    redirect("/admin/dashboard?error=unauthorized");
  }

  const users = await db.user.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true } },
      center: { select: { name: true } },
    },
  });

  // Đếm SUPER_ADMIN active để disable nút toggle/role-change nếu chỉ còn 1
  const activeSuperAdminCount = users.filter(
    (u) => u.role === "SUPER_ADMIN" && u.isActive,
  ).length;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Tài khoản đăng nhập
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {users.length} tài khoản · chỉ SUPER_ADMIN có quyền quản lý
          </p>
        </div>
        <Link
          href="/admin/users/new"
          className="inline-flex items-center gap-1.5 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Tạo tài khoản mới
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Email
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Tên
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Role
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Nhân sự
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Cơ sở
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Trạng thái
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Đăng nhập cuối
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    Chưa có tài khoản nào
                  </td>
                </tr>
              ) : (
                users.map((u) => {
                  const isSelf = u.id === session.user.id;
                  const isLastActiveSuperAdmin =
                    u.role === "SUPER_ADMIN" &&
                    u.isActive &&
                    activeSuperAdminCount === 1;
                  const toggleDisabled = isSelf || isLastActiveSuperAdmin;
                  const toggleReason = isSelf
                    ? "Không thể tự disable chính mình"
                    : isLastActiveSuperAdmin
                      ? "Không thể disable SUPER_ADMIN duy nhất"
                      : undefined;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/users/${u.id}/edit`}
                          className="font-medium text-gray-900 hover:text-orange-600"
                        >
                          {u.email}
                        </Link>
                        {isSelf && (
                          <span className="ml-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                            BẠN
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {u.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <RoleBadge role={u.role} />
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {u.employee ? (
                          <Link
                            href={`/admin/nhan-su/${u.employee.id}`}
                            className="text-orange-600 hover:underline"
                          >
                            {u.employee.fullName}
                            {u.employee.employeeCode && (
                              <span className="ml-1 text-xs text-gray-400">
                                · {u.employee.employeeCode}
                              </span>
                            )}
                          </Link>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {u.center?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <UserStatusToggle
                          userId={u.id}
                          isActive={u.isActive}
                          disabled={toggleDisabled}
                          disabledReason={toggleReason}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs tabular-nums text-gray-500">
                        {formatLogin(u.lastLoginAt)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <UserRowActions userId={u.id} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-900">
        <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div>
          <strong>Lưu ý bảo mật:</strong> Khi đổi role hoặc reset password hoặc
          disable user → `tokenVersion` tự tăng → user đó bị đăng xuất khỏi
          mọi thiết bị ở request kế tiếp.
        </div>
      </div>
    </div>
  );
}
