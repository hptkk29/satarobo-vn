import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { CompletionForm } from "./_components/completion-form";
import { BulkCompleteByClass } from "./_components/bulk-complete-by-class";

export const metadata = { title: "Hoàn thành khoá | Admin" };
export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ classId?: string }>;
}

export default async function CompletionPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "completions:manage")) redirect("/dashboard");

  const sp = await searchParams;
  const selectedClassId = sp.classId?.trim() || "";

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

  // Danh sách lớp cho bộ chọn bulk (scope theo cơ sở của CENTER_MANAGER).
  const classes = await db.class.findMany({
    where: { deletedAt: null, ...(centerScope ? { centerId: centerScope } : {}) },
    orderBy: [{ startDate: "desc" }, { name: "asc" }],
    take: 300,
    select: {
      id: true,
      name: true,
      classCode: true,
      course: { select: { name: true } },
      center: { select: { name: true } },
    },
  });

  // Khi đã chọn lớp: nạp học viên đang theo học (enrollment active) + đánh dấu
  // ai đã hoàn thành khoá của lớp này (đã có chứng chỉ → bỏ chọn sẵn).
  let selectedClass:
    | {
        id: string;
        name: string;
        courseName: string;
        students: { id: string; name: string; studentCode: string | null; alreadyCompleted: boolean }[];
      }
    | null = null;

  if (selectedClassId) {
    const klass = await db.class.findFirst({
      where: {
        id: selectedClassId,
        deletedAt: null,
        ...(centerScope ? { centerId: centerScope } : {}),
      },
      select: {
        id: true,
        name: true,
        courseId: true,
        course: { select: { name: true } },
        enrollments: {
          where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
          select: {
            student: { select: { id: true, name: true, studentCode: true } },
          },
        },
      },
    });

    if (klass) {
      // Loại trùng học viên (1 HV có thể có nhiều enrollment active hiếm gặp).
      const byId = new Map<string, { id: string; name: string; studentCode: string | null }>();
      for (const e of klass.enrollments) byId.set(e.student.id, e.student);
      const studentList = Array.from(byId.values());

      const done = await db.courseCompletion.findMany({
        where: {
          courseId: klass.courseId,
          studentId: { in: studentList.map((s) => s.id) },
        },
        select: { studentId: true },
      });
      const doneSet = new Set(done.map((c) => c.studentId));

      selectedClass = {
        id: klass.id,
        name: klass.name,
        courseName: klass.course.name,
        students: studentList
          .map((s) => ({
            id: s.id,
            name: s.name,
            studentCode: s.studentCode,
            alreadyCompleted: doneSet.has(s.id),
          }))
          .sort((a, b) => a.name.localeCompare(b.name, "vi")),
      };
    }
  }

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

      <BulkCompleteByClass
        classes={classes.map((c) => ({
          id: c.id,
          name: c.name,
          classCode: c.classCode,
          courseName: c.course.name,
          centerName: c.center?.name ?? null,
        }))}
        selectedClassId={selectedClassId}
        selectedClass={selectedClass}
      />

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
