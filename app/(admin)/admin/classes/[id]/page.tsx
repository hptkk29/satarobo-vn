import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { resolveActor } from "@/lib/auth/actor";
import { checkPermission } from "@/lib/auth/check-permission";
import { scopedDb } from "@/lib/db-scope";
import { getNonEnrollableCenterIds } from "@/lib/enrollment-flow";
import { getSelectableOrgUnits } from "@/lib/org/org-service";
import { getAssignableTeachers } from "@/lib/teachers/assignable";
import { isSessionLifecycleV2Enabled } from "@/lib/flags";
import { resolveClassSlots } from "@/lib/classes/slots";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ClassForm, type ClassFormValue } from "../_components/class-form";
import { ClassApprovalActions } from "./_components/class-approval-actions";
import { ClassReschedule } from "./_components/class-reschedule";
import { ClassCurriculum } from "./_components/class-curriculum";
import { ClassSessionsManage } from "./_components/class-sessions-manage";
import { ClassAttendancePanel } from "./_components/class-attendance-panel";
import { buildSessionAttendanceRows } from "@/lib/attendance/roster";
import { MediaClient } from "../../media/_components/media-client";
import { MakeupRow } from "../../hoc-bu/_components/makeup-row";
import { ClassEvalPanel } from "./_components/class-eval-panel";
import {
  loadClassMediaItems,
  loadClassMakeupItems,
  loadClassScormSessions,
} from "@/lib/classes/detail-tabs-data";
import { isScormEnabled } from "@/lib/flags";
import { canManageTraining } from "@/lib/scorm/access";

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
  const hoCenterIds = await getNonEnrollableCenterIds();

  const hasEdit = await checkPermission("classes:edit");
  const hasViewAll = await checkPermission("classes:view-all");
  const hasViewOwn = await checkPermission("classes:view-own");
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
        // BGĐ 31/07 — giờ riêng theo thứ (lớp 2 ca khác giờ).
        scheduleSlots: {
          select: { weekday: true, startTime: true, endTime: true },
          orderBy: { weekday: "asc" },
        },
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
      select: { id: true, name: true, category: true, code: true, slug: true }, // T3.4 — code/slug để gợi ý tên lớp
    }),
    // Hội sở KHÔNG nhận lớp (chốt 04/08) — picker chỉ liệt kê cơ sở dạy học.
    getSelectableOrgUnits(actor, { types: ["CENTER"] }),
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

  const canEdit = await checkPermission("classes:edit", { centerId: cls.centerId });
  const canApproveClass =
    actor.isSuperAdmin ||
    (actor.orgRoles.some((r) => r.roleCode === "CENTER_MANAGER") &&
      (await checkPermission("classes:edit", { centerId: cls.centerId })));
  const lifecycleV2 = isSessionLifecycleV2Enabled();

  // Tab Ảnh / Học bù — gate quyền (GV chỉ view-own không có parent-requests:manage).
  const canViewMedia =
    (await checkPermission("media:view")) || (await checkPermission("media:upload"));
  const canApproveMedia = await checkPermission("media:approve");
  const canManageMakeup = await checkPermission("parent-requests:manage");

  // Tab SCORM (R2-CLASS-5) — chỉ GV phân công lớp này hoặc QL đào tạo, và flag ON
  // (route /scorm/play tự gate lại canOpenScorm). Tab Đánh giá (R2-CLASS-7) — GV của
  // lớp hoặc người có quyền sửa lớp; gateFill server-side vẫn chốt cuối.
  const isOwnerTeacher =
    cls.teacherId === session.user.id || cls.assistantId === session.user.id;
  const canViewScorm = isScormEnabled() && (canManageTraining(actor) || isOwnerTeacher);
  const canEval = canEdit || isOwnerTeacher;

  const [mediaItems, makeupItems, scormSessions] = await Promise.all([
    canViewMedia ? loadClassMediaItems(cls.id, cls.name) : Promise.resolve([]),
    canManageMakeup ? loadClassMakeupItems(cls.id) : Promise.resolve([]),
    canViewScorm ? loadClassScormSessions(cls.id) : Promise.resolve([]),
  ]);

  // DS học viên buổi mặc định cho tab Đánh giá (present = đã điểm danh có mặt/muộn).
  const initialEvalStudents = initialRoster.rows.map((r) => ({
    studentId: r.studentId,
    name: r.studentName,
    present: r.existing?.status === "PRESENT" || r.existing?.status === "LATE",
  }));

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
    scheduleSlots: cls.scheduleSlots ?? [],
    maxStudents: cls.maxStudents,
    minStudents: cls.minStudents,
    status: cls.status,
    notes: cls.notes,
  };

  const teacherName =
    teachers.find((t) => t.id === cls.teacherId)?.name ?? null;
  const badge = STATUS_BADGE[cls.status] ?? STATUS_BADGE.PLANNED;
  // BGĐ 31/07 — hiển thị lịch kèm giờ CỦA TỪNG THỨ (lớp 2 ca khác giờ).
  const effectiveSlots = resolveClassSlots({
    scheduleDays: cls.scheduleDays ?? [],
    startTime: cls.startTime,
    endTime: cls.endTime,
    slots: cls.scheduleSlots,
  });
  const scheduleLabel = effectiveSlots
    .map((s) => {
      const day = WEEKDAY_LABEL[s.weekday] ?? s.weekday;
      return s.startTime ? `${day} ${s.startTime}` : `${day}`;
    })
    .join(" · ");
  // Có ca lệch giờ → ô "Giờ" chung không còn ý nghĩa, ghi rõ "theo từng thứ".
  const hasPerDayTimes = new Set(effectiveSlots.map((s) => s.startTime)).size > 1;

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
            value={
              hasPerDayTimes
                ? "Theo từng thứ"
                : cls.startTime
                  ? `${cls.startTime}${cls.endTime ? `–${cls.endTime}` : ""}`
                  : "—"
            }
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
          {canViewMedia && <TabsTrigger value="media">Ảnh lớp</TabsTrigger>}
          {canManageMakeup && <TabsTrigger value="makeup">Học bù</TabsTrigger>}
          {canViewScorm && <TabsTrigger value="scorm">Tài liệu SCORM</TabsTrigger>}
          {canEval && <TabsTrigger value="eval">Đánh giá</TabsTrigger>}
        </TabsList>

        <TabsContent value="info" className="space-y-6 pt-4">
          <ClassApprovalActions
            classId={cls.id}
            status={cls.status}
            canSubmit={actor.orgRoles.some((r) =>
              ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"].includes(r.roleCode),
            )}
            canApprove={canApproveClass}
            approvedByName={cls.approvedByName}
          />
          <ClassReschedule classId={cls.id} canEdit={canEdit} />
          <ClassForm
        hoCenterIds={hoCenterIds}
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

        {canViewMedia && (
          <TabsContent value="media" className="pt-4">
            <MediaClient
              items={mediaItems}
              classes={[{ id: cls.id, label: cls.classCode ? `${cls.classCode} · ${cls.name}` : cls.name }]}
              canApprove={canApproveMedia}
            />
          </TabsContent>
        )}

        {canManageMakeup && (
          <TabsContent value="makeup" className="pt-4">
            {makeupItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
                Không có nhu cầu học bù nào đang chờ cho lớp này.
              </p>
            ) : (
              <ul className="space-y-2">
                {makeupItems.map((item) => (
                  <MakeupRow key={item.id} item={item} />
                ))}
              </ul>
            )}
          </TabsContent>
        )}

        {canViewScorm && (
          <TabsContent value="scorm" className="pt-4">
            <p className="mb-3 text-sm text-neutral-500">
              Mở/present tài liệu SCORM của bài giảng theo từng buổi. Mỗi lần mở cấp vé
              10 phút + watermark (truy vết).
            </p>
            {scormSessions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-400">
                Lớp chưa có buổi học gắn bài giảng.
              </p>
            ) : (
              <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200 bg-white">
                {scormSessions.map((s) => (
                  <li key={s.sessionId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="text-sm">
                      <span className="font-medium text-neutral-800">
                        {new Date(s.date).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </span>
                      {s.lessonTitle ? <span className="text-neutral-500"> · {s.lessonTitle}</span> : null}
                      {s.topic ? <span className="text-neutral-400"> · {s.topic}</span> : null}
                    </div>
                    {s.scorm ? (
                      <Link
                        href={`/scorm/play/${s.scorm.id}?sessionId=${s.sessionId}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-[#7C3AED] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                      >
                        ▶ Mở giảng
                      </Link>
                    ) : (
                      <span className="text-xs text-neutral-400">Chưa có SCORM</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        )}

        {canEval && (
          <TabsContent value="eval" className="pt-4">
            <ClassEvalPanel
              sessions={sessionRows}
              initialSessionId={defaultSession?.id ?? null}
              initialStudents={initialEvalStudents}
              canEdit={canEval}
            />
          </TabsContent>
        )}
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
