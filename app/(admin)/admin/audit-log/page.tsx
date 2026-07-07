import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ScrollText } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { AuditLogClient } from "./_components/audit-log-client";

export const metadata = { title: "Audit Log | Admin" };
export const dynamic = "force-dynamic";

export default async function AuditLogPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // Khớp với quyền hiển thị menu (audit-logs:view) — trước đây gate users:manage
  // khiến CENTER_MANAGER thấy menu nhưng bị redirect về dashboard.
  if (!(await checkPermission("audit-logs:view"))) {
    redirect("/dashboard?error=unauthorized");
  }

  // User SCOPE_EXEMPT (identity toàn cục) → sdb pass-through, hành vi y nguyên.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const actors = await sdb.user.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
  });

  return (
    <div>
      <div className="mb-6 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-50">
          <ScrollText className="h-5 w-5 text-orange-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
          <p className="mt-1 text-sm text-gray-500">
            Lịch sử thay đổi của User, Phân quyền, Leads, Lớp, Học viên
            (giữ trong 365 ngày)
          </p>
        </div>
      </div>

      <Suspense
        fallback={
          <div className="h-40 animate-pulse rounded-xl bg-gray-100" />
        }
      >
        <AuditLogClient actors={actors} />
      </Suspense>
    </div>
  );
}
