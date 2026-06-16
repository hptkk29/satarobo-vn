import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { resolveActor } from "@/lib/auth/actor";
import { getSelectableOrgUnits } from "@/lib/org/org-service";
import { getAssignableTeachers } from "@/lib/teachers/assignable";
import { ClassForm } from "../_components/class-form";

export const dynamic = "force-dynamic";

export default async function NewClassPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "classes:create")) {
    redirect("/dashboard?error=unauthorized");
  }

  const actor = await resolveActor(session.user.id);
  const [courses, orgUnits, classGroups, rooms, teachers, curricula] = await Promise.all([
    db.course.findMany({
      where: { isActive: true, isTeachable: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: true },
    }),
    getSelectableOrgUnits(actor),
    db.classGroup.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      orderBy: { displayCode: "asc" },
      select: { id: true, displayCode: true, name: true, centerId: true },
    }),
    db.room.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ centerId: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, centerId: true },
    }),
    // Fix #9 — nguồn DUY NHẤT cho GV có thể phân lớp (không lọt quản lý/sale thuần).
    getAssignableTeachers(),
    db.curriculum.findMany({
      where: {
        isActive: true,
        status: "ACTIVE",
        course: { isActive: true, isTeachable: true },
      },
      orderBy: [{ courseId: "asc" }, { version: "desc" }],
      select: { id: true, courseId: true, version: true, name: true },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">Thêm lớp học mới</h1>
      <ClassForm
        courses={courses}
        orgUnits={orgUnits.map((o) => ({
          id: o.orgUnitId,
          name: o.name,
          centerId: o.centerId,
        }))}
        classGroups={classGroups}
        rooms={rooms}
        teachers={teachers.map((t) => ({
          id: t.id,
          name: t.name ?? "(chưa đặt tên)",
          role: t.role,
        }))}
        curricula={curricula}
      />
    </div>
  );
}
