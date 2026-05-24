import Link from "next/link";
import { ChevronLeft, History } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { StockMovementType, type Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER", "ACCOUNTANT"];

const TYPE_INFO: Record<
  StockMovementType,
  { label: string; color: string; sign: "+" | "-" }
> = {
  RECEIPT: { label: "Nhập", color: "bg-green-100 text-green-700", sign: "+" },
  ISSUE: { label: "Xuất", color: "bg-red-100 text-red-700", sign: "-" },
  TRANSFER_OUT: {
    label: "Chuyển đi",
    color: "bg-amber-100 text-amber-700",
    sign: "-",
  },
  TRANSFER_IN: {
    label: "Nhận về",
    color: "bg-blue-100 text-blue-700",
    sign: "+",
  },
  ADJUSTMENT_INCREASE: {
    label: "Kiểm kê thừa",
    color: "bg-purple-100 text-purple-700",
    sign: "+",
  },
  ADJUSTMENT_DECREASE: {
    label: "Kiểm kê thiếu",
    color: "bg-purple-100 text-purple-700",
    sign: "-",
  },
};

const VALID_TYPES = Object.values(StockMovementType);

function fmtDateTime(d: Date) {
  return new Date(d).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtVnd(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return new Intl.NumberFormat("vi-VN").format(n) + "đ";
}

interface SearchParams {
  searchParams: Promise<{
    type?: string;
    itemId?: string;
    centerId?: string;
    from?: string;
    to?: string;
  }>;
}

export default async function MovementsPage({ searchParams }: SearchParams) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const sp = await searchParams;
  const typeFilter =
    sp.type && VALID_TYPES.includes(sp.type as StockMovementType)
      ? (sp.type as StockMovementType)
      : undefined;
  const itemFilter = sp.itemId?.trim() || undefined;
  const centerFilter = sp.centerId?.trim() || undefined;

  const fromDate = sp.from ? new Date(sp.from) : null;
  const toDate = sp.to ? new Date(sp.to) : null;
  const dateRange: Prisma.DateTimeFilter | undefined =
    fromDate || toDate
      ? {
          ...(fromDate && !Number.isNaN(fromDate.getTime())
            ? { gte: fromDate }
            : {}),
          ...(toDate && !Number.isNaN(toDate.getTime())
            ? // include end-of-day
              {
                lte: new Date(
                  toDate.getFullYear(),
                  toDate.getMonth(),
                  toDate.getDate(),
                  23,
                  59,
                  59,
                ),
              }
            : {}),
        }
      : undefined;

  const where: Prisma.StockMovementWhereInput = {
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(itemFilter ? { itemId: itemFilter } : {}),
    ...(centerFilter ? { centerId: centerFilter } : {}),
    ...(dateRange ? { performedAt: dateRange } : {}),
  };

  const [movements, items, centers] = await Promise.all([
    db.stockMovement.findMany({
      where,
      include: {
        item: { select: { itemCode: true, name: true, unit: true } },
        center: { select: { name: true } },
        performedBy: { select: { fullName: true } },
        transferPair: {
          include: { center: { select: { name: true } } },
        },
      },
      orderBy: { performedAt: "desc" },
      take: 200,
    }),
    db.inventoryItem.findMany({
      orderBy: { itemCode: "asc" },
      select: { id: true, itemCode: true, name: true },
      take: 500,
    }),
    db.center.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/inventory/items"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại kho
        </Link>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <History className="h-6 w-6 text-[#7C3AED]" />
          Lịch sử giao dịch kho
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {movements.length > 0
            ? `${movements.length} phiếu (tối đa 200 gần nhất)`
            : "Chưa có giao dịch nào khớp bộ lọc"}
        </p>
      </div>

      <form
        method="GET"
        className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6"
      >
        <select
          name="type"
          defaultValue={typeFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi loại</option>
          {Object.entries(TYPE_INFO).map(([v, { label }]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          name="itemId"
          defaultValue={itemFilter ?? ""}
          className="lg:col-span-2 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi mặt hàng</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.itemCode} — {i.name}
            </option>
          ))}
        </select>
        <select
          name="centerId"
          defaultValue={centerFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi cơ sở</option>
          {centers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          name="from"
          defaultValue={sp.from ?? ""}
          placeholder="Từ"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        />
        <input
          type="date"
          name="to"
          defaultValue={sp.to ?? ""}
          placeholder="Đến"
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        />
        <button
          type="submit"
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 sm:col-span-2 lg:col-span-6"
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
                  Thời gian
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Loại
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Mặt hàng
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Cơ sở
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  SL
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Tiền
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Tham chiếu
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Người làm
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {movements.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    Chưa có giao dịch kho nào khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                movements.map((m) => {
                  const info = TYPE_INFO[m.type];
                  const pairCenterName = m.transferPair?.center?.name;
                  const referenceText =
                    (m.type === "TRANSFER_OUT" && pairCenterName
                      ? `→ ${pairCenterName}`
                      : m.type === "TRANSFER_IN" && pairCenterName
                        ? `← ${pairCenterName}`
                        : m.referenceNote) || "—";
                  return (
                    <tr key={m.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-3 text-xs tabular-nums text-gray-500">
                        {fmtDateTime(m.performedAt)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${info.color}`}
                        >
                          {info.label}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-medium text-gray-900 text-sm">
                          {m.item.name}
                        </div>
                        <div className="text-xs text-gray-400 tabular-nums">
                          {m.item.itemCode}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-600">
                        {m.center.name}
                      </td>
                      <td
                        className={`px-3 py-3 text-right text-sm tabular-nums font-bold ${
                          info.sign === "+" ? "text-green-700" : "text-red-700"
                        }`}
                      >
                        {info.sign}
                        {m.quantity} {m.item.unit}
                      </td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums text-gray-600">
                        {m.totalCost !== null
                          ? fmtVnd(m.totalCost)
                          : m.unitPrice !== null
                            ? fmtVnd(m.unitPrice)
                            : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600 max-w-[200px]">
                        <div className="line-clamp-2">{referenceText}</div>
                        {m.notes && (
                          <div className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">
                            {m.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-500">
                        {m.performedBy?.fullName ?? "—"}
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
