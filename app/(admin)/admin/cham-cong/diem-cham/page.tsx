// app/(admin)/admin/cham-cong/diem-cham/page.tsx — L4: điểm chấm công (WorkLocation) theo cơ sở.
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { loadCenterMap } from "@/lib/cham-cong/home-center";
import { LocationList } from "./_components/location-form";

export const metadata = { title: "Điểm chấm công | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DiemChamPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Fdiem-cham");
  const map = await loadCenterMap();
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const centers = await sdb.center.findMany({ where: { isActive: true, code: { in: Object.keys(map.byCode) } }, select: { id: true, name: true, code: true }, orderBy: { displayOrder: "asc" } });
  const editable: { id: string; name: string }[] = [];
  for (const c of centers) if (await checkPermission("hr_attendance:config", { centerId: c.id })) editable.push({ id: c.id, name: `${c.code} · ${c.name}` });
  if (editable.length === 0) redirect("/cham-cong");
  const rows = await sdb.workLocation.findMany({ where: { centerId: { in: editable.map((c) => c.id) } }, orderBy: { code: "asc" } });
  const nameOf = new Map(editable.map((c) => [c.id, c.name]));
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <Link href="/cham-cong" className="text-sm text-muted-foreground hover:underline">← Chấm công</Link>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Điểm chấm công</h1>
        <p className="mt-1 text-sm text-muted-foreground">Mỗi cơ sở vận hành một điểm (màn hình QR tại quầy). Hội sở không có điểm — người HO chấm ở cơ sở nào cũng được (Q-04). Toạ độ trống ⇒ geofence tắt, lượt vẫn ghi kèm cờ "Chưa toạ độ".</p>
      </div>
      <LocationList rows={rows.map((r) => ({ id: r.id, centerId: r.centerId, code: r.code, name: r.name, latitude: r.latitude, longitude: r.longitude, radiusMeters: r.radiusMeters, geofenceEnabled: r.geofenceEnabled, isActive: r.isActive, centerName: nameOf.get(r.centerId) ?? r.centerId }))} centers={editable} canCreate />
    </div>
  );
}
