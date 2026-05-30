import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Báo cáo chuyển lead liên cơ sở | Admin" };
export const dynamic = "force-dynamic";

const CLOSED_STATUSES = new Set(["ENROLLED"]);

interface Props {
  searchParams: Promise<{ month?: string }>;
}

export default async function TransferReportPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "leads:assign")) redirect("/leads");

  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  const isCM = hasRole(session.user, "CENTER_MANAGER") && !isSuper;
  const myCenter = isCM ? session.user.centerId : null;

  const sp = await searchParams;
  const now = new Date();
  const month =
    sp.month && /^\d{4}-\d{2}$/.test(sp.month)
      ? sp.month
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const year = Number(month.slice(0, 4));
  const monthIdx = Number(month.slice(5, 7)) - 1;
  const monthStart = new Date(year, monthIdx, 1);
  const monthEnd = new Date(year, monthIdx + 1, 1);

  // Chỉ chuyển LIÊN CƠ SỞ (from != to, đều có giá trị).
  const where: Prisma.LeadTransferWhereInput = {
    createdAt: { gte: monthStart, lt: monthEnd },
    fromCenterId: { not: null },
    toCenterId: { not: null },
    ...(myCenter ? { OR: [{ fromCenterId: myCenter }, { toCenterId: myCenter }] } : {}),
  };

  const transfersRaw = await db.leadTransfer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  // Loại các bản ghi from==to (phòng khi DB field-compare không khả dụng).
  const transfers = transfersRaw.filter((t) => t.fromCenterId !== t.toCenterId);

  const centerIds = [
    ...new Set(transfers.flatMap((t) => [t.fromCenterId, t.toCenterId].filter((x): x is string => !!x))),
  ];
  const leadIds = [...new Set(transfers.map((t) => t.leadId))];

  const [centers, leads] = await Promise.all([
    centerIds.length
      ? db.center.findMany({ where: { id: { in: centerIds } }, select: { id: true, name: true, code: true } })
      : Promise.resolve([]),
    leadIds.length
      ? db.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, parentName: true, phone: true, status: true } })
      : Promise.resolve([]),
  ]);
  const centerMap = new Map(centers.map((c) => [c.id, c]));
  const leadMap = new Map(leads.map((l) => [l.id, l]));

  const rows = transfers.map((t) => {
    const lead = leadMap.get(t.leadId);
    return {
      id: t.id,
      leadId: t.leadId,
      parentName: lead?.parentName ?? "(đã xoá)",
      phone: lead?.phone ?? "",
      from: centerMap.get(t.fromCenterId ?? "")?.code ?? centerMap.get(t.fromCenterId ?? "")?.name ?? "—",
      to: centerMap.get(t.toCenterId ?? "")?.code ?? centerMap.get(t.toCenterId ?? "")?.name ?? "—",
      by: t.transferredByName,
      reason: t.reason ?? t.note,
      closed: lead ? CLOSED_STATUSES.has(lead.status) : false,
      createdAt: t.createdAt.toISOString(),
    };
  });

  const total = rows.length;
  const closedCount = rows.filter((r) => r.closed).length;
  const cs1ToCs2 = rows.filter((r) => r.from === "CS1" && r.to === "CS2").length;
  const cs2ToCs1 = rows.filter((r) => r.from === "CS2" && r.to === "CS1").length;

  const prevM = new Date(year, monthIdx - 1, 1);
  const nextM = new Date(year, monthIdx + 1, 1);
  const mStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="max-w-5xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <ArrowLeftRight className="h-6 w-6 text-[#7C3AED]" /> Chuyển lead liên cơ sở
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {isCM ? "Lead vào/ra cơ sở của bạn" : "Toàn hệ thống"} · tháng {month}
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/leads/bao-cao-chuyen?month=${mStr(prevM)}`} className="rounded-lg border border-gray-300 px-2 py-1.5 hover:bg-gray-50">←</Link>
          <span className="font-semibold text-gray-700">{month}</span>
          <Link href={`/leads/bao-cao-chuyen?month=${mStr(nextM)}`} className="rounded-lg border border-gray-300 px-2 py-1.5 hover:bg-gray-50">→</Link>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tổng chuyển" value={total} />
        <Stat label="CS1 → CS2" value={cs1ToCs2} />
        <Stat label="CS2 → CS1" value={cs2ToCs1} />
        <Stat label="Đã chốt" value={`${closedCount}/${total}`} tone="ok" />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Không có lead chuyển liên cơ sở trong tháng này.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">Chuyển</th>
                <th className="px-3 py-2">Người chuyển</th>
                <th className="px-3 py-2">Lý do / bàn giao</th>
                <th className="px-3 py-2">Kết quả</th>
                <th className="px-3 py-2">Ngày</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/leads/${r.leadId}`} className="font-medium text-[#7C3AED] hover:underline">
                      {r.parentName}
                    </Link>
                    <span className="block text-xs text-gray-400">{r.phone}</span>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-semibold text-gray-700">
                    {r.from} → {r.to}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{r.by}</td>
                  <td className="px-3 py-2 max-w-xs truncate text-gray-600" title={r.reason}>{r.reason}</td>
                  <td className="px-3 py-2">
                    {r.closed ? (
                      <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">Đã chốt</span>
                    ) : (
                      <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">Chưa</span>
                    )}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-500">
                    {new Date(r.createdAt).toLocaleDateString("vi-VN")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number | string; tone?: "ok" }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className={`text-2xl font-bold tabular-nums ${tone === "ok" ? "text-emerald-600" : "text-[#7C3AED]"}`}>{value}</div>
      <div className="mt-0.5 text-xs text-gray-500">{label}</div>
    </div>
  );
}
