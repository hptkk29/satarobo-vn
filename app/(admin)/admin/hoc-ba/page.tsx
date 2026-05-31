import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getStudentTranscript } from "@/lib/transcript/service";
import { TranscriptView } from "@/components/transcript/transcript-view";

export const metadata = { title: "Học bạ | Admin" };
export const dynamic = "force-dynamic";

export default async function AdminTranscriptPage({
  searchParams,
}: {
  searchParams: Promise<{ studentId?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // GV/quản lý/CSKH/HR đều xem được học bạ.
  if (!can(session.user, "students:view-all") && !can(session.user, "students:view-own-class")) {
    redirect("/dashboard");
  }

  const centerScope =
    hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN")
      ? session.user.centerId
      : null;

  const students = await db.student.findMany({
    where: { deletedAt: null, ...(centerScope ? { centerId: centerScope } : {}) },
    orderBy: { name: "asc" },
    take: 500,
    select: { id: true, name: true, studentCode: true },
  });

  const { studentId } = await searchParams;

  // Center scope guard cho transcript đang xem.
  let t = null;
  if (studentId) {
    if (centerScope) {
      const inScope = await db.student.findFirst({
        where: { id: studentId, centerId: centerScope },
        select: { id: true },
      });
      if (inScope) t = await getStudentTranscript(studentId);
    } else {
      t = await getStudentTranscript(studentId);
    }
  }

  return (
    <div className="space-y-5 p-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Học bạ học viên</h1>
        <p className="text-sm text-neutral-500">Chọn học viên để xem quá trình học tổng hợp + xuất PDF.</p>
      </div>

      <form className="flex gap-2" action="/admin/hoc-ba" method="get">
        <select name="studentId" defaultValue={studentId ?? ""} className="rounded-md border border-neutral-300 px-3 py-2 text-sm">
          <option value="">— Chọn học viên —</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.studentCode ? ` (${s.studentCode})` : ""}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white">
          Xem
        </button>
      </form>

      {studentId && !t ? (
        <p className="text-sm text-rose-600">Không tìm thấy học viên hoặc ngoài phạm vi cơ sở.</p>
      ) : null}
      {t ? <TranscriptView t={t} pdfHref={`/api/admin/reports/transcript?studentId=${studentId}`} /> : null}
    </div>
  );
}
