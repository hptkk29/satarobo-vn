import { monthGrid, WEEKDAY_LABELS } from "@/lib/lms/calendar";

export type CalEvent = { iso: string; label: string; sublabel?: string };

const VN_MONTH = (m0: number) => `Tháng ${m0 + 1}`;

// Lịch tháng dùng chung (admin + portal). Server component, CSS grid thuần (không
// chart/animation lib → không vướng ESLint boundary).
export function MonthCalendar({
  year,
  month0,
  events,
}: {
  year: number;
  month0: number;
  events: CalEvent[];
}) {
  const weeks = monthGrid(year, month0);
  const byDay = new Map<string, CalEvent[]>();
  for (const e of events) {
    const list = byDay.get(e.iso);
    if (list) list.push(e);
    else byDay.set(e.iso, [e]);
  }
  const todayIso = (() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
  })();

  return (
    <div>
      <p className="mb-2 text-sm font-medium">
        {VN_MONTH(month0)} / {year}
      </p>
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border bg-neutral-200 text-xs">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="bg-neutral-50 py-1 text-center font-medium text-neutral-600">
            {w}
          </div>
        ))}
        {weeks.flat().map((d) => {
          const evs = byDay.get(d.iso) ?? [];
          return (
            <div
              key={d.iso}
              className={`min-h-[72px] bg-white p-1 ${d.inMonth ? "" : "bg-neutral-50 text-neutral-300"}`}
            >
              <div className={`text-right ${d.iso === todayIso ? "font-bold text-orange-600" : ""}`}>
                {d.date.getDate()}
              </div>
              <div className="space-y-0.5">
                {evs.slice(0, 4).map((e, i) => (
                  <div
                    key={i}
                    className="truncate rounded bg-orange-100 px-1 text-[10px] text-orange-800"
                    title={`${e.label}${e.sublabel ? ` · ${e.sublabel}` : ""}`}
                  >
                    {e.sublabel ? `${e.sublabel} ` : ""}
                    {e.label}
                  </div>
                ))}
                {evs.length > 4 && <div className="text-[10px] text-neutral-400">+{evs.length - 4}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
