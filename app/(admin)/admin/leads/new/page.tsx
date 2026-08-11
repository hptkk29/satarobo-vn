import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { getSelectableOrgUnits } from "@/lib/org/org-service";
import { LeadForm } from "../_components/lead-form";

export const metadata = { title: "Thêm lead | Admin" };
export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("leads:create"))) redirect("/leads");

  // Cách ly cơ sở: Course là catalog global (không scoped) → sdb pass-through.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const [orgUnits, courses] = await Promise.all([
    // Chủ dự án chốt 04/08: LEAD KHÔNG BAO GIỜ VỀ HỘI SỞ. HO là cơ quan đầu não,
    // không phải nơi dạy học — chỉ đơn vị type=CENTER mới nhận lead/học viên.
    // (Trước đây dropdown liệt kê cả "Hội sở", tạo đúng loại lead mà bước chốt sẽ
    // từ chối bằng LEAD_HEAD_OFFICE — sai từ lúc nhập, phát hiện lúc chốt.)
    getSelectableOrgUnits(actor, { types: ["CENTER"] }),
    // Chỉ khoá LÁ dạy được (Sata1-8/Combo) — kèm category để nhóm optgroup.
    sdb.course.findMany({ where: { isActive: true, isTeachable: true }, orderBy: { name: "asc" }, select: { id: true, name: true, category: true } }),
  ]);

  return (
    <div className="p-6">
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="h-4 w-4" /> Danh sách lead
      </Link>
      <h1 className="mb-4 text-2xl font-bold text-foreground">Thêm lead thủ công</h1>
      <LeadForm orgUnits={orgUnits.map((o) => ({ id: o.orgUnitId, name: o.name }))} courses={courses} />
    </div>
  );
}
