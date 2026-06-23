import { auth } from "@/lib/auth";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PackageForm } from "../_components/package-form";
import { can } from "@/lib/auth/permissions";

export default async function NewPackagePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "course-packages:edit")) {
    redirect("/dashboard?error=unauthorized");
  }

  // FL1-05 — khoá dạy để liên kết (Course là catalog toàn hệ thống, không center-scope;
  // đi qua scopedDb theo rule R6-F1, Course không bị scope nên hành vi không đổi).
  const sdb = scopedDb(await resolveActor(session.user.id));
  const courses = await sdb.course.findMany({
    where: { isActive: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, code: true, slug: true },
  });

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/course-packages"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Quay lai
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Thêm gói khoá học</h1>
      </div>

      <PackageForm courses={courses} />
    </div>
  );
}
