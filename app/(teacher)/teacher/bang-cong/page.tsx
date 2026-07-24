// app/(teacher)/teacher/bang-cong/page.tsx — #06 (L6): "Bảng công" site GV.
//
// Bố cục theo reference TeachUI: 4 StatCard (Số ca · Buổi dạy · Tổng giờ công ·
// Ngày nghỉ) + bảng CHI TIẾT CA gộp 3 loại: Dạy (ClassSession) · Trải nghiệm
// (TrialClassSession) · Ca làm (ShiftRegistration). Mỗi CA: giờ + trạng thái
// (Đã làm/Sắp tới theo ngày). Chọn tháng qua ?thang=YYYY-MM.
//
// ⚠️ CHỐT với chủ nhiệm: hệ thống KHÔNG chấm công OT/đi-muộn/đúng-giờ cho GV →
// ẨN 3 stat đó (mock bịa). Ca làm chỉ có ngày + mã ca (Ca sáng/chiều/tối), KHÔNG
// giờ công thực → cột giờ công của ca làm để "—", không cộng vào Tổng giờ công.
//
// Nguồn (own-rows): getOwnShiftRegistrations · getTeacherTrialSessions ·
// getVisibleHolidays (lib/lms/teacher-schedule); buổi dạy qua withMakeupException
// (dạy thay/bù liên cơ sở). ⚠️ Câu 46: chỉ tên lớp/cơ sở + giờ — không HV/PH.
import Link from "next/link";
import {
  CalendarOff,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  GraduationCap,
  Layers,
} from "lucide-react";
import type { AdjustStatus, SessionStatus, WorkShift } from "@prisma/client";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { withMakeupException } from "@/lib/db-scope";
import { checkPermission } from "@/lib/auth/check-permission";
import { SHIFT_ORDER, SHIFT_DEFS } from "@/lib/shifts";
import {
  getOwnShiftRegistrations,
  getTeacherTrialSessions,
  getVisibleHolidays,
} from "@/lib/lms/teacher-schedule";
import { getOwnAdjustmentRequests } from "@/lib/attendance/own-adjustments";
import { cn } from "@/lib/utils";
import { PageHeader } from "../_components/ui/page-header";
import { StatCard } from "../_components/ui/stat-card";
import { EmptyState } from "../_components/ui/empty-state";
import { AdjustRequestDialog } from "./_components/adjust-request-dialog";

export const metadata = { title: "Bảng công | Giáo viên Sata Robo" };

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function vnTodayUtc(now = new Date()): Date {
  const vn = new Date(now.getTime() + VN_OFFSET_MS);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()));
}
function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
function addMonthsUtc(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
}
function toVnInstant(dayUtc: Date): Date {
  return new Date(dayUtc.getTime() - VN_OFFSET_MS);
}
const two = (n: number) => String(n).padStart(2, "0");
function monthKey(monthStart: Date): string {
  return `${monthStart.getUTCFullYear()}-${two(monthStart.getUTCMonth() + 1)}`;
}
function parseThang(raw?: string): Date | null {
  if (!raw || !/^\d{4}-\d{2}$/.test(raw)) return null;
  const [y, m] = raw.split("-").map(Number);
  if (y < 2000 || y > 2100 || m < 1 || m > 12) return null;
  return new Date(Date.UTC(y, m - 1, 1));
}

function parseHHmm(s: string | null): number | null {
  if (!s || !/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, m] = s.split(":").map(Number);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}
/** Giờ (số) giữa 2 mốc "HH:mm" — thiếu/không hợp lệ → 0. */
function hoursBetween(start: string | null, end: string | null): number {
  const a = parseHHmm(start);
  const b = parseHHmm(end);
  if (a === null || b === null || b <= a) return 0;
  return (b - a) / 60;
}
const fmtHours = (h: number) => h.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
/** "sáng" (<12) · "chiều" (12–17) · "tối" (≥17) từ giờ bắt đầu — đặt tên "Ca dạy …". */
function shiftOfDay(start: string | null): string {
  const m = parseHHmm(start);
  if (m === null) return "";
  if (m < 12 * 60) return "sáng";
  if (m < 17 * 60) return "chiều";
  return "tối";
}

/** "YYYY-MM-DD" theo giờ VN cho cột Timestamptz. */
const dayKeyFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "Asia/Ho_Chi_Minh",
});
function isoKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
const dateFmt = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: "UTC",
});

