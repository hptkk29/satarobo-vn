import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { ClassForm } from "../_components/class-form";

export const dynamic = "force-dynamic";

export default async function NewClassPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "classes:create")) {
    redirect("/dashboard?error=unauthorized");
  }

  const [courses, centers, rooms, teachers] = await Promise.all([
    db.course.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.center.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
    db.room.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ centerId: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, centerId: true },
    }),
    db.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        role: { in: ["TEACHER", "CENTER_MANAGER"] },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">Thêm lớp học mới</h1>
      <ClassForm
        courses={courses}
        centers={centers}
        rooms={rooms}
        teachers={teachers.map((t) => ({
          id: t.id,
          name: t.name ?? "(chưa đặt tên)",
          role: t.role,
        }))}
      />
    </div>
  );
}
