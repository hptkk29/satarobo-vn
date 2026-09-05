// app/(admin)/admin/cham-cong/doi-soat/page.tsx — L6: đối soát Sheet ↔ hệ thống (chạy song song 1 kỳ).
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { HO_CENTER_ID, loadCenterMap } from "@/lib/cham-cong/home-center";
import { ReconcilePanel } from "./_components/reconcile-panel";

export const metadata = { title: "Đối soát Sheet | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DoiSoatPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Fdoi-soat");
  const map = await loadCenterMap();
  let allowed = false;
  for (const id of [...Object.values(map.byCode).map((c) => c.centerId), HO_CENTER_ID]) {
    if (await checkPermission("hr_attendance:view", { centerId: id })) { allowed = true; break; }
  }
  if (!allowed) redirect("/cham-cong");
  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-4">
        <Link href="/cham-cong" className="text-sm text-muted-foreground hover:underline">← Chấm công</Link>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Đối soát Sheet ↔ hệ thống</h1>
        <p className="mt-1 text-sm text-muted-foreground">Kỳ chạy song song (L6): mỗi ngày tải Sheet đang dùng lên, xem ô nào lệch. Cổng ra: <strong>10 ngày làm việc liên tiếp không lệch</strong> rồi mới bỏ Sheet (kế hoạch §7). Người chưa ánh xạ ⇒ ánh xạ ở màn Import lịch; người miễn chấm công tự bị loại.</p>
      </div>
      <ReconcilePanel />
    </div>
  );
}
