import { redirect } from "next/navigation";
import { ClipboardEdit } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { canAdjustTimesheet } from "@/lib/attendance/adjust";
import { getSetting } from "@/lib/settings/service";
import { ReviewRow, type ReviewItem } from "./_components/review-row";

export const metadata = { title: "Duyệt chỉnh công | Admin" };
export const dynamic = "force-dynamic";

export default async function ChinhCongPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  const isCM = hasRole(session.user, "CENTER_MANAGER");
  const centerScope = isCM && !isSuper ? session.user.centerId : null;

  if (!(await checkPermission("hr_attendance:adjust", { centerId: centerScope ?? session.user.centerId ?? null }))) {
    redirect("/dashboard");
  }

  // Cách ly cơ sở (A0-04): TimesheetAdjustmentRequest ∈ SCOPED_MODELS → đọc qua scopedDb.
  const sdb = scopedDb(await resolveActor(session.user.id));

  const rows = await sdb.timesheetAdjustmentRequest.findMany({
    where: { status: "PENDING", ...(centerScope ? { centerId: centerScope } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length
    ? await sdb.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true, center: { select: { name: true } } },
      })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const now = new Date();
  const editWindowDays = await getSetting("shift.managerEditWindowDays");
  const items: ReviewItem[] = rows.map((r) => {
    const u = userMap.get(r.userId);
    const gate = canAdjustTimesheet({ isSuperAdmin: isSuper, isCenterManager: isCM, workDate: r.date, now }, editWindowDays);
    return {
      id: r.id,
      userName: u?.name ?? u?.email ?? "(không tên)",
      centerName: u?.center?.name ?? null,
      date: r.date.toISOString(),
      reason: r.reason,
      requested: r.requested,
      createdAt: r.createdAt.toISOString(),
      locked: !gate.ok,
      lockReason: gate.ok ? null : gate.reason,
    };
  });

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <ClipboardEdit className="h-6 w-6 text-primary" /> Duyệt chỉnh công
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quản lý cơ sở duyệt trong vòng 2 ngày kể từ ngày công; admin cấp cao duyệt mọi lúc. Duyệt
          có nhập giờ → áp chỉnh + ghi log.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Không có yêu cầu chỉnh công nào chờ duyệt.
        </p>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <ReviewRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}
