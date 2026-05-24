import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, KeyRound, Power, Shield, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { UserForm } from "../../_components/user-form";
import { toggleUserActiveAction } from "../../_actions";

export const metadata = { title: "Sửa tài khoản | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default async function EditUserPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "users:manage")) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;
  const user = await db.user.findFirst({
    where: { id, deletedAt: null },
    include: {
      employee: { select: { id: true, fullName: true, employeeCode: true } },
      center: { select: { id: true, name: true } },
      _count: { select: { permissionGrants: true } },
    },
  });
  if (!user) notFound();

  const [centers, unlinkedEmployees] = await Promise.all([
    db.center.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.employee.findMany({
      where: { status: "ACTIVE", userAccount: null },
      orderBy: { fullName: "asc" },
      select: { id: true, fullName: true, employeeCode: true },
    }),
  ]);

  // Hợp nhất unlinkedEmployees + current employee (nếu có) → dropdown có thể
  // giữ lựa chọn hiện tại.
  const employees = user.employee
    ? [user.employee, ...unlinkedEmployees].filter(
        (e, i, arr) => arr.findIndex((x) => x.id === e.id) === i,
      )
    : unlinkedEmployees;

  const isSelf = user.id === session.user.id;

  // Last active SUPER_ADMIN protection mirror với list page
  const activeSuperAdminCount = await db.user.count({
    where: { role: "SUPER_ADMIN", isActive: true, deletedAt: null },
  });
  const isLastActiveSuperAdmin =
    user.role === "SUPER_ADMIN" &&
    user.isActive &&
    activeSuperAdminCount === 1;

  return (
    <div className="max-w-3xl">
      <Link
        href="/users"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{user.email}</h1>
        <p className="mt-1 text-sm text-gray-500">
          {user.name ?? "—"}
          {isSelf && (
            <span className="ml-2 inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              ĐÂY LÀ BẠN
            </span>
          )}
        </p>
      </div>

      {/* Form */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <UserForm
          mode="edit"
          initialData={{
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            centerId: user.centerId,
            employeeId: user.employeeId,
          }}
          centers={centers}
          employees={employees}
        />
      </div>

      {/* Thông tin hệ thống — readonly */}
      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50/50 p-5 text-sm">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">
          Thông tin hệ thống
        </h2>
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-gray-500">Ngày tạo</dt>
            <dd className="mt-0.5 tabular-nums text-gray-800">
              {formatDate(user.createdAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Lần đăng nhập cuối</dt>
            <dd className="mt-0.5 tabular-nums text-gray-800">
              {formatDate(user.lastLoginAt)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Token version</dt>
            <dd className="mt-0.5 font-mono text-xs text-gray-700">
              {user.tokenVersion}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-gray-500">Trạng thái</dt>
            <dd className="mt-0.5">
              {user.isActive ? (
                <span className="inline-flex rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
                  Hoạt động
                </span>
              ) : (
                <span className="inline-flex rounded-full bg-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  Đã disable
                </span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Phân quyền nâng cao — Phase 5.3.2 */}
      <div className="mt-6 rounded-xl border border-purple-200 bg-purple-50/30 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-purple-700">
              <Shield className="h-4 w-4" />
              Phân quyền nâng cao
            </h2>
            <p className="mt-2 text-sm text-gray-700">
              Cấp (ALLOW) hoặc thu hồi (DENY) một quyền cụ thể bất kể role.
              {user._count.permissionGrants > 0 ? (
                <>
                  {" "}User này đang có{" "}
                  <strong className="text-purple-700">
                    {user._count.permissionGrants} override
                  </strong>
                  .
                </>
              ) : (
                <> User này chưa có override nào — đang dùng quyền mặc định theo role.</>
              )}
            </p>
          </div>
          <Link
            href={`/users/${user.id}/permissions`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-purple-300 bg-white px-4 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-50"
          >
            Quản lý
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {/* Nguy hiểm: reset password + toggle disable */}
      <div className="mt-6 rounded-xl border-2 border-red-200 bg-red-50/40 p-5">
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-red-700">
          Hành động nhạy cảm
        </h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            href={`/users/${user.id}/reset-password`}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-orange-300 bg-white px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-50"
          >
            <KeyRound className="h-4 w-4" />
            Đổi mật khẩu
          </Link>

          <form
            action={async () => {
              "use server";
              await toggleUserActiveAction(user.id);
            }}
          >
            <button
              type="submit"
              disabled={isSelf || isLastActiveSuperAdmin}
              title={
                isSelf
                  ? "Không thể tự disable chính mình"
                  : isLastActiveSuperAdmin
                    ? "Không thể disable SUPER_ADMIN duy nhất"
                    : undefined
              }
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Power className="h-4 w-4" />
              {user.isActive ? "Disable tài khoản" : "Kích hoạt lại"}
            </button>
          </form>
        </div>
        <p className="mt-3 text-xs text-red-700/80">
          ⚠️ Cả 2 thao tác sẽ tăng tokenVersion → user đó bị đăng xuất khỏi
          mọi thiết bị ở request kế tiếp.
        </p>
      </div>
    </div>
  );
}
