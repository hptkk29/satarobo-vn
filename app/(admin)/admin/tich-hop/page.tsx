import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { znsProvider } from "@/lib/zalo/provider";
import { getRateLimitBackend } from "@/lib/rate-limit";
import { isMisaConfigured, isMisaLive, getMisaConfig } from "@/lib/misa/service";
import { getPaymentConfigExact } from "@/lib/payments/vietqr";
import { MisaControls } from "./_components/misa-controls";
import { VietQrConfig, type VietQrCenterRow } from "./_components/vietqr-config";
import { ZnsTest } from "./_components/zns-test";

export const metadata = { title: "Tích hợp | Admin" };
export const dynamic = "force-dynamic";

const STATUS_CLS: Record<string, string> = {
  SENT: "bg-state-success-soft text-state-success-ink",
  SUCCESS: "bg-state-success-soft text-state-success-ink",
  SKIPPED: "bg-state-warning-soft text-state-warning-ink",
  FAILED: "bg-state-danger-soft text-state-danger-ink",
  PENDING: "bg-state-info-soft text-state-info-ink",
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
      select: { id: true, toPhone: true, templateKey: true, status: true, errorMessage: true, fallbackEmailed: true, createdAt: true, providerMessageId: true },
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
  // BGĐ 31/07 — tài khoản nhận tiền theo TỪNG CƠ SỞ + 1 dòng cấu hình chung (fallback).
  const centers = await sdb.center.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const vietqrRows: VietQrCenterRow[] = await Promise.all([
    getPaymentConfigExact(null).then((current) => ({
      centerId: null,
      centerName: "Cấu hình chung (dùng khi cơ sở chưa đặt)",
      current,
    })),
    ...centers.map(async (c) => ({
      centerId: c.id,
      centerName: c.name,
      current: await getPaymentConfigExact(c.id),
    })),
  ]);

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Tích hợp ngoài</h1>
        <p className="text-sm text-muted-foreground">Trạng thái các adapter. Khi thiếu credential, hệ thống tự fallback an toàn.</p>
      </div>

      {/* AUTH-SĐT P4 — soi nhanh backend rate-limit (P0-d): memory = bộ đếm reset
          theo instance serverless, không chặn được brute-force trải đều instance. */}
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Rate limit (Upstash Redis)</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ getRateLimitBackend() === "upstash" ? "bg-state-success-soft text-state-success-ink" : "bg-state-danger-soft text-state-danger-ink" }`}
          >
            {getRateLimitBackend() === "upstash" ? "Redis (bền vững)" : "Memory (per-instance!)"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {getRateLimitBackend() === "upstash"
            ? "Env Upstash đã nạp. Lưu ý: lỗi runtime (URL sai, DB đã xoá) vẫn tự rơi về memory từng request — thấy log [rate-limit] Upstash error thì kiểm console.upstash.com."
            : "Chưa nạp env UPSTASH_REDIS_REST_URL/TOKEN (hoặc chưa redeploy sau khi thêm) → bộ đếm chống brute-force reset theo instance."}
        </p>
      </section>

      {/* BGĐ 31/07 — tài khoản nhận tiền theo TỪNG CƠ SỞ (fallback cấu hình chung). */}
      <VietQrConfig canEdit={canEdit} rows={vietqrRows} />

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-foreground">Zalo OA / ZNS</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ zaloLive ? "bg-state-success-soft text-state-success-ink" : zaloConfigured ? "bg-state-warning-soft text-state-warning-ink" : "bg-muted text-muted-foreground" }`}
          >
            {zaloLive ? "Đang bật (live)" : zaloConfigured ? "Có credential (mô phỏng)" : "Chưa cấu hình"}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {zaloConfigured
            ? "Có ZALO_APP_ID + ZALO_OA_ACCESS_TOKEN. Bật ZALO_LIVE=true để gửi thật."
            : "Chưa có credential → tin nhắn Zalo bị bỏ qua, tự gửi email dự phòng."}
        </p>

        <ZnsTest canEdit={canEdit} />

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
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
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    Chưa có log.
                  </td>
                </tr>
              ) : (
                zaloLogs.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2">{l.toPhone ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.templateKey ?? "—"}</td>
                    <td className="px-3 py-2">
                      {/* SENT + providerMessageId "SIMULATED-…" = ZALO_LIVE chưa bật: log xanh
                          nhưng KHÔNG tin nào rời hệ thống — phải phân biệt kẻo tưởng đã gửi. */}
                      {l.status === "SENT" && l.providerMessageId?.startsWith("SIMULATED-") ? (
                        <span className="rounded-full bg-state-info-soft px-2 py-0.5 text-xs text-state-info-ink">SENT (mô phỏng)</span>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_CLS[l.status] ?? ""}`}>{l.status}</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{l.fallbackEmailed ? "có" : "—"}</td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{l.errorMessage ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold text-foreground">MISA AMIS (kế toán)</h2>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${ misaCfg.isEnabled && misaLive ? "bg-state-success-soft text-state-success-ink" : misaCfg.isEnabled && misaConfigured ? "bg-state-warning-soft text-state-warning-ink" : "bg-muted text-muted-foreground" }`}
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
        <p className="mt-1 text-xs text-muted-foreground">
          {misaConfigured
            ? "Có credential MISA. Bật MISA_LIVE=true để push thật."
            : "Chưa có credential (MISA_CLIENT_ID/SECRET/API_URL) → sync bị bỏ qua, không push."}
        </p>

        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
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
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
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
                    <td className="px-3 py-2 text-xs text-muted-foreground">{l.errorMessage ?? "—"}</td>
                    <td className="px-3 py-2 text-muted-foreground">{l.createdAt.toISOString().slice(0, 16).replace("T", " ")}</td>
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
