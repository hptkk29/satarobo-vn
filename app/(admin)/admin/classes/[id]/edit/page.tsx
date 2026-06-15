import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { db } from "@/lib/db";
import { can, hasAnyRole } from "@/lib/auth/permissions";
import { ClassForm, type ClassFormValue } from "../../_components/class-form";
import { ClassApprovalActions } from "../_components/class-approval-actions";
import { ClassReschedule } from "../_components/class-reschedule";
import { ClassCurriculum } from "../_components/class-curriculum";
import { ClassSessionsManage } from "../_components/class-sessions-manage";

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

  const [cls, courses, centers, classGroups, rooms, teachers] =
    await Promise.all([
    db.class.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        classCode: true,
        name: true,
        description: true,
        courseId: true,
        centerId: true,
        classGroupId: true,
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
        approvedByName: true,
        curriculumVersion: true,
      },
    }),
    db.course.findMany({
      where: { isActive: true, isTeachable: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: true },
    }),
    db.center.findMany({
      where: { isActive: true },
      orderBy: { displayOrder: "asc" },
      select: { id: true, name: true },
    }),
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
    db.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        // Đa vai trò (3B): gồm người có TEACHER/CENTER_MANAGER ở bất kỳ vị trí nào.
        roles: { hasSome: ["TEACHER", "CENTER_MANAGER"] },
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
  ]);

  if (!cls) notFound();

  // R7-06 — dữ liệu cho tab "Chương trình" + "Quản lý buổi học".
  const [plans, sessions, curricula] = await Promise.all([
    db.classSessionPlan.findMany({
      where: { classId: cls.id },
      orderBy: { order: "asc" },
      select: { id: true, seq: true, order: true, customTitle: true, note: true, lessonId: true },
    }),
    db.classSession.findMany({
      where: { classId: cls.id },
      orderBy: { date: "asc" },
      select: { id: true, date: true, topic: true, status: true },
    }),
    db.curriculum.findMany({
      where: { courseId: cls.courseId, isActive: true, status: "ACTIVE" },
      orderBy: { version: "desc" },
      select: { version: true, name: true },
    }),
  ]);

  const lessonIds = plans
    .map((p) => p.lessonId)
    .filter((id): id is string => Boolean(id));
  const lessons = lessonIds.length
    ? await db.lesson.findMany({
        where: { id: { in: lessonIds } },
        select: { id: true, title: true },
      })
    : [];
  const lessonTitleById = new Map(lessons.map((l) => [l.id, l.title]));

  const planRows = plans.map((p) => ({
    id: p.id,
    seq: p.seq,
    order: p.order,
    customTitle: p.customTitle,
    note: p.note,
    lessonTitle: p.lessonId ? lessonTitleById.get(p.lessonId) ?? null : null,
  }));

  const sessionRows = sessions.map((s) => ({
    id: s.id,
    date: s.date.toISOString(),
    topic: s.topic,
    status: s.status,
  }));

  const teacherOptions = teachers.map((t) => ({
    id: t.id,
    label: t.name ?? "(chưa đặt tên)",
  }));
  const roomOptions = rooms
    .filter((r) => !cls.centerId || r.centerId === cls.centerId)
    .map((r) => ({ id: r.id, label: `${r.code} — ${r.name}` }));

  const canEdit = can(session.user, "classes:edit");

  const formValue: ClassFormValue = {
    id: cls.id,
    classCode: cls.classCode,
    name: cls.name,
    description: cls.description,
    courseId: cls.courseId,
    centerId: cls.centerId,
    classGroupId: cls.classGroupId,
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

      <div className="mb-6">
        <ClassApprovalActions
          classId={cls.id}
          status={cls.status}
          canSubmit={hasAnyRole(session.user, ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"])}
          canApprove={
            hasAnyRole(session.user, ["SUPER_ADMIN"]) ||
            (hasAnyRole(session.user, ["CENTER_MANAGER"]) && cls.centerId === session.user.centerId)
          }
          approvedByName={cls.approvedByName}
        />
      </div>

      <div className="mb-6">
        <ClassReschedule classId={cls.id} canEdit={canEdit} />
      </div>

      <div className="mb-6">
        <ClassCurriculum
          classId={cls.id}
          pinnedVersion={cls.curriculumVersion}
          plans={planRows}
          versions={curricula}
          canEdit={canEdit}
        />
      </div>

      <div className="mb-6">
        <ClassSessionsManage
          sessions={sessionRows}
          teachers={teacherOptions}
          rooms={roomOptions}
          canEdit={canEdit}
        />
      </div>

      <ClassForm
        cls={formValue}
        courses={courses}
        centers={centers}
        classGroups={classGroups}
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
