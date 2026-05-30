import Link from "next/link";
import { CheckCircle2, AlertTriangle, ClipboardList } from "lucide-react";
import { getPendingTasks, summarizePendingTasks, type TaskUser } from "@/lib/pending-tasks";

// Module nhắc việc PHẦN 2 — khu "Cần xử lý" trên dashboard (server component).
export async function PendingTasksSection({ user }: { user: TaskUser }) {
  const groups = await getPendingTasks(user);
  if (groups.length === 0) return null;

  const { total, overdue } = summarizePendingTasks(groups);
  const active = groups.filter((g) => g.count > 0);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-600">
          <ClipboardList className="h-4 w-4 text-[#7C3AED]" /> Cần xử lý
        </h2>
        <div className="flex items-center gap-2">
          {overdue > 0 && (
            <span className="rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-bold text-rose-700">
              {overdue} quá hạn
            </span>
          )}
          <span className="rounded-full bg-[#7C3AED] px-2.5 py-0.5 text-xs font-bold text-white">
            {total} việc
          </span>
        </div>
      </div>

      {active.length === 0 ? (
        <p className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Đã sạch — không có việc nào cần xử lý.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {active.map((g) => (
            <Link
              key={g.type}
              href={g.href}
              className={`flex items-start justify-between gap-3 rounded-xl border p-3 transition-colors ${
                g.overdueCount > 0
                  ? "border-rose-200 bg-rose-50/50 hover:border-rose-300"
                  : "border-gray-200 hover:border-[#7C3AED]"
              }`}
            >
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{g.label}</p>
                {g.items.length > 0 && (
                  <p className="mt-0.5 truncate text-xs text-gray-500">
                    {g.items.map((i) => i.label).slice(0, 2).join(" · ")}
                    {g.count > 2 && ` …+${g.count - 2}`}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-bold text-gray-700">
                  {g.count}
                </span>
                {g.overdueCount > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-rose-600">
                    <AlertTriangle className="h-3 w-3" /> {g.overdueCount} quá hạn
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
