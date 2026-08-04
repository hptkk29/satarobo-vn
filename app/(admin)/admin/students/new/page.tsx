import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { getSelectableOrgUnits } from "@/lib/org/org-service";
import { StudentForm } from "../_components/student-form";

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("students:create"))) {
    redirect("/dashboard?error=unauthorized");
  }

  // #15 — chỉ kế toán/admin (payments:view-pii) mới thấy + nhập CCCD PH (PII).
  const canViewParentCccd = await checkPermission("payments:view-pii");

  const actor = await resolveActor(session.user.id);
  const orgUnits = await // Hội sở KHÔNG nhận học viên (chốt 04/08) — picker chỉ liệt kê cơ sở dạy học.
    getSelectableOrgUnits(actor, { types: ["CENTER"] });

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">Thêm học viên mới</h1>
      <StudentForm
        orgUnits={orgUnits.map((o) => ({ id: o.orgUnitId, name: o.name }))}
        canViewParentCccd={canViewParentCccd}
      />
    </div>
  );
}
