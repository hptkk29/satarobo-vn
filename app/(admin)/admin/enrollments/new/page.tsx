import { db } from "@/lib/db";
import { EnrollmentForm } from "../_components/enrollment-form";

export const dynamic = "force-dynamic";

export default async function NewEnrollmentPage() {
  const [students, classes] = await Promise.all([
    db.student.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
      take: 500,
    }),
    db.class.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        course: { select: { name: true } },
        center: { select: { name: true } },
      },
      take: 200,
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">Tạo đăng ký mới</h1>
      <EnrollmentForm
        students={students}
        classes={classes.map((c) => ({
          id: c.id,
          name: c.name,
          courseName: c.course.name,
          centerName: c.center?.name ?? null,
        }))}
      />
    </div>
  );
}
