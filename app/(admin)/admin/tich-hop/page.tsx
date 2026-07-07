import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { znsProvider } from "@/lib/zalo/provider";
import { isMisaConfigured, isMisaLive, getMisaConfig } from "@/lib/misa/service";
import { getPaymentConfig } from "@/lib/payments/vietqr";
import { MisaControls } from "./_components/misa-controls";
import { VietQrConfig } from "./_components/vietqr-config";

export const metadata = { title: "Tích hợp | Admin" };
export const dynamic = "force-dynamic";

const STATUS_CLS: Record<string, string> = {
  SENT: "bg-emerald-100 text-emerald-700",
  SUCCESS: "bg-emerald-100 text-emerald-700",
  SKIPPED: "bg-amber-100 text-amber-700",
  FAILED: "bg-rose-100 text-rose-700",
  PENDING: "bg-blue-100 text-blue-700",
};

export default async function IntegrationsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("settings:view"))) redirect("/dashboard");

  const canEdit = await checkPermission("settings:edit");
  const zaloConfigured = znsProvider.isConfigured();
  const zaloLive = znsProvider.isLive();

  // ZaloMessageLog/IntegrationLog là log tích hợp global (∉ SCOPED_MODELS) → pass-through.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const [zaloLogs, misaCfg, misaLogs] = await Promise.all([
    sdb.zaloMessageLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, toPhone: true, templateKey: true, status: true, errorMessage: true, fallbackEmailed: true, createdAt: true },
    }),
    getMisaConfig(),
    sdb.integrationLog.findMany({
      where: { provider: "MISA" },
      orderBy: { createdAt: "desc" },
      take: 30,
      select: { id: true, action: true, status: true, errorMessage: true, createdAt: true },
    }),
  ]);
  const misaConfigured = isMisaConfigured();
  const misaLive = isMisaLive();
  const payCfg = await getPaymentConfig();

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">Tích hợp ngoài</h1>
        <p className="text-sm text-neutral-500">Trạng thái các adapter. Khi thiếu credential, hệ thống tự fallback an toàn.</p>
      </div>

      <VietQrConfig canEdit={canEdit} current={payCfg} />

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-neutral-800">Zalo OA / ZNS</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              zaloLive ? "bg-emerald-100 text-emerald-700" : zaloConfigured ? "bg-amber-100 text-amber-700" : "bg-neutral-200 text-neutral-500"
            }`}
          >
            {zaloLive ? "Đang bật (live)" : zaloConfigured ? "Có credential (mô phỏng)" : "Chưa cấu hình"}
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          {zaloConfigured
            ? "Có ZALO_APP_ID + ZALO_OA_ACCESS_TOKEN. Bật ZALO_LIVE=true để gửi thật."
            : "Chưa có credential → tin nhắn Zalo bị bỏ qua, tự gửi email dự phòng."}
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-400">
              <tr>
                <th className="px-3 py-2">SĐT</th>
                <th className="px-3 py-2">Template</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Fallback email</th>
                <th className="px-3 py-2">Ghi chú</th>
                <th className="px-3 py-2">Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {zaloLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-neutral-400">
                    Chưa có log.
                  </td>
                </tr>
              ) : (
                zaloLogs.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2">{l.toPhone ?? "—"}</td>
                    <td className="px-3 py-2 text-neutral-500">{l.templateKey ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[l.status] ?? ""}`}>{l.status}</span>
                    </td>
                    <td className="px-3 py-2 text-neutral-500">{l.fallbackEmailed ? "có" : "—"}</td>
                    <td className="px-3 py-2 text-xs text-neutral-400">{l.errorMessage ?? "—"}</td>
                    <td className="px-3 py-2 text-neutral-500">{l.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-neutral-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-neutral-800">MISA AMIS (kế toán)</h2>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                misaCfg.isEnabled && misaLive
                  ? "bg-emerald-100 text-emerald-700"
                  : misaCfg.isEnabled && misaConfigured
                    ? "bg-amber-100 text-amber-700"
                    : "bg-neutral-200 text-neutral-500"
              }`}
            >
              {misaCfg.isEnabled
                ? misaLive
                  ? "Đang bật (live)"
                  : misaConfigured
                    ? "Bật (mô phỏng)"
                    : "Bật nhưng thiếu credential"
                : "Đang tắt"}
            </span>
            <MisaControls enabled={misaCfg.isEnabled} canEdit={canEdit} />
          </div>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          {misaConfigured
            ? "Có credential MISA. Bật MISA_LIVE=true để push thật."
            : "Chưa có credential (MISA_CLIENT_ID/SECRET/API_URL) → sync bị bỏ qua, không push."}
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-400">
              <tr>
                <th className="px-3 py-2">Hành động</th>
                <th className="px-3 py-2">Trạng thái</th>
                <th className="px-3 py-2">Ghi chú</th>
                <th className="px-3 py-2">Thời gian</th>
              </tr>
            </thead>
            <tbody>
              {misaLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-neutral-400">
                    Chưa có log.
                  </td>
                </tr>
              ) : (
                misaLogs.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2">{l.action}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[l.status] ?? ""}`}>{l.status}</span>
                    </td>
                    <td className="px-3 py-2 text-xs text-neutral-400">{l.errorMessage ?? "—"}</td>
                    <td className="px-3 py-2 text-neutral-500">{l.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
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
