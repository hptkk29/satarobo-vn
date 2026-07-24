import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb, getModelVisibleCenterIds } from "@/lib/db-scope";
import { getSelectableOrgUnits } from "@/lib/org/org-service";
import { getAssignableTeachers } from "@/lib/teachers/assignable";
import { ClassForm, type ClassFormValue } from "../../_components/class-form";
import { ClassApprovalActions } from "../_components/class-approval-actions";
import { ClassCancel } from "../_components/class-cancel";
import { ClassReschedule } from "../_components/class-reschedule";
import { ClassCurriculum } from "../_components/class-curriculum";
import { ClassSessionsManage } from "../_components/class-sessions-manage";
import { isSessionLifecycleV2Enabled } from "@/lib/flags";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function EditClassPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const actor = await resolveActor(session.user.id);

  const hasEdit = await checkPermission("classes:edit");
  const hasViewAll = await checkPermission("classes:view-all");
  const hasViewOwn = await checkPermission("classes:view-own");

  if (!hasEdit && !hasViewAll && !hasViewOwn) {
    redirect("/dashboard?error=unauthorized");
  }

  const sdb = scopedDb(actor);
  const [cls, courses, orgUnits, classGroups, rooms] =
    await Promise.all([
    sdb.class.findFirst({
      where: { id, deletedAt: null },
      select: {
        id: true,
        classCode: true,
        name: true,
        description: true,
        courseId: true,
        centerId: true,
        orgUnitId: true,
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
    sdb.course.findMany({
      where: { isActive: true, isTeachable: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, category: true },
    }),
    getSelectableOrgUnits(actor),
    sdb.classGroup.findMany({
      where: { deletedAt: null, status: "ACTIVE" },
      orderBy: { displayCode: "asc" },
      select: { id: true, displayCode: true, name: true, centerId: true },
    }),
    sdb.room.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ centerId: "asc" }, { code: "asc" }],
      select: { id: true, code: true, name: true, centerId: true },
    }),
  ]);

  if (!cls) notFound();

  // IDOR check for view-own scope: must be assigned teacher or assistant
  if (!hasEdit && !hasViewAll && hasViewOwn) {
    if (cls.teacherId !== session.user.id && cls.assistantId !== session.user.id) {
      redirect("/dashboard?error=unauthorized");
    }
  }

  // R7-06 — dữ liệu cho tab "Chương trình" + "Quản lý buổi học".
  // Fix #9 — `teachers` = GV có thể phân lớp + LUÔN kèm GV/trợ giảng đang gán cho lớp
  // này (kể cả khi họ được gán từ trang Giáo viên và không còn match điều kiện lọc)
  // để <Select> không tự rớt giá trị đang chọn → gốc của bug "Lớp học hiện trống".
  const [plans, sessions, curricula, teachers] = await Promise.all([
    sdb.classSessionPlan.findMany({
      where: { classId: cls.id },
      orderBy: { order: "asc" },
      select: { id: true, seq: true, order: true, customTitle: true, note: true, lessonId: true },
    }),
    sdb.classSession.findMany({
      where: { classId: cls.id },
      orderBy: { date: "asc" },
      select: { id: true, date: true, topic: true, status: true },
    }),
    sdb.curriculum.findMany({
      where: { courseId: cls.courseId, isActive: true, status: "ACTIVE" },
      orderBy: { version: "desc" },
      select: { version: true, name: true },
    }),
    // R2-RBAC-3 — GV cùng cơ sở actor nhìn thấy + LUÔN kèm GV/TA đang gán (includeIds)
    // để <Select> không rớt value; form lọc tiếp theo đơn vị đang chọn ở client.
    getAssignableTeachers({
      centerIds: actor.visibleCenterIds,
      includeIds: [cls.teacherId, cls.assistantId],
    }),
  ]);

  const lessonIds = plans
    .map((p) => p.lessonId)
    .filter((id): id is string => Boolean(id));
  const lessons = lessonIds.length
    ? await sdb.lesson.findMany({
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

  const canEdit = await checkPermission("classes:edit", { centerId: cls.centerId });
  // QA 21/07 (B4) — số ghi danh còn học, hiện trong cảnh báo dialog Hủy lớp
  // (cùng danh sách LIVE mà cancelClassAction sẽ rút về WITHDREW).
  const liveEnrollmentCount = await sdb.enrollment.count({
    where: {
      classId: cls.id,
      deletedAt: null,
      status: { in: ["CONFIRMED", "STUDYING", "ACTIVE", "PAUSED"] },
    },
  });
  const canApproveClass =
    actor.isSuperAdmin ||
    (actor.orgRoles.some((r) => r.roleCode === "CENTER_MANAGER") &&
      (await checkPermission("classes:edit", { centerId: cls.centerId })));

  // Picker "Đơn vị" theo scope GHI của Class (đối xứng guard updateClass — vá 24/07):
  // role HO không có quyền classes:* không được mời chuyển lớp sang cơ sở ngoài scope.
  const classCenters = getModelVisibleCenterIds("Class", actor);
  const orgUnitsInScope =
    classCenters === "ALL"
      ? orgUnits
      : orgUnits.filter((o) => o.centerId != null && classCenters.includes(o.centerId));

  const formValue: ClassFormValue = {
    id: cls.id,
    classCode: cls.classCode,
    name: cls.name,
    description: cls.description,
    courseId: cls.courseId,
    orgUnitId: cls.orgUnitId,
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
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/classes/${cls.id}/students`}
            className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-white px-3 py-1.5 text-sm font-semibold text-orange-700 hover:bg-orange-50"
          >
            👥 Học sinh
          </Link>
          <Link
            href={`/classes/${cls.id}/progress`}
            className="inline-flex items-center gap-1 rounded-lg border border-purple-200 bg-white px-3 py-1.5 text-sm font-semibold text-purple-700 hover:bg-purple-50"
          >
            📊 Tiến độ lớp
          </Link>
        </div>
      </div>

      <div className="mb-6">
        <ClassApprovalActions
          classId={cls.id}
          status={cls.status}
          canSubmit={actor.orgRoles.some(r => ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"].includes(r.roleCode))}
          canApprove={canApproveClass}
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
          lifecycleV2={isSessionLifecycleV2Enabled()}
        />
      </div>

      <div className="mb-6">
        <ClassCancel
          classId={cls.id}
          className={cls.name}
          status={cls.status}
          liveEnrollmentCount={liveEnrollmentCount}
          canEdit={canEdit}
        />
      </div>

      <ClassForm
        cls={formValue}
        courses={courses}
        canEdit={canEdit}
        orgUnits={orgUnitsInScope.map((o) => ({
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
          centerId: t.centerId,
        }))}
      />
    </div>
  );
}
