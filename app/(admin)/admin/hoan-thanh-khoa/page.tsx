import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { CompletionForm } from "./_components/completion-form";

export const metadata = { title: "Hoàn thành khoá | Admin" };
export const dynamic = "force-dynamic";

export default async function CompletionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "completions:manage")) redirect("/dashboard");

  const centerScope =
    hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")
      ? session.user.centerId
      : null;

  const [students, courses, completions] = await Promise.all([
    db.student.findMany({
      where: { deletedAt: null, ...(centerScope ? { centerId: centerScope } : {}) },
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, studentCode: true },
    }),
    db.course.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.courseCompletion.findMany({
      where: centerScope ? { student: { centerId: centerScope } } : {},
      orderBy: { completedAt: "desc" },
      take: 50,
      select: {
        id: true,
        certificateCode: true,
        completedAt: true,
        finalGrade: true,
        nextCourseId: true,
        student: { select: { name: true } },
        course: { select: { name: true } },
      },
    }),
  ]);

  // nextCourseId không có relation riêng → map tên từ danh sách khoá đã nạp.
  const courseName = new Map(courses.map((c) => [c.id, c.name]));

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Hoàn thành khoá &amp; chứng chỉ</h1>
        <p className="text-sm text-neutral-500">
          Đánh dấu học viên hoàn thành khoá, nhập đánh giá cuối khoá của GV → sinh chứng chỉ, gợi ý khoá tiếp
          theo, tạo việc chăm sóc tái tục và đẩy email chúc mừng.
        </p>
      </div>

      <CompletionForm students={students} courses={courses} />

      <div className="rounded-xl border border-neutral-200 bg-white">
        <div className="border-b px-4 py-2 text-sm font-semibold text-neutral-700">Đã hoàn thành gần đây</div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-neutral-400">
            <tr>
              <th className="px-4 py-2">Học viên</th>
              <th className="px-4 py-2">Khoá</th>
              <th className="px-4 py-2">Xếp loại</th>
              <th className="px-4 py-2">Khoá tiếp theo</th>
              <th className="px-4 py-2">Ngày</th>
              <th className="px-4 py-2">Chứng chỉ</th>
            </tr>
          </thead>
          <tbody>
            {completions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-400">
                  Chưa có dữ liệu.
                </td>
              </tr>
            ) : (
              completions.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-2 font-medium">{c.student.name}</td>
                  <td className="px-4 py-2">{c.course.name}</td>
                  <td className="px-4 py-2">{c.finalGrade ?? "—"}</td>
                  <td className="px-4 py-2 text-neutral-500">
                    {c.nextCourseId ? courseName.get(c.nextCourseId) ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{c.completedAt.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2">
                    <a
                      href={`/api/admin/reports/certificate?code=${encodeURIComponent(c.certificateCode)}`}
                      target="_blank"
                      rel="noopener"
                      className="text-purple-700 underline"
                    >
                      {c.certificateCode}
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
