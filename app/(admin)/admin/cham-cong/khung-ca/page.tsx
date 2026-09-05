// app/(admin)/admin/cham-cong/khung-ca/page.tsx — L3: KHUNG CA CỐ ĐỊNH HẰNG TUẦN theo khối
// (CS1 / CS2 / Hội sở) + nút sinh lưới tháng. Nguồn chuẩn của lưới (như tab KHUNG CA trên Sheet).
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { HO_CENTER_ID, loadCenterMap } from "@/lib/cham-cong/home-center";
import { vnYmd } from "@/lib/time/vn";
import { PatternGrid, type PatternBlock } from "./_components/pattern-grid";

export const metadata = { title: "Khung ca tuần | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function KhungCaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Fkhung-ca");
  const map = await loadCenterMap();
  const blockDefs: { centerId: string; label: string }[] = [];
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const centers = await sdb.center.findMany({ where: { isActive: true, code: { in: Object.keys(map.byCode) } }, select: { id: true, name: true, code: true }, orderBy: { displayOrder: "asc" } });
  for (const c of centers) blockDefs.push({ centerId: c.id, label: `${c.code} · ${c.name}` });
  blockDefs.push({ centerId: HO_CENTER_ID, label: "Hội sở (HO)" });

  const canAssign = new Map<string, boolean>();
  let canView = false;
  for (const b of blockDefs) {
    const a = await checkPermission("hr_attendance:assign", { centerId: b.centerId });
    const v = a || (await checkPermission("hr_attendance:view", { centerId: b.centerId }));
    canAssign.set(b.centerId, a);
    if (v) canView = true;
  }
  if (!canView) redirect("/cham-cong");

  const patterns = await sdb.shiftWeeklyPattern.findMany({
    where: { centerId: { in: blockDefs.map((b) => b.centerId) }, effectiveTo: null },
    select: { userId: true, centerId: true, weekday: true, templateCode: true, sheetName: true, jobLabel: true, displayOrder: true },
  });
  const userIds = [...new Set(patterns.map((p) => p.userId))];
  const users = await sdb.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  const employees = await sdb.employee.findMany({
    where: { status: "ACTIVE", userAccount: { isNot: null } },
    select: { fullName: true, employeeCode: true, userAccount: { select: { id: true } } },
    orderBy: { fullName: "asc" },
  });
  const candidates = employees.map((e) => ({ userId: e.userAccount!.id, label: `${e.fullName} · ${e.employeeCode}` }));
  for (const e of employees) if (!nameOf.has(e.userAccount!.id)) nameOf.set(e.userAccount!.id, e.fullName);

  const blocks: PatternBlock[] = blockDefs
    .filter((b) => canAssign.get(b.centerId) || patterns.some((p) => p.centerId === b.centerId))
    .map((b) => {
      const byUser = new Map<string, PatternBlock["people"][number]>();
      for (const p of patterns.filter((x) => x.centerId === b.centerId).sort((x, y) => x.displayOrder - y.displayOrder)) {
        const row = byUser.get(p.userId) ?? { userId: p.userId, name: nameOf.get(p.userId) ?? p.userId, jobLabel: p.jobLabel, sheetName: p.sheetName, byWeekday: {} };
        row.byWeekday[p.weekday] = p.templateCode;
        byUser.set(p.userId, row);
      }
      return { centerId: b.centerId, label: b.label, canAssign: canAssign.get(b.centerId) ?? false, people: [...byUser.values()] };
    });
  const codes = (await sdb.shiftTemplate.findMany({ where: { isActive: true }, select: { code: true }, orderBy: { displayOrder: "asc" } })).map((t) => t.code);
  const next = new Date();
  next.setUTCMonth(next.getUTCMonth() + 1);
  const defaultPeriod = vnYmd(next).slice(0, 7);

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <Link href="/cham-cong" className="text-sm text-muted-foreground hover:underline">← Chấm công</Link>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Khung ca cố định hằng tuần</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Ca lặp hằng tuần của từng người theo khối. Sửa ở đây rồi bấm <b>Sinh lưới từ khung ca</b> cho tháng cần. Người làm cả 2 cơ sở có 2 dòng (một ở mỗi khối), ô D1/D2 trỏ sang khối kia.
        </p>
      </div>
      <PatternGrid blocks={blocks} codes={codes} candidates={candidates} defaultPeriod={defaultPeriod} />
    </div>
  );
}
