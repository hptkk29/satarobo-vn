import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { StartAuditForm } from "../_components/start-audit-form";

export const dynamic = "force-dynamic";

const ALLOWED_ROLES = ["SUPER_ADMIN", "MANAGER", "ACCOUNTANT"];

export default async function NewAuditPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ALLOWED_ROLES.includes(session.user.role)) {
    redirect("/dashboard?error=unauthorized");
  }

  const centers = await db.center.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { displayOrder: "asc" },
  });

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/inventory/audit"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">
          Tạo phiếu kiểm kê
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Phiếu mới ở trạng thái DRAFT. Sau khi tạo, hệ thống mở form kiểm kê
          bulk cho toàn bộ mặt hàng active của cơ sở.
        </p>
      </div>

      {centers.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Chưa có cơ sở active nào. Tạo / kích hoạt cơ sở trước tại{" "}
          <Link
            href="/centers"
            className="font-semibold underline hover:text-amber-900"
          >
            /admin/centers
          </Link>
          .
        </div>
      ) : (
        <StartAuditForm centers={centers} />
      )}
    </div>
  );
}
