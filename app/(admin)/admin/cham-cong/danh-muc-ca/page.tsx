// app/(admin)/admin/cham-cong/danh-muc-ca/page.tsx — L3: danh mục mã ca (PHẦN 6b — tự vận hành).
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { HO_CENTER_ID, loadCenterMap } from "@/lib/cham-cong/home-center";
import type { ShiftSegment } from "@/lib/cham-cong/catalog";
import { TemplateTable, type TemplateRow } from "./_components/template-table";

export const metadata = { title: "Danh mục mã ca | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function DanhMucCaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Fdanh-muc-ca");
  const map = await loadCenterMap();
  const canGlobal = await checkPermission("hr_attendance:config", { centerId: HO_CENTER_ID });
  const centerIds = Object.values(map.byCode).map((c) => c.centerId);
  let anyCenter = canGlobal;
  for (const id of centerIds) if (!anyCenter && (await checkPermission("hr_attendance:config", { centerId: id }))) anyCenter = true;
  if (!anyCenter) redirect("/cham-cong");

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const [templates, centers] = await Promise.all([
    sdb.shiftTemplate.findMany({ orderBy: [{ displayOrder: "asc" }, { code: "asc" }] }),
    sdb.center.findMany({ where: { isActive: true, code: { in: Object.keys(map.byCode) } }, select: { id: true, code: true, name: true }, orderBy: { displayOrder: "asc" } }),
  ]);
  const centerName = new Map(centers.map((c) => [c.id, c.name]));
  const rows: TemplateRow[] = templates.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    kind: t.kind,
    segments: ((t.segments as ShiftSegment[] | null) ?? []).map((s) => ({ start: s.start, end: s.end, kind: s.kind, place: s.place })),
    defaultPlace: t.defaultPlace,
    attendanceMode: t.attendanceMode,
    dayCredit: t.dayCredit,
    isLeave: t.isLeave,
    nominalMinutes: t.nominalMinutes,
    payMode: t.payMode,
    note: t.note,
    isActive: t.isActive,
    centerId: t.centerId,
    centerName: t.centerId ? (centerName.get(t.centerId) ?? t.centerId) : null,
  }));

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <Link href="/cham-cong" className="text-sm text-muted-foreground hover:underline">← Chấm công</Link>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Danh mục mã ca</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Giờ ca, số công, nơi làm, chế độ chấm là dữ liệu — sửa ở đây, không cần dev. Ca đã xếp giữ giờ cũ (snapshot); ô xếp sau khi sửa mới dùng giờ mới.
          Mọi mã làm việc = 1 công/ngày (K-01 theo Sheet); X/P = 0.
        </p>
      </div>
      <TemplateTable rows={rows} centers={centers.map((c) => ({ id: c.id, code: c.code ?? "", name: c.name }))} canGlobal={canGlobal} />
    </div>
  );
}
