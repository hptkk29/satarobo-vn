import Link from "next/link";
import { unstable_cache } from "next/cache";
import { BarChart3, Briefcase, Users, CalendarClock } from "lucide-react";
import { scopedDb } from "@/lib/db-scope";
import type { Actor } from "@/lib/auth/actor";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { actorScopeKey } from "@/lib/cache/scope-key";

function startOfWeek(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

// REQ-04: số liệu dashboard marketing (aggregate theo scope → PRIMITIVE, bySource phẳng).
async function getMarketingStats(actor: Actor) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  // FL0 — cách ly cơ sở: Lead ∈ SCOPED_MODELS → scopedDb lọc theo tầm nhìn cơ sở.
  const sdb = scopedDb(actor);
  const [bySource, newThisWeek, total, enrolledTotal] = await Promise.all([
    sdb.lead.groupBy({
      by: ["source"],
      where: { deletedAt: null },
      _count: { _all: true },
      orderBy: { _count: { source: "desc" } },
      take: 8,
    }),
    sdb.lead.count({ where: { deletedAt: null, createdAt: { gte: weekStart } } }),
    sdb.lead.count({ where: { deletedAt: null } }),
    sdb.lead.count({ where: { deletedAt: null, status: "ENROLLED" } }),
  ]);
  return {
    bySource: bySource.map((s) => ({ source: s.source, count: s._count._all })),
    newThisWeek,
    total,
    enrolledTotal,
  };
}

// Đợt 3C #5 — Dashboard MARKETING (nguồn lead, hiệu quả kênh tóm tắt).
export async function MarketingDashboard({ name, actor, embedded = false }: { name: string; actor: Actor; embedded?: boolean }) {
  // REQ-04: cache theo scope, TTL 60s. Output primitive.
  const { bySource, newThisWeek, total, enrolledTotal } = await unstable_cache(
    () => getMarketingStats(actor),
    ["marketing-dashboard-stats", actorScopeKey(actor)],
    { tags: [CACHE_TAGS.dashboard], revalidate: 60 },
  )();

  const convRate = total > 0 ? Math.round((enrolledTotal / total) * 100) : 0;
  const maxCount = Math.max(1, ...bySource.map((s) => s.count));

  return (
    <div className="space-y-6">
      {!embedded && <h1 className="text-2xl font-bold text-gray-900">Chào {name || "bạn"} 👋 · Marketing</h1>}
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Lead mới tuần này" value={newThisWeek} />
        <Stat label="Tổng lead" value={total} />
        <Stat label="Tỷ lệ chuyển đổi" value={`${convRate}%`} />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
          <BarChart3 className="h-4 w-4" /> Nguồn lead theo kênh
        </h2>
        {bySource.length === 0 ? (
          <p className="text-sm text-gray-400">Chưa có lead.</p>
        ) : (
          <ul className="space-y-2">
            {bySource.map((s, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate text-gray-700" title={s.source ?? "—"}>{s.source ?? "(không nguồn)"}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-[#7C3AED]" style={{ width: `${(s.count / maxCount) * 100}%` }} />
                </div>
                <span className="w-10 text-right font-semibold tabular-nums text-gray-700">{s.count}</span>
              </li>
            ))}
          </ul>
        )}
        <Link href="/marketing" className="mt-3 inline-block text-sm font-semibold text-[#7C3AED] hover:underline">Xem Tracking chi tiết →</Link>
      </section>
    </div>
  );
}

// REQ-04: số liệu dashboard HR (đếm theo scope → PRIMITIVE).
async function getHrStats(actor: Actor) {
  const now = new Date();
  const weekStart = startOfWeek(now);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);

  // FL0 — cách ly cơ sở: Employee/ShiftRegistration ∈ SCOPED_MODELS → scopedDb lọc
  // theo tầm nhìn cơ sở. JobPosting không scoped → đi qua nguyên vẹn.
  const sdb = scopedDb(actor);
  const [activeStaff, openJobs, shiftRegsWeek, leaveReqs] = await Promise.all([
    sdb.employee.count({ where: { status: "ACTIVE" } }),
    sdb.jobPosting.count({ where: { status: "OPEN" } }),
    sdb.shiftRegistration.count({ where: { date: { gte: weekStart, lt: weekEnd } } }),
    sdb.shiftRegistration.count({ where: { status: "LEAVE_REQUESTED", date: { gte: weekStart } } }),
  ]);
  return { activeStaff, openJobs, shiftRegsWeek, leaveReqs };
}

// Đợt 3C #5 — Dashboard HR (nhân sự, tuyển dụng, đăng ký ca).
export async function HrDashboard({ name, actor, embedded = false }: { name: string; actor: Actor; embedded?: boolean }) {
  // REQ-04: cache theo scope, TTL 60s.
  const { activeStaff, openJobs, shiftRegsWeek, leaveReqs } = await unstable_cache(
    () => getHrStats(actor),
    ["hr-dashboard-stats", actorScopeKey(actor)],
    { tags: [CACHE_TAGS.dashboard], revalidate: 60 },
  )();

  return (
    <div className="space-y-6">
      {!embedded && <h1 className="text-2xl font-bold text-gray-900">Chào {name || "bạn"} 👋 · Nhân sự</h1>}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Nhân viên đang làm" value={activeStaff} href="/nhan-su" icon={<Users className="h-5 w-5" />} />
        <Stat label="Tuyển dụng đang mở" value={openJobs} href="/jobs" icon={<Briefcase className="h-5 w-5" />} />
        <Stat label="Đăng ký ca tuần này" value={shiftRegsWeek} href="/cham-cong/lich-ca-nhan-vien" icon={<CalendarClock className="h-5 w-5" />} />
        <Stat label="Xin nghỉ khẩn" value={leaveReqs} href="/cham-cong/lich-ca-nhan-vien" tone={leaveReqs > 0 ? "danger" : "ok"} icon={<CalendarClock className="h-5 w-5" />} />
      </div>
    </div>
  );
}

function Stat({
  label, value, href, tone = "neutral", icon,
}: {
  label: string; value: number | string; href?: string; tone?: "neutral" | "ok" | "danger"; icon?: React.ReactNode;
}) {
  const toneCls = tone === "danger" ? "text-rose-600" : tone === "ok" ? "text-emerald-600" : "text-[#7C3AED]";
  const body = (
    <>
      <div className={`flex items-center gap-2 ${toneCls}`}>{icon}<span className="text-2xl font-bold tabular-nums">{value}</span></div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </>
  );
  return href ? (
    <Link href={href} className="rounded-xl border border-gray-200 bg-white p-4 hover:border-[#7C3AED]">{body}</Link>
  ) : (
    <div className="rounded-xl border border-gray-200 bg-white p-4">{body}</div>
  );
}
