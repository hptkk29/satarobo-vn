import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Users, AlertTriangle } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import type { Prisma, WorkShift } from "@prisma/client";
import { SHIFT_DEFS, SHIFT_TONE } from "@/lib/shifts";

export const metadata = { title: "Lịch ca nhân viên | Admin" };
export const dynamic = "force-dynamic";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

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
  searchParams: Promise<{ date?: string }>;
}

export default async function ManagerShiftsPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "hr_attendance:view")) redirect("/dashboard");

  const { date } = await searchParams;
  const anchor = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T00:00:00`) : new Date();
  const weekStart = mondayOf(anchor);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return ymd(d);
  });

  // Phạm vi cơ sở: CM chỉ nhân viên cơ sở mình; SUPER_ADMIN/HR toàn bộ.
  const centerScope = session.user.role === "CENTER_MANAGER" ? session.user.centerId : null;
  const userWhere: Prisma.UserWhereInput = {
    role: { not: "PARENT" },
    isActive: true,
    deletedAt: null,
    ...(centerScope ? { centerId: centerScope } : {}),
  };

  const [staff, regs] = await Promise.all([
    db.user.findMany({
      where: userWhere,
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, center: { select: { name: true } } },
    }),
    db.shiftRegistration.findMany({
      where: {
        date: { gte: weekStart, lt: weekEnd },
        ...(centerScope ? { user: { centerId: centerScope } } : {}),
      },
      select: { userId: true, date: true, shifts: true, status: true, note: true },
    }),
  ]);

  // map[userId][dateStr] = reg
  const map = new Map<string, Map<string, { shifts: WorkShift[]; status: string; note: string }>>();
  for (const r of regs) {
    const ds = ymd(new Date(r.date));
    if (!map.has(r.userId)) map.set(r.userId, new Map());
    map.get(r.userId)!.set(ds, { shifts: r.shifts, status: r.status, note: r.note ?? "" });
  }

  // Cảnh báo: ngày không ai đăng ký ca + xin nghỉ khẩn.
  const understaffed = weekDates.filter(
    (ds) => !regs.some((r) => ymd(new Date(r.date)) === ds && r.shifts.length > 0),
  );
  const leaveReqs = regs.filter((r) => r.status === "LEAVE_REQUESTED");

  const prev = new Date(weekStart); prev.setDate(prev.getDate() - 7);
  const next = new Date(weekStart); next.setDate(next.getDate() + 7);

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Users className="h-6 w-6 text-[#7C3AED]" /> Lịch ca nhân viên
        </h1>
        <div className="flex items-center gap-2">
          <Link href={`/cham-cong/lich-ca-nhan-vien?date=${ymd(prev)}`} className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-semibold text-gray-700">
            Tuần {weekDates[0]} → {weekDates[6]}
          </span>
          <Link href={`/cham-cong/lich-ca-nhan-vien?date=${ymd(next)}`} className="rounded-lg border border-gray-300 p-1.5 hover:bg-gray-50">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>

      {(understaffed.length > 0 || leaveReqs.length > 0) && (
        <div className="mb-4 space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {understaffed.length > 0 && (
            <p className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> Ngày chưa có ai đăng ký ca: {understaffed.join(", ")}
            </p>
          )}
          {leaveReqs.length > 0 && (
            <p className="flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" /> {leaveReqs.length} lượt xin nghỉ khẩn cần sắp người bù.
            </p>
          )}
        </div>
      )}

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
                const row = map.get(u.id);
                return (
                  <tr key={u.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-2">
                      <div className="font-medium text-gray-900">{u.name ?? u.email}</div>
                      {!centerScope && u.center?.name && (
                        <div className="text-xs text-gray-400">{u.center.name}</div>
                      )}
                    </td>
                    {weekDates.map((ds) => {
                      const reg = row?.get(ds);
                      return (
                        <td key={ds} className="px-2 py-2 text-center align-top">
                          {reg?.status === "LEAVE_REQUESTED" && reg.shifts.length === 0 ? (
                            <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">Nghỉ?</span>
                          ) : (
                            <div className="flex flex-col items-center gap-0.5">
                              {reg?.shifts.map((s) => (
                                <span key={s} className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${SHIFT_TONE[s]}`}>
                                  {SHIFT_DEFS[s].label.replace("Ca ", "")}
                                </span>
                              ))}
                              {reg?.status === "LEAVE_REQUESTED" && reg.shifts.length > 0 && (
                                <span className="text-[9px] font-bold text-rose-600">nghỉ?</span>
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
    </div>
  );
}
