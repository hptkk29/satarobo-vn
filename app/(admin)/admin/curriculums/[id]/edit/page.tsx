import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { CurriculumForm } from "../../_components/curriculum-form";
import { LessonList, type LessonRow } from "../../_components/lesson-list";
import { CurriculumSessionsForm } from "../../_components/curriculum-sessions-form";
import { CurriculumMergeForm } from "../../_components/curriculum-merge-form";
import {
  LessonChangeRequests,
  type ChangeRequestRow,
} from "../../_components/lesson-change-requests";
import {
  LessonResources,
  type LessonResourceRow,
  type AssignmentRow,
} from "../../_components/lesson-resources";
import { checkPermission } from "@/lib/auth/check-permission";
import { isScormEnabled } from "@/lib/flags";
import { isScormProcessingStale, SCORM_STALE_ERROR } from "@/lib/scorm/stale";
import { formatDateVN } from "@/lib/format/date";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sửa chương trình | Admin" };

interface Props {
  params: Promise<{ id: string }>;
}

export default async function EditCurriculumPage({ params }: Props) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await checkPermission("curriculum:edit"))) {
    redirect("/dashboard?error=unauthorized");
  }

  const { id } = await params;

  // Nhóm 01 L1 — Curriculum/Lesson/Course = giáo trình dùng chung toàn hệ thống
  // (câu 74a), scopedDb pass-through. Assignment (qua Class scoped) lọc tay bên dưới.
  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);

  const [curriculum, courses, changeRequests] = await Promise.all([
    sdb.curriculum.findUnique({
      where: { id },
      include: {
        course: { select: { name: true } },
        lessons: {
          orderBy: { order: "asc" },
          select: {
            id: true,
            curriculumId: true,
            order: true,
            title: true,
            description: true,
            content: true,
            duration: true,
            objectives: true,
            materials: true,
            notes: true,
            teacherGuide: true,
            expectedOutput: true,
            homeworkDefault: true,
            assessmentCriteria: true,
            status: true,
            version: true,
            archivedAt: true,
          },
        },
      },
    }),
    sdb.course.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    sdb.lessonChangeRequest.findMany({
      where: { lesson: { curriculumId: id } },
      orderBy: { createdAt: "desc" },
      include: { lesson: { select: { order: true, title: true } } },
    }),
  ]);

  if (!curriculum) notFound();

  // Tên người gửi đề xuất (requestedById = User.id, không có relation trực tiếp).
  const requesterIds = [...new Set(changeRequests.map((r) => r.requestedById))];
  const requesters = requesterIds.length
    ? await sdb.user.findMany({
        where: { id: { in: requesterIds } },
        select: { id: true, name: true, email: true },
      })
    : [];
  const requesterName = new Map(
    requesters.map((u) => [u.id, u.name ?? u.email ?? "Người dùng"]),
  );

  // Số đề xuất OPEN theo từng buổi.
  const openByLesson = new Map<string, number>();
  for (const r of changeRequests) {
    if (r.status === "OPEN") {
      const cur = openByLesson.get(r.lessonId) ?? 0;
      openByLesson.set(r.lessonId, cur + 1);
    }
  }

  // FL W0-NAV-2 (QĐ-T3b): tách quyền — unlock buổi LOCKED vẫn dùng training:manage,
  // còn DUYỆT đề xuất chỉnh bài dùng lesson-change:approve (CM cũng duyệt được).
  const canUnlock = await checkPermission("training:manage");
  const canApproveChange = await checkPermission("lesson-change:approve");
  const canAuthor = await checkPermission("questions:author");

  // FL1-02 (US-LMS-1) — học liệu SCORM + bài tập theo buổi.
  const scormEnabled = isScormEnabled();
  const lessonIds = curriculum.lessons.map((l) => l.id);
  // Loại B — Assignment không auto-scope (không ∈ SCOPED_MODELS); cách ly tay qua
  // class.centerId ∈ visibleCenterIds, HO/SUPER bypass (pattern parent-feedback).
  const isGlobal = actor.isSuperAdmin || actor.isHoLevel;
  const [scormPackages, lessonAssignments] = await Promise.all([
    scormEnabled
      ? sdb.scormPackage.findMany({
          where: { lessonId: { in: lessonIds } },
          orderBy: [{ lessonId: "asc" }, { version: "desc" }],
          select: {
            id: true,
            lessonId: true,
            name: true,
            version: true,
            status: true,
            isActiveForLesson: true,
            error: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    // Bài tập đã gắn buổi của giáo trình + bài tập trống (chưa gắn buổi) cùng khoá.
    sdb.assignment.findMany({
      where: {
        OR: [
          { lessonId: { in: lessonIds } },
          { lessonId: null, class: { courseId: curriculum.courseId } },
        ],
        ...(isGlobal
          ? {}
          : { class: { centerId: { in: actor.visibleCenterIds } } }),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        kind: true,
        status: true,
        lessonId: true,
        class: { select: { name: true } },
      },
    }),
  ]);

  const scormByLesson = new Map<string, typeof scormPackages>();
  for (const p of scormPackages) {
    const arr = scormByLesson.get(p.lessonId) ?? [];
    arr.push(p);
    scormByLesson.set(p.lessonId, arr);
  }
  const assignmentsByLesson = new Map<string, AssignmentRow[]>();
  const availableAssignments: AssignmentRow[] = [];
  for (const a of lessonAssignments) {
    const row: AssignmentRow = {
      id: a.id,
      title: a.title,
      kind: a.kind,
      status: a.status,
      className: a.class.name,
    };
    if (a.lessonId) {
      const arr = assignmentsByLesson.get(a.lessonId) ?? [];
      arr.push(row);
      assignmentsByLesson.set(a.lessonId, arr);
    } else {
      availableAssignments.push(row);
    }
  }

  const lessons: LessonRow[] = curriculum.lessons.map((l) => ({
    id: l.id,
    curriculumId: l.curriculumId,
    order: l.order,
    title: l.title,
    description: l.description,
    content: l.content,
    duration: l.duration,
    objectives: l.objectives,
    materials: l.materials,
    notes: l.notes,
    teacherGuide: l.teacherGuide,
    expectedOutput: l.expectedOutput,
    homeworkDefault: l.homeworkDefault,
    assessmentCriteria: l.assessmentCriteria,
    status: l.status,
    version: l.version,
    archivedAt: l.archivedAt ? l.archivedAt.toISOString() : null,
    openChangeRequests: openByLesson.get(l.id) ?? 0,
  }));

  const activeLessons = lessons.filter((l) => !l.archivedAt);
  const expectedVersions: Record<string, number> = {};
  for (const l of activeLessons) expectedVersions[l.id] = l.version;

  const lessonResourceRows: LessonResourceRow[] = activeLessons.map((l) => ({
    lessonId: l.id,
    order: l.order,
    title: l.title,
    // QA 20/07 — bản UPLOADING/PROCESSING kẹt >15 phút hiển thị như bản LỖI (nút
    // "Dọn") thay vì "Đang xử lý…" vĩnh viễn.
    scorm: (scormByLesson.get(l.id) ?? []).map((p) =>
      isScormProcessingStale(p.status, p.createdAt)
        ? { id: p.id, name: p.name, version: p.version, status: "FAILED", isActiveForLesson: p.isActiveForLesson, error: SCORM_STALE_ERROR }
        : { id: p.id, name: p.name, version: p.version, status: p.status, isActiveForLesson: p.isActiveForLesson, error: p.error },
    ),
    assignments: assignmentsByLesson.get(l.id) ?? [],
  }));

  const changeRequestRows: ChangeRequestRow[] = changeRequests.map((r) => ({
    id: r.id,
    lessonOrder: r.lesson.order,
    lessonTitle: r.lesson.title,
    requestedByName: requesterName.get(r.requestedById) ?? "Người dùng",
    content: r.content,
    status: r.status,
    response: r.response,
    createdAt: formatDateVN(r.createdAt),
  }));

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/curriculums"
          className="mb-3 inline-flex items-center gap-1 text-sm text-neutral-500 hover:text-neutral-700"
        >
          <ChevronLeft className="h-4 w-4" /> Quay lại danh sách
        </Link>
        <h1 className="text-2xl font-bold text-neutral-900">
          {curriculum.name}{" "}
          <span className="text-neutral-400">v{curriculum.version}</span>
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Khoá học: <strong>{curriculum.course.name}</strong>
        </p>
      </div>

      <CurriculumForm
        courses={courses}
        curriculum={{
          id: curriculum.id,
          courseId: curriculum.courseId,
          name: curriculum.name,
          description: curriculum.description,
          isActive: curriculum.isActive,
          status: curriculum.status,
        }}
      />

      <CurriculumSessionsForm
        curriculumId={curriculum.id}
        currentCount={activeLessons.length}
        expectedVersions={expectedVersions}
      />

      {/* Khoá gộp (Combo = Sata 1 + Sata 2): nạp nội dung bài từ giáo trình khác,
          ghi đè tại chỗ nên lớp đang chạy không mất liên kết buổi. */}
      <CurriculumMergeForm curriculumId={curriculum.id} currentCount={activeLessons.length} />

      <LessonList
        curriculumId={curriculum.id}
        initialLessons={lessons}
        canManageTraining={canUnlock}
        canAuthor={canAuthor}
      />

      <LessonResources
        lessons={lessonResourceRows}
        availableAssignments={availableAssignments}
        scormEnabled={scormEnabled}
        canActivateScorm={canUnlock}
      />

      <LessonChangeRequests
        requests={changeRequestRows}
        canHandle={canApproveChange}
      />
    </div>
  );
}
