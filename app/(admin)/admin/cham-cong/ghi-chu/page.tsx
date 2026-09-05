// app/(admin)/admin/cham-cong/ghi-chu/page.tsx — L3: việc cố định theo thứ + ghi chú/ghi đè theo
// ngày cho tin nhắc lịch 19:00 (tab VIỆC CỐ ĐỊNH + GHI CHÚ & GHI ĐÈ của Sheet).
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { HO_CENTER_ID, loadCenterMap } from "@/lib/cham-cong/home-center";
import { NoteManager, type NoteRow } from "./_components/note-manager";

export const metadata = { title: "Ghi chú lịch | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function GhiChuPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Fghi-chu");
  const map = await loadCenterMap();
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const centers = await sdb.center.findMany({ where: { isActive: true, code: { in: Object.keys(map.byCode) } }, select: { id: true, code: true, name: true }, orderBy: { displayOrder: "asc" } });
  const blocks: { id: string; label: string; canAssign: boolean }[] = [];
  let canView = false;
  for (const b of [...centers.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` })), { id: HO_CENTER_ID, label: "Hội sở" }]) {
    const assign = await checkPermission("hr_attendance:assign", { centerId: b.id });
    const view = assign || (await checkPermission("hr_attendance:view", { centerId: b.id }));
    if (view) {
      blocks.push({ ...b, canAssign: assign });
      canView = true;
    }
  }
  if (!canView) redirect("/cham-cong");
  const label = new Map(blocks.map((b) => [b.id, b.label]));
  const notes = await sdb.shiftBriefNote.findMany({ where: { centerId: { in: blocks.map((b) => b.id) } }, orderBy: [{ date: "asc" }, { weekday: "asc" }, { createdAt: "asc" }] });
  const rows: NoteRow[] = notes.map((n) => ({
    id: n.id,
    centerId: n.centerId,
    centerLabel: label.get(n.centerId) ?? n.centerId,
    weekday: n.weekday,
    date: n.date ? n.date.toISOString().slice(0, 10) : null,
    audience: n.audience,
    mode: n.mode,
    text: n.text,
    isActive: n.isActive,
  }));
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <Link href="/cham-cong" className="text-sm text-muted-foreground hover:underline">← Chấm công</Link>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Việc cố định & ghi chú lịch</h1>
        <p className="mt-1 text-sm text-muted-foreground">Nội dung ghép vào tin nhắc lịch ngày mai (gửi lúc giờ đặt trong Cấu hình vận hành). Ghi chú theo NGÀY ưu tiên hơn việc cố định theo thứ; "Không gửi tin" tắt tin của khối hôm đó.</p>
      </div>
      <NoteManager rows={rows} blocks={blocks} />
    </div>
  );
}
