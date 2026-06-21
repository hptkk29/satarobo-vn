import Link from "next/link";
import { requireActiveStudent } from "@/lib/portal/session";
import { monthGridRange, shiftMonth } from "@/lib/lms/calendar";
import { getStudentCalendarEvents } from "@/lib/lms/calendar-data";
import { MonthCalendar } from "@/components/lms/month-calendar";

export const dynamic = "force-dynamic";

function parseInt10(v: string | undefined, fallback: number): number {
  const n = v ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export default async function PortalCalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const { studentId } = await requireActiveStudent();
  const sp = await searchParams;
  const now = new Date();
  const year = parseInt10(sp.y, now.getFullYear());
  const month0 = parseInt10(sp.m, now.getMonth());
  const { from, to } = monthGridRange(year, month0);
  const events = await getStudentCalendarEvents(studentId, from, to);

  const prev = shiftMonth(year, month0, -1);
  const next = shiftMonth(year, month0, 1);
  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Lịch học</h1>
        <div className="flex gap-2 text-sm">
          <Link href={`/portal/lich?y=${prev.year}&m=${prev.month0}`} className="rounded border px-2 py-1">←</Link>
          <Link href={`/portal/lich?y=${next.year}&m=${next.month0}`} className="rounded border px-2 py-1">→</Link>
        </div>
      </div>
      <MonthCalendar year={year} month0={month0} events={events} />
    </div>
  );
}
