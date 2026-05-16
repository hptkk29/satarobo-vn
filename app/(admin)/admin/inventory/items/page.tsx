import Link from "next/link";
import { Boxes, FileSpreadsheet, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { InventoryCategory, type Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER", "ACCOUNTANT"];

const CATEGORY_INFO: Record<InventoryCategory, { label: string; color: string }> = {
  MAINBOARD: { label: "Bo mạch", color: "bg-blue-100 text-blue-700" },
  SENSOR: { label: "Cảm biến", color: "bg-cyan-100 text-cyan-700" },
  MOTOR: { label: "Động cơ", color: "bg-orange-100 text-orange-700" },
  BATTERY: { label: "Pin", color: "bg-yellow-100 text-yellow-700" },
  MECHANICAL: { label: "Cơ khí", color: "bg-neutral-100 text-neutral-700" },
  WIRE: { label: "Dây", color: "bg-amber-100 text-amber-700" },
  TOOL: { label: "Dụng cụ", color: "bg-purple-100 text-purple-700" },
  CONSUMABLE: { label: "Vật tư", color: "bg-pink-100 text-pink-700" },
  ROBOSIM: { label: "Robosim", color: "bg-emerald-100 text-emerald-700" },
  OTHER: { label: "Khác", color: "bg-neutral-100 text-neutral-500" },
};

const VALID_CATEGORIES = Object.values(InventoryCategory);

interface SearchParams {
  searchParams: Promise<{
    q?: string;
    category?: string;
    isActive?: string;
  }>;
}

export default async function InventoryItemsPage({ searchParams }: SearchParams) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/admin/dashboard?error=unauthorized");
  }

  const sp = await searchParams;
  const q = sp.q?.trim() || undefined;
  const categoryFilter =
    sp.category && VALID_CATEGORIES.includes(sp.category as InventoryCategory)
      ? (sp.category as InventoryCategory)
      : undefined;
  // Default: only active. Pass isActive=all to see everything.
  const activeFilter: boolean | undefined =
    sp.isActive === "all" ? undefined : sp.isActive === "false" ? false : true;

  const where: Prisma.InventoryItemWhereInput = {
    ...(categoryFilter ? { category: categoryFilter } : {}),
    ...(activeFilter !== undefined ? { isActive: activeFilter } : {}),
    ...(q
      ? {
          OR: [
            { itemCode: { contains: q, mode: "insensitive" as const } },
            { name: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const items = await db.inventoryItem.findMany({
    where,
    include: {
      balances: {
        select: {
          quantity: true,
          reserved: true,
          minThreshold: true,
          centerId: true,
        },
      },
    },
    orderBy: [{ category: "asc" }, { itemCode: "asc" }],
    take: 200,
  });

  const itemsView = items.map((item) => {
    const totalStock = item.balances.reduce((sum, b) => sum + b.quantity, 0);
    const totalReserved = item.balances.reduce(
      (sum, b) => sum + b.reserved,
      0,
    );
    const lowStockCount = item.balances.filter(
      (b) =>
        b.quantity < (b.minThreshold ?? item.defaultMinThreshold),
    ).length;
    return { ...item, totalStock, totalReserved, lowStockCount };
  });

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <Boxes className="h-6 w-6 text-[#7C3AED]" />
            Kho — Học cụ
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {itemsView.length > 0 ? `${itemsView.length} mặt hàng` : "Chưa có mặt hàng nào"}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/inventory/items/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Thêm hàng
          </Link>
          <Link
            href="/admin/inventory/items/import"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Import Excel
          </Link>
        </div>
      </div>

      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Tìm mã hàng / tên..."
          className="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/20"
        />
        <select
          name="category"
          defaultValue={categoryFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi danh mục</option>
          {Object.entries(CATEGORY_INFO).map(([v, { label }]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="isActive"
          defaultValue={sp.isActive ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Đang sử dụng (mặc định)</option>
          <option value="false">Không sử dụng</option>
          <option value="all">Tất cả</option>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 sm:col-span-2 lg:col-span-4"
        >
          Áp dụng bộ lọc
        </button>
      </form>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-100">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Ảnh
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Mã / Tên
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Danh mục
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Đơn vị
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Tổng tồn
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Đã đặt
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Cảnh báo
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {itemsView.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    Chưa có mặt hàng nào khớp bộ lọc.{" "}
                    <Link
                      href="/admin/inventory/items/new"
                      className="text-[#7C3AED] hover:underline"
                    >
                      Thêm hàng →
                    </Link>
                  </td>
                </tr>
              ) : (
                itemsView.map((item) => {
                  const catInfo = CATEGORY_INFO[item.category];
                  return (
                    <tr key={item.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-3">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-10 w-10 rounded border border-gray-200 object-cover"
                          />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-gray-200 text-[10px] text-gray-400">
                            no img
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900">{item.name}</div>
                        <div className="text-xs text-gray-400 tabular-nums">
                          {item.itemCode}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${catInfo.color}`}
                        >
                          {catInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-sm text-gray-600">
                        {item.unit}
                      </td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums font-semibold text-gray-700">
                        {item.totalStock}
                      </td>
                      <td className="px-3 py-3 text-right text-sm tabular-nums text-gray-500">
                        {item.totalReserved}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {item.lowStockCount > 0 ? (
                          <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                            {item.lowStockCount} cơ sở
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <Link
                          href={`/admin/inventory/items/${item.id}/edit`}
                          className="inline-flex items-center gap-1 rounded-md border border-purple-200 px-2.5 py-1 text-xs font-semibold text-purple-700 hover:bg-purple-50"
                        >
                          Sửa
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
