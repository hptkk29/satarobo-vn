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
    getSelectableOrgUnits(actor),
    // Chỉ khoá LÁ dạy được (Sata1-8/Combo) — kèm category để nhóm optgroup.
    sdb.course.findMany({ where: { isActive: true, isTeachable: true }, orderBy: { name: "asc" }, select: { id: true, name: true, category: true } }),
  ]);

  return (
    <div className="p-6">
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="h-4 w-4" /> Danh sách lead
      </Link>
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Thêm lead thủ công</h1>
      <LeadForm orgUnits={orgUnits.map((o) => ({ id: o.orgUnitId, name: o.name }))} courses={courses} />
    </div>
  );
}
