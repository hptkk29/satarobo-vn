// app/(admin)/admin/cham-cong/ky-cong/page.tsx — L5: KỲ CÔNG (cơ sở × tháng): bảng tổng hợp mỗi người,
// công chuẩn, chốt sổ, mở lại, xuất Excel. Kỳ đã chốt hiện số trong summaryJson (số đã chốt).
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { HO_CENTER_ID, loadCenterMap } from "@/lib/cham-cong/home-center";
import { buildPeriodSummary, currentPeriodKey, getOrCreatePeriod, parsePeriodKey, periodRange, type PeriodSummary } from "@/lib/cham-cong/period";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";
import { PeriodPanel } from "./_components/period-panel";

export const metadata = { title: "Kỳ công | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

function shiftKey(key: string, delta: number): string {
  const p = parsePeriodKey(key)!;
  const d = new Date(Date.UTC(p.y, p.m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export default async function KyCongPage({ searchParams }: { searchParams: Promise<{ ky?: string; coSo?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Fky-cong");
  const sp = await searchParams;
  const map = await loadCenterMap();
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const centers = await sdb.center.findMany({ where: { isActive: true, code: { in: Object.keys(map.byCode) } }, select: { id: true, code: true, name: true }, orderBy: { displayOrder: "asc" } });
  const blocks = [...centers.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` })), { id: HO_CENTER_ID, label: "Hội sở" }];
  const visible: typeof blocks = [];
  for (const b of blocks) if (await checkPermission("hr_attendance:view", { centerId: b.id })) visible.push(b);
  if (visible.length === 0) redirect("/cham-cong");
  const coSo = visible.find((b) => b.id === sp.coSo)?.id ?? visible[0].id;
  const ky = sp.ky && parsePeriodKey(sp.ky) ? sp.ky : currentPeriodKey();
  const [canClose, canReopen, canExport] = await Promise.all([
    checkPermission("hr_attendance:close-period", { centerId: coSo }),
    checkPermission("hr_attendance:close-period", { centerId: HO_CENTER_ID }),
    checkPermission("hr_attendance:export", { centerId: coSo }),
  ]);

  const period = canClose ? await getOrCreatePeriod(coSo, ky) : await sdb.attendancePeriod.findUnique({ where: { centerId_periodKey: { centerId: coSo, periodKey: ky } } });
  const locked = period?.status === "LOCKED";
  const summary: PeriodSummary = locked && period?.summaryJson ? (period.summaryJson as unknown as PeriodSummary) : await buildPeriodSummary(coSo, ky);
  const { to } = periodRange(ky);
  const periodEnded = to.getTime() < Date.now();
  const label = visible.find((b) => b.id === coSo)?.label ?? coSo;

  return (
    <div className="max-w-6xl p-6">
      <div className="mb-4">
        <Link href="/cham-cong" className="text-sm text-muted-foreground hover:underline">← Chấm công</Link>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Kỳ công {ky} — {label}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Công = tổng công ngày (đã tính ghi đè). Buổi dạy = buổi lớp COMPLETED do người đó thực dạy (không tính trải nghiệm / huỷ — K-05). Chốt kỳ đóng băng số; sau đó lưới và lượt quét không đổi được số này.</p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link className="rounded-md border border-border px-2 py-1" href={`/cham-cong/ky-cong?ky=${shiftKey(ky, -1)}&coSo=${coSo}`}>‹</Link>
        <span className="font-mono font-semibold">{ky}</span>
        <Link className="rounded-md border border-border px-2 py-1" href={`/cham-cong/ky-cong?ky=${shiftKey(ky, 1)}&coSo=${coSo}`}>›</Link>
        {visible.map((b) => (
          <Link key={b.id} className={`rounded-md border px-2 py-1 ${b.id === coSo ? "border-primary bg-primary text-white" : "border-border"}`} href={`/cham-cong/ky-cong?ky=${ky}&coSo=${b.id}`}>{b.label}</Link>
        ))}
        <Link className="ml-auto text-xs text-muted-foreground hover:underline" href={`/cham-cong/phan-ca?ky=${ky}&coSo=${coSo}`}>Lưới phân ca →</Link>
      </div>

      <div className="mb-4">
        <PeriodPanel centerId={coSo} ky={ky} status={period?.status ?? null} standardUnits={period?.standardUnits ?? summary.standardUnits} standardUnitsNote={period?.standardUnitsNote ?? null} canClose={canClose} canReopen={canReopen} canExport={canExport} periodEnded={periodEnded} />
        {locked && period?.lockedAt && <p className="mt-2 text-xs text-muted-foreground">Chốt lúc {period.lockedAt.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}{period.lockReason ? ` — ${period.lockReason}` : ""} · đã xuất {period.exportCount} lần.</p>}
      </div>

      <PhanTrangBang cuonNgang>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nhân sự</th>
              <th className="px-3 py-2 text-right">Công</th>
              <th className="px-3 py-2 text-right">KH</th>
              <th className="px-3 py-2 text-right">Nghỉ CL</th>
              <th className="px-3 py-2 text-right">Lễ</th>
              <th className="px-3 py-2 text-right">Giờ HC</th>
              <th className="px-3 py-2 text-right">Giờ làm</th>
              <th className="px-3 py-2 text-right">Muộn/Sớm</th>
              <th className="px-3 py-2 text-right">Không lượt</th>
              <th className="px-3 py-2 text-right">Ghi đè</th>
              <th className="px-3 py-2 text-right">Cờ</th>
              <th className="px-3 py-2 text-right">Buổi dạy</th>
            </tr>
          </thead>
          <tbody>
            {summary.rows.length === 0 ? (
              <tr><td colSpan={12} className="p-10 text-center text-muted-foreground">Chưa có ca hay ngày công nào trong kỳ {ky} ở khối này.</td></tr>
            ) : (
              summary.rows.map((r) => (
                <tr key={r.userId} className="border-b border-border hover:bg-muted/40">
                  <td className="px-3 py-2"><span className="font-medium">{r.name}</span>{r.employeeCode && <span className="ml-1 font-mono text-xs text-muted-foreground">{r.employeeCode}</span>}{r.jobTitle && <div className="text-xs text-muted-foreground">{r.jobTitle}</div>}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.units}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{r.expectedUnits}</td>
                  <td className="px-3 py-2 text-right">{r.leaveUnits || "—"}</td>
                  <td className="px-3 py-2 text-right">{r.holidayPaidUnits || "—"}</td>
                  <td className="px-3 py-2 text-right">{r.hourCredit || "—"}</td>
                  <td className="px-3 py-2 text-right">{r.workedMinutes ? `${Math.round(r.workedMinutes / 60)}h` : "—"}<span className="text-xs text-muted-foreground"> / {Math.round(r.expectedMinutes / 60)}h</span></td>
                  <td className="px-3 py-2 text-right">{r.lateCount || r.earlyLeaveCount ? `${r.lateCount}/${r.earlyLeaveCount}` : "—"}</td>
                  <td className="px-3 py-2 text-right">{r.missingTapDays || "—"}</td>
                  <td className="px-3 py-2 text-right">{r.overrideDays || "—"}</td>
                  <td className="px-3 py-2 text-right">{r.flaggedDays ? <span className="rounded-full bg-state-warning-soft px-2 py-0.5 text-xs font-semibold text-state-warning-ink">{r.flaggedDays}</span> : "—"}</td>
                  <td className="px-3 py-2 text-right">{r.teachingSessions || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
          {summary.rows.length > 0 && (
            <tfoot><tr className="border-t border-border bg-muted/40 font-semibold"><td className="px-3 py-2">Tổng {summary.totals.people} người</td><td className="px-3 py-2 text-right">{summary.totals.units}</td><td colSpan={8} /><td className="px-3 py-2 text-right">{summary.totals.flaggedDays || "—"}</td><td className="px-3 py-2 text-right">{summary.totals.teachingSessions || "—"}</td></tr></tfoot>
          )}
        </table>
      </PhanTrangBang>
      <p className="mt-3 text-xs text-muted-foreground">{locked ? "Số đã chốt — đọc từ bản lưu lúc chốt." : `Bản tạm dựng lúc ${new Date(summary.builtAt).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" })}. Số công ngày cập nhật vài phút sau mỗi lượt quét/đổi ca.`}</p>
    </div>
  );
}
