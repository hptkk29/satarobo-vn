import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import Link from "next/link";
import { Plus } from "lucide-react";
import { HonorsAdminTable } from "@/components/admin/honors/honors-admin-table";

export const metadata = { title: "Quản lý Hall of Fame | Admin" };

export default async function HonorsAdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!["SUPER_ADMIN", "CENTER_MANAGER"].includes(session.user.role)) {
    redirect("/dashboard");
  }

  const honors = await db.honor.findMany({
    orderBy: [{ displayOrder: "asc" }, { awardedAt: "desc" }],
    include: { createdBy: { select: { name: true } } },
  });

  const canDelete = session.user.role === "SUPER_ADMIN";

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Hall of Fame</h1>
          <p className="mt-1 text-sm text-gray-500">{honors.length} nhân sự được vinh danh</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/honors/timeline"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Timeline
          </Link>
          <Link
            href="/honors/settings"
            className="inline-flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cài đặt trang
          </Link>
          <Link
            href="/honors/new"
            className="inline-flex items-center gap-2 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Thêm nhân sự
          </Link>
        </div>
      </div>

      <HonorsAdminTable honors={honors} canDelete={canDelete} />
    </div>
  );
}
