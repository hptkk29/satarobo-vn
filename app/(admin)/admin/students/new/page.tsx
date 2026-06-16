import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { resolveActor } from "@/lib/auth/actor";
import { getSelectableOrgUnits } from "@/lib/org/org-service";
import { StudentForm } from "../_components/student-form";

export const dynamic = "force-dynamic";

export default async function NewStudentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "students:create")) {
    redirect("/dashboard?error=unauthorized");
  }

  // PR-C: picker đơn vị qua OrgUnit tree (gồm cả HO) — không dùng db.center.findMany.
  const actor = await resolveActor(session.user.id);
  const orgUnits = await getSelectableOrgUnits(actor);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">Thêm học viên mới</h1>
      <StudentForm orgUnits={orgUnits.map((o) => ({ id: o.orgUnitId, name: o.name }))} />
    </div>
  );
}
