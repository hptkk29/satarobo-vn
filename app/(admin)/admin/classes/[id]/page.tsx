import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { resolveActor } from "@/lib/auth/actor";
import { can } from "@/lib/auth/can";
import { scopedDb } from "@/lib/db-scope";
import { getSelectableOrgUnits } from "@/lib/org/org-service";
import { getAssignableTeachers } from "@/lib/teachers/assignable";
import { isSessionLifecycleV2Enabled } from "@/lib/flags";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClassForm, type ClassFormValue } from "../_components/class-form";
import { ClassApprovalActions } from "./_components/class-approval-actions";
import { ClassReschedule } from "./_components/class-reschedule";
import { ClassCurriculum } from "./_components/class-curriculum";
import { ClassSessionsManage } from "./_components/class-sessions-manage";
import { ClassAttendancePanel } from "./_components/class-attendance-panel";
import { buildSessionAttendanceRows } from "@/lib/attendance/roster";

interface Props {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

const WEEKDAY_LABEL: Record<number, string> = {
  0: "CN",
  1: "T2",
  2: "T3",
  3: "T4",
  4: "T5",
  5: "T6",
  6: "T7",
};

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  PLANNED: { label: "Đang lên KH", cls: "bg-neutral-100 text-neutral-700" },
  RECRUITING: { label: "Tuyển sinh", cls: "bg-blue-100 text-blue-700" },
  PENDING_APPROVAL: { label: "Chờ duyệt", cls: "bg-amber-100 text-amber-700" },
  ACTIVE: { label: "Đang dạy", cls: "bg-green-100 text-green-700" },
  COMPLETED: { label: "Hoàn thành", cls: "bg-purple-100 text-purple-700" },
  CANCELLED: { label: "Huỷ", cls: "bg-red-100 text-red-700" },
};

/**
 * R2-CLASS-1/4 — Trang chi tiết lớp ĐA-TAB: gộp Thông tin · Chương trình ·
 * Buổi học (+ Điểm danh) · Ảnh · Học bù · Tài liệu SCORM · Đánh giá vào 1 nơi,
 * thay vì 4 trang rời (sidebar đã ẩn ở W0). Header gọn 1 card (R2-CLASS-4).
 * Route cũ /sessions /attendance /media /hoc-bu GIỮ tới khi trang này ổn định.
 */
