import { CalendarDays, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StudentSchedule, ScheduleSession } from "@/lib/portal/schedule";
import { PageHero } from "@/components/portal/page-header";

// Portal v2 — trang Lịch học (giống SataUI): hero + buổi kế tiếp + tuần này + sắp tới + lịch tháng.

const DOW = ["CN", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];
function dmy(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
function dm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function isToday(iso: string): boolean {
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/15 px-4 py-2 text-center backdrop-blur-sm">
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className="text-[11px] font-semibold text-white/80">{label}</p>
    </div>
  );
}

export function SchedulePageV2({
  schedule,
  calendar,
}: {
  schedule: StudentSchedule;
  calendar: React.ReactNode;
}) {
  const s = schedule;
  return (
    <div className="portal-v2 mx-auto w-full max-w-6xl space-y-6">
      <PageHero
        icon={CalendarDays}
        title="Lịch học"
        subtitle={[
          s.studentName,
          s.courseName,
          s.className ? `Lớp ${s.className}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        metric={
          <div className="flex gap-2">
            <HeroStat value={`${s.rate}%`} label="Chuyên cần" />
            <HeroStat value={`${s.done}/${s.total}`} label="Đã học" />
            <HeroStat value={`${s.remaining}`} label="Còn lại" />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left */}
        <div className="space-y-6 lg:col-span-2">
          {/* Buổi học tiếp theo */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Buổi học tiếp theo
            </h2>
            {s.next ? (
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-base font-bold text-foreground">
                    {s.next.title}
                  </p>
                  {isToday(s.next.dateISO) ? (
                    <span className="shrink-0 rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                      Hôm nay
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 text-xs font-bold text-muted-foreground">
                      {dm(s.next.dateISO)}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted-foreground">
                  {s.next.time && (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="size-4 text-primary" /> {s.next.time}
                    </span>
                  )}
                  {(s.next.room || s.next.teacher) && (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4 text-primary" />{" "}
                      {[s.next.room, s.next.teacher && `GV ${s.next.teacher}`]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Chưa có buổi học sắp tới.
              </p>
            )}
          </section>

          {/* Lịch học tuần này */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Lịch học tuần này
            </h2>
            <div className="rounded-2xl border border-border bg-card divide-y divide-border">
              {s.thisWeek.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  Tuần này không có buổi học.
                </p>
              ) : (
                s.thisWeek.map((it) => <WeekRow key={it.id} it={it} />)
              )}
            </div>
          </section>

          {/* Các buổi học sắp tới */}
          <section className="space-y-3">
            <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
              Các buổi học sắp tới
            </h2>
            <div className="space-y-2">
              {s.upcoming.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
                  Chưa có buổi học sắp tới.
                </p>
              ) : (
                s.upcoming.map((it, i) => (
                  <div
                    key={it.id}
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
                  >
                    <span
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-xl text-sm font-bold",
                        i === 0
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {it.order ?? "•"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-foreground">
                        {it.title}
                      </p>
                      <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                        Dự kiến: {dmy(it.dateISO)}
                      </p>
                    </div>
                    {i === 0 && (
                      <span className="shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                        Đang học
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        {/* Right: Lịch tháng */}
        <div className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-foreground">
            <CalendarDays className="size-4 text-primary" /> Lịch tháng
          </h2>
          <div className="rounded-2xl border border-border bg-card p-3">
            {calendar}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeekRow({ it }: { it: ScheduleSession }) {
  const d = new Date(it.dateISO);
  const today = isToday(it.dateISO);
  return (
    <div className="flex items-start gap-3 p-3">
      <div className="w-12 shrink-0 text-center">
        <p
          className={cn(
            "text-xs font-bold",
            today ? "text-primary" : "text-foreground",
          )}
        >
          {DOW[d.getDay()]}
        </p>
        <p className="text-xs font-medium text-muted-foreground">
          {dm(it.dateISO)}
        </p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-foreground">{it.title}</p>
        <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
          {[it.time, it.room, it.teacher && `GV ${it.teacher}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <span
        className={cn(
          "shrink-0 rounded-md px-2 py-0.5 text-xs font-bold",
          today
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {today ? "Hôm nay" : "Sắp tới"}
      </span>
    </div>
  );
}
