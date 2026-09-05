// app/(admin)/admin/cham-cong/page.tsx — BẢNG CÔNG NGÀY (L4, chấm công v3): đọc StaffAttendanceDay +
// StaffTimeLog thay cho EmployeeCheckin/ShiftRegistration cũ. Mỗi dòng = một người trong ngày: ca,
// vào/ra đầu-cuối, giờ, công, cờ hậu kiểm. ?date=YYYY-MM-DD&coSo=<centerId|hoi-so>.
import Link from "next/link";
import { redirect } from "next/navigation";
import { Monitor, AlertTriangle, FileSpreadsheet, CalendarDays } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { HO_CENTER_ID, loadCenterMap } from "@/lib/cham-cong/home-center";
import { vnYmd, parseVnYmd, vnDateOnly } from "@/lib/time/vn";
import { DateNavInput } from "./_components/date-nav-input";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

export const metadata = { title: "Chấm công | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ date?: string; coSo?: string }>;
}

const FLAG_LABEL: Record<string, { text: string; tone: "warn" | "danger" | "info" }> = {
  KHONG_CO_LUOT: { text: "Không có lượt", tone: "danger" },
  THIEU_LUOT_RA: { text: "Thiếu lượt ra", tone: "warn" },
  RA_KHONG_CO_VAO: { text: "Ra không có vào", tone: "warn" },
  THIEU_BUOI_SANG: { text: "Thiếu buổi sáng", tone: "warn" },
  THIEU_BUOI_CHIEU: { text: "Thiếu buổi chiều", tone: "warn" },
  DI_MUON: { text: "Đi muộn", tone: "warn" },
  VE_SOM: { text: "Về sớm", tone: "warn" },
  THIEU_GIO: { text: "Thiếu giờ", tone: "warn" },
  DEN_SAT_GIO: { text: "Đến sát giờ", tone: "info" },
  NGOAI_VUNG: { text: "Ngoài vùng", tone: "danger" },
  THIEU_GPS: { text: "Thiếu GPS", tone: "info" },
  CHUA_TOA_DO: { text: "Chưa toạ độ", tone: "info" },
  SAI_NOI_LAM: { text: "Sai nơi làm", tone: "danger" },
  CHAM_NGOAI_LICH: { text: "Chấm ngoài lịch", tone: "warn" },
  TRUNG_2_PHUT: { text: "Bấm trùng", tone: "info" },
  VUOT_TRAN: { text: "Vượt trần lượt", tone: "warn" },
  LAM_NGAY_LE: { text: "Làm ngày lễ", tone: "info" },
  GPS_KEM_CHINH_XAC: { text: "GPS kém", tone: "info" },
};
const TONE: Record<"warn" | "danger" | "info", string> = {
  warn: "bg-state-warning-soft text-state-warning-ink",
  danger: "bg-state-danger-soft text-state-danger-ink",
  info: "bg-muted text-muted-foreground",
};

function hhmm(d: Date | null | undefined): string {
  if (!d) return "—";
  const p = new Date(d.getTime() + 7 * 3_600_000);
  return `${String(p.getUTCHours()).padStart(2, "0")}:${String(p.getUTCMinutes()).padStart(2, "0")}`;
}
function fmtMin(m: number): string {
  return m ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : "—";
}

