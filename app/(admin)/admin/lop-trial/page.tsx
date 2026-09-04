// app/(admin)/admin/lop-trial/page.tsx — GĐ2. Danh sách lớp trải nghiệm.
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { layDanhSachLop } from "./_lib/queries";
import { ClassFilterChips } from "./_components/class-filter-chips";
import { SearchForm } from "./_components/search-form";
import { ClassTable } from "./_components/class-table";

export const dynamic = "force-dynamic";

export default async function LopTrialPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("trials:view"))) redirect("/dashboard");

  const { status, q } = await searchParams;
  const canManage = await checkPermission("trials:manage");

  const actor = await resolveActor(session.user.id);
  const rows = await layDanhSachLop(actor, status, q);

  return (
    <div className="space-y-4">
      {/* 28/08/2026 — GỠ khối "Cấu hình số buổi (mặc định)".
          Chủ dự án: form tạo lớp nhập thẳng số buổi nào cũng được, nên một "số buổi
          mặc định" cấp hệ thống chỉ còn là ô người dùng phải đọc rồi bỏ qua. Bảng
          `TrialProgramConfig` và cột `TrialClassV2.configId` GIỮ NGUYÊN (2 pha —
          bỏ cột trên bảng có dữ liệu prod là việc của đợt drop riêng, luật cứng #4). */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ClassFilterChips current={status} q={q} />
        {canManage && (
          <Link
            href="/lop-trial/moi"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-white hover:bg-primary-dark"
          >
            <Plus className="h-4 w-4" /> Tạo lớp
          </Link>
        )}
      </div>

      <SearchForm
        action="/lop-trial"
        placeholder="Tìm theo tên lớp hoặc mã lớp…"
        defaultValue={q}
        hidden={{ status }}
      />

      <ClassTable rows={rows} canManage={canManage} />
    </div>
  );
}
