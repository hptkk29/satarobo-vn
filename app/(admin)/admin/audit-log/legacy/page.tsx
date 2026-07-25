import Link from "next/link";
import { ChevronLeft, Archive } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import {
  canReadLegacyAudit,
  canViewLegacyPii,
  queryLegacyAuditLogs,
} from "@/lib/audit/legacy-log";

export const metadata = { title: "Lịch sử cũ (đọc-only) | Admin" };
export const dynamic = "force-dynamic";

const SOURCE_LABEL: Record<string, string> = {
  user: "Tài khoản",
  grant: "Phân quyền riêng",
  lead: "Lead",
  class: "Lớp",
  student: "Học viên",
};

export default async function LegacyAuditLogPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("audit-logs:view"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const actor = await resolveActor(session.user.id);
  // Bảng cũ không có orgUnitId ⇒ không lọc được theo cơ sở. Thà chặn còn hơn lộ cơ sở khác.
  if (!canReadLegacyAudit(actor)) {
    redirect("/audit-log?error=legacy-restricted");
  }

  // Vá 24/07 — legacy all-or-nothing: unmask PII cần view-pii tầm "ALL" (đồng bộ
  // canReadLegacyAudit), KHÔNG dùng checkPermission phẳng (true được nhờ perm 1 cơ sở).
  const canViewPii = canViewLegacyPii(actor);
  const rows = await queryLegacyAuditLogs(actor, { take: 100, canViewPii });

  return (
    <div>
      <Link
        href="/audit-log"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Về Audit Log
      </Link>

      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-100">
          <Archive className="h-5 w-5 text-gray-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lịch sử cũ (đọc-only)</h1>
          <p className="mt-1 text-sm text-gray-500">
            5 bảng audit cũ đã đóng băng từ 09/07/2026 — không còn ghi mới. Thao tác từ đó trở đi nằm ở{" "}
            <Link href="/audit-log" className="font-medium text-orange-600 hover:underline">
              Audit Log hợp nhất
            </Link>
            . Trang này giới hạn cho Quản trị / Hội sở vì bản ghi cũ không mang thông tin cơ sở.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Không có bản ghi cũ.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Thời gian</th>
                <th className="px-4 py-3">Nguồn</th>
                <th className="px-4 py-3">Hành động</th>
                <th className="px-4 py-3">Đối tượng</th>
                <th className="px-4 py-3">Người thực hiện</th>
                <th className="px-4 py-3">Lý do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={`${r.source}:${r.id}`}>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                    {r.createdAt.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {SOURCE_LABEL[r.source] ?? r.source}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{r.action}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{r.entityId}</td>
                  <td className="px-4 py-3 text-gray-700">{r.actorName}</td>
                  <td className="px-4 py-3 text-gray-500">{r.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
