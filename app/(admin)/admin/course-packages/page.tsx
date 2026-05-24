import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { PackageListRow } from "./_components/package-list-row";

function canManageCoursePackages(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "MANAGER";
}

export default async function CoursePackagesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!canManageCoursePackages(session.user.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const packages = await db.coursePackage.findMany({
    orderBy: [{ displayOrder: "asc" }, { code: "asc" }],
    select: {
      id: true,
      slug: true,
      code: true,
      name: true,
      level: true,
      lessons: true,
      priceOriginal: true,
      isPublished: true,
      isFeatured: true,
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Course Packages</h1>
          <p className="mt-1 text-sm text-gray-500">
            Quan ly cac goi khoa hoc Sata1-8 va Combo
          </p>
        </div>
        <Link
          href="/course-packages/new"
          className="inline-flex items-center gap-2 rounded-lg bg-[#F7941D] px-4 py-2 text-sm font-semibold text-white hover:bg-[#e58510]"
        >
          <Plus className="h-4 w-4" />
          Them Package
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Name
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Level
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Price
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Lessons
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Status
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {packages.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">
                    Chua co package nao
                  </td>
                </tr>
              ) : (
                packages.map((pkg) => <PackageListRow key={pkg.id} pkg={pkg} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
