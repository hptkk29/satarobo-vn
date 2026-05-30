import { redirect } from "next/navigation";
import { ClipboardCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ALL_CHECKLIST_KEYS } from "@/lib/center-checklist";
import { CenterChecklistForm } from "./_components/checklist-form";

export const metadata = { title: "Checklist mở/đóng cơ sở | Admin" };
export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<{ date?: string; centerId?: string }>;
}

export default async function CenterChecklistPage({ searchParams }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "hr_attendance:view")) redirect("/dashboard");

  const sp = await searchParams;
  const now = new Date();
  const dateStr =
    sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)
      ? sp.date
      : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const isSuper = session.user.role === "SUPER_ADMIN" || (session.user.roles?.includes("SUPER_ADMIN") ?? false);
  const isCM = session.user.role === "CENTER_MANAGER" || (session.user.roles?.includes("CENTER_MANAGER") ?? false);

  const centers = isSuper
    ? await db.center.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true } })
    : isCM && session.user.centerId
      ? await db.center.findMany({ where: { id: session.user.centerId }, select: { id: true, name: true } })
      : await db.center.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true } });

  // CM cố định cơ sở mình; còn lại chọn (mặc định cơ sở đầu).
  const centerId = isCM && session.user.centerId ? session.user.centerId : (sp.centerId || centers[0]?.id || "");
  const canEdit = isSuper || (isCM && centerId === session.user.centerId) || can(session.user, "hr_attendance:view");

  const date = new Date(`${dateStr}T00:00:00`);
  const existing = centerId
    ? await db.centerDayChecklist.findUnique({ where: { centerId_date: { centerId, date } } })
    : null;

  const existingRec = existing as unknown as Record<string, unknown> | null;
  const initial: Record<string, boolean> = {};
  for (const k of ALL_CHECKLIST_KEYS) initial[k] = existingRec ? existingRec[k] === true : false;

  return (
    <div className="max-w-3xl p-6">
      <h1 className="mb-1 flex items-center gap-2 text-2xl font-bold text-gray-900">
        <ClipboardCheck className="h-6 w-6 text-[#7C3AED]" /> Checklist mở/đóng cơ sở
      </h1>
      <p className="mb-4 text-sm text-gray-500">Tick đầu ngày khi mở cơ sở và cuối ngày khi đóng.</p>

      <form method="GET" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs text-gray-500">Ngày</span>
          <input type="date" name="date" defaultValue={dateStr} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
        </label>
        {!isCM && centers.length > 1 && (
          <label className="block">
            <span className="mb-1 block text-xs text-gray-500">Cơ sở</span>
            <select name="centerId" defaultValue={centerId} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
              {centers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm font-medium text-white">Xem</button>
        <span className="ml-auto text-sm text-gray-500">
          {centers.find((c) => c.id === centerId)?.name ?? "—"}
        </span>
      </form>

      {centerId ? (
        <CenterChecklistForm
          centerId={centerId}
          date={dateStr}
          initial={initial}
          initialNote={existing?.note ?? ""}
          canEdit={canEdit}
        />
      ) : (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">Chưa có cơ sở.</p>
      )}
    </div>
  );
}
