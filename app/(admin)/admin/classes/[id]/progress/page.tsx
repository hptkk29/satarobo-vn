import Link from "next/link";
import { ChevronLeft, LineChart } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { can, hasRole, canViewParentContact } from "@/lib/auth/permissions";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { getClassProgress, getClassGradebook } from "@/lib/progress";
import { GenerateReportsButton } from "./_components/generate-reports-button";

export const dynamic = "force-dynamic";

const EXAM_STATUS_VI: Record<string, string> = {
  IN_PROGRESS: "Đang làm",
  SUBMITTED: "Đã nộp",
  GRADED: "Đã chấm",
  REVIEWED: "Đã duyệt",
  "—": "Chưa làm",
};
const SUB_STATUS_VI: Record<string, string> = {
  NOT_SUBMITTED: "Chưa nộp",
  SUBMITTED: "Đã nộp",
  LATE: "Nộp trễ",
  GRADED: "Đã chấm",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ClassProgressPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const now = new Date();

  // Cách ly cơ sở: Class ∈ SCOPED_MODELS → sdb.class.findUnique lọc IDOR (ngoài tầm
  // nhìn cơ sở → null → notFound). Cổng này khoá luôn cả trang vì count/getClassProgress
  // /getClassGradebook đều key theo `id` đã được xác thực tầm nhìn ở đây.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const cls = await sdb.class.findUnique({
    where: { id },
    include: {
      course: { select: { name: true } },
      center: { select: { name: true } },
      teacher: { select: { name: true } },
    },
  });
  if (!cls) notFound();

  // Gate: view-all (quản lý) hoặc giáo viên phụ trách lớp (view-own).
  const canViewAll = can(session.user, "classes:view-all");
  const isOwnTeacher =
    can(session.user, "classes:view-own") && cls.teacherId === session.user.id;
  if (!canViewAll && !isOwnTeacher) {
    redirect("/dashboard?error=unauthorized");
  }
  const canGenerateReports =
    hasRole(session.user, "SUPER_ADMIN") ||
    hasRole(session.user, "CENTER_MANAGER") ||
    (hasRole(session.user, "TEACHER") && cls.teacherId === session.user.id);

  // P0-3: GV (chỉ view-own) KHÔNG được nhận SĐT phụ huynh — chỉ quản lý/kế toán/CSM.
  const showParentContact = canViewParentContact(session.user);

  const [progresses, heldSessionsCount, gradebook] = await Promise.all([
    getClassProgress(id, showParentContact),
    sdb.classSession.count({ where: { classId: id, date: { lte: now } } }),
    getClassGradebook(id),
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/classes/${cls.id}/edit`}
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
        {canGenerateReports && progresses.length > 0 && (
          <GenerateReportsButton classId={cls.id} />
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Sĩ số đang học" value={String(progresses.length)} />
        <StatCard label="Buổi đã diễn ra" value={String(heldSessionsCount)} />
        <StatCard
          label="Điểm danh TB"
          value={heldSessionsCount === 0 ? "—" : `${avgAttendance}%`}
        />
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
                        {progress.totalSessions === 0 ? (
                          <div className="text-xs font-normal text-neutral-400">
                            Chưa diễn ra
                          </div>
                        ) : (
                          <>
                            <div>
                              {progress.attendedSessions}/{progress.totalSessions}
                            </div>
                            <div className="text-xs font-normal">
                              ({progress.attendanceRate}%)
                            </div>
                          </>
                        )}
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
                          href={`/students/${student.id}/edit`}
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

      {/* Lộ trình giáo trình (Phase T2.1) */}
      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-neutral-100 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700">
            Lộ trình giáo trình
          </h2>
          <span className="text-xs font-medium text-neutral-500">
            {gradebook.coveredLessons}/{gradebook.totalLessons} bài ·{" "}
            {gradebook.lessonCoverageRate}%
          </span>
        </header>
        <div className="p-4">
          {gradebook.lessons.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-400">
              Khoá học chưa có giáo trình (curriculum) đang hoạt động.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {gradebook.lessons.map((l) => (
                <li
                  key={l.id}
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm"
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      l.taught
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-neutral-100 text-neutral-400"
                    }`}
                  >
                    {l.order}
                  </span>
                  <span
                    className={
                      l.taught ? "text-neutral-800" : "text-neutral-400"
                    }
                  >
                    {l.title}
                  </span>
                  {l.taught && l.sessionDate && (
                    <span className="ml-auto text-xs text-neutral-400 tabular-nums">
                      Đã dạy {new Date(l.sessionDate).toLocaleDateString("vi-VN")}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* Bảng điểm lớp (Phase T2.1) */}
      <section className="rounded-xl border border-neutral-200 bg-white shadow-sm">
        <header className="border-b border-neutral-100 p-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700">
            Bảng điểm lớp
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Ma trận học viên × đề thi/bài tập đã giao. Ô hiện điểm thô hoặc trạng thái.
          </p>
        </header>
        <div className="overflow-x-auto">
          {gradebook.columns.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-neutral-400">
              Lớp chưa có đề thi hoặc bài tập nào được giao (PUBLISHED).
            </p>
          ) : (
            <table className="min-w-full divide-y divide-neutral-100 text-sm">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="sticky left-0 z-10 bg-neutral-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                    Học viên
                  </th>
                  {gradebook.columns.map((c) => (
                    <th
                      key={c.id}
                      className="px-3 py-3 text-center text-xs font-semibold text-neutral-500"
                    >
                      <div className="flex flex-col items-center gap-0.5">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            c.kind === "exam"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {c.kind === "exam" ? "Đề" : "BT"}
                        </span>
                        <span className="max-w-[120px] truncate font-medium normal-case text-neutral-700">
                          {c.title}
                        </span>
                        <span className="text-[10px] font-normal text-neutral-400">
                          /{c.totalPoints}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {gradebook.rows.map((r) => (
                  <tr key={r.studentId} className="hover:bg-neutral-50/60">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2 font-medium text-neutral-900">
                      {r.name}
                      {r.studentCode && (
                        <span className="ml-1 text-[10px] text-neutral-400 tabular-nums">
                          {r.studentCode}
                        </span>
                      )}
                    </td>
                    {gradebook.columns.map((c) => {
                      const cell = r.cells[c.id];
                      const label =
                        c.kind === "exam"
                          ? EXAM_STATUS_VI[cell.status] ?? cell.status
                          : SUB_STATUS_VI[cell.status] ?? cell.status;
                      return (
                        <td
                          key={c.id}
                          className="px-3 py-2 text-center tabular-nums"
                        >
                          {cell.score !== null ? (
                            <span
                              className={`font-semibold ${
                                cell.passed === false
                                  ? "text-red-600"
                                  : "text-neutral-800"
                              }`}
                            >
                              {cell.score}
                            </span>
                          ) : (
                            <span className="text-xs text-neutral-400">
                              {label}
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
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
