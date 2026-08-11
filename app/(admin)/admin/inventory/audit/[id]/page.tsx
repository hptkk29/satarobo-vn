import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { InventoryAuditStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

const STATUS_INFO: Record<
  InventoryAuditStatus,
  { label: string; color: string }
> = {
  DRAFT: { label: "Đang soạn", color: "bg-state-warning-soft text-state-warning-ink" },
  COMPLETED: { label: "Hoàn thành", color: "bg-state-success-soft text-state-success-ink" },
  CANCELLED: { label: "Đã huỷ", color: "bg-neutral-100 text-neutral-500" },
};

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

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AuditDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("inventory:audit"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;

  // Cách ly cơ sở: findUnique qua scopedDb — phiếu ngoài scope → null → notFound (chống IDOR).
  const sdb = scopedDb(await resolveActor(session.user.id));
  const audit = await sdb.inventoryAudit.findUnique({
    where: { id },
    include: {
      center: { select: { name: true } },
      performedBy: { select: { fullName: true } },
      items: {
        include: {
          item: { select: { itemCode: true, name: true, unit: true } },
          movement: { select: { id: true } },
        },
        orderBy: [{ delta: "desc" }, { id: "asc" }],
      },
    },
  });
  if (!audit) notFound();

  // If still DRAFT, redirect to the edit page — detail view is for closed audits.
  if (audit.status === "DRAFT") {
    redirect(`/inventory/audit/${id}/edit`);
  }

  const statusInfo = STATUS_INFO[audit.status];

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/inventory/audit"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-bold text-neutral-900">
            Phiếu kiểm kê:{" "}
            <span className="font-mono text-primary">
              {audit.auditCode ?? audit.id.slice(0, 8) + "…"}
            </span>
          </h1>
          <span
            className={`inline-flex rounded-full px-3 py-1 text-sm font-semibold ${statusInfo.color}`}
          >
            {statusInfo.label}
          </span>
        </div>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
          <dt className="text-neutral-500">Cơ sở</dt>
          <dd className="font-medium text-neutral-900">{audit.center.name}</dd>
          <dt className="text-neutral-500">Người làm</dt>
          <dd className="font-medium text-neutral-900">
            {audit.performedBy?.fullName ?? "—"}
          </dd>
          <dt className="text-neutral-500">Submit lúc</dt>
          <dd className="font-medium tabular-nums text-neutral-900">
            {fmtDateTime(audit.performedAt)}
          </dd>
          <dt className="text-neutral-500">Tạo lúc</dt>
          <dd className="font-medium tabular-nums text-neutral-900">
            {fmtDateTime(audit.createdAt)}
          </dd>
        </dl>
        {audit.notes && (
          <div className="mt-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm text-neutral-700">
            <strong className="text-neutral-900">Ghi chú:</strong> {audit.notes}
          </div>
        )}
      </section>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryCard label="Tổng dòng" value={audit.totalItems} />
        <SummaryCard label="Đã điều chỉnh" value={audit.totalAdjusted} />
        <SummaryCard
          label="Tổng tăng"
          value={`+${audit.totalIncreases}`}
          color="text-state-success-ink"
        />
        <SummaryCard
          label="Tổng giảm"
          value={`-${audit.totalDecreases}`}
          color="text-state-danger-ink"
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
        <header className="border-b border-neutral-100 bg-neutral-50 px-4 py-3">
          <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-700">
            Chi tiết từng dòng ({audit.items.length})
          </h2>
        </header>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-100 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Mã
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Tên hàng
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Hệ thống
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Thực tế
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Δ
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Lý do
                </th>
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Movement
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-50">
              {audit.items.map((line) => {
                const rowBg =
                  line.delta > 0
                    ? "bg-state-success-soft/60"
                    : line.delta < 0
                      ? "bg-state-danger-soft/60"
                      : "";
                const deltaColor =
                  line.delta > 0
                    ? "text-state-success-ink"
                    : line.delta < 0
                      ? "text-state-danger-ink"
                      : "text-neutral-400";
                return (
                  <tr key={line.id} className={rowBg}>
                    <td className="px-3 py-2 font-mono text-xs text-neutral-600">
                      {line.item.itemCode}
                    </td>
                    <td className="px-3 py-2 text-neutral-900">
                      {line.item.name}
                      <span className="ml-1 text-xs text-neutral-400">
                        ({line.item.unit})
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                      {line.previousQty}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-neutral-700">
                      {line.actualQty}
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums font-bold ${deltaColor}`}
                    >
                      {line.delta > 0 ? `+${line.delta}` : line.delta}
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-700 max-w-[260px]">
                      {line.reason ?? (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center text-xs">
                      {line.movement ? (
                        <span className="text-state-success-ink">✓</span>
                      ) : (
                        <span className="text-neutral-300">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p
        className={`mt-1 text-2xl font-bold tabular-nums ${ color ?? "text-neutral-900" }`}
      >
        {value}
      </p>
    </div>
  );
}
