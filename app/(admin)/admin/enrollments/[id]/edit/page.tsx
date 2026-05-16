import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { EnrollmentForm } from "../../_components/enrollment-form";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditEnrollmentPage({ params }: Props) {
  const { id } = await params;

  const enrollment = await db.enrollment.findUnique({
    where: { id },
    include: {
      student: { select: { id: true, name: true } },
      class: { select: { id: true, name: true } },
    },
  });
  if (!enrollment) notFound();

  const [students, classes] = await Promise.all([
    db.student.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
      take: 500,
    }),
    db.class.findMany({
      where: { deletedAt: null },
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
      <h1 className="mb-6 text-3xl font-black text-neutral-900">
        Sửa đăng ký:{" "}
        <span className="font-bold text-orange-600">
          {enrollment.student.name} · {enrollment.class.name}
        </span>
      </h1>
      <EnrollmentForm
        enrollment={{
          id: enrollment.id,
          studentId: enrollment.studentId,
          classId: enrollment.classId,
          status: enrollment.status,
          tuition: enrollment.tuition,
          paidAt: enrollment.paidAt,
          startDate: enrollment.startDate,
          endDate: enrollment.endDate,
        }}
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
