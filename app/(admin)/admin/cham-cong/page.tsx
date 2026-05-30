import Link from "next/link";
import { redirect } from "next/navigation";
import { Monitor, AlertTriangle, MapPinOff } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { WorkShift } from "@prisma/client";
import {
  computeShiftAttendance,
  formatVNTime,
  formatRegisteredShifts,
  type AttendanceTag,
} from "@/lib/work-schedule";
import { SHIFT_DEFS, SHIFT_ORDER } from "@/lib/shifts";

export const metadata = { title: "Chấm công | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ date?: string }>;
}

const TAG_TONE: Record<AttendanceTag["tone"], string> = {
  ok: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
  danger: "bg-rose-100 text-rose-700",
};

export default async function ChamCongPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "hr_attendance:view")) redirect("/dashboard");

  const { date } = await searchParams;
  const base = date ? new Date(date) : new Date();
  const start = new Date(base);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const dateStr = start.toISOString().slice(0, 10);

  // Phạm vi cơ sở: CENTER_MANAGER chỉ xem cơ sở mình.
  const centerScope = session.user.role === "CENTER_MANAGER" ? session.user.centerId : null;

  const [rows, regs] = await Promise.all([
    db.employeeCheckin.findMany({
      where: { checkedAt: { gte: start, lt: end }, ...(centerScope ? { centerId: centerScope } : {}) },
      orderBy: { checkedAt: "asc" },
    }),
    db.shiftRegistration.findMany({
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

  const list = [...byUser.values()]
    .sort((x, y) => x.userName.localeCompare(y.userName))
    .map((a) => ({
      ...a,
      status: computeShiftAttendance({
        checkIn: a.checkIn,
        checkOut: a.checkOut,
        geofenceFlag: a.geofenceFlag,
        registeredShifts: a.registeredShifts,
      }),
    }));

  const centers = await db.center.findMany({ select: { id: true, name: true } });
  const centerName = new Map(centers.map((c) => [c.id, c.name]));

  const missingOut = list.filter((a) => a.checkIn && !a.checkOut).length;

  return (
    <div className="max-w-5xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chấm công nhân viên</h1>
          <p className="mt-1 text-sm text-gray-500">
            Tính công theo ca đăng ký (GMT+7):{" "}
            {SHIFT_ORDER.map((s) => `${SHIFT_DEFS[s].label} ${SHIFT_DEFS[s].start}–${SHIFT_DEFS[s].end}`).join(" · ")}.
          </p>
        </div>
        <Link
          href="/cham-cong/man-hinh"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#7C3AED] px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800"
        >
          <Monitor className="h-4 w-4" /> Mở màn hình QR
        </Link>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <form>
          <input
            type="date"
            name="date"
            defaultValue={dateStr}
            className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
          />
        </form>
        {missingOut > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5" /> {missingOut} người chưa check-out
          </span>
        )}
      </div>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Chưa có chấm công ngày {dateStr}.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-100 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
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
            <tbody className="divide-y divide-gray-50">
              {list.map((a, i) => (
                <tr key={i} className="hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{a.userName}</td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {a.centerId ? centerName.get(a.centerId) ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-gray-700">
                    {formatRegisteredShifts(a.registeredShifts)}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-gray-700">
                    {formatVNTime(a.checkIn)}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-gray-700">
                    {formatVNTime(a.checkOut)}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums font-medium text-gray-900">
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
        </div>
      )}
    </div>
  );
}
