import Link from "next/link";
import { ChevronLeft, ClipboardCheck, Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { InventoryAuditStatus, type Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SUPER_ADMIN", "CENTER_MANAGER", "ACCOUNTANT"];

const STATUS_INFO: Record<
  InventoryAuditStatus,
  { label: string; color: string }
> = {
  DRAFT: { label: "Đang soạn", color: "bg-amber-100 text-amber-700" },
  COMPLETED: { label: "Hoàn thành", color: "bg-green-100 text-green-700" },
  CANCELLED: { label: "Đã huỷ", color: "bg-neutral-100 text-neutral-500" },
};

const VALID_STATUSES = Object.values(InventoryAuditStatus);

function fmtDateTime(d: Date | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface SearchParams {
  searchParams: Promise<{
    status?: string;
    centerId?: string;
  }>;
}

export default async function AuditListPage({ searchParams }: SearchParams) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const sp = await searchParams;
  const statusFilter =
    sp.status && VALID_STATUSES.includes(sp.status as InventoryAuditStatus)
      ? (sp.status as InventoryAuditStatus)
      : undefined;
  const centerFilter = sp.centerId?.trim() || undefined;

  const where: Prisma.InventoryAuditWhereInput = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(centerFilter ? { centerId: centerFilter } : {}),
  };

  const [audits, centers] = await Promise.all([
    db.inventoryAudit.findMany({
      where,
      include: {
        center: { select: { name: true } },
        performedBy: { select: { fullName: true } },
        _count: { select: { items: true } },
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100,
    }),
    db.center.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/inventory/items"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại kho
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
              <ClipboardCheck className="h-6 w-6 text-[#7C3AED]" />
              Kiểm kê (Audit)
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {audits.length > 0
                ? `${audits.length} phiếu (tối đa 100 gần nhất)`
                : "Chưa có phiếu kiểm kê nào"}
            </p>
          </div>
          <Link
            href="/inventory/audit/new"
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-90"
          >
            <Plus className="h-4 w-4" />
            Tạo phiếu kiểm kê
          </Link>
        </div>
      </div>

      <form
        method="GET"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      >
        <select
          name="status"
          defaultValue={statusFilter ?? ""}
          className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#7C3AED] focus:outline-none"
        >
          <option value="">Mọi trạng thái</option>
          {Object.entries(STATUS_INFO).map(([v, { label }]) => (
            <option key={v} value={v}>
              {label}
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
        <button
          type="submit"
          className="rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
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
                  Mã phiếu
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Cơ sở
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Trạng thái
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Dòng
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Đã điều chỉnh
                </th>
                <th className="px-3 py-3 text-center text-xs font-semibold uppercase tracking-wider text-gray-500">
                  +/−
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Người làm
                </th>
                <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Thời gian
                </th>
                <th className="px-3 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Hành động
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {audits.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-sm text-gray-400"
                  >
                    Chưa có phiếu kiểm kê nào khớp bộ lọc.{" "}
                    <Link
                      href="/inventory/audit/new"
                      className="text-[#7C3AED] hover:underline"
                    >
                      Tạo mới →
                    </Link>
                  </td>
                </tr>
              ) : (
                audits.map((a) => {
                  const statusInfo = STATUS_INFO[a.status];
                  const isDraft = a.status === "DRAFT";
                  return (
                    <tr key={a.id} className="hover:bg-gray-50/60">
                      <td className="px-3 py-3 font-mono text-xs text-gray-700 tabular-nums">
                        {a.auditCode ?? a.id.slice(0, 8) + "…"}
                      </td>
                      <td className="px-3 py-3 text-sm text-gray-700">
                        {a.center.name}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusInfo.color}`}
                        >
                          {statusInfo.label}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-center text-sm tabular-nums text-gray-700">
                        {a._count.items}
                      </td>
                      <td className="px-3 py-3 text-center text-sm tabular-nums font-semibold text-gray-700">
                        {a.totalAdjusted}
                      </td>
                      <td className="px-3 py-3 text-center text-xs tabular-nums">
                        {a.totalIncreases > 0 && (
                          <span className="text-green-600">
                            +{a.totalIncreases}
                          </span>
                        )}
                        {a.totalIncreases > 0 && a.totalDecreases > 0 && " / "}
                        {a.totalDecreases > 0 && (
                          <span className="text-red-600">
                            -{a.totalDecreases}
                          </span>
                        )}
                        {a.totalIncreases === 0 && a.totalDecreases === 0 && "—"}
                      </td>
                      <td className="px-3 py-3 text-xs text-gray-600">
                        {a.performedBy?.fullName ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-xs tabular-nums text-gray-500">
                        {fmtDateTime(a.performedAt ?? a.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {isDraft ? (
                          <Link
                            href={`/inventory/audit/${a.id}/edit`}
                            className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                          >
                            Tiếp tục →
                          </Link>
                        ) : (
                          <Link
                            href={`/inventory/audit/${a.id}`}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                          >
                            Xem
                          </Link>
                        )}
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