export default async function ClassDetailPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const { id } = await params;
  const actor = await resolveActor(session.user.id);

  const hasEdit = can(actor, "classes:edit");
  const hasViewAll = can(actor, "classes:view-all");
  const hasViewOwn = can(actor, "classes:view-own");
  if (!hasEdit && !hasViewAll && !hasViewOwn) {
    redirect("/dashboard?error=unauthorized");
  }

  const sdb = scopedDb(actor);
  const [cls, courses, orgUnits, classGroups, rooms] = await Promise.all([
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
        course: { select: { name: true } },
        _count: { select: { enrollments: { where: { deletedAt: null } } } },
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

  // IDOR view-own: chỉ GV/TA của lớp mới xem được khi chỉ có quyền view-own.
  if (!hasEdit && !hasViewAll && hasViewOwn) {
    if (cls.teacherId !== session.user.id && cls.assistantId !== session.user.id) {
      redirect("/dashboard?error=unauthorized");
    }
  }

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
    // R2-RBAC-3 — GV cùng cơ sở + LUÔN kèm GV/TA đang gán (giữ <Select> value).
    getAssignableTeachers({
      centerIds: actor.visibleCenterIds,
      includeIds: [cls.teacherId, cls.assistantId],
    }),
  ]);

  const lessonIds = plans
    .map((p) => p.lessonId)
    .filter((x): x is string => Boolean(x));
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

  // Tab điểm danh: buổi mặc định = buổi sắp tới gần nhất (chưa huỷ), else buổi cuối.
  // Roster render server-side (RSC) để panel khỏi useEffect-fetch lúc mount.
  const nowMs = Date.now();
  const defaultSession =
    sessions.find((s) => s.status !== "CANCELLED" && s.date.getTime() >= nowMs) ??
    sessions[sessions.length - 1] ??
    null;
  const initialRoster = defaultSession
    ? await buildSessionAttendanceRows(actor, defaultSession.id)
    : { rows: [] };

  const teacherOptions = teachers.map((t) => ({
    id: t.id,
    label: t.name ?? "(chưa đặt tên)",
  }));
  const roomOptions = rooms
    .filter((r) => !cls.centerId || r.centerId === cls.centerId)
    .map((r) => ({ id: r.id, label: `${r.code} — ${r.name}` }));

  const canEdit = can(actor, "classes:edit", { centerId: cls.centerId });
  const lifecycleV2 = isSessionLifecycleV2Enabled();

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

  const teacherName =
    teachers.find((t) => t.id === cls.teacherId)?.name ?? null;
  const badge = STATUS_BADGE[cls.status] ?? STATUS_BADGE.PLANNED;
  const scheduleLabel = (cls.scheduleDays ?? [])
    .map((d) => WEEKDAY_LABEL[d] ?? d)
    .join(" · ");

  return (
    <div className="space-y-6">
      {/* R2-CLASS-4 — header gọn 1 card */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-neutral-900">{cls.name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.cls}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-sm text-neutral-500">
              {cls.classCode ? <span className="font-mono">{cls.classCode}</span> : "—"}
              {cls.course?.name ? <> · {cls.course.name}</> : null}
            </p>
          </div>
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
              📊 Tiến độ
            </Link>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <HeaderItem label="Lịch học" value={scheduleLabel || "—"} />
          <HeaderItem
            label="Giờ"
            value={cls.startTime ? `${cls.startTime}${cls.endTime ? `–${cls.endTime}` : ""}` : "—"}
          />
          <HeaderItem label="GV chính" value={teacherName ?? "Chưa phân"} />
          <HeaderItem label="Sĩ số" value={`${cls._count.enrollments}/${cls.maxStudents}`} />
        </dl>
      </div>

      <Tabs defaultValue="info" className="w-full">
        <TabsList variant="line" className="flex-wrap">
          <TabsTrigger value="info">Thông tin</TabsTrigger>
          <TabsTrigger value="curriculum">Chương trình</TabsTrigger>
          <TabsTrigger value="sessions">Buổi & Điểm danh</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-6 pt-4">
          <ClassApprovalActions
            classId={cls.id}
            status={cls.status}
            canSubmit={actor.orgRoles.some((r) =>
              ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"].includes(r.roleCode),
            )}
            canApprove={
              actor.isSuperAdmin ||
              (actor.orgRoles.some((r) => r.roleCode === "CENTER_MANAGER") &&
                can(actor, "classes:edit", { centerId: cls.centerId }))
            }
            approvedByName={cls.approvedByName}
          />
          <ClassReschedule classId={cls.id} canEdit={canEdit} />
          <ClassForm
            cls={formValue}
            courses={courses}
            canEdit={canEdit}
            orgUnits={orgUnits.map((o) => ({
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
        </TabsContent>

        <TabsContent value="curriculum" className="pt-4">
          <ClassCurriculum
            classId={cls.id}
            pinnedVersion={cls.curriculumVersion}
            plans={planRows}
            versions={curricula}
            canEdit={canEdit}
          />
        </TabsContent>

        <TabsContent value="sessions" className="space-y-8 pt-4">
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-700">
              Buổi học
            </h2>
            <ClassSessionsManage
              sessions={sessionRows}
              teachers={teacherOptions}
              rooms={roomOptions}
              canEdit={canEdit}
              lifecycleV2={lifecycleV2}
            />
          </section>
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-neutral-700">
              Điểm danh
            </h2>
            <ClassAttendancePanel
              sessions={sessionRows}
              initialSessionId={defaultSession?.id ?? null}
              initialRows={initialRoster.rows}
            />
          </section>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HeaderItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-neutral-800">{value}</dd>
    </div>
  );
}
