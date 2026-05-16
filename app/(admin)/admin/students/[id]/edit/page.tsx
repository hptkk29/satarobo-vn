import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { hasPermission } from "@/lib/permissions";
import { StudentForm, type StudentFormValue } from "../../_components/student-form";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditStudentPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!hasPermission(session.user, "update", "student")) {
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

  return (
    <div>
      <h1 className="mb-6 text-3xl font-black text-neutral-900">
        Sửa học viên:{" "}
        <span className="font-bold text-orange-600">{student.name}</span>
      </h1>
      <StudentForm student={formValue} centers={centers} />
    </div>
  );
}
