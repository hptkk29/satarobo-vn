import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { checkPermission } from "@/lib/auth/check-permission";
import { CurriculumForm } from "../_components/curriculum-form";

export const dynamic = "force-dynamic";

export default async function NewCurriculumPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("curriculum:create"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const courses = await db.course.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/curriculums"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">Thêm giáo trình mới</h1>
      </div>

      {courses.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Chưa có khoá học. Tạo khoá học trước tại{" "}
          <Link
            href="/courses"
            className="font-semibold underline hover:text-amber-900"
          >
            /admin/courses
          </Link>
          .
        </div>
      ) : (
        <CurriculumForm courses={courses} />
      )}
    </div>
  );
}
