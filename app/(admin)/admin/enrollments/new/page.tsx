import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { EnrollForm } from "../_components/enroll-form";

export const dynamic = "force-dynamic";

const CAPACITY_COUNT_STATUSES = ["PENDING", "CONFIRMED", "STUDYING", "ACTIVE"];

export default async function NewEnrollmentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "enrollments:create")) {
    redirect("/dashboard?error=unauthorized");
  }

  const [students, classes] = await Promise.all([
    db.student.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        parentPhone: true,
        studentCode: true,
      },
      take: 500,
    }),
    db.class.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PLANNED", "RECRUITING", "ACTIVE"] },
      },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        classCode: true,
        status: true,
        maxStudents: true,
        center: { select: { name: true } },
        _count: {
          select: {
            enrollments: {
              where: { status: { in: CAPACITY_COUNT_STATUSES as never[] } },
            },
          },
        },
      },
      take: 200,
    }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">
        Đăng ký lớp cho học viên
      </h1>
      <EnrollForm
        students={students}
        classes={classes.map((c) => ({
          id: c.id,
          classCode: c.classCode,
          name: c.name,
          status: c.status,
          maxStudents: c.maxStudents,
          enrolledCount: c._count.enrollments,
          centerName: c.center?.name ?? null,
        }))}
      />
    </div>
  );
}
