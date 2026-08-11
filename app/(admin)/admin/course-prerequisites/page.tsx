import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { Workflow } from "lucide-react";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { checkPermission } from "@/lib/auth/check-permission";
import { PrerequisitesManager } from "./_components/prerequisites-manager";

export const metadata = { title: "Khoá tiên quyết | Admin" };
export const dynamic = "force-dynamic";

function label(c: { name: string; code: string | null }): string {
  return c.code ? `${c.code} · ${c.name}` : c.name;
}

export default async function CoursePrerequisitesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("courses:create"))) redirect("/dashboard");

  // Nhóm 01 L1 — Course/CoursePrerequisite = catalog LMS toàn cục, scopedDb pass-through.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const [allCourses, withPrereqs] = await Promise.all([
    sdb.course.findMany({
      where: { isActive: true, isTeachable: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true, code: true },
    }),
    sdb.course.findMany({
      where: { isActive: true, prerequisites: { some: {} } },
      orderBy: { displayOrder: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        prerequisites: {
          select: { requiredCourse: { select: { id: true, name: true, code: true } } },
        },
      },
    }),
  ]);

  const rows = withPrereqs.map((c) => ({
    courseId: c.id,
    courseLabel: label(c),
    prereqs: c.prerequisites.map((p) => ({ id: p.requiredCourse.id, label: label(p.requiredCourse) })),
  }));

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <Workflow className="h-6 w-6 text-primary" />
          Khoá tiên quyết
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Khoá phải hoàn thành trước khi đăng ký. Khi đăng ký học viên vào lớp, hệ thống chặn
          nếu học viên chưa hoàn thành (trạng thái “Hoàn thành”) các khoá yêu cầu.
        </p>
      </div>

      <PrerequisitesManager
        courses={allCourses.map((c) => ({ id: c.id, label: label(c) }))}
        rows={rows}
      />
    </div>
  );
}
