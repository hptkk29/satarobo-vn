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
import type { PhaseFormValue } from "@/lib/classes/phase-form";
import { loadClassPhases, loadHolidayKeys } from "@/lib/classes/phases-service";
import { auditSessionSeries } from "@/lib/classes/session-audit";
import { vnAddDays, vnStartOfDay, vnYmd } from "@/lib/time/vn";
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
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";
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
  PLANNED: { label: "Đang lên KH", cls: "bg-muted text-foreground" },
  RECRUITING: { label: "Tuyển sinh", cls: "bg-state-info-soft text-state-info-ink" },
  PENDING_APPROVAL: { label: "Chờ duyệt", cls: "bg-state-warning-soft text-state-warning-ink" },
  ACTIVE: { label: "Đang dạy", cls: "bg-state-success-soft text-state-success-ink" },
  COMPLETED: { label: "Hoàn thành", cls: "bg-primary-soft text-primary" },
  CANCELLED: { label: "Huỷ", cls: "bg-state-danger-soft text-state-danger-ink" },
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
        // Sĩ số = HV ĐANG thuộc lớp. Thiếu lọc status thì WITHDREW/CANCELLED/COMPLETED
        // vẫn được đếm — lệch với cột sĩ số ở /admin/classes (classes/page.tsx) và làm
        // HV đã nghỉ/đã xoá vẫn kê lên đầu trang lớp (sự cố 07/08).
        _count: {
          select: {
            enrollments: {
              where: {
                status: { in: ENROLLMENT_ACTIVE_STATUS_LIST },
                deletedAt: null,
                student: { deletedAt: null },
              },
            },
          },
        },
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
    // 06/08 - GV la nguon luc chung (Hoi so dieu di moi co so): KHONG loc danh
    // sach theo co so nua, neu khong CS2 khong bao gio toi duoc form va bo loc
    // phia client co mo cung vo nghia.
    getAssignableTeachers({ includeIds: [cls.teacherId, cls.assistantId] }),
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

  // Kế hoạch lịch học (nay nằm trong tab "Thông tin", chỗ cũ của "Lịch học trong tuần"):
  // lớp chưa lập kế hoạch thì hiện GIAI ĐOẠN SUY từ lịch hiện tại (isDerived) — sửa xong
  // bấm Lưu là chốt, không cần backfill dữ liệu cũ.
  const loadedPhases = await loadClassPhases(cls.id);
  const phaseForm: PhaseFormValue[] = (loadedPhases?.phases ?? []).map((p) => ({
    from: vnYmd(p.effectiveFrom),
    to: p.effectiveTo ? vnYmd(p.effectiveTo) : "",
    note: p.note ?? "",
    days: Object.fromEntries(
      p.slots.map((s) => [s.weekday, { start: s.startTime, end: s.endTime ?? "" }]),
    ),
  }));
  // Mặc định áp dụng từ NGÀY MAI — không đụng buổi hôm nay (có thể đang dạy).
  const defaultApplyFrom = vnYmd(vnAddDays(vnStartOfDay(new Date()), 1));
  // Chữ ký kế hoạch: state của form lịch chỉ khởi tạo 1 lần, không có key thì sau
  // `router.refresh()` form vẫn giữ bản cũ và banner "chưa lưu kế hoạch" vẫn hiện dù đã lưu.
  const phaseSignature = `${loadedPhases?.isDerived ? "d" : "s"}:${JSON.stringify(phaseForm)}`;

  // 08/08 — SOÁT dãy buổi có khớp "ngày khai giảng + lịch học" không. Trước đây lệch là
  // lệch âm thầm: `endDate` được tính lại theo lịch mới còn `ClassSession` giữ dãy cũ,
  // không màn nào đối chiếu hai thứ đó với nhau.
  const sessionAudit = auditSessionSeries({
    from: cls.startDate ? vnStartOfDay(cls.startDate) : null,
    phases: loadedPhases?.phases ?? [],
    holidays: await loadHolidayKeys(cls.centerId),
    sessions,
    classStatus: cls.status,
  });

  // Nhóm chat của lớp (nếu đã sinh) — chỉ lấy `id`, một truy vấn khoá duy nhất.
  // Đi qua `sdb` chứ không `db` trần — luật ESLint của repo cấm import `@/lib/db` trong
  // app/(admin). An toàn: `Conversation` nằm trong SCOPE_EXEMPT nên scopedDb không lọc nó
  // (DM có centerId = null, đưa vào diện scoped là hiểu sai thành "không thuộc cơ sở nào").
  const chatConversationId = (
    await sdb.conversation.findUnique({
      where: {
        type_subjectType_subjectId: {
          type: "CLASS_GROUP",
          subjectType: "CLASS",
          subjectId: cls.id,
        },
      },
      select: { id: true },
    })
  )?.id;

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
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-black text-foreground">{cls.name}</h1>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${badge.cls}`}>
                {badge.label}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {cls.classCode ? <span className="font-mono">{cls.classCode}</span> : "—"}
              {cls.course?.name ? <> · {cls.course.name}</> : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/classes/${cls.id}/students`}
              className="inline-flex items-center gap-1 rounded-lg border border-primary-soft bg-card px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-soft"
            >
              👥 Học sinh
            </Link>
            <Link
              href={`/classes/${cls.id}/progress`}
              className="inline-flex items-center gap-1 rounded-lg border border-primary-soft bg-card px-3 py-1.5 text-sm font-semibold text-primary hover:bg-primary-soft"
            >
              📊 Tiến độ
            </Link>
            {/* Lối tắt sang nhóm chat của lớp (yêu cầu chủ dự án 10/08): từ trang lớp
                bấm thẳng sang chỗ nhắn tin / gửi thông báo cho phụ huynh, không phải đi
                vòng qua màn Tin nhắn rồi dò tên lớp trong danh sách.
                Nhóm chỉ tồn tại khi lớp đã ACTIVE (BR-01) nên nút chỉ hiện khi CÓ nhóm —
                nút dẫn tới hư vô còn tệ hơn không có nút. */}
            {chatConversationId && (
              <Link
                href={`/admin/tin-nhan?c=${chatConversationId}`}
                className="inline-flex items-center gap-1 rounded-lg border border-state-info-soft bg-card px-3 py-1.5 text-sm font-semibold text-state-info-ink hover:bg-state-info-soft"
              >
                💬 Nhắn nhóm lớp
              </Link>
            )}
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
          {/* 08/08 — tab "Kế hoạch lịch học" đã chuyển vào tab Thông tin, đúng chỗ cũ của
              "Lịch học trong tuần" (một màn một việc: lịch lớp chỉ có MỘT nơi để sửa). */}
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
          <ClassReschedule
            classId={cls.id}
            canEdit={canEdit}
            audit={{ severity: sessionAudit.severity, message: sessionAudit.message }}
          />
          <ClassForm
            hoCenterIds={hoCenterIds}
            cls={formValue}
            courses={courses}
            canEdit={canEdit}
            schedulePhases={phaseForm}
            phasesDerived={loadedPhases?.isDerived ?? true}
            phaseSignature={phaseSignature}
            defaultApplyFrom={defaultApplyFrom}
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
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">
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
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-foreground">
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
              currentUserId={session.user.id}
            />
          </TabsContent>
        )}

        {canManageMakeup && (
          <TabsContent value="makeup" className="pt-4">
            {makeupItems.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
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
            <p className="mb-3 text-sm text-muted-foreground">
              Mở/present tài liệu SCORM của bài giảng theo từng buổi. Mỗi lần mở cấp vé
              10 phút + watermark (truy vết).
            </p>
            {scormSessions.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
                Lớp chưa có buổi học gắn bài giảng.
              </p>
            ) : (
              <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                {scormSessions.map((s) => (
                  <li key={s.sessionId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <div className="text-sm">
                      <span className="font-medium text-foreground">
                        {new Date(s.date).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </span>
                      {s.lessonTitle ? <span className="text-muted-foreground"> · {s.lessonTitle}</span> : null}
                      {s.topic ? <span className="text-muted-foreground"> · {s.topic}</span> : null}
                    </div>
                    {s.scorm ? (
                      <Link
                        href={`/scorm/play/${s.scorm.id}?sessionId=${s.sessionId}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
                      >
                        ▶ Mở giảng
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">Chưa có SCORM</span>
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
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}
