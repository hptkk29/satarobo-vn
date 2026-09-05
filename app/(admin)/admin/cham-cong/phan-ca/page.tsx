// app/(admin)/admin/cham-cong/phan-ca/page.tsx — L3: LƯỚI PHÂN CA THÁNG (như tab LỊCH Tmm trên Sheet)
// ?ky=YYYY-MM&coSo=<centerId|hoi-so>. Ô sửa tay = MANUAL; nguồn ô tô màu (sửa tay / đơn / lễ).
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileSpreadsheet, CalendarRange } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { HO_CENTER_ID, loadCenterMap } from "@/lib/cham-cong/home-center";
import { daysOfMonth } from "@/lib/cham-cong/generate";
import { vnYmd } from "@/lib/time/vn";
import { MonthGrid, type GridRow } from "./_components/month-grid";

export const metadata = { title: "Lưới phân ca | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ ky?: string; coSo?: string }>;
}

export default async function PhanCaPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Fphan-ca");
  const sp = await searchParams;
  const map = await loadCenterMap();
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const centers = await sdb.center.findMany({ where: { isActive: true, code: { in: Object.keys(map.byCode) } }, select: { id: true, code: true, name: true }, orderBy: { displayOrder: "asc" } });
  const blocks = [...centers.map((c) => ({ id: c.id, code: c.code ?? "", label: `${c.code} · ${c.name}` })), { id: HO_CENTER_ID, code: "HO", label: "Hội sở" }];

  const perms = new Map<string, { view: boolean; assign: boolean }>();
  for (const b of blocks) {
    const assign = await checkPermission("hr_attendance:assign", { centerId: b.id });
    const view = assign || (await checkPermission("hr_attendance:view", { centerId: b.id }));
    perms.set(b.id, { view, assign });
  }
  const visible = blocks.filter((b) => perms.get(b.id)?.view);
  if (visible.length === 0) redirect("/cham-cong");
  const coSo = visible.find((b) => b.id === sp.coSo)?.id ?? visible[0].id;
  const ky = /^\d{4}-\d{2}$/.test(sp.ky ?? "") ? (sp.ky as string) : vnYmd(new Date()).slice(0, 7);
  const [y, m] = ky.split("-").map(Number);
  const days = daysOfMonth(y, m).map((d) => ({ day: d.getUTCDate(), wd: d.getUTCDay(), ymd: d.toISOString().slice(0, 10) }));
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 0));

  const unitOf = (centerId: string) => (centerId === HO_CENTER_ID ? "HO" : (blocks.find((b) => b.id === centerId)?.code ?? "HO"));
  // Người thuộc khối: có pattern ở khối này HOẶC có ca trong tháng chịu công tại khối này.
  const [patterns, assignments] = await Promise.all([
    sdb.shiftWeeklyPattern.findMany({ where: { centerId: coSo, effectiveTo: null }, select: { userId: true, jobLabel: true, displayOrder: true } }),
    sdb.shiftAssignment.findMany({ where: { workDate: { gte: from, lte: to }, status: "ACTIVE", centerId: coSo }, select: { userId: true } }),
  ]);
  const userIds = [...new Set([...patterns.map((p) => p.userId), ...assignments.map((a) => a.userId)])];
  const allAssign = userIds.length
    ? await sdb.shiftAssignment.findMany({ where: { userId: { in: userIds }, workDate: { gte: from, lte: to }, status: "ACTIVE" }, select: { userId: true, workDate: true, templateCode: true, source: true, centerId: true, sourceCells: true } })
    : [];
  const users = await sdb.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  const jobOf = new Map(patterns.map((p) => [p.userId, p.jobLabel]));
  const order = new Map(patterns.map((p) => [p.userId, p.displayOrder]));
  const rows: GridRow[] = userIds
    .sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999) || (nameOf.get(a) ?? "").localeCompare(nameOf.get(b) ?? ""))
    .map((userId) => {
      const cells: GridRow["cells"] = {};
      for (const a of allAssign.filter((x) => x.userId === userId)) {
        const day = a.workDate.getUTCDate();
        const sc = (a.sourceCells as Record<string, string> | null) ?? null;
        const unitHere = unitOf(coSo);
        // Ô hiển thị theo khối đang xem: nếu ca chịu công ở khối khác nhưng sourceCells có ô của khối này (D1/D2) thì hiện ô đó.
        const code = a.centerId === coSo ? a.templateCode : (sc?.[unitHere] ?? (a.centerId === HO_CENTER_ID ? a.templateCode : `→${unitOf(a.centerId)}`));
        cells[day] = { code, source: a.source, centerUnit: unitOf(a.centerId) };
      }
      return { userId, name: nameOf.get(userId) ?? userId, jobLabel: jobOf.get(userId) ?? null, homeUnit: unitOf(coSo), cells };
    });
  const holidays = new Set(
    (await sdb.holiday.findMany({ where: { date: { lte: to }, OR: [{ endDate: null, date: { gte: from } }, { endDate: { gte: from } }], AND: [{ OR: [{ centerId: null }, { centerId: coSo }] }] }, select: { date: true, endDate: true } })).flatMap((h) => {
      const out: string[] = [];
      for (let d = new Date(h.date); d <= (h.endDate ?? h.date); d = new Date(d.getTime() + 86_400_000)) out.push(d.toISOString().slice(0, 10));
      return out;
    }),
  );
  const codes = (await sdb.shiftTemplate.findMany({ where: { isActive: true }, select: { code: true }, orderBy: { displayOrder: "asc" } })).map((t) => t.code);
  const prev = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);

  return (
    <div className="mx-auto max-w-[1400px] p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/cham-cong" className="text-sm text-muted-foreground hover:underline">← Chấm công</Link>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Lưới phân ca {ky}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Ô sửa tay được giữ khi sinh lại từ khung ca hay import file. Màu: <span className="rounded bg-amber-50 px-1">sửa tay</span> <span className="rounded bg-sky-50 px-1">đổi ca</span> <span className="rounded bg-violet-50 px-1">nghỉ phép</span>.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Link className="rounded-md border border-border px-2 py-1" href={`/cham-cong/phan-ca?ky=${prev}&coSo=${coSo}`}>‹ {prev}</Link>
          <Link className="rounded-md border border-border px-2 py-1" href={`/cham-cong/phan-ca?ky=${next}&coSo=${coSo}`}>{next} ›</Link>
          {visible.map((b) => (
            <Link key={b.id} className={`rounded-md border px-2 py-1 ${b.id === coSo ? "border-primary bg-primary text-white" : "border-border"}`} href={`/cham-cong/phan-ca?ky=${ky}&coSo=${b.id}`}>{b.label}</Link>
          ))}
          <Link className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1" href="/cham-cong/khung-ca"><CalendarRange className="h-4 w-4" /> Khung ca</Link>
          <Link className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1" href="/cham-cong/phan-ca/import"><FileSpreadsheet className="h-4 w-4" /> Import Sheet</Link>
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">Chưa có ai trong khối này cho kỳ {ky}. Xếp khung ca rồi bấm "Sinh lưới", hoặc import file Sheet.</p>
      ) : (
        <MonthGrid rows={rows} days={days} codes={codes} canEdit={perms.get(coSo)?.assign ?? false} holidays={holidays} />
      )}
    </div>
  );
}
