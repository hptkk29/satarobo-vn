import Link from "next/link";
import { CalendarDays, ClipboardCheck, FileWarning, AlertTriangle } from "lucide-react";
import { db } from "@/lib/db";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
import { buildWeeklySchedule, WEEKDAY_LABELS, type TeacherClassSlot } from "@/lib/teachers/schedule";

// Đợt 3C — Dashboard GIÁO VIÊN. KHÔNG doanh thu/lead/quản trị.
export async function TeacherDashboard({ userId, name }: { userId: string; name: string }) {
  const now = new Date();
  const todayWd = now.getDay(); // 0=CN..6=T7
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayEnd = new Date(dayStart);
  dayEnd.setDate(dayEnd.getDate() + 1);

  const myClasses = await db.class.findMany({
    where: { teacherId: userId, deletedAt: null, status: { in: ["PLANNED", "RECRUITING", "ACTIVE"] } },
    select: {
      id: true, name: true, classCode: true, scheduleDays: true, startTime: true, endTime: true,
      room: { select: { code: true } },
      _count: { select: { enrollments: { where: { status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } } } } },
    },
  });

  const [sessionsToday, toGrade] = await Promise.all([
    db.classSession.findMany({
      where: { class: { teacherId: userId }, date: { gte: dayStart, lt: dayEnd } },
      select: { id: true, status: true, class: { select: { name: true, classCode: true } } },
      orderBy: { date: "asc" },
    }),
    db.assignmentSubmission.count({
      where: { assignment: { class: { teacherId: userId } }, status: { in: ["SUBMITTED", "LATE"] }, score: null },
    }),
  ]);

  const todayClasses = myClasses.filter((c) => c.scheduleDays.includes(todayWd));
  const incompleteToday = sessionsToday.filter((s) => s.status !== "COMPLETED");

  const slots: TeacherClassSlot[] = myClasses.map((c) => ({
    id: c.id,
    label: c.classCode ?? c.name,
    scheduleDays: c.scheduleDays,
    startTime: c.startTime,
    endTime: c.endTime,
    role: "teacher",
  }));
  const { conflicts } = buildWeeklySchedule(slots);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Chào {name || "thầy/cô"} 👋</h1>

      {/* Lớp hôm nay */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
          <CalendarDays className="h-4 w-4" /> Lớp dạy hôm nay ({todayClasses.length})
        </h2>
        {todayClasses.length === 0 ? (
          <p className="text-sm text-gray-400">Hôm nay không có lớp.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {todayClasses.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="font-medium text-gray-900">{c.classCode ? `${c.classCode} · ` : ""}{c.name}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {c.startTime && c.endTime ? `${c.startTime}–${c.endTime}` : ""}
                    {c.room?.code ? ` · P.${c.room.code}` : ""} · {c._count.enrollments} HV
                  </span>
                </div>
                <Link href="/attendance" className="inline-flex items-center gap-1 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90">
                  <ClipboardCheck className="h-3.5 w-3.5" /> Điểm danh
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <DashStat label="Buổi hôm nay chưa hoàn tất" value={incompleteToday.length} href="/sessions" tone={incompleteToday.length > 0 ? "warn" : "ok"} icon={<ClipboardCheck className="h-5 w-5" />} />
        <DashStat label="Bài đã nộp cần chấm" value={toGrade} href="/assignments" tone={toGrade > 0 ? "warn" : "ok"} icon={<FileWarning className="h-5 w-5" />} />
        <DashStat label="Xung đột giờ trong tuần" value={conflicts.length} href="#" tone={conflicts.length > 0 ? "danger" : "ok"} icon={<AlertTriangle className="h-5 w-5" />} />
      </div>

      {conflicts.length > 0 && (
        <section className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <p className="mb-1 font-semibold">Lịch dạy bị trùng giờ:</p>
          <ul className="space-y-0.5">
            {conflicts.map((c, i) => (
              <li key={i}>{WEEKDAY_LABELS[c.day]}: “{c.a}” trùng “{c.b}”</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DashStat({
  label, value, href, tone, icon,
}: {
  label: string; value: number; href: string; tone: "ok" | "warn" | "danger"; icon: React.ReactNode;
}) {
  const toneCls = tone === "danger" ? "text-rose-600" : tone === "warn" ? "text-amber-600" : "text-emerald-600";
  return (
    <Link href={href} className="rounded-xl border border-gray-200 bg-white p-4 hover:border-[#7C3AED]">
      <div className={`flex items-center gap-2 ${toneCls}`}>{icon}<span className="text-2xl font-bold tabular-nums">{value}</span></div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </Link>
  );
}
