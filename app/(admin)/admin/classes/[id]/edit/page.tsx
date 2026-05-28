import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can } from "@/lib/auth/permissions";
import { ClassForm, type ClassFormValue } from "../../_components/class-form";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditClassPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!can(session.user, "classes:edit")) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;

  const [cls, courses, centers, rooms, teachers] = await Promise.all([
    db.class.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        classCode: true,
        name: true,
        description: true,
        courseId: true,
        centerId: true,
        roomId: true,
        teacherId: true,
        assistantId: true,
        startDate: true,
        endDate: true,
        scheduleDays: true,
        startTime: true,
        endTime: true,
        maxStudents: true,
        minStudents: true,
        status: true,
        notes: true,
      },
    }),
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

  if (!cls) notFound();

  const formValue: ClassFormValue = {
    id: cls.id,
    classCode: cls.classCode,
    name: cls.name,
    description: cls.description,
    courseId: cls.courseId,
    centerId: cls.centerId,
    roomId: cls.roomId,
    teacherId: cls.teacherId,
    assistantId: cls.assistantId,
    startDate: cls.startDate,
    endDate: cls.endDate,
    scheduleDays: cls.scheduleDays ?? [],
    startTime: cls.startTime,
    endTime: cls.endTime,
    maxStudents: cls.maxStudents,
    minStudents: cls.minStudents,
    status: cls.status,
    notes: cls.notes,
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="text-3xl font-black text-neutral-900">
          Sửa lớp: <span className="font-bold text-orange-600">{cls.name}</span>
        </h1>
        <Link
          href={`/classes/${cls.id}/progress`}
          className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-50"
        >
          📊 Tiến độ lớp
        </Link>
      </div>
      <ClassForm
        cls={formValue}
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
