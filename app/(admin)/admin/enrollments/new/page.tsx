import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { can } from "@/lib/auth/permissions";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
import { getNonEnrollableCenterIds, notHeadOfficeWhere } from "@/lib/enrollment-flow";
import { EnrollForm } from "../_components/enroll-form";

export const dynamic = "force-dynamic";

const CAPACITY_COUNT_STATUSES = ["PENDING", "CONFIRMED", "STUDYING", "ACTIVE"];

export default async function NewEnrollmentPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "enrollments:create")) {
    redirect("/dashboard?error=unauthorized");
  }

  // Cách ly cơ sở: Student + Class ∈ SCOPED_MODELS → sdb auto inject centerId,
  // CENTER_MANAGER@CS1 không thấy/đăng ký HS hay lớp của CS2.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  // FL2-05 — Hội sở (OrgUnit type ≠ CENTER) KHÔNG nhận học viên → loại lớp thuộc
  // cơ sở Hội sở khỏi picker đăng ký. Nhận diện qua OrgUnit tree, không hardcode.
  const hoCenterIds = await getNonEnrollableCenterIds();

  const [students, classes] = await Promise.all([
    sdb.student.findMany({
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
    sdb.class.findMany({
      where: {
        deletedAt: null,
        status: { in: ["PLANNED", "RECRUITING", "ACTIVE"] },
        ...notHeadOfficeWhere(hoCenterIds),
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
