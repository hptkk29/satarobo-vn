import Link from "next/link";
import { redirect } from "next/navigation";
import { Monitor, AlertTriangle, MapPinOff } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { ymdVN } from "@/lib/classes/schedule";
import { DateNavInput } from "./_components/date-nav-input";
import type { WorkShift } from "@prisma/client";
import {
  computeShiftAttendance,
  formatVNTime,
  formatRegisteredShifts,
  type AttendanceTag,
} from "@/lib/work-schedule";
import { SHIFT_DEFS, SHIFT_ORDER } from "@/lib/shifts";
import { getSetting } from "@/lib/settings/service";
import { PhanTrangBang } from "@/components/ui/phan-trang-bang";

export const metadata = { title: "Chấm công | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ date?: string }>;
}

const TAG_TONE: Record<AttendanceTag["tone"], string> = {
  ok: "bg-state-success-soft text-state-success-ink",
  warn: "bg-state-warning-soft text-state-warning-ink",
  danger: "bg-state-danger-soft text-state-danger-ink",
};

export default async function ChamCongPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Phạm vi cơ sở: CENTER_MANAGER chỉ xem cơ sở mình.
  const centerScope = hasRole(session.user, "CENTER_MANAGER") ? session.user.centerId : null;
  if (!(await checkPermission("hr_attendance:view", { centerId: centerScope ?? session.user.centerId ?? null }))) {
    redirect("/dashboard");
  }

  const { date } = await searchParams;
  const base = date ? new Date(date) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  // `start` là NỬA ĐÊM GIỜ ĐỊA PHƯƠNG → đọc lại nhãn theo ngày ĐỊA PHƯƠNG (ymdVN),
  // KHÔNG qua toISOString() (UTC) — trên máy +7 sẽ lệch -1 ngày (18/7 thay vì 19/7)
  // và ngày người dùng tự chọn cũng bị hiển thị lùi 1 ngày.
  const dateStr = ymdVN(start);

  // Cách ly cơ sở (A0-04): EmployeeCheckin/ShiftRegistration ∈ SCOPED_MODELS → scopedDb.
  const sdb = scopedDb(await resolveActor(session.user.id));

  const [rows, regs] = await Promise.all([
    sdb.employeeCheckin.findMany({
      where: { checkedAt: { gte: start, lt: end }, ...(centerScope ? { centerId: centerScope } : {}) },
      orderBy: { checkedAt: "asc" },
    }),
    sdb.shiftRegistration.findMany({
      // Chỉ lịch CHÍNH THỨC (APPROVED) mới dùng tính công (PHẦN 2).
      where: { date: { gte: start, lt: end }, status: "APPROVED", ...(centerScope ? { centerId: centerScope } : {}) },
      select: { userId: true, shifts: true, user: { select: { name: true, centerId: true } } },
    }),
  ]);

  type Agg = {
    userId: string;
    userName: string;
    checkIn: Date | null;
    checkOut: Date | null;
    centerId: string | null;
    geofenceFlag: boolean;
    registeredShifts: WorkShift[];
  };
  const byUser = new Map<string, Agg>();
  const ensure = (userId: string, name: string, centerId: string | null): Agg => {
    let a = byUser.get(userId);
    if (!a) {
      a = { userId, userName: name, checkIn: null, checkOut: null, centerId, geofenceFlag: false, registeredShifts: [] };
      byUser.set(userId, a);
    }
    return a;
  };
  for (const r of rows) {
    const a = ensure(r.userId, r.userName ?? "(không tên)", r.centerId);
    if (r.type === "CHECK_IN") a.checkIn = r.checkedAt;
    else a.checkOut = r.checkedAt;
    if (!r.withinGeofence) a.geofenceFlag = true;
  }
  // Nhân viên có ĐĂNG KÝ ca ngày đó (kể cả chưa quét → để hiện "Thiếu ca").
  for (const reg of regs) {
    const a = ensure(reg.userId, reg.user.name ?? "(không tên)", reg.user.centerId);
    a.registeredShifts = reg.shifts;
  }

  const shiftTolerance = await getSetting("shift.toleranceMinutes");
  const list = [...byUser.values()]
    .sort((x, y) => x.userName.localeCompare(y.userName))
    .map((a) => ({
      ...a,
      status: computeShiftAttendance(
        {
          checkIn: a.checkIn,
          checkOut: a.checkOut,
          geofenceFlag: a.geofenceFlag,
          registeredShifts: a.registeredShifts,
        },
        shiftTolerance,
      ),
    }));

  const centers = await sdb.center.findMany({ select: { id: true, name: true } });
  const centerName = new Map(centers.map((c) => [c.id, c.name]));

  const missingOut = list.filter((a) => a.checkIn && !a.checkOut).length;

  return (
    <div className="max-w-5xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chấm công nhân viên</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tính công theo ca đăng ký (GMT+7):{" "}
            {SHIFT_ORDER.map((s) => `${SHIFT_DEFS[s].label} ${SHIFT_DEFS[s].start}–${SHIFT_DEFS[s].end}`).join(" · ")}.
          </p>
        </div>
        <Link
          href="/cham-cong/man-hinh"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          <Monitor className="h-4 w-4" /> Mở màn hình QR
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <DateNavInput value={dateStr} />
        {missingOut > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-state-warning-soft px-3 py-1 text-xs font-semibold text-state-warning-ink">
            <AlertTriangle className="h-3.5 w-3.5" /> {missingOut} người chưa check-out
          </span>
        )}
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Chưa có chấm công ngày {dateStr}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <PhanTrangBang>
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nhân viên</th>
                  <th className="px-4 py-3 font-semibold">Cơ sở</th>
                  <th className="px-4 py-3 font-semibold">Ca đăng ký</th>
                  <th className="px-4 py-3 text-center font-semibold">Check-in</th>
                  <th className="px-4 py-3 text-center font-semibold">Check-out</th>
                  <th className="px-4 py-3 text-center font-semibold">Giờ công</th>
                  <th className="px-4 py-3 text-center font-semibold">Tình trạng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {list.map((a, i) => (
                  <tr key={i} className="hover:bg-muted/60">
                    <td className="px-4 py-2.5 font-medium text-foreground">{a.userName}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {a.centerId ? centerName.get(a.centerId) ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-foreground">
                      {formatRegisteredShifts(a.registeredShifts)}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-foreground">
                      {formatVNTime(a.checkIn)}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-foreground">
                      {formatVNTime(a.checkOut)}
                    </td>
                    <td className="px-4 py-2.5 text-center tabular-nums font-medium text-foreground">
                      {a.checkIn && a.checkOut ? `${a.status.workedHours}h` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex flex-wrap items-center justify-center gap-1">
                        {a.status.tags.map((t, j) => (
                          <span
                            key={j}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${TAG_TONE[t.tone]}`}
                          >
                            {t.label === "Ngoài vùng" && <MapPinOff className="h-3 w-3" />}
                            {t.label}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PhanTrangBang>
        </div>
      )}
    </div>
  );
}
