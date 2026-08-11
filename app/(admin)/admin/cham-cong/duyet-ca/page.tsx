import { redirect } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { hasRole } from "@/lib/auth/permissions";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { isManagerImportWindowOpen, lastDayOfMonth } from "@/lib/shifts";
import { ShiftApproval } from "./_components/shift-approval";
import { PageHelp } from "@/components/admin/ui/page-help";

export const metadata = { title: "Duyệt ca (Excel) | Admin" };
export const dynamic = "force-dynamic";

export default async function DuyetCaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const isCM =
    hasRole(session.user, "CENTER_MANAGER") &&
    !hasRole(session.user, "SUPER_ADMIN");
  const fixedCenterId = isCM ? (session.user.centerId ?? null) : null;

  if (
    !(await checkPermission("hr_attendance:view", {
      centerId: fixedCenterId ?? session.user.centerId ?? null,
    }))
  ) {
    redirect("/dashboard");
  }

  const sdb = scopedDb(await resolveActor(session.user.id));
  const centers = await sdb.center.findMany({
    where: { isActive: true, ...(fixedCenterId ? { id: fixedCenterId } : {}) },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true },
  });

  const now = new Date();
  const importOpen = isManagerImportWindowOpen(now);

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
          <CalendarCheck className="h-6 w-6 text-primary" /> Duyệt ca (Export /
          Import Excel)
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Chốt lịch làm việc chính thức
        </p>
      </div>

      <PageHelp>
        <p>
          Nhân viên đề xuất ca → quản lý export, sửa trong Excel, import lên lại
          để chốt lịch chính thức (chỉ lịch chính thức mới dùng tính công).
        </p>
      </PageHelp>

      <p
        className={`mb-4 rounded-lg px-3 py-2 text-xs ${importOpen ? "bg-state-info-soft text-state-info-ink" : "bg-state-warning-soft text-state-warning-ink"}`}
      >
        {importOpen
          ? `Cửa sổ duyệt/import: trước ngày cuối tháng (${lastDayOfMonth(now)}). Hãy chốt lịch chính thức trước hạn.`
          : `Đã đến ngày cuối tháng (${lastDayOfMonth(now)}) — quá hạn duyệt/import khuyến nghị. Quản lý/admin vẫn import được nhưng nên chốt sớm.`}
      </p>

      {centers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Chưa có cơ sở.
        </p>
      ) : (
        <ShiftApproval centers={centers} fixedCenterId={fixedCenterId} />
      )}
    </div>
  );
}
