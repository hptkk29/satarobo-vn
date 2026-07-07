import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Users, AlertTriangle, MessageSquareWarning } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import type { Prisma, WorkShift } from "@prisma/client";
import {
  computeShiftAttendance,
  formatVNTime,
  formatRegisteredShifts,
  type AttendanceTag,
} from "@/lib/work-schedule";
import { getSetting } from "@/lib/settings/service";

export const metadata = { title: "Tổng hợp công ca | Admin" };
export const dynamic = "force-dynamic";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

const TAG_TONE: Record<AttendanceTag["tone"], string> = {
  ok: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-700",
};

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mondayOf(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const wd = (x.getDay() + 6) % 7; // 0=Mon
  x.setDate(x.getDate() - wd);
  return x;
}

interface Props {
  searchParams: Promise<{ date?: string; centerId?: string }>;
}

export default async function ManagerShiftsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { date, centerId } = await searchParams;
  // Phạm vi: CM (không super) → cơ sở mình; super/HR → tất cả (lọc tuỳ chọn);
  // nhân viên thường → chỉ chính mình.
  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  const isCM = hasRole(session.user, "CENTER_MANAGER");
  const forcedCenter = isCM && !isSuper ? session.user.centerId : null;
  // Target gate: cơ sở CM cố định, hoặc cơ sở đang lọc, hoặc cơ sở actor (fallback
  // CENTER_HR — tránh v2 luôn false vì thiếu target khi action có cả tầng CENTER).
  const viewTargetCenter = forcedCenter ?? centerId ?? session.user.centerId ?? null;
  // Quản lý/HR xem theo phạm vi; nhân viên thường chỉ xem CHÍNH MÌNH.
  const canViewAll = await checkPermission("hr_attendance:view", { centerId: viewTargetCenter });
  if (!canViewAll && !(await checkPermission("hr_attendance:checkin", { centerId: session.user.centerId }))) {
    redirect("/dashboard");
  }

  const anchor = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date();
  const weekStart = mondayOf(anchor);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return ymd(d);
  });

  const filterCenter = forcedCenter ?? (canViewAll ? centerId ?? null : null);
  const selfOnly = !canViewAll;

  // Cách ly cơ sở (A0-04): ShiftRegistration/EmployeeCheckin/TimesheetAdjustmentRequest
  // ∈ SCOPED_MODELS → đọc qua scopedDb.
  const sdb = scopedDb(await resolveActor(session.user.id));

  const centers = canViewAll && !forcedCenter
    ? await sdb.center.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true } })
    : [];

  const userWhere: Prisma.UserWhereInput = selfOnly
    ? { id: session.user.id }
    : {
        role: { not: "PARENT" },
        isActive: true,
        deletedAt: null,
        ...(filterCenter ? { centerId: filterCenter } : {}),
      };

  const [staffRaw, regs, checkins, adjustments] = await Promise.all([
    sdb.user.findMany({
      where: userWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, center: { select: { name: true } } },
    }),
    sdb.shiftRegistration.findMany({
      where: {
        date: { gte: weekStart, lt: weekEnd },
        status: "APPROVED", // chỉ lịch CHÍNH THỨC
        ...(selfOnly ? { userId: session.user.id } : filterCenter ? { user: { centerId: filterCenter } } : {}),
      },
      select: { userId: true, date: true, shifts: true },
    }),
    sdb.employeeCheckin.findMany({
      where: {
        checkedAt: { gte: weekStart, lt: weekEnd },
        ...(selfOnly ? { userId: session.user.id } : filterCenter ? { centerId: filterCenter } : {}),
      },
      select: { userId: true, type: true, checkedAt: true, withinGeofence: true },
    }),
    sdb.timesheetAdjustmentRequest.findMany({
      where: {
        date: { gte: weekStart, lt: weekEnd },
        ...(selfOnly ? { userId: session.user.id } : filterCenter ? { centerId: filterCenter } : {}),
      },
      select: { userId: true, date: true, reason: true, status: true },
    }),
  ]);

  // #12 — gộp đúng 1 dòng/nhân viên (dedup theo userId, phòng nhân đôi).
  const staff = Array.from(new Map(staffRaw.map((u) => [u.id, u])).values());

  // reg map[userId][dateStr] = shifts
  const regMap = new Map<string, Map<string, WorkShift[]>>();
  for (const r of regs) {
    const ds = ymd(new Date(r.date));
    if (!regMap.has(r.userId)) regMap.set(r.userId, new Map());
    regMap.get(r.userId)!.set(ds, r.shifts);
  }
  // checkin map[userId][dateStr] = {in,out,geo}
  type Att = { checkIn: Date | null; checkOut: Date | null; geo: boolean };
  const attMap = new Map<string, Map<string, Att>>();
  for (const c of checkins) {
    const ds = ymd(new Date(c.checkedAt));
    if (!attMap.has(c.userId)) attMap.set(c.userId, new Map());
    const day = attMap.get(c.userId)!;
    const cur = day.get(ds) ?? { checkIn: null, checkOut: null, geo: false };
    if (c.type === "CHECK_IN") cur.checkIn = c.checkedAt;
    else cur.checkOut = c.checkedAt;
    if (!c.withinGeofence) cur.geo = true;
    day.set(ds, cur);
  }
  // adjustment map[userId][dateStr] = {reason,status}
  const adjMap = new Map<string, Map<string, { reason: string; status: string }>>();
  for (const a of adjustments) {
    const ds = ymd(new Date(a.date));
    if (!adjMap.has(a.userId)) adjMap.set(a.userId, new Map());
    adjMap.get(a.userId)!.set(ds, { reason: a.reason, status: a.status });
  }

  const prev = new Date(weekStart); prev.setDate(prev.getDate() - 7);
  const next = new Date(weekStart); next.setDate(next.getDate() + 7);
  const linkBase = (d: Date) =>
    `/cham-cong/lich-ca-nhan-vien?date=${ymd(d)}${filterCenter ? `&centerId=${filterCenter}` : ""}`;

  const shiftTolerance = await getSetting("shift.toleranceMinutes");

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Users className="h-6 w-6 text-[#7C3AED]" /> Tổng hợp công ca
        </h1>
        <div className="flex items-center gap-2">
          {centers.length > 0 && (
            <form method="GET" className="flex items-center gap-1">
              <input type="hidden" name="date" value={ymd(weekStart)} />
              <select
                name="centerId"
                defaultValue={filterCenter ?? ""}
                className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
              >
                <option value="">Tất cả cơ sở</option>
                {centers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button type="submit" className="rounded-lg bg-gray-800 px-2 py-1.5 text-xs font-medium text-white">Lọc</button>
            </form>
          )}
          <Link href={linkBase(prev)} className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-semibold text-gray-700">
            Tuần {weekDates[0]} → {weekDates[6]}
          </span>
          <Link href={linkBase(next)} className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      <p className="mb-3 text-xs text-gray-500">
        Ca chính thức (APPROVED) · giờ vào/ra (GMT+7) · trạng thái · <MessageSquareWarning className="inline h-3.5 w-3.5 text-amber-600" /> = có giải trình/yêu cầu chỉnh công.
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-100 text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase text-gray-500">Nhân viên</th>
              {weekDates.map((ds, i) => (
                <th key={ds} className="px-2 py-2 text-center text-xs font-semibold text-gray-500">
                  {WEEKDAYS[i]}<br /><span className="font-normal text-gray-400">{ds.slice(5)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {staff.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">Không có nhân viên trong phạm vi.</td></tr>
            ) : (
              staff.map((u) => {
                const uRegs = regMap.get(u.id);
                const uAtt = attMap.get(u.id);
                const uAdj = adjMap.get(u.id);
                return (
                  <tr key={u.id} className="align-top hover:bg-gray-50/60">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{u.name ?? u.email}</div>
                      {!filterCenter && u.center?.name && (
                        <div className="text-xs text-gray-400">{u.center.name}</div>
                      )}
                    </td>
                    {weekDates.map((ds) => {
                      const shifts = uRegs?.get(ds) ?? [];
                      const att = uAtt?.get(ds) ?? { checkIn: null, checkOut: null, geo: false };
                      const adj = uAdj?.get(ds);
                      const result = computeShiftAttendance(
                        {
                          checkIn: att.checkIn,
                          checkOut: att.checkOut,
                          geofenceFlag: att.geo,
                          registeredShifts: shifts,
                        },
                        shiftTolerance,
                      );
                      const hasData = shifts.length > 0 || att.checkIn || att.checkOut || adj;
                      return (
                        <td key={ds} className="px-2 py-2 text-center">
                          {!hasData ? (
                            <span className="text-gray-300">—</span>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              {shifts.length > 0 ? (
                                <span className="text-[10px] font-semibold text-gray-700">
                                  {formatRegisteredShifts(shifts)}
                                </span>
                              ) : (
                                att.checkIn && <span className="text-[9px] text-amber-600">Chưa ĐK ca</span>
                              )}
                              {(att.checkIn || att.checkOut) && (
                                <span className="text-[10px] tabular-nums text-gray-500">
                                  {formatVNTime(att.checkIn)}–{formatVNTime(att.checkOut)}
                                </span>
                              )}
                              {result.tags.slice(0, 1).map((t, k) => (
                                <span key={k} className={`rounded px-1 text-[9px] font-semibold ${TAG_TONE[t.tone]}`}>
                                  {t.label}
                                </span>
                              ))}
                              {adj && (
                                <span
                                  title={`Giải trình (${adj.status}): ${adj.reason}`}
                                  className="inline-flex items-center gap-0.5 rounded bg-amber-50 px-1 text-[9px] font-semibold text-amber-700"
                                >
                                  <MessageSquareWarning className="h-3 w-3" /> giải trình
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {!selfOnly && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
          <AlertTriangle className="h-3.5 w-3.5" /> Chỉ lịch chính thức (đã duyệt qua import Excel) mới tính công.
        </p>
      )}
    </div>
  );
}
