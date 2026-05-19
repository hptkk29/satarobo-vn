import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { UserForm } from "../_components/user-form";

export const metadata = { title: "Tạo tài khoản mới | Admin" };
export const dynamic = "force-dynamic";

export default async function NewUserPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "users:manage")) {
    redirect("/admin/dashboard?error=unauthorized");
  }

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

  return (
    <div className="max-w-3xl">
      <Link
        href="/admin/users"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Quay lại danh sách
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tạo tài khoản mới</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tài khoản cho phép nhân viên đăng nhập admin panel.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <UserForm
          mode="create"
          centers={centers}
          employees={unlinkedEmployees}
        />
      </div>
    </div>
  );
}
