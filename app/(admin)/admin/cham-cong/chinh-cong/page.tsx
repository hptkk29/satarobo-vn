import { redirect } from "next/navigation";
import { ClipboardEdit } from "lucide-react";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { canAdjustTimesheet } from "@/lib/attendance/adjust";
import { getSetting } from "@/lib/settings/service";
import { ReviewRow, type ReviewItem } from "./_components/review-row";

export const metadata = { title: "Duyệt chỉnh công | Admin" };
export const dynamic = "force-dynamic";

export default async function ChinhCongPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "hr_attendance:adjust")) redirect("/dashboard");

  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  const isCM = hasRole(session.user, "CENTER_MANAGER");
  const centerScope = isCM && !isSuper ? session.user.centerId : null;

  const rows = await db.timesheetAdjustmentRequest.findMany({
    where: { status: "PENDING", ...(centerScope ? { centerId: centerScope } : {}) },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  const userIds = [...new Set(rows.map((r) => r.userId))];
  const users = userIds.length
    ? await db.user.findMany({
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
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <ClipboardEdit className="h-6 w-6 text-[#7C3AED]" /> Duyệt chỉnh công
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Quản lý cơ sở duyệt trong vòng 2 ngày kể từ ngày công; admin cấp cao duyệt mọi lúc. Duyệt
          có nhập giờ → áp chỉnh + ghi log.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
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