const ADJUST_STATUS: Record<AdjustStatus, { label: string; cls: string }> = {
  PENDING: {
    label: "Chờ duyệt",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  APPROVED: {
    label: "Đã duyệt",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200",
  },
  REJECTED: {
    label: "Từ chối",
    cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
  },
};

type CaType = "Dạy" | "Trải nghiệm" | "Ca làm";
const TYPE_TONE: Record<CaType, string> = {
  Dạy: "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
  "Trải nghiệm": "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300",
  "Ca làm": "bg-muted text-muted-foreground",
};

/** Một CA trong bảng chi tiết (đã chuẩn hoá từ 3 nguồn). */
type CaRow = {
  key: string;
  name: string;
  subtitle: string | null;
  type: CaType;
  dateLabel: string; // "YYYY-MM-DD"
  timeLabel: string;
  hours: number | null; // null → "—" (không cộng tổng)
  done: boolean; // Đã làm vs Sắp tới
};

export default async function TeacherTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ thang?: string }>;
}) {
  const session = await auth();
  if (!session?.user) return null; // layout đã gate

  const sp = await searchParams;
  const todayUtc = vnTodayUtc();
  const todayKey = isoKey(todayUtc);
  const thisMonth = startOfMonthUtc(todayUtc);
  const monthStart = parseThang(sp.thang) ?? thisMonth;
  const nextMonth = addMonthsUtc(monthStart, 1);
  const isCurrentMonth = monthStart.getTime() === thisMonth.getTime();

  const actor = await resolveActor(session.user.id);
  const xdb = withMakeupException(actor);
  const classIds = [...actor.assignedClassIds];

  const canRequestAdjust = await checkPermission("hr_attendance:checkin", {
    centerId: session.user.centerId,
  });

  const [sessions, trials, shiftRows, holidays, adjustRequests] = await Promise.all([
    // Buổi lớp trong tháng (mọi trạng thái trừ hủy) — lớp mình / thực dạy.
    xdb.classSession.findMany({
      where: {
        status: { not: "CANCELLED" },
        date: { gte: toVnInstant(monthStart), lt: toVnInstant(nextMonth) },
        OR: [{ classId: { in: classIds } }, { actualTeacherId: session.user.id }],
      },
      select: {
        id: true,
        date: true,
        status: true,
        class: {
          select: { name: true, startTime: true, endTime: true, center: { select: { name: true } } },
        },
      },
      orderBy: { date: "asc" },
      take: 500,
    }),
    getTeacherTrialSessions(session.user.id, monthStart, nextMonth),
    getOwnShiftRegistrations(session.user.id, monthStart, nextMonth),
    // Vá 24/07 — getVisibleHolidays nhận actor, tự tính per-model scope Holiday.
    getVisibleHolidays(actor, monthStart, nextMonth),
    getOwnAdjustmentRequests(session.user.id, monthStart, nextMonth),
  ]);

  // ── Chuẩn hoá về CA rows ──────────────────────────────────────────────────────
  const rows: CaRow[] = [];

  for (const s of sessions) {
    const dk = dayKeyFmt.format(s.date);
    const hrs = hoursBetween(s.class.startTime, s.class.endTime);
    rows.push({
      key: `d-${s.id}`,
      name: `Ca dạy ${shiftOfDay(s.class.startTime)}`.trim(),
      subtitle: [s.class.name, s.class.center?.name].filter(Boolean).join(" · ") || null,
      type: "Dạy",
      dateLabel: dk,
      timeLabel:
        s.class.startTime && s.class.endTime ? `${s.class.startTime}–${s.class.endTime}` : "—",
      hours: hrs > 0 ? hrs : null,
      done: (s.status as SessionStatus) === "COMPLETED" || dk < todayKey,
    });
  }

  for (const t of trials) {
    const dk = isoKey(t.date);
    const hrs = hoursBetween(t.startTime, t.endTime);
    rows.push({
      key: `t-${t.id}`,
      name: t.trialClassName,
      subtitle: null,
      type: "Trải nghiệm",
      dateLabel: dk,
      timeLabel: `${t.startTime}–${t.endTime}`,
      hours: hrs > 0 ? hrs : null,
      done: t.status === "COMPLETED" || dk < todayKey,
    });
  }

  for (const r of shiftRows) {
    const dk = isoKey(r.date);
    for (const code of SHIFT_ORDER.filter((c) => r.shifts.includes(c))) {
      const def = SHIFT_DEFS[code as WorkShift];
      rows.push({
        key: `s-${dk}-${code}`,
        name: def.label,
        subtitle: null,
        type: "Ca làm",
        dateLabel: dk,
        timeLabel: `${def.start}–${def.end}`,
        // Ca làm: chỉ đăng ký ngày+mã ca, KHÔNG giờ công thực → "—", không cộng tổng.
        hours: null,
        done: dk < todayKey,
      });
    }
  }

  rows.sort((a, b) => a.dateLabel.localeCompare(b.dateLabel) || a.timeLabel.localeCompare(b.timeLabel));

  // ── Tổng hợp (4 stat) ─────────────────────────────────────────────────────────
  const teachingCount = rows.filter((r) => r.type === "Dạy").length;
  const totalHours = rows.reduce((n, r) => n + (r.hours ?? 0), 0);
  // Ngày nghỉ = số NGÀY (giờ VN) trong tháng rơi vào ngày nghỉ.
  const holidayDays = new Set<string>();
  for (const h of holidays) {
    const start = Math.max(h.date.getTime(), monthStart.getTime());
    const end = Math.min((h.endDate ?? h.date).getTime(), nextMonth.getTime() - DAY_MS);
    for (let t = start; t <= end; t += DAY_MS) holidayDays.add(isoKey(new Date(t)));
  }

  const monthLabel = `Tháng ${monthStart.getUTCMonth() + 1}/${monthStart.getUTCFullYear()}`;

  return (
    <div>
      <PageHeader
        title="Bảng công"
        subtitle="Số ca và giờ công theo tháng — giờ dạy/trải nghiệm ước tính từ khung giờ, không phải công chính thức."
        actions={
          canRequestAdjust ? (
            <AdjustRequestDialog defaultDate={todayUtc.toISOString().slice(0, 10)} />
          ) : null
        }
      />

      <div className="space-y-6">
        {/* Chọn tháng */}
        <div className="flex flex-wrap items-center gap-2">
          <NavLink href={`?thang=${monthKey(addMonthsUtc(monthStart, -1))}`} aria="Tháng trước">
            <ChevronLeft className="h-4 w-4" />
          </NavLink>
          <NavLink href={`?thang=${monthKey(nextMonth)}`} aria="Tháng sau">
            <ChevronRight className="h-4 w-4" />
          </NavLink>
          <Link
            href="?"
            className="ml-1 inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted/50"
          >
            Tháng này
          </Link>
          <p className="ml-2 text-base font-bold text-foreground">{monthLabel}</p>
          {isCurrentMonth && (
            <span className="rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              tạm tính đến hôm nay
            </span>
          )}
        </div>

        {/* 4 stat (ẩn OT/Đi muộn/Chuyên cần — không có dữ liệu thật) */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard icon={Layers} value={rows.length} label="Số ca" tone="brand" />
          <StatCard icon={GraduationCap} value={teachingCount} label="Buổi dạy" tone="green" />
          <StatCard icon={Clock} value={`${fmtHours(totalHours)}h`} label="Tổng giờ công" tone="blue" />
          <StatCard icon={CalendarOff} value={holidayDays.size} label="Ngày nghỉ" tone="amber" />
        </div>

        {/* Chi tiết ca */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
            Chi tiết ca ({rows.length})
          </h2>
          {rows.length === 0 ? (
            <EmptyState
              icon={CalendarX2}
              title="Không có ca dạy, trải nghiệm hay ca làm nào trong tháng này."
            />
          ) : (
            <div className="t-card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                      <th scope="col" className="px-4 py-3">Ca</th>
                      <th scope="col" className="px-4 py-3">Loại</th>
                      <th scope="col" className="px-4 py-3">Ngày</th>
                      <th scope="col" className="px-4 py-3">Giờ</th>
                      <th scope="col" className="px-4 py-3">Giờ công</th>
                      <th scope="col" className="px-4 py-3">Trạng thái</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr
                        key={r.key}
                        className="border-b border-border/60 transition-colors last:border-0 hover:bg-muted/50"
                      >
                        <td className="px-4 py-3">
                          <p className="font-semibold text-foreground">{r.name}</p>
                          {r.subtitle && (
                            <p className="text-xs text-muted-foreground">{r.subtitle}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                              TYPE_TONE[r.type],
                            )}
                          >
                            {r.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {r.dateLabel}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-foreground">{r.timeLabel}</td>
                        <td className="px-4 py-3 whitespace-nowrap font-semibold text-foreground">
                          {r.hours != null ? `${fmtHours(r.hours)}h` : (
                            <span className="font-normal text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
                              r.done
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-600/20 dark:text-emerald-200"
                                : "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300",
                            )}
                          >
                            {r.done ? "Đã làm" : "Sắp tới"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {/* Yêu cầu chỉnh công của mình trong tháng */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold tracking-wide text-muted-foreground uppercase">
            Yêu cầu chỉnh công trong tháng ({adjustRequests.length})
          </h2>
          {adjustRequests.length === 0 ? (
            <EmptyState icon={ClipboardList} title="Chưa có yêu cầu chỉnh công nào cho tháng này." />
          ) : (
            <ul className="space-y-2">
              {adjustRequests.map((r) => (
                <li key={r.id} className="t-card p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-foreground">{dateFmt.format(r.date)}</span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        ADJUST_STATUS[r.status].cls,
                      )}
                    >
                      {ADJUST_STATUS[r.status].label}
                    </span>
                  </div>
                  {r.requested && (
                    <p className="mt-1 text-sm text-foreground">Đề nghị: {r.requested}</p>
                  )}
                  <p className="mt-1 text-sm whitespace-pre-wrap text-muted-foreground">{r.reason}</p>
                  {r.reviewNote && (
                    <p className="mt-2 rounded-lg bg-muted/50 p-2 text-sm text-muted-foreground">
                      Phản hồi: {r.reviewNote}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function NavLink({
  href,
  aria,
  children,
}: {
  href: string;
  aria: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={aria}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted/50"
    >
      {children}
    </Link>
  );
}
