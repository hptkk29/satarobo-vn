import { redirect } from "next/navigation";
import { TrendingUp } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { getModelVisibleCenterIds } from "@/lib/db-scope";
import { getFunnelCounts } from "@/lib/crm/funnel-query";
import { buildFunnelCards } from "@/lib/crm/funnel-cards";
import { computeFunnelMetrics } from "@/lib/crm/marketing-metrics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";
export const metadata = { title: "Funnel Marketing | Admin" };

export default async function MarketingFunnelPage() {
  const session = await auth();
  if (!(await checkPermission("leads:view-all"))) redirect("/admin/dashboard");

  // C8.3 + vá 24/07 — per-model scope thay isHoLevel trần: cross-center chỉ khi actor
  // có quyền leads:* scope ALL (SUPER_ADMIN/HO-marketing giữ nguyên; HO-role khác
  // chức năng — vd TRAINING@HO — về đúng cơ sở mình).
  const actor = await resolveActor(session!.user.id);
  const scope = getModelVisibleCenterIds("Lead", actor);
  const centerIds = scope === "ALL" ? undefined : scope;
  const counts = await getFunnelCounts({ centerIds });
  const m = computeFunnelMetrics(counts);

  // V-02 — THI HÀNH hợp đồng `spendAvailable` (lib/crm/funnel-query.ts): với actor bị giới
  // hạn cơ sở, `AdsInsightDaily` KHÔNG được hỏi (bảng không có cột `centerId`) nên `spend`
  // về 0 với nghĩa "KHÔNG ĐO ĐƯỢC". In số 0 ở Chi phí QC/CPL/CPA/ROAS đọc y hệt "tháng này
  // không tốn đồng quảng cáo nào" — luật hiển thị nằm ở `buildFunnelCards`, có test riêng.
  const cards = buildFunnelCards(counts, m);

  return (
    <div>
      <h1 className="mb-6 flex items-center gap-2 text-3xl font-black text-foreground">
        <TrendingUp className="h-7 w-7 text-primary" />
        Funnel Marketing
      </h1>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={
                  c.khongDoDuoc
                    ? "text-2xl font-black text-muted-foreground"
                    : "text-2xl font-black text-foreground"
                }
              >
                {c.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        ROAS = doanh thu (đơn CONFIRMED/COMPLETED) / chi phí QC.
      </p>
      {!counts.spendAvailable && (
        <p className="mt-2 text-xs text-muted-foreground">
          Chi phí quảng cáo hiện chỉ đo được ở phạm vi toàn hệ thống (bảng chi phí chưa tách
          theo cơ sở), nên Chi phí QC / CPL / CPA / ROAS hiển thị “—”:{" "}
          <strong>không đo được</strong>, KHÔNG phải bằng 0.
        </p>
      )}
    </div>
  );
}