export default async function ChamCongPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const sp = await searchParams;
  const map = await loadCenterMap();
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const centers = await sdb.center.findMany({ where: { isActive: true, code: { in: Object.keys(map.byCode) } }, select: { id: true, code: true, name: true }, orderBy: { displayOrder: "asc" } });
  const blocks = [...centers.map((c) => ({ id: c.id, label: `${c.code} · ${c.name}` })), { id: HO_CENTER_ID, label: "Hội sở" }];
  const visible: typeof blocks = [];
  for (const b of blocks) if (await checkPermission("hr_attendance:view", { centerId: b.id })) visible.push(b);
  if (visible.length === 0) redirect("/dashboard");
  const coSo = visible.find((b) => b.id === sp.coSo)?.id ?? visible[0].id;

  const day = (sp.date && parseVnYmd(sp.date)) || new Date();
  const workDate = vnDateOnly(day);
  const dateStr = workDate.toISOString().slice(0, 10);
  const prev = new Date(workDate.getTime() - 86_400_000).toISOString().slice(0, 10);
  const next = new Date(workDate.getTime() + 86_400_000).toISOString().slice(0, 10);

  const [days, logs, assignments] = await Promise.all([
    sdb.staffAttendanceDay.findMany({ where: { workDate, centerId: coSo } }),
    sdb.staffTimeLog.findMany({ where: { workDate, centerId: coSo, result: "ACCEPTED" }, orderBy: { loggedAt: "asc" }, select: { userId: true, direction: true, loggedAt: true, flags: true } }),
    sdb.shiftAssignment.findMany({ where: { workDate, centerId: coSo, status: "ACTIVE" }, select: { userId: true, templateCode: true } }),
  ]);
  const userIds = [...new Set([...days.map((d) => d.userId), ...logs.map((l) => l.userId), ...assignments.map((a) => a.userId)])];
  const users = await sdb.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
  const nameOf = new Map(users.map((u) => [u.id, u.name ?? u.email ?? u.id]));
  const rows = userIds
    .map((userId) => {
      const d = days.find((x) => x.userId === userId) ?? null;
      const my = logs.filter((l) => l.userId === userId);
      const firstIn = my.find((l) => l.direction === "CHECK_IN")?.loggedAt ?? null;
      const lastOut = [...my].reverse().find((l) => l.direction === "CHECK_OUT")?.loggedAt ?? null;
      return {
        userId,
        name: nameOf.get(userId) ?? userId,
        code: d?.templateCode ?? assignments.find((a) => a.userId === userId)?.templateCode ?? null,
        firstIn,
        lastOut,
        taps: my.length,
        worked: d?.workedMinutes ?? 0,
        expected: d?.expectedMinutes ?? 0,
        credit: d ? (d.overrideUnits ?? d.dayCreditEarned) : null,
        override: d?.overrideUnits != null,
        flags: d ? d.flags : [...new Set(my.flatMap((l) => l.flags))],
        computed: !!d,
        dayType: d?.dayType ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  const withFlags = rows.filter((r) => r.flags.some((f) => FLAG_LABEL[f]?.tone !== "info")).length;
  const notComputed = rows.filter((r) => !r.computed).length;

  return (
    <div className="max-w-6xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Bảng công ngày</h1>
          <p className="mt-1 text-sm text-muted-foreground">Công đếm theo lịch đã xếp; lượt quét chỉ sinh cờ để Quản lý rà (T-01). Giờ tính giao giữa cặp vào/ra và ca.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/cham-cong/phan-ca/import" className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"><FileSpreadsheet className="h-4 w-4" /> Import lịch</Link>
          <Link href={`/cham-cong/phan-ca?ky=${dateStr.slice(0, 7)}&coSo=${coSo}`} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted"><CalendarDays className="h-4 w-4" /> Lưới phân ca</Link>
          <Link href={`/cham-cong/man-hinh?centerId=${coSo}`} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary-dark"><Monitor className="h-4 w-4" /> Màn hình QR</Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
        <Link className="rounded-md border border-border px-2 py-1" href={`/cham-cong?date=${prev}&coSo=${coSo}`}>‹</Link>
        <DateNavInput value={dateStr} />
        <Link className="rounded-md border border-border px-2 py-1" href={`/cham-cong?date=${next}&coSo=${coSo}`}>›</Link>
        {visible.map((b) => (
          <Link key={b.id} className={`rounded-md border px-2 py-1 ${b.id === coSo ? "border-primary bg-primary text-white" : "border-border"}`} href={`/cham-cong?date=${dateStr}&coSo=${b.id}`}>{b.label}</Link>
        ))}
        {withFlags > 0 && <span className="inline-flex items-center gap-1 rounded-full bg-state-warning-soft px-3 py-1 text-xs font-semibold text-state-warning-ink"><AlertTriangle className="h-3.5 w-3.5" /> {withFlags} người có cờ cần rà</span>}
        {notComputed > 0 && <span className="text-xs text-muted-foreground">{notComputed} dòng đang chờ tính (vài phút)</span>}
      </div>

      <PhanTrangBang cuonNgang>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Nhân sự</th>
              <th className="px-3 py-2">Ca</th>
              <th className="px-3 py-2">Vào</th>
              <th className="px-3 py-2">Ra</th>
              <th className="px-3 py-2 text-right">Lượt</th>
              <th className="px-3 py-2 text-right">Giờ / KH</th>
              <th className="px-3 py-2 text-right">Công</th>
              <th className="px-3 py-2">Cờ</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={8} className="p-10 text-center text-muted-foreground">Chưa có ca hay lượt chấm nào cho ngày {dateStr} ở khối này.</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={r.userId} className="border-b border-border hover:bg-muted/40">
                  <td className="px-3 py-2 font-medium">{r.name}</td>
                  <td className="px-3 py-2 font-mono">{r.code ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2">{hhmm(r.firstIn)}</td>
                  <td className="px-3 py-2">{hhmm(r.lastOut)}</td>
                  <td className="px-3 py-2 text-right">{r.taps || "—"}</td>
                  <td className="px-3 py-2 text-right">{fmtMin(r.worked)} / {fmtMin(r.expected)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{r.credit ?? "…"}{r.override && <span title="Quản lý đã ghi đè" className="ml-1 text-xs text-amber-600">*</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {r.flags.map((f) => {
                        const l = FLAG_LABEL[f] ?? { text: f, tone: "info" as const };
                        return <span key={f} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[l.tone]}`}>{l.text}</span>;
                      })}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </PhanTrangBang>
      <p className="mt-3 text-xs text-muted-foreground">Ngày công theo giờ Việt Nam. Hôm nay: {vnYmd(new Date())}.</p>
    </div>
  );
}
