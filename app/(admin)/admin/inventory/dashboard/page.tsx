import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ClipboardCheck,
  DollarSign,
  History,
  LayoutDashboard,
  Package,
} from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getInventoryStats } from "@/lib/inventory-stats";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER", "ACCOUNTANT"];

function formatVnd(value: number): string {
  return new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 0 }).format(
    value,
  ) + " ₫";
}

function formatRelative(d: Date | null): string {
  if (!d) return "—";
  const diffDays = (Date.now() - new Date(d).getTime()) / 86400000;
  if (diffDays < 1) return "Hôm nay";
  if (diffDays < 7) return `${Math.floor(diffDays)} ngày trước`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} tuần trước`;
  return new Date(d).toLocaleDateString("vi-VN");
}

export default async function InventoryDashboardPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/admin/dashboard?error=unauthorized");
  }

  const stats = await getInventoryStats();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <LayoutDashboard className="h-6 w-6 text-[#7C3AED]" />
            Tổng quan Kho
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Theo dõi tồn kho ZMROBO + linh kiện trên toàn hệ thống.
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <Link
            href="/admin/inventory/items"
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50"
          >
            Mặt hàng →
          </Link>
          <Link
            href="/admin/inventory/movements"
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50"
          >
            <History className="mr-1 inline h-3.5 w-3.5" />
            Lịch sử
          </Link>
          <Link
            href="/admin/inventory/audit"
            className="rounded-md border border-gray-200 bg-white px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50"
          >
            <ClipboardCheck className="mr-1 inline h-3.5 w-3.5" />
            Kiểm kê
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          icon={<Package className="h-5 w-5 text-blue-500" />}
          label="Mặt hàng active"
          value={String(stats.totalItems)}
          sub={`${stats.totalBalances} entry có tồn`}
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5 text-green-500" />}
          label="Tổng giá trị tồn"
          value={formatVnd(stats.totalStockValue)}
        />
        <StatCard
          icon={
            <AlertTriangle
              className={`h-5 w-5 ${stats.lowStockCount > 0 ? "text-red-500" : "text-gray-400"}`}
            />
          }
          label="Cảnh báo tồn thấp"
          value={String(stats.lowStockCount)}
          danger={stats.lowStockCount > 0}
        />
        <StatCard
          icon={<Activity className="h-5 w-5 text-purple-500" />}
          label="Giao dịch 7 ngày"
          value={String(stats.recentMovements)}
        />
      </div>

      {stats.lowStockAlerts.length > 0 && (
        <section className="overflow-hidden rounded-xl border-2 border-red-300 bg-white">
          <header className="flex items-center gap-2 border-b border-red-300 bg-red-50 px-4 py-3">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h2 className="font-semibold text-red-900">
              Cảnh báo tồn thấp ({stats.lowStockAlerts.length} mục)
            </h2>
          </header>
          <div className="max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-50 border-b text-xs uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-2 text-left">Mặt hàng</th>
                  <th className="px-4 py-2 text-left">Cơ sở</th>
                  <th className="px-4 py-2 text-right">Tồn</th>
                  <th className="px-4 py-2 text-right">Ngưỡng</th>
                  <th className="px-4 py-2 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {stats.lowStockAlerts.slice(0, 50).map((a) => (
                  <tr
                    key={`${a.itemId}-${a.centerId}`}
                    className={
                      "border-b " +
                      (a.severity === "CRITICAL"
                        ? "bg-red-50"
                        : "bg-amber-50/60")
                    }
                  >
                    <td className="px-4 py-2">
                      <div className="font-medium text-neutral-900">
                        {a.itemName}
                      </div>
                      <div className="text-xs text-neutral-500 tabular-nums">
                        {a.itemCode}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-neutral-600">{a.centerName}</td>
                    <td
                      className={`px-4 py-2 text-right font-bold tabular-nums ${
                        a.severity === "CRITICAL"
                          ? "text-red-700"
                          : "text-amber-700"
                      }`}
                    >
                      {a.quantity} {a.unit}
                      {a.severity === "CRITICAL" && (
                        <span className="ml-1 text-[10px] uppercase tracking-wider">
                          (Hết)
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-500">
                      {a.threshold}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/admin/inventory/items/${a.itemId}/edit`}
                        className="text-xs font-semibold text-[#7C3AED] hover:underline"
                      >
                        Mở →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.lowStockAlerts.length > 50 && (
              <p className="border-t border-neutral-100 bg-neutral-50 py-2 text-center text-xs text-neutral-500">
                Hiển thị 50 mục đầu tiên · Tổng: {stats.lowStockAlerts.length}
              </p>
            )}
          </div>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-neutral-100 bg-neutral-50 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700">
            Tồn kho theo cơ sở
          </h2>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-100 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Cơ sở
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Mặt hàng có tồn
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Tổng giá trị
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Cảnh báo thấp
                </th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Hoạt động gần nhất
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {stats.centers.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-sm text-neutral-400"
                  >
                    Chưa có cơ sở nào có tồn kho.
                  </td>
                </tr>
              ) : (
                stats.centers.map((c) => (
                  <tr key={c.centerId} className="hover:bg-neutral-50/60">
                    <td className="px-4 py-2 font-medium text-neutral-900">
                      {c.centerName}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-700">
                      {c.distinctItems}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums font-semibold text-neutral-700">
                      {formatVnd(c.totalValue)}
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        c.lowStockItems > 0
                          ? "font-bold text-red-600"
                          : "text-neutral-400"
                      }`}
                    >
                      {c.lowStockItems}
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-neutral-500">
                      {formatRelative(c.lastActivity)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  danger?: boolean;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex items-center justify-between">
        {icon}
      </div>
      <p className="mt-2 text-xs uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold ${
          danger ? "text-red-600" : "text-neutral-900"
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-neutral-400">{sub}</p>}
    </div>
  );
}
