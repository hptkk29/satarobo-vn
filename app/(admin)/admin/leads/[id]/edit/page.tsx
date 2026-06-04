import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { LeadForm } from "../../_components/lead-form";

export const metadata = { title: "Sửa lead | Admin" };
export const dynamic = "force-dynamic";

// P1-d — sửa hồ sơ lead (các field cơ bản). Dùng LeadForm ở chế độ edit
// (updateLeadFields đã có + ghi audit P2-1).
export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "leads:edit")) redirect("/leads");

  const { id } = await params;
  const [lead, centers, courses] = await Promise.all([
    db.lead.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        parentName: true,
        phone: true,
        email: true,
        childName: true,
        childAge: true,
        centerId: true,
        courseId: true,
        source: true,
        note: true,
      },
    }),
    db.center.findMany({ where: { isActive: true }, orderBy: { displayOrder: "asc" }, select: { id: true, name: true } }),
    db.course.findMany({ where: { isActive: true, isTeachable: true }, orderBy: { name: "asc" }, select: { id: true, name: true, category: true } }),
  ]);
  if (!lead) notFound();

  return (
    <div className="p-6">
      <Link href={`/leads/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="h-4 w-4" /> Chi tiết lead
      </Link>
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Sửa thông tin lead</h1>
      <LeadForm
        centers={centers}
        courses={courses}
        initial={{
          id: lead.id,
          parentName: lead.parentName,
          phone: lead.phone,
          email: lead.email ?? undefined,
          childName: lead.childName ?? undefined,
          childAge: lead.childAge,
          centerId: lead.centerId,
          courseId: lead.courseId,
          source: lead.source,
          note: lead.note,
        }}
      />
    </div>
  );
}
