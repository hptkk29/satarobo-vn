import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { getSelectableOrgUnits } from "@/lib/org/org-service";
import { canViewLeadPii } from "@/lib/auth/permissions";
import { LeadForm } from "../../_components/lead-form";
import { LeadChildrenManager } from "../../_components/lead-children";

export const metadata = { title: "Sửa lead | Admin" };
export const dynamic = "force-dynamic";

// P1-d — sửa hồ sơ lead (các field cơ bản). Dùng LeadForm ở chế độ edit
// (updateLeadFields đã có + ghi audit P2-1).
export default async function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("leads:edit"))) redirect("/leads");
  // #11 T1 — cần biết actor có view-all không để check ownership sau khi load lead.
  const canViewAll = await checkPermission("leads:view-all");

  const { id } = await params;
  const actor = await resolveActor(session.user.id);
  // Cách ly cơ sở: Lead ∈ SCOPED_MODELS → sdb.lead tự inject `centerId IN visible`.
  // CENTER_MANAGER@CS1 sửa lead CS2 → findFirst trả null → notFound() (chống IDOR).
  // SUPER_ADMIN/HO bypass (ALL). Course không scoped → sdb pass-through.
  const sdb = scopedDb(actor);
  const [lead, orgUnits, courses] = await Promise.all([
    sdb.lead.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        status: true,
        assignedToId: true,
        parentName: true,
        phone: true,
        email: true,
        childName: true,
        childAge: true,
        centerId: true,
        orgUnitId: true,
        courseId: true,
        source: true,
        note: true,
        children: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            fullName: true,
            dob: true,
            ageYears: true,
            gender: true,
            schoolName: true,
            gradeLevel: true,
            interestedCourseId: true,
            interestedCenterId: true,
            note: true,
            trialStatus: true,
          },
        },
      },
    }),
    getSelectableOrgUnits(actor),
    sdb.course.findMany({ where: { isActive: true, isTeachable: true }, orderBy: { name: "asc" }, select: { id: true, name: true, category: true } }),
  ]);
  if (!lead) notFound();

  // #11 T1/T2 — 2 lớp chặn vào form edit (LeadForm prefill PII RAW từ DB):
  // (a) Ownership (Q2): lead "dùng chung" chỉ cho XEM + GHI CHÚ → shared-viewer
  //     KHÔNG được vào edit. Đồng thời vá lỗ pre-existing: sale cùng cơ sở đoán
  //     URL /edit của lead người khác (trước chỉ cần leads:edit + qua scope là lọt).
  if (!canViewAll && lead.assignedToId !== session.user.id) redirect(`/leads/${id}`);
  // (b) PII (Q7): non-holder leads:view-pii (vd MARKETING) vào form sẽ thấy PII raw
  //     + nguy cơ bấm Lưu đè bản mask ngược vào DB → chặn hẳn, về chi tiết (đã mask).
  if (!canViewLeadPii(session.user)) redirect(`/leads/${id}`);

  return (
    <div className="p-6">
      <Link href={`/leads/${id}`} className="mb-3 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
        <ChevronLeft className="h-4 w-4" /> Chi tiết lead
      </Link>
      <h1 className="mb-4 text-2xl font-bold text-gray-900">Sửa thông tin lead</h1>
      <LeadForm
        orgUnits={orgUnits.map((o) => ({ id: o.orgUnitId, name: o.name }))}
        courses={courses}
        initial={{
          id: lead.id,
          parentName: lead.parentName,
          phone: lead.phone,
          email: lead.email ?? undefined,
          childName: lead.childName ?? undefined,
          childAge: lead.childAge,
          orgUnitId: lead.orgUnitId,
          courseId: lead.courseId,
          source: lead.source,
          note: lead.note,
        }}
      />

      {/* R7-01 — quản lý con đã lưu (thêm/sửa/xoá ngay) */}
      <div className="mt-6 max-w-xl">
        <LeadChildrenManager
          leadId={lead.id}
          childrenList={lead.children.map((c) => ({
            id: c.id,
            fullName: c.fullName,
            dob: c.dob ? c.dob.toISOString() : null,
            ageYears: c.ageYears,
            gender: c.gender,
            schoolName: c.schoolName,
            gradeLevel: c.gradeLevel,
            interestedCourseId: c.interestedCourseId,
            interestedCenterId: c.interestedCenterId,
            note: c.note,
            trialStatus: c.trialStatus,
          }))}
          centers={orgUnits.map((o) => ({ id: o.orgUnitId, name: o.name }))}
          courses={courses}
          legacyChildName={lead.childName}
          legacyChildAge={lead.childAge}
          readOnly={lead.status === "LOST"}
        />
      </div>
    </div>
  );
}
