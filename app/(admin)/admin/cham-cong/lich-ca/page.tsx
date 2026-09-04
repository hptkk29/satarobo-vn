import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { isNextMonthWindowOpen, isWeekendEditWindow, EMERGENCY_MONTHLY_LIMIT } from "@/lib/shifts";
import { getSetting } from "@/lib/settings/service";
import { checkPermission } from "@/lib/auth/check-permission";
import { MyShiftsCalendar } from "./_components/my-shifts-calendar";

export const metadata = { title: "Lịch ca của tôi | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ month?: string }>;
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function MyShiftsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("hr_attendance:checkin", { centerId: session.user.centerId }))) redirect("/dashboard");

  const { month } = await searchParams;
  const now = new Date();
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const year = Number(m.slice(0, 4));
  const monthIdx = Number(m.slice(5, 7)) - 1;
  const monthStart = new Date(year, monthIdx, 1);
  const monthEnd = new Date(year, monthIdx + 1, 1);

  // Cách ly cơ sở (A0-04): ShiftRegistration/ClassSession ∈ SCOPED_MODELS → scopedDb.
  const sdb = scopedDb(await resolveActor(session.user.id));

  const [regs, teachingSessions] = await Promise.all([
    sdb.shiftRegistration.findMany({
      where: { userId: session.user.id, date: { gte: monthStart, lt: monthEnd } },
      select: { date: true, shifts: true, status: true, note: true },
    }),
    // PHẦN 3 — buổi dạy của GV (lớp GV phụ trách chính/trợ giảng) trong tháng.
    sdb.classSession.findMany({
      where: {
        date: { gte: monthStart, lt: monthEnd },
        class: { OR: [{ teacherId: session.user.id }, { assistantId: session.user.id }] },
      },
      select: {
        date: true,
        class: { select: { name: true, classCode: true, startTime: true, endTime: true } },
      },
      orderBy: { date: "asc" },
    }),
  ]);
  const byDate = new Map(
    regs.map((r) => [ymd(new Date(r.date)), { shifts: r.shifts, status: r.status, note: r.note ?? "" }]),
  );

  // PHẦN 6 — số lần khẩn cấp đã dùng trong tháng đang xem.
  const emergencyUsed = await sdb.shiftRegistration.count({
    where: { userId: session.user.id, status: "LEAVE_REQUESTED", date: { gte: monthStart, lt: monthEnd } },
  });

  // teachingByDate: ngày → danh sách tiết dạy {start,end,label}.
  const teachingByDate: Record<string, { start: string; end: string; label: string }[]> = {};
  for (const s of teachingSessions) {
    const ds = ymd(new Date(s.date));
    const start = s.class.startTime ?? "00:00";
    const end = s.class.endTime ?? start;
    const label = s.class.classCode ? `${s.class.classCode} · ${s.class.name}` : s.class.name;
    (teachingByDate[ds] ??= []).push({ start, end, label });
  }

  // Lưới: padding đầu tuần (CN=0).
  const firstWeekday = monthStart.getDay();
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const cells: { dateStr: string | null; day: number | null }[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ dateStr: null, day: null });
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ dateStr: ymd(new Date(year, monthIdx, d)), day: d });
  }

  const prev = new Date(year, monthIdx - 1, 1);
  const next = new Date(year, monthIdx + 1, 1);
  const monthLabel = `Tháng ${monthIdx + 1}/${year}`;
  const todayStr = ymd(now);

  const proposalWindow = await getSetting("shift.proposalWindow");
  const winLabel = `${proposalWindow.fromDay}–${proposalWindow.toDay}`;
  const windowHint = isNextMonthWindowOpen(now, proposalWindow)
    ? `Đang trong cửa sổ ĐỀ XUẤT ca THÁNG SAU (ngày ${winLabel}). Lịch bạn chọn là ĐỀ XUẤT — quản lý duyệt (import Excel) để chốt chính thức.`
    : isWeekendEditWindow(now)
      ? "Cuối tuần — được phép sửa đề xuất ca trong tháng."
      : `Ngoài cửa sổ đề xuất chuẩn (${winLabel} cho tháng sau / cuối tuần để sửa). Vẫn lưu được, lịch là ĐỀ XUẤT chờ quản lý duyệt.`;

  return (
    <div className="max-w-4xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <CalendarDays className="h-6 w-6 text-primary" /> Lịch ca của tôi
        </h1>
        <div className="flex items-center gap-2">
          <Link href={`/cham-cong/lich-ca?month=${ymd(prev).slice(0, 7)}`} scroll={false} className="rounded-lg border border-border p-1.5 hover:bg-muted">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-semibold text-foreground">{monthLabel}</span>
          <Link href={`/cham-cong/lich-ca?month=${ymd(next).slice(0, 7)}`} scroll={false} className="rounded-lg border border-border p-1.5 hover:bg-muted">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <p className="mb-2 rounded-lg bg-state-info-soft px-3 py-2 text-xs text-state-info-ink">{windowHint}</p>
      <p
        className={`mb-4 rounded-lg px-3 py-2 text-xs ${ emergencyUsed >= EMERGENCY_MONTHLY_LIMIT ? "bg-state-danger-soft text-state-danger-ink" : "bg-muted text-muted-foreground" }`}
      >
        Khẩn cấp (đổi/nghỉ gấp) tháng này: <b>{emergencyUsed}/{EMERGENCY_MONTHLY_LIMIT}</b>
        {emergencyUsed >= EMERGENCY_MONTHLY_LIMIT && " — đã hết lượt, liên hệ quản lý."}
      </p>

      <MyShiftsCalendar
        cells={cells}
        byDate={Object.fromEntries(byDate)}
        teachingByDate={teachingByDate}
        todayStr={todayStr}
      />
    </div>
  );
}
