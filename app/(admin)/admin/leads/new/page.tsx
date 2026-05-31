import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { LeadForm } from "../_components/lead-form";

export const metadata = { title: "Thêm lead | Admin" };
export const dynamic = "force-dynamic";

export default async function NewLeadPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "leads:create")) redirect("/leads");

  const [centers, courses] = await Promise.all([
    db.center.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true } }),
    // Chỉ khoá LÁ dạy được (Sata1-8/Combo) — kèm category để nhóm optgroup.
    db.course.findMany({ where: { isActive: true, isTeachable: true }, orderBy: { name: "asc" }, select: { id: true, name: true, category: true } }),
  ]);

  return (
    <div className="p-6">
      <Link href="/leads" className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="h-4 w-4" /> Danh sách lead
      </Link>
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Thêm lead thủ công</h1>
      <LeadForm centers={centers} courses={courses} />
    </div>
  );
}
