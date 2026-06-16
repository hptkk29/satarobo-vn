import Link from "next/link";
import { CalendarDays, ClipboardList, FileText, BookOpen } from "lucide-react";
import { requireActiveStudent } from "@/lib/portal/session";
import {
  getStudentClasses,
  getStudentSessions,
  getStudentAssignments,
  getStudentExams,
  getStudentAttendanceSummaries,
} from "@/lib/portal/learning";

export const dynamic = "force-dynamic";

export default async function PortalHome() {
  const { ctx, studentId } = await requireActiveStudent();
  const [classes, sessions, assignments, exams, summaries] = await Promise.all([
    getStudentClasses(studentId),
    getStudentSessions(studentId),
    getStudentAssignments(studentId),
    getStudentExams(studentId),
    getStudentAttendanceSummaries(studentId),
  ]);

  // R7-08 — tổng hợp 5 chỉ số điểm danh trên toàn bộ lớp đang học.
  const attendance = summaries.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      attended: acc.attended + s.attended,
      absent: acc.absent + s.absent,
      needMakeup: acc.needMakeup + s.needMakeup,
      madeUp: acc.madeUp + s.madeUp,
    }),
    { total: 0, attended: 0, absent: 0, needMakeup: 0, madeUp: 0 },
  );

  const nextSession = sessions.find((s) => !s.past);
  const pendingAssignments = assignments.filter(
    (a) => a.status === "NOT_SUBMITTED",
  ).length;
  const openExams = exams.filter(
    (e) => e.isOpen && e.attemptStatus !== "SUBMITTED" && e.attemptStatus !== "GRADED",
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">
          Xin chào, {ctx.parentName}
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Đang xem học viên:{" "}
          <span className="font-semibold text-orange-600">
            {ctx.activeStudent?.name}
          </span>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          icon={<CalendarDays className="h-4 w-4" />}
          label="Buổi học tới"
          value={
            nextSession
              ? new Date(nextSession.date).toLocaleDateString("vi-VN", {
                  day: "2-digit",
                  month: "2-digit",
                })
              : "—"
          }
          href="/portal/lich-hoc"
        />
        <Stat
          icon={<ClipboardList className="h-4 w-4" />}
          label="Bài tập chưa nộp"
          value={String(pendingAssignments)}
          href="/portal/bai-tap"
        />
        <Stat
          icon={<FileText className="h-4 w-4" />}
          label="Bài thi đang mở"
          value={String(openExams)}
          href="/portal/bai-thi"
        />
      </div>

      {summaries.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wider text-neutral-700">
            Tiến độ điểm danh
          </h2>
          <Link
            href="/portal/lich-hoc"
            className="block rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm"
          >
            <dl className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {(
                [
                  ["Tổng buổi", attendance.total, "text-neutral-900"],
                  ["Đã học", attendance.attended, "text-green-700"],
                  ["Vắng", attendance.absent, "text-red-600"],
                  ["Chờ học bù", attendance.needMakeup, "text-amber-600"],
                  ["Đã học bù", attendance.madeUp, "text-[#7C3AED]"],
                ] as [string, number, string][]
              ).map(([label, value, tone]) => (
                <div
                  key={label}
                  className="rounded-lg border border-neutral-100 bg-neutral-50 p-2 text-center"
                >
                  <dd className={`text-lg font-bold ${tone}`}>{value}</dd>
                  <dt className="text-[11px] text-neutral-500">{label}</dt>
                </div>
              ))}
            </dl>
          </Link>
        </section>
      )}

      <section>
        <h2 className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-neutral-700">
          <BookOpen className="h-4 w-4 text-[#7C3AED]" /> Lớp đang học
        </h2>
        {classes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-300 bg-white p-6 text-center text-sm text-neutral-400">
            Học viên chưa được xếp lớp.
          </p>
        ) : (
          <ul className="space-y-2">
            {classes.map((c) => (
              <li
                key={c.id}
                className="rounded-xl border border-neutral-200 bg-white p-4"
              >
                <p className="font-semibold text-neutral-900">{c.name}</p>
                <p className="text-xs text-neutral-500">
                  {c.classCode ? `${c.classCode} · ` : ""}
                  {c.courseName}
                  {c.centerName ? ` · ${c.centerName}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm"
    >
      <div className="flex items-center gap-1.5 text-neutral-400">{icon}</div>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </Link>
  );
}
