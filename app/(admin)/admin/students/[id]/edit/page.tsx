import Link from "next/link";
import { LineChart } from "lucide-react";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { getStudentProgress } from "@/lib/progress";
import { StudentForm, type StudentFormValue } from "../../_components/student-form";
import { GeneratePdfButton } from "./_pdf-button";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditStudentPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user.role, "students:edit")) {
    redirect("/admin/dashboard?error=unauthorized");
  }

  const { id } = await params;

  const [student, centers] = await Promise.all([
    db.student.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        name: true,
        studentCode: true,
        dateOfBirth: true,
        gender: true,
        phone: true,
        email: true,
        avatarUrl: true,
        currentGrade: true,
        school: true,
        parentName: true,
        parentPhone: true,
        parentEmail: true,
        parentRelation: true,
        parent2Name: true,
        parent2Phone: true,
        parent2Relation: true,
        address: true,
        ward: true,
        district: true,
        city: true,
        bloodType: true,
        allergies: true,
        healthNotes: true,
        enrollmentDate: true,
        preferredCenterId: true,
        notes: true,
        status: true,
        centerId: true,
      },
    }),
    db.center.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  if (!student) notFound();

  const formValue: StudentFormValue = {
    id: student.id,
    name: student.name,
    studentCode: student.studentCode,
    dateOfBirth: student.dateOfBirth,
    gender: student.gender,
    phone: student.phone,
    email: student.email,
    avatarUrl: student.avatarUrl,
    currentGrade: student.currentGrade,
    school: student.school,
    parentName: student.parentName,
    parentPhone: student.parentPhone,
    parentEmail: student.parentEmail,
    parentRelation: student.parentRelation,
    parent2Name: student.parent2Name,
    parent2Phone: student.parent2Phone,
    parent2Relation: student.parent2Relation,
    address: student.address,
    ward: student.ward,
    district: student.district,
    city: student.city,
    bloodType: student.bloodType,
    allergies: student.allergies ?? [],
    healthNotes: student.healthNotes,
    enrollmentDate: student.enrollmentDate,
    preferredCenterId: student.preferredCenterId,
    notes: student.notes,
    status: student.status,
    centerId: student.centerId,
  };

  const activeEnrollments = await db.enrollment.findMany({
    where: {
      studentId: id,
      status: { in: ["CONFIRMED", "STUDYING", "ACTIVE"] },
    },
    select: {
      id: true,
      class: {
        select: {
          id: true,
          name: true,
          classCode: true,
          course: { select: { name: true } },
          center: { select: { name: true } },
        },
      },
    },
  });

  const progressByClass = await Promise.all(
    activeEnrollments.map(async (e) => ({
      enrollment: e,
      progress: await getStudentProgress(id, e.class.id),
    })),
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="mb-6 text-3xl font-black text-neutral-900">
          Sửa học viên:{" "}
          <span className="font-bold text-orange-600">{student.name}</span>
        </h1>
        <StudentForm student={formValue} centers={centers} />
      </div>

      {progressByClass.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-neutral-900">
            <LineChart className="h-5 w-5 text-[#7C3AED]" />
            Tiến độ học tập
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {progressByClass.map(({ enrollment, progress }) => (
              <div
                key={enrollment.id}
                className="rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-neutral-900">
                      {enrollment.class.name}
                    </h3>
                    <p className="text-xs text-neutral-500">
                      {enrollment.class.classCode &&
                        `${enrollment.class.classCode} · `}
                      {enrollment.class.course.name}
                      {enrollment.class.center?.name &&
                        ` · ${enrollment.class.center.name}`}
                    </p>
                    <Link
                      href={`/admin/classes/${enrollment.class.id}/progress`}
                      className="mt-0.5 inline-block text-xs font-semibold text-[#7C3AED] hover:underline"
                    >
                      Xem lớp →
                    </Link>
                  </div>
                  <GeneratePdfButton
                    studentId={id}
                    classId={enrollment.class.id}
                    studentName={student.name}
                    className={enrollment.class.name}
                  />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center text-sm">
                  <MiniStat
                    label="Điểm danh"
                    value={`${progress.attendedSessions}/${progress.totalSessions}`}
                    sub={`${progress.attendanceRate}%`}
                  />
                  <MiniStat
                    label="Bài học"
                    value={`${progress.coveredLessons}/${progress.totalLessons}`}
                  />
                  <MiniStat
                    label="Bài tập"
                    value={`${progress.submittedAssignments}/${progress.totalAssignments}`}
                  />
                  <MiniStat
                    label="Điểm TB"
                    value={
                      progress.averageScore !== null
                        ? `${progress.averageScore}/10`
                        : "—"
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-neutral-500">
        {label}
      </p>
      <p className="text-sm font-bold text-neutral-900 tabular-nums">{value}</p>
      {sub && (
        <p className="text-[10px] text-neutral-500 tabular-nums">{sub}</p>
      )}
    </div>
  );
}
