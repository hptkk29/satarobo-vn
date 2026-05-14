import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { HonorForm } from "@/components/admin/honors/honor-form";

export const metadata = { title: "Thêm vinh danh | Hall of Fame" };

export default async function NewHonorPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "honors:create")) redirect("/admin/dashboard");

  const employees = await db.employee.findMany({
    where: { isActive: true },
    orderBy: [{ department: "asc" }, { fullName: "asc" }],
    select: {
      id: true,
      employeeCode: true,
      fullName: true,
      jobTitle: true,
      department: true,
      avatarUrl: true,
      joinedAt: true,
    },
  });

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Thêm vinh danh</h1>
        <p className="mt-1 text-sm text-gray-500">
          Chọn nhân sự từ danh sách, điền giải thưởng + câu chuyện. Chưa có nhân sự?{" "}
          <Link
            href="/admin/nhan-su/new"
            className="text-orange-600 hover:underline"
          >
            Thêm nhân sự mới
          </Link>
          .
        </p>
      </div>

      <HonorForm mode="create" employees={employees} />
    </div>
  );
}
