// app/(admin)/admin/lop-trial/page.tsx — GĐ2. Danh sách lớp trải nghiệm.
import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { layCauHinh, layDanhSachLop } from "./_lib/queries";
import { ClassFilterChips } from "./_components/class-filter-chips";
import { SearchForm } from "./_components/search-form";
import { ClassTable } from "./_components/class-table";
import { ConfigSection } from "./_components/config-section";

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
  const [canManage, canConfig] = await Promise.all([
    checkPermission("trials:manage"),
    checkPermission("trials:config"),
  ]);

  const actor = await resolveActor(session.user.id);
  const [rows, config] = await Promise.all([
    layDanhSachLop(actor, status, q),
    layCauHinh(actor),
  ]);

  return (
    <div className="space-y-4">
      <ConfigSection config={config} canEdit={canConfig} />

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
