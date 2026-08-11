import Link from "next/link";
import { safeCache } from "@/lib/cache/safe-cache";
import { Wallet, AlertTriangle, TrendingUp } from "lucide-react";
import { scopedDb } from "@/lib/db-scope";
import type { Actor } from "@/lib/auth/actor";
import { CACHE_TAGS } from "@/lib/cache/tags";
import { actorScopeKey } from "@/lib/cache/scope-key";

const PAID_STATUSES = ["CONFIRMED", "COMPLETED"] as const;

function vnd(n: number): string {
  return `${n.toLocaleString("vi-VN")}đ`;
}

// Đợt 3C — Dashboard KẾ TOÁN. Tài chính toàn hệ thống. KHÔNG pipeline/điểm danh/giáo trình.
// REQ-04: số liệu tài chính dashboard kế toán (aggregate theo scope → PRIMITIVE, tên cơ
// sở resolve sẵn, KHÔNG Map/Date trong output → serialize an toàn).
async function getAccountantStats(actor: Actor) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const overdueBefore = new Date(now.getTime() - 7 * 86400000); // PENDING_PAYMENT > 7 ngày

  // FL0 — cách ly cơ sở: Order ∈ SCOPED_MODELS → scopedDb lọc theo tầm nhìn cơ sở.
  const sdb = scopedDb(actor);
  const [paidAgg, debtAgg, revenueMonth, debtByCenter, overdueOrders, centers] = await Promise.all([
    sdb.order.aggregate({ where: { status: { in: [...PAID_STATUSES] } }, _sum: { totalAmount: true } }),
    sdb.order.aggregate({ where: { status: "PENDING_PAYMENT" }, _sum: { totalAmount: true } }),
    sdb.order.aggregate({
      where: { status: { in: [...PAID_STATUSES] }, paidAt: { gte: monthStart } },
      _sum: { totalAmount: true },
    }),
    sdb.order.groupBy({
      by: ["centerId"],
      where: { status: "PENDING_PAYMENT" },
      _sum: { totalAmount: true },
    }),
    sdb.order.findMany({
      where: { status: "PENDING_PAYMENT", createdAt: { lt: overdueBefore } },
      orderBy: { createdAt: "asc" },
      take: 12,
      select: {
        id: true, totalAmount: true,
        student: { select: { name: true } },
        center: { select: { name: true } },
      },
    }),
    sdb.center.findMany({ select: { id: true, name: true } }),
  ]);

  const centerName = new Map(centers.map((c) => [c.id, c.name]));
  return {
    paid: paidAgg._sum.totalAmount ?? 0,
    debt: debtAgg._sum.totalAmount ?? 0,
    revenueMonth: revenueMonth._sum.totalAmount ?? 0,
    debtByCenter: debtByCenter.map((d) => ({
      label: d.centerId ? centerName.get(d.centerId) ?? "—" : "Chưa gán cơ sở",
      amount: d._sum.totalAmount ?? 0,
    })),
    overdueOrders: overdueOrders.map((o) => ({
      id: o.id,
      studentName: o.student?.name ?? "—",
      centerName: o.center?.name ?? "",
      amount: o.totalAmount,
    })),
  };
}

export async function AccountantDashboard({ name, actor, embedded = false }: { name: string; actor: Actor; embedded?: boolean }) {
  // REQ-04: cache theo scope, TTL 60s. Output primitive (tên resolve sẵn).
  const { paid, debt, revenueMonth, debtByCenter, overdueOrders } = await safeCache(
    () => getAccountantStats(actor),
    ["accountant-dashboard-stats", actorScopeKey(actor)],
    { tags: [CACHE_TAGS.dashboard], revalidate: 60 },
  )();

  return (
    <div className="space-y-6">
      {!embedded && <h1 className="text-2xl font-bold text-gray-900">Chào {name || "bạn"} 👋 · Tài chính</h1>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatBig label="Đã thu (tổng)" value={vnd(paid)} tone="ok" icon={<Wallet className="h-5 w-5" />} />
        <StatBig label="Còn nợ (chờ thanh toán)" value={vnd(debt)} tone={debt > 0 ? "danger" : "ok"} icon={<AlertTriangle className="h-5 w-5" />} />
        <StatBig label="Doanh thu tháng này" value={vnd(revenueMonth)} tone="neutral" icon={<TrendingUp className="h-5 w-5" />} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Công nợ theo cơ sở */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-gray-500">Công nợ theo cơ sở</h2>
          {debtByCenter.length === 0 ? (
            <p className="text-sm text-gray-400">Không có công nợ.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {debtByCenter.map((d, i) => (
                <li key={i} className="flex items-center justify-between">
                  <span className="text-gray-700">{d.label}</span>
                  <span className="font-semibold tabular-nums text-state-danger-ink">{vnd(d.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Hoá đơn quá hạn */}
        <section className="rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-gray-500">
            <AlertTriangle className="h-4 w-4 text-state-danger-ink" /> Hoá đơn quá hạn (&gt;7 ngày chưa thu)
          </h2>
          {overdueOrders.length === 0 ? (
            <p className="text-sm text-gray-400">Không có hoá đơn quá hạn.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {overdueOrders.map((o) => (
                <li key={o.id} className="flex items-center justify-between gap-2">
                  <Link href={`/orders/${o.id}`} className="truncate text-gray-800 hover:text-primary">
                    {o.studentName}
                    <span className="ml-1 text-xs text-gray-400">{o.centerName}</span>
                  </Link>
                  <span className="shrink-0 font-semibold tabular-nums text-state-danger-ink">{vnd(o.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <Link href="/orders" className="inline-block text-sm font-semibold text-primary hover:underline">
        Quản lý đơn hàng / học phí →
      </Link>
    </div>
  );
}

function StatBig({
  label, value, tone, icon,
}: {
  label: string; value: string; tone: "neutral" | "ok" | "danger"; icon: React.ReactNode;
}) {
  const toneCls = tone === "danger" ? "text-state-danger-ink" : tone === "ok" ? "text-state-success-ink" : "text-primary";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className={`flex items-center gap-2 ${toneCls}`}>{icon}<span className="text-xl font-bold tabular-nums">{value}</span></div>
      <div className="mt-1 text-xs text-gray-500">{label}</div>
    </div>
  );
}
