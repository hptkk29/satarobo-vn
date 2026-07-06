import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ClipboardCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { db } from "@/lib/db";
import { OPEN_FIELDS, CLOSE_FIELDS, type ChecklistKey } from "@/lib/center-checklist";

export const metadata = { title: "Tổng quan checklist cơ sở | Admin" };
export const dynamic = "force-dynamic";

const DAYS = 14;

function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// P2 — tổng quan hoàn thành checklist mở/đóng theo NGÀY × CƠ SỞ (14 ngày gần nhất).
export default async function ChecklistOverviewPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  const isCM = hasRole(session.user, "CENTER_MANAGER");
  const centerScope = isCM && !isSuper ? session.user.centerId : null;

  if (!(await checkPermission("hr_attendance:view", { centerId: centerScope ?? session.user.centerId ?? null }))) {
    redirect("/dashboard");
  }

  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1));

  const [centers, rows] = await Promise.all([
    db.center.findMany({
      where: { isActive: true, ...(centerScope ? { id: centerScope } : {}) },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.centerDayChecklist.findMany({
      where: { date: { gte: start }, ...(centerScope ? { centerId: centerScope } : {}) },
      select: {
        centerId: true,
        date: true,
        openPower: true, openDevices: true, openRoomsReady: true, openCleanCommon: true, openSecurity: true,
        closePower: true, closeDevices: true, closeLock: true, closeKpiBoard: true, closeSafety: true, closeHandover: true,
      },
    }),
  ]);

  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) byKey.set(`${r.centerId}|${ymd(r.date)}`, r);

  const dates: Date[] = [];
  for (let i = 0; i < DAYS; i++) dates.push(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));

  function status(rec: (typeof rows)[number] | undefined): { open: boolean; close: boolean } {
    if (!rec) return { open: false, close: false };
    const r = rec as unknown as Record<ChecklistKey, boolean>;
    return {
      open: OPEN_FIELDS.every((f) => r[f.key]),
      close: CLOSE_FIELDS.every((f) => r[f.key]),
    };
  }

  // Tỷ lệ ngày-cơ sở hoàn tất CẢ mở+đóng.
  let totalCells = 0;
  let fullCells = 0;
  for (const c of centers) {
    for (const d of dates) {
      totalCells++;
      const st = status(byKey.get(`${c.id}|${ymd(d)}`));
      if (st.open && st.close) fullCells++;
    }
  }
  const pct = totalCells > 0 ? Math.round((fullCells / totalCells) * 100) : 0;

  return (
    <div className="p-6">
      <Link href="/cham-cong/checklist-co-so" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="h-4 w-4" /> Nhập checklist
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <ClipboardCheck className="h-6 w-6 text-[#7C3AED]" /> Tổng quan checklist cơ sở
        </h1>
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-center">
          <p className="text-2xl font-bold text-[#7C3AED]">{pct}%</p>
          <p className="text-xs text-gray-400">{fullCells}/{totalCells} ngày-cơ sở đủ mở+đóng · {DAYS} ngày</p>
        </div>
      </div>

      <p className="mb-3 text-xs text-gray-500">
        Ô: <span className="font-semibold text-emerald-600">●</span> đủ mở+đóng ·
        <span className="font-semibold text-amber-600"> ◐</span> thiếu 1 trong 2 ·
        <span className="font-semibold text-rose-500"> ○</span> chưa làm. Di chuột để xem ngày.
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs text-gray-500">
            <tr>
              <th className="px-3 py-2">Cơ sở</th>
              {dates.map((d) => (
                <th key={ymd(d)} className="px-2 py-2 text-center">
                  {String(d.getDate()).padStart(2, "0")}/{String(d.getMonth() + 1).padStart(2, "0")}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {centers.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-3 py-2 font-medium text-gray-800">{c.name}</td>
                {dates.map((d) => {
                  const st = status(byKey.get(`${c.id}|${ymd(d)}`));
                  const full = st.open && st.close;
                  const partial = st.open || st.close;
                  const sym = full ? "●" : partial ? "◐" : "○";
                  const cls = full ? "text-emerald-600" : partial ? "text-amber-600" : "text-rose-400";
                  const title = `${c.name} ${ymd(d)} — mở: ${st.open ? "đủ" : "thiếu"}, đóng: ${st.close ? "đủ" : "thiếu"}`;
                  return (
                    <td key={ymd(d)} className={`px-2 py-2 text-center text-lg ${cls}`} title={title}>
                      {sym}
                    </td>
                  );
                })}
              </tr>
            ))}
            {centers.length === 0 && (
              <tr>
                <td colSpan={DAYS + 1} className="px-3 py-8 text-center text-gray-400">Không có cơ sở.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
