// app/(admin)/admin/cham-cong/loai-nghi/page.tsx — LOẠI NGHỈ: danh mục người nộp đơn chọn khi xin nghỉ.
//
// Vì sao màn này tồn tại: tỷ lệ lương của từng loại nghỉ quyết định mã ghi lên lưới khi duyệt đơn
// (tỷ lệ > 0 ⇒ P, = 0 ⇒ X — K-06) và là mã đối chiếu với Sheet/MISA. Đây là dữ liệu vận hành, sửa
// tại đây chứ không sửa mã nguồn.
//
// Điều dễ vỡ:
//  · Danh mục DÙNG CHUNG toàn hệ thống ⇒ chỉ `hr_attendance:config` tại HỘI SỞ mới sửa được, kể cả
//    Quản lý cơ sở có config tại cơ sở mình. Người chỉ có `view` vào xem được nhưng không có nút sửa.
//  · `code` là mã đối chiếu ngoài hệ thống ⇒ khoá khi sửa (quy ước UI; server không chặn).
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { HO_CENTER_ID } from "@/lib/cham-cong/home-center";
import { ASK_WHO, loadModuleScope } from "@/lib/cham-cong/module-scope";
import { PageHeader } from "@/components/admin/ui/page-header";
import { PageHelp } from "@/components/admin/ui/page-help";
import { NoPermission } from "@/components/admin/ui/states";
import { ModuleNav } from "@/components/admin/cham-cong/module-nav";
import { ConfigTabs } from "@/components/admin/cham-cong/config-tabs";
import { LeaveTypeList } from "./_components/leave-type-list";

export const metadata = { title: "Loại nghỉ | Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function LoaiNghiPage({
  searchParams,
}: {
  searchParams: Promise<{ ky?: string; coSo?: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=%2Fcham-cong%2Floai-nghi");
  const sp = await searchParams;
  const ctx = { ky: sp.ky ?? null, coSo: sp.coSo ?? null };
  const scope = await loadModuleScope(session.user.id);
  const canView = scope.any("hr_attendance:view");
  const canEdit = scope.has("hr_attendance:config", HO_CENTER_ID);

  const head = (
    <>
      <PageHeader
        title="Loại nghỉ"
        subtitle="Danh mục dùng chung khi nhân sự nộp đơn nghỉ — tỷ lệ lương quyết định mã ghi lên lưới."
      />
      <ModuleNav active="cauhinh" scope={scope} ctx={ctx} />
    </>
  );

  if (!canView && !canEdit) {
    return (
      <div className="max-w-6xl">
        {head}
        <NoPermission
          permission="hr_attendance:view"
          what="loại nghỉ"
          askWho={ASK_WHO["hr_attendance:view"]}
        />
      </div>
    );
  }

  const sdb = scopedDb(await resolveActor(session.user.id));
  const rows = await sdb.leaveType.findMany({ orderBy: [{ displayOrder: "asc" }, { code: "asc" }] });

  return (
    <div className="max-w-6xl">
      {head}
      <ConfigTabs active="loai-nghi" scope={scope} ctx={ctx} />
      <PageHelp guideSlug="nhan-su-giao-vien">
        <p>
          Duyệt đơn nghỉ xong, hệ thống ghi mã lên lưới phân ca theo tỷ lệ lương: tỷ lệ &gt; 0 ghi{" "}
          <span className="font-mono">P</span> (nghỉ có lương), tỷ lệ = 0 ghi{" "}
          <span className="font-mono">X</span> (nghỉ không lương).
        </p>
        <p className="mt-2">
          &ldquo;Tính như đi làm&rdquo; = ngày nghỉ đó vẫn được cộng công trong kỳ (vd nghỉ lễ, công
          tác). Trần ngày/năm để trống là không giới hạn.
        </p>
        <p className="mt-2">
          Mã loại nghỉ là mã đối chiếu với Sheet/MISA nên không sửa được sau khi tạo. Không dùng nữa
          thì bỏ &ldquo;Đang dùng&rdquo;, đừng tạo mã trùng nghĩa.
        </p>
      </PageHelp>
      <LeaveTypeList
        rows={rows.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          paidRatio: r.paidRatio,
          maxDaysPerYear: r.maxDaysPerYear,
          countsAsWorked: r.countsAsWorked,
          isActive: r.isActive,
        }))}
        canEdit={canEdit}
      />
    </div>
  );
}
