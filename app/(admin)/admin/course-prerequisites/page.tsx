import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Workflow } from "lucide-react";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { PrerequisiteEditor } from "./_components/prerequisite-editor";

export const metadata = { title: "Khoá tiên quyết | Admin" };
export const dynamic = "force-dynamic";

export default async function CoursePrerequisitesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "courses:create")) redirect("/dashboard");

  const courses = await db.course.findMany({
    where: { isActive: true },
    orderBy: { displayOrder: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      prerequisites: {
        select: {
          id: true,
          requiredCourse: { select: { id: true, name: true, code: true } },
        },
      },
    },
  });

  const courseOptions = courses.map((c) => ({ id: c.id, name: c.name, code: c.code }));

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Workflow className="h-6 w-6 text-[#7C3AED]" />
          Khoá tiên quyết
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Cấu hình khoá phải hoàn thành trước khi đăng ký. Khi đăng ký học viên vào lớp,
          hệ thống kiểm tra học viên đã hoàn thành (trạng thái “Hoàn thành”) các khoá yêu cầu.
        </p>
      </div>

      {courses.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Chưa có khoá học nào.
        </p>
      ) : (
        <div className="space-y-4">
          {courses.map((c) => (
            <section key={c.id} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="font-semibold text-gray-900">
                  {c.name}
                  {c.code && <span className="ml-2 text-xs text-gray-400">({c.code})</span>}
                </h2>
              </div>
              <PrerequisiteEditor
                courseId={c.id}
                existing={c.prerequisites.map((p) => ({
                  id: p.id,
                  requiredCourseId: p.requiredCourse.id,
                  label: p.requiredCourse.code
                    ? `${p.requiredCourse.code} · ${p.requiredCourse.name}`
                    : p.requiredCourse.name,
                }))}
                options={courseOptions
                  .filter((o) => o.id !== c.id)
                  .map((o) => ({
                    id: o.id,
                    label: o.code ? `${o.code} · ${o.name}` : o.name,
                  }))}
              />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
