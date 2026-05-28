import Link from "next/link";
import { redirect } from "next/navigation";
import { Monitor, AlertTriangle, MapPinOff } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

export const metadata = { title: "Chấm công | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ date?: string }>;
}

function fmtTime(d: Date | null): string {
  return d ? d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }) : "—";
}

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

  const rows = await db.employeeCheckin.findMany({
    where: { checkedAt: { gte: start, lt: end } },
    orderBy: { checkedAt: "asc" },
  });

  // Gom theo nhân viên.
  type Agg = {
    userName: string;
    checkIn: Date | null;
    checkOut: Date | null;
    centerId: string | null;
    geofenceFlag: boolean;
  };
  const byUser = new Map<string, Agg>();
  for (const r of rows) {
    const a =
      byUser.get(r.userId) ??
      { userName: r.userName ?? "(không tên)", checkIn: null, checkOut: null, centerId: r.centerId, geofenceFlag: false };
    if (r.type === "CHECK_IN") a.checkIn = r.checkedAt;
    else a.checkOut = r.checkedAt;
    if (!r.withinGeofence) a.geofenceFlag = true;
    byUser.set(r.userId, a);
  }
  const list = [...byUser.values()].sort((x, y) => x.userName.localeCompare(y.userName));

  const centers = await db.center.findMany({ select: { id: true, name: true } });
  const centerName = new Map(centers.map((c) => [c.id, c.name]));

  const missingOut = list.filter((a) => a.checkIn && !a.checkOut).length;

  return (
    <div className="max-w-5xl p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Chấm công nhân viên</h1>
          <p className="mt-1 text-sm text-gray-500">
            QR xoay 30s + định vị GPS theo cơ sở. Bắt buộc cả check-in và check-out.
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
                <th className="px-4 py-3 text-center font-semibold">Check-in</th>
                <th className="px-4 py-3 text-center font-semibold">Check-out</th>
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
                  <td className="px-4 py-2.5 text-center tabular-nums text-gray-700">
                    {fmtTime(a.checkIn)}
                  </td>
                  <td className="px-4 py-2.5 text-center tabular-nums text-gray-700">
                    {fmtTime(a.checkOut)}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {a.geofenceFlag ? (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600">
                        <MapPinOff className="h-3.5 w-3.5" /> Ngoài vùng
                      </span>
                    ) : a.checkIn && !a.checkOut ? (
                      <span className="text-xs font-medium text-amber-600">Thiếu check-out</span>
                    ) : a.checkIn && a.checkOut ? (
                      <span className="text-xs font-medium text-emerald-600">Đủ công</span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
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
