import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { UserForm } from "../_components/user-form";

export const metadata = { title: "Tạo tài khoản mới | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ employeeId?: string }>;
}

export default async function NewUserPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "users:manage")) {
    redirect("/admin/dashboard?error=unauthorized");
  }

  const { employeeId: prefillEmployeeId } = await searchParams;

  // Nếu có ?employeeId=... → pre-fill from employee. Nếu employee đó đã có
  // user account → redirect về trang edit user đó (W2 idempotent).
  let prefillData:
    | {
        name?: string | null;
        email?: string;
        employeeId?: string;
      }
    | undefined;

  if (prefillEmployeeId) {
    const emp = await db.employee.findUnique({
      where: { id: prefillEmployeeId },
      select: {
        id: true,
        fullName: true,
        email: true,
        employeeCode: true,
        userAccount: { select: { id: true } },
      },
    });

    if (emp?.userAccount) {
      redirect(`/admin/users/${emp.userAccount.id}/edit`);
    }

    if (emp) {
      prefillData = {
        name: emp.fullName,
        email: emp.email ?? undefined,
        employeeId: emp.id,
      };
    }
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
        {prefillData && (
          <p className="mt-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            Đã tự điền từ nhân sự: {prefillData.name}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <UserForm
          mode="create"
          centers={centers}
          employees={unlinkedEmployees}
          initialData={prefillData}
        />
      </div>
    </div>
  );
}
