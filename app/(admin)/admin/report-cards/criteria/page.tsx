import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { CriteriaManager } from "../_components/criteria-manager";

export const metadata = { title: "Tiêu chí học bạ | Admin" };
export const dynamic = "force-dynamic";

export default async function ReportCardCriteriaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Cấu hình tiêu chí = quyền duyệt (Đào tạo/Quản lý).
  if (!can(session.user, "report-cards:review")) redirect("/report-cards");

  const courses = await db.course.findMany({
    where: { isActive: true },
    orderBy: [{ isTeachable: "desc" }, { displayOrder: "asc" }, { name: "asc" }],
    take: 300,
    select: {
      id: true,
      name: true,
      isTeachable: true,
      // Tất cả tiêu chí (kể cả inactive) để bật/tắt.
    },
  });

  const criteria = await db.reportCardCriterion.findMany({
    where: { courseId: { in: courses.map((c) => c.id) } },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, courseId: true, name: true, order: true, active: true },
  });

  const byCourse = new Map<string, typeof criteria>();
  for (const c of criteria) {
    const list = byCourse.get(c.courseId) ?? [];
    list.push(c);
    byCourse.set(c.courseId, list);
  }

  return (
    <div className="space-y-5 p-4">
      <div>
        <Link href="/report-cards" className="text-sm text-purple-700">
          ← Học bạ năng lực
        </Link>
        <h1 className="mt-1 text-xl font-bold text-neutral-900">Cấu hình tiêu chí năng lực</h1>
        <p className="text-sm text-neutral-500">
          Đào tạo cấu hình tiêu chí theo từng khoá học. GV chấm thang 1–4 cho mỗi tiêu chí khi nhập học bạ.
        </p>
      </div>

      <CriteriaManager
        courses={courses.map((c) => ({
          id: c.id,
          name: c.name,
          isTeachable: c.isTeachable,
          criteria: byCourse.get(c.id) ?? [],
        }))}
      />
    </div>
  );
}
