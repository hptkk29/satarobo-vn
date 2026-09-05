// app/(admin)/admin/don-tu/cua-toi/page.tsx — L5: ĐƠN CỦA TÔI trên site admin (tư vấn, giáo vụ,
// kế toán, người Hội sở…). Cùng form với site GV (`components/cham-cong/request-form.tsx`).
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { loadRequestFormOptions } from "@/lib/cham-cong/request-form-data";
import { HO_CENTER_ID } from "@/lib/cham-cong/home-center";
import { WORK_REQUEST_KINDS, type WorkRequestKindV, type WorkRequestStatusV } from "@/lib/work-request";
import { MyRequests, type MyRequestRow } from "@/components/cham-cong/my-requests";

export const metadata = { title: "Đơn của tôi | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const dateFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Ho_Chi_Minh" });
const dtFmt = new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" });

export default async function DonCuaToiPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fdon-tu%2Fcua-toi");
  const sp = await searchParams;
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const [requests, options] = await Promise.all([
    sdb.workRequest.findMany({ where: { requesterId: session.user.id }, orderBy: { createdAt: "desc" }, take: 200 }),
    loadRequestFormOptions(session.user.id),
  ]);
  const centerLabel = new Map(options.centers.map((c) => [c.id, c.label]));
  const rows: MyRequestRow[] = requests.map((r) => ({
    id: r.id,
    kind: r.kind as WorkRequestKindV,
    status: r.status as WorkRequestStatusV,
    centerLabel: r.centerId ? (centerLabel.get(r.centerId) ?? (r.centerId === HO_CENTER_ID ? "Hội sở" : r.centerId)) : "—",
    fromLabel: r.fromDate ? dateFmt.format(r.fromDate) : null,
    toLabel: r.toDate ? dateFmt.format(r.toDate) : null,
    time: r.requestedInAt || r.requestedOutAt ? `vào ${r.requestedInAt ?? "—"} · ra ${r.requestedOutAt ?? "—"}` : r.startTime ? `${r.startTime}${r.endTime ? `–${r.endTime}` : ""}` : null,
    detail: r.detail,
    reason: r.reason,
    submittedLate: r.submittedLate,
    applyError: r.applyError,
    reviewNote: r.reviewNote,
    reviewedByName: r.reviewedByName,
    createdAtLabel: dtFmt.format(r.createdAt),
  }));
  const preset = (WORK_REQUEST_KINDS as readonly string[]).includes(sp.type ?? "") ? (sp.type as WorkRequestKindV) : null;
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-4">
        <Link href="/cham-cong" className="text-sm text-muted-foreground hover:underline">← Chấm công</Link>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Đơn của tôi</h1>
        <p className="mt-1 text-sm text-muted-foreground">Đổi ca, nghỉ phép, chỉnh công (quên quét), tăng ca, đi muộn/về sớm, công tác. Đơn gửi tới Quản lý của cơ sở chịu công ngày đó; duyệt xong lịch/ công đổi ngay.</p>
      </div>
      <MyRequests rows={rows} options={options} presetKind={preset} />
    </div>
  );
}
