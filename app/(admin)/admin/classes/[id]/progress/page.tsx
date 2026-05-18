import Link from "next/link";
import { ChevronLeft, LineChart } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { getClassProgress } from "@/lib/progress";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClassProgressPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "classes:view-all")) {
    redirect("/admin/dashboard?error=unauthorized");
  }

  const { id } = await params;
  const now = new Date();

  const cls = await db.class.findUnique({
    where: { id },
    include: {
      course: { select: { name: true } },
      center: { select: { name: true } },
      teacher: { select: { name: true } },
    },
  });
  if (!cls) notFound();

  const [progresses, heldSessionsCount] = await Promise.all([
    getClassProgress(id),
    db.classSession.count({ where: { classId: id, date: { lte: now } } }),
  ]);

  const avgAttendance =
    progresses.length > 0
      ? Math.round(
          progresses.reduce((s, p) => s + p.progress.attendanceRate, 0) /
            progresses.length,
        )
      : 0;

  const scored = progresses.filter((p) => p.progress.averageScore !== null);
  const avgScore =
    scored.length > 0
      ? Math.round(
          (scored.reduce(
            (s, p) => s + (p.progress.averageScore as number),
            0,
          ) /
            scored.length) *
            10,
        ) / 10
      : null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/classes/${cls.id}/edit`}
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại lớp
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-900">
          <LineChart className="h-6 w-6 text-[#7C3AED]" />
          Tiến độ lớp: <span className="text-orange-600">{cls.name}</span>
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          {cls.course.name} · {cls.center?.name ?? "—"}
          {cls.teacher?.name && ` · GV: ${cls.teacher.name}`}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Sĩ số đang học" value={String(progresses.length)} />
        <StatCard label="Buổi đã diễn ra" value={String(heldSessionsCount)} />
        <StatCard label="Điểm danh TB" value={`${avgAttendance}%`} />
        <StatCard
          label="Điểm TB lớp"
          value={avgScore !== null ? `${avgScore}/10` : "—"}
        />
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <header className="border-b border-neutral-100 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700">
            Tiến độ từng học viên
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            HS có status enrollment <strong>CONFIRMED / STUDYING / ACTIVE</strong>.
            Tỉ lệ điểm danh: ≥80% xanh · 60–79% vàng · &lt;60% đỏ.
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-100">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Học viên
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Điểm danh
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Bài học
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Bài tập
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Điểm TB
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Đề thi đạt
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500" />
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {progresses.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-sm text-neutral-400"
                  >
                    Chưa có HS đang học trong lớp.
                  </td>
                </tr>
              ) : (
                progresses.map(({ student, progress }) => {
                  const attendanceColor =
                    progress.totalSessions === 0
                      ? "text-neutral-400"
                      : progress.attendanceRate >= 80
                        ? "text-green-600"
                        : progress.attendanceRate >= 60
                          ? "text-amber-600"
                          : "text-red-600";
                  return (
                    <tr key={student.id} className="hover:bg-neutral-50/60">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {student.avatarUrl ? (
                            <img
                              src={student.avatarUrl}
                              alt={student.name}
                              className="h-9 w-9 rounded-full border border-neutral-200 object-cover"
                            />
                          ) : (
                            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500">
                              {student.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div>
                            <div className="font-medium text-neutral-900">
                              {student.name}
                            </div>
                            {student.studentCode && (
                              <div className="text-[10px] text-neutral-400 tabular-nums">
                                {student.studentCode}
                              </div>
                            )}
                            {student.parentPhone && (
                              <div className="text-xs text-neutral-400 tabular-nums">
                                PH: {student.parentPhone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td
                        className={`px-4 py-3 text-center font-semibold tabular-nums ${attendanceColor}`}
                      >
                        <div>
                          {progress.attendedSessions}/{progress.totalSessions}
                        </div>
                        <div className="text-xs font-normal">
                          ({progress.attendanceRate}%)
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center text-sm tabular-nums text-neutral-700">
                        {progress.coveredLessons}/{progress.totalLessons}
                      </td>
                      <td className="px-4 py-3 text-center text-sm tabular-nums text-neutral-700">
                        {progress.submittedAssignments}/{progress.totalAssignments}
                        {progress.gradedAssignments > 0 && (
                          <span className="ml-1 text-xs text-green-600">
                            ({progress.gradedAssignments}✓)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-sm tabular-nums font-semibold text-neutral-700">
                        {progress.averageScore !== null
                          ? `${progress.averageScore}/10`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center text-sm tabular-nums text-neutral-700">
                        {progress.examAttempts > 0
                          ? `${progress.passedExams}/${progress.examAttempts}`
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/students/${student.id}/edit`}
                          className="text-xs font-semibold text-[#7C3AED] hover:underline"
                        >
                          Chi tiết →
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
    </div>
  );
}
