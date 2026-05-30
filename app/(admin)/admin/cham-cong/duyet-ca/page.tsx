import { redirect } from "next/navigation";
import { CalendarCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import { can, hasRole } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { ShiftApproval } from "./_components/shift-approval";

export const metadata = { title: "Duyệt ca (Excel) | Admin" };
export const dynamic = "force-dynamic";

export default async function DuyetCaPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "hr_attendance:view")) redirect("/dashboard");

  const isCM = hasRole(session.user, "CENTER_MANAGER") && !hasRole(session.user, "SUPER_ADMIN");
  const fixedCenterId = isCM ? session.user.centerId ?? null : null;

  const centers = await db.center.findMany({
    where: { isActive: true, ...(fixedCenterId ? { id: fixedCenterId } : {}) },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="max-w-3xl p-6">
      <div className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <CalendarCheck className="h-6 w-6 text-[#7C3AED]" /> Duyệt ca (Export / Import Excel)
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Nhân viên đề xuất ca → quản lý export, sửa trong Excel, import lên lại để chốt lịch chính
          thức (chỉ lịch chính thức mới dùng tính công).
        </p>
      </div>

      {centers.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-400">
          Chưa có cơ sở.
        </p>
      ) : (
        <ShiftApproval centers={centers} fixedCenterId={fixedCenterId} />
      )}
    </div>
  );
}
