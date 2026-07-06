"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Session } from "next-auth";
import type { LessonChangeStatus, LessonStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { checkPermission } from "@/lib/auth/check-permission";
import { getAuditActor } from "@/lib/audit/log";
import { writeAudit } from "@/lib/audit/audit-log";
import {
  archiveLesson,
  isLessonLocked,
  planResize,
  resizeCurriculum,
  setLessonStatus,
  unarchiveLesson,
  type ResizePlan,
} from "@/lib/lms/curriculum";
import {
  curriculumSchema,
  lessonSchema,
  type CurriculumInput,
  type LessonInput,
} from "@/lib/validators/curriculum";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// Gate sửa giáo trình (curriculum:edit) — trả luôn session để ghi audit.
async function requireRole(): Promise<
  | { ok: true; session: Session }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("curriculum:edit"))) {
    return { ok: false, error: "Không có quyền quản lý giáo trình" };
  }
  return { ok: true, session };
}

// Gate Đào tạo (training:manage = SUPER_ADMIN/TRAINING) — dùng cho UNLOCK buổi
// LOCKED. ⚠️ GIỮ NGUYÊN cho nhánh mở khóa (KHÔNG đổi sang lesson-change:approve).
async function requireTraining(): Promise<
  | { ok: true; session: Session }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("training:manage"))) {
    return { ok: false, error: "Chỉ Đào tạo (quản lý cơ sở) mới có quyền này" };
  }
  return { ok: true, session };
}

// FL W0-NAV-2 (QĐ-T3b) — Gate DUYỆT đề xuất chỉnh bài (lesson-change:approve =
// SUPER_ADMIN/TRAINING/CENTER_MANAGER). TÁCH khỏi training:manage để CM duyệt
// được đề xuất nhưng KHÔNG mở khóa buổi/sửa giáo trình.
async function requireLessonChangeApprove(): Promise<
  | { ok: true; session: Session }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("lesson-change:approve"))) {
    return { ok: false, error: "Không có quyền duyệt đề xuất chỉnh bài" };
  }
  return { ok: true, session };
}

// ──────────────────────────────────────────────────────────────────────────
// Curriculum CRUD
// ──────────────────────────────────────────────────────────────────────────

export async function createCurriculum(
  input: CurriculumInput,
): Promise<Result<{ curriculumId: string }>> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = curriculumSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const dup = await db.curriculum.findUnique({
    where: { courseId_version: { courseId: data.courseId, version: data.version } },
    select: { id: true },
  });
  if (dup) {
    return {
      ok: false,
      error: `Giáo trình v${data.version} đã tồn tại cho khoá học này`,
    };
  }

  try {
    const c = await db.curriculum.create({ data, select: { id: true } });
    revalidatePath("/curriculums");
    return { ok: true, data: { curriculumId: c.id } };
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
}

export async function createCurriculumAndRedirect(input: CurriculumInput) {
  const res = await createCurriculum(input);
  if (!res.ok) return res;
  redirect(`/curriculums/${res.data!.curriculumId}/edit`);
}

export async function updateCurriculum(
  id: string,
  input: CurriculumInput,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = curriculumSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const current = await db.curriculum.findUnique({
    where: { id },
    select: { courseId: true, version: true },
  });
  if (!current) return { ok: false, error: "Giáo trình không tồn tại" };

  if (current.courseId !== data.courseId || current.version !== data.version) {
    const dup = await db.curriculum.findUnique({
      where: {
        courseId_version: { courseId: data.courseId, version: data.version },
      },
      select: { id: true },
    });
    if (dup && dup.id !== id) {
      return {
        ok: false,
        error: `Giáo trình v${data.version} đã tồn tại cho khoá học này`,
      };
    }
  }

  try {
    await db.curriculum.update({ where: { id }, data });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath("/curriculums");
  revalidatePath(`/curriculums/${id}/edit`);
  return { ok: true };
}

export async function deleteCurriculum(id: string): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const count = await db.lesson.count({ where: { curriculumId: id } });
  if (count > 0) {
    return {
      ok: false,
      error: `Giáo trình có ${count} bài học. Hãy xoá tất cả bài trước.`,
    };
  }

  try {
    await db.curriculum.delete({ where: { id } });
  } catch (err) {
    return {
      ok: false,
      error: `Không xoá được: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/curriculums");
  return { ok: true };
}

export async function deleteCurriculumAndRedirect(id: string): Promise<Result> {
  const res = await deleteCurriculum(id);
  if (!res.ok) return res;
  redirect("/curriculums");
}

// ──────────────────────────────────────────────────────────────────────────
// Lesson CRUD
// ──────────────────────────────────────────────────────────────────────────

export async function createLesson(input: LessonInput): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const curriculum = await db.curriculum.findUnique({
    where: { id: data.curriculumId },
    select: { id: true },
  });
  if (!curriculum) return { ok: false, error: "Giáo trình không tồn tại" };

  const dup = await db.lesson.findUnique({
    where: {
      curriculumId_order: { curriculumId: data.curriculumId, order: data.order },
    },
    select: { id: true },
  });
  if (dup) return { ok: false, error: `Bài ${data.order} đã tồn tại` };

  try {
    await db.lesson.create({ data });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath(`/curriculums/${data.curriculumId}/edit`);
  return { ok: true };
}

export async function updateLesson(
  id: string,
  input: LessonInput,
): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const data = parsed.data;

  const current = await db.lesson.findUnique({
    where: { id },
    select: { curriculumId: true, order: true, status: true, archivedAt: true },
  });
  if (!current) return { ok: false, error: "Bài học không tồn tại" };

  // R7-10 — buổi LOCKED chặn sửa nội dung (T4); buổi đã archive là đọc-only.
  if (isLessonLocked(current.status)) {
    return { ok: false, error: "Buổi đang KHÓA — yêu cầu Đào tạo mở khóa trước khi sửa" };
  }
  if (current.archivedAt) {
    return { ok: false, error: "Buổi đã lưu trữ (đọc-only) — khôi phục trước khi sửa" };
  }

  if (current.order !== data.order) {
    const dup = await db.lesson.findUnique({
      where: {
        curriculumId_order: {
          curriculumId: data.curriculumId,
          order: data.order,
        },
      },
      select: { id: true },
    });
    if (dup && dup.id !== id) {
      return { ok: false, error: `Bài ${data.order} đã tồn tại` };
    }
  }

  try {
    await db.lesson.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath(`/curriculums/${data.curriculumId}/edit`);
  return { ok: true };
}

export async function deleteLesson(id: string): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const lesson = await db.lesson.findUnique({
    where: { id },
    select: { curriculumId: true },
  });
  if (!lesson) return { ok: false, error: "Bài học không tồn tại" };

  try {
    await db.lesson.delete({ where: { id } });
  } catch (err) {
    return {
      ok: false,
      error: `Không xoá được: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath(`/curriculums/${lesson.curriculumId}/edit`);
  return { ok: true };
}

// Reorder via 2-pass to avoid violating the unique (curriculumId, order)
// constraint mid-transaction.
export async function reorderLessons({
  curriculumId,
  lessonIds,
}: {
  curriculumId: string;
  lessonIds: string[];
}): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  if (!Array.isArray(lessonIds) || lessonIds.length === 0) {
    return { ok: false, error: "Danh sách bài học rỗng" };
  }

  // Verify all lessons belong to the curriculum to avoid foreign-curriculum tampering.
  const found = await db.lesson.findMany({
    where: { id: { in: lessonIds }, curriculumId },
    select: { id: true },
  });
  if (found.length !== lessonIds.length) {
    return { ok: false, error: "Có bài học không thuộc giáo trình này" };
  }

  try {
    await db.$transaction(async (tx) => {
      for (let i = 0; i < lessonIds.length; i++) {
        await tx.lesson.update({
          where: { id: lessonIds[i] },
          data: { order: -(i + 1) },
        });
      }
      for (let i = 0; i < lessonIds.length; i++) {
        await tx.lesson.update({
          where: { id: lessonIds[i] },
          data: { order: i + 1 },
        });
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: `Reorder thất bại: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath(`/curriculums/${curriculumId}/edit`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// R7-10 — Resize N buổi (AC1/AC2/C5)
// ──────────────────────────────────────────────────────────────────────────

/** Xem trước kế hoạch resize (cho modal liệt kê buổi sẽ loại). Read-only. */
export async function previewResizeCurriculum(
  curriculumId: string,
  targetN: number,
): Promise<Result<ResizePlan>> {
  const gate = await requireRole();
  if (!gate.ok) return gate;
  const plan = await planResize(curriculumId, targetN);
  return { ok: true, data: plan };
}

/**
 * Áp dụng resize. Tăng → append; giảm → soft-archive (cần confirm nếu có link,
 * chặn nếu IN_USE). expectedVersions để optimistic-lock (2 resize song song).
 */
export async function applyResizeCurriculum(input: {
  curriculumId: string;
  targetN: number;
  confirm?: boolean;
  expectedVersions?: Record<string, number>;
}): Promise<Result<{ created: number; archived: number }>> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const res = await resizeCurriculum({
    curriculumId: input.curriculumId,
    targetN: input.targetN,
    confirm: input.confirm,
    expectedVersions: input.expectedVersions,
  });
  if (!res.ok) return { ok: false, error: res.message };

  const { actorId, actorName } = getAuditActor(gate.session);
  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "curriculum",
    entityType: "Curriculum",
    entityId: input.curriculumId,
    action: "RESIZE",
    newValues: {
      target: res.plan.target,
      previous: res.plan.current,
      created: res.created,
      archived: res.archived,
    },
  });

  revalidatePath(`/curriculums/${input.curriculumId}/edit`);
  return { ok: true, data: { created: res.created, archived: res.archived } };
}

// ──────────────────────────────────────────────────────────────────────────
// R7-10 — Trạng thái buổi + khóa/mở khóa (AC3)
// ──────────────────────────────────────────────────────────────────────────

export async function setLessonStatusAction(input: {
  lessonId: string;
  status: LessonStatus;
}): Promise<Result> {
  const current = await db.lesson.findUnique({
    where: { id: input.lessonId },
    select: { curriculumId: true, status: true },
  });
  if (!current) return { ok: false, error: "Bài học không tồn tại" };

  // Rời trạng thái LOCKED (mở khóa) chỉ Đào tạo. Các chuyển trạng thái khác:
  // curriculum:edit là đủ. Đặt LOCKED cũng cho curriculum:edit.
  const unlocking = isLessonLocked(current.status) && input.status !== "LOCKED";
  const gate = unlocking ? await requireTraining() : await requireRole();
  if (!gate.ok) return gate;

  const { actorId, actorName } = getAuditActor(gate.session);
  await setLessonStatus({ lessonId: input.lessonId, status: input.status, actorId });

  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "curriculum",
    entityType: "Lesson",
    entityId: input.lessonId,
    action: unlocking ? "UNLOCK" : "STATUS_CHANGE",
    oldValues: { status: current.status },
    newValues: { status: input.status },
  });

  revalidatePath(`/curriculums/${current.curriculumId}/edit`);
  return { ok: true };
}

export async function archiveLessonAction(lessonId: string): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const current = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { curriculumId: true, status: true },
  });
  if (!current) return { ok: false, error: "Bài học không tồn tại" };

  const res = await archiveLesson({ lessonId });
  if (!res.ok) return { ok: false, error: res.message };

  const { actorId, actorName } = getAuditActor(gate.session);
  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "curriculum",
    entityType: "Lesson",
    entityId: lessonId,
    action: "ARCHIVE",
  });

  revalidatePath(`/curriculums/${current.curriculumId}/edit`);
  return { ok: true };
}

export async function unarchiveLessonAction(lessonId: string): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const current = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { curriculumId: true },
  });
  if (!current) return { ok: false, error: "Bài học không tồn tại" };

  const res = await unarchiveLesson({ lessonId });
  if (!res.ok) return { ok: false, error: res.message };

  const { actorId, actorName } = getAuditActor(gate.session);
  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "curriculum",
    entityType: "Lesson",
    entityId: lessonId,
    action: "UNARCHIVE",
  });

  revalidatePath(`/curriculums/${current.curriculumId}/edit`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// R7-10 — LessonChangeRequest: GV gửi đề xuất → Đào tạo xử lý (AC4)
// ──────────────────────────────────────────────────────────────────────────

/** GV gửi đề xuất chỉnh sửa buổi (gate questions:author). */
export async function submitLessonChangeRequest(input: {
  lessonId: string;
  content: string;
}): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("questions:author"))) {
    return { ok: false, error: "Không có quyền gửi đề xuất" };
  }

  const content = input.content.trim();
  if (content.length < 5) {
    return { ok: false, error: "Nội dung đề xuất quá ngắn (≥ 5 ký tự)" };
  }

  const lesson = await db.lesson.findUnique({
    where: { id: input.lessonId },
    select: { id: true, curriculumId: true },
  });
  if (!lesson) return { ok: false, error: "Bài học không tồn tại" };

  const cr = await db.lessonChangeRequest.create({
    data: { lessonId: input.lessonId, requestedById: session.user.id, content },
    select: { id: true },
  });

  const { actorId, actorName } = getAuditActor(session);
  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "curriculum",
    entityType: "LessonChangeRequest",
    entityId: cr.id,
    action: "CREATE",
    newValues: { lessonId: input.lessonId, content },
  });

  revalidatePath(`/curriculums/${lesson.curriculumId}/edit`);
  return { ok: true };
}

/**
 * Duyệt đề xuất: ACCEPTED/REJECTED + phản hồi.
 * FL W0-NAV-2 (QĐ-T3b) — gate đổi training:manage → lesson-change:approve
 * (SUPER_ADMIN/TRAINING/CENTER_MANAGER). Unlock buổi vẫn dùng training:manage.
 */
export async function handleLessonChangeRequest(input: {
  requestId: string;
  decision: Extract<LessonChangeStatus, "ACCEPTED" | "REJECTED">;
  response?: string;
}): Promise<Result> {
  const gate = await requireLessonChangeApprove();
  if (!gate.ok) return gate;

  if (input.decision !== "ACCEPTED" && input.decision !== "REJECTED") {
    return { ok: false, error: "Quyết định không hợp lệ" };
  }

  const cr = await db.lessonChangeRequest.findUnique({
    where: { id: input.requestId },
    select: { id: true, status: true, lesson: { select: { curriculumId: true } } },
  });
  if (!cr) return { ok: false, error: "Đề xuất không tồn tại" };
  if (cr.status !== "OPEN") {
    return { ok: false, error: "Đề xuất đã được xử lý" };
  }

  const { actorId, actorName } = getAuditActor(gate.session);
  await db.lessonChangeRequest.update({
    where: { id: input.requestId },
    data: {
      status: input.decision,
      response: input.response?.trim() || null,
      handledById: actorId,
    },
  });

  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "curriculum",
    entityType: "LessonChangeRequest",
    entityId: input.requestId,
    action: input.decision,
    newValues: { response: input.response?.trim() || null },
  });

  revalidatePath(`/curriculums/${cr.lesson.curriculumId}/edit`);
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// FL1-02 (US-LMS-1 AC2) — Gắn/gỡ Assignment SẴN CÓ vào buổi qua Assignment.lessonId
//   (KHÔNG xây AssignmentTemplate — đó là lane LMS-E). Chỉ liên kết bài tập đã
//   tồn tại; SCORM gắn-buổi tái dùng activateForLesson ở /admin/scorm.
// ──────────────────────────────────────────────────────────────────────────

/** Gắn 1 bài tập (đã có) vào buổi. Gate curriculum:edit. */
export async function attachAssignmentToLesson(input: {
  lessonId: string;
  assignmentId: string;
}): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  const { lessonId, assignmentId } = input;
  if (!lessonId || !assignmentId) return { ok: false, error: "Thiếu tham số" };

  const lesson = await db.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, curriculumId: true, curriculum: { select: { courseId: true } } },
  });
  if (!lesson) return { ok: false, error: "Bài học không tồn tại" };

  const assignment = await db.assignment.findUnique({
    where: { id: assignmentId },
    select: { id: true, lessonId: true, class: { select: { courseId: true } } },
  });
  if (!assignment) return { ok: false, error: "Bài tập không tồn tại" };
  if (assignment.lessonId && assignment.lessonId !== lessonId) {
    return { ok: false, error: "Bài tập đang gắn buổi khác — gỡ trước khi gắn lại" };
  }
  // Chỉ cho gắn bài tập cùng khoá học với giáo trình (tránh gắn nhầm chéo khoá).
  if (assignment.class.courseId !== lesson.curriculum.courseId) {
    return { ok: false, error: "Bài tập thuộc khoá học khác với giáo trình này" };
  }

  try {
    await db.assignment.update({ where: { id: assignmentId }, data: { lessonId } });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  const { actorId, actorName } = getAuditActor(gate.session);
  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "curriculum",
    entityType: "Assignment",
    entityId: assignmentId,
    action: "UPDATE",
    newValues: { lessonId },
  });

  revalidatePath(`/curriculums/${lesson.curriculumId}/edit`);
  return { ok: true };
}

/** Gỡ bài tập khỏi buổi (Assignment.lessonId = null). Gate curriculum:edit. */
export async function detachAssignmentFromLesson(input: {
  assignmentId: string;
}): Promise<Result> {
  const gate = await requireRole();
  if (!gate.ok) return gate;

  if (!input.assignmentId) return { ok: false, error: "Thiếu tham số" };

  const assignment = await db.assignment.findUnique({
    where: { id: input.assignmentId },
    select: { id: true, lessonId: true, lesson: { select: { curriculumId: true } } },
  });
  if (!assignment) return { ok: false, error: "Bài tập không tồn tại" };
  if (!assignment.lessonId) return { ok: true }; // đã rời buổi — không làm gì.

  try {
    await db.assignment.update({
      where: { id: input.assignmentId },
      data: { lessonId: null },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi cơ sở dữ liệu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  const { actorId, actorName } = getAuditActor(gate.session);
  await writeAudit({
    actor: { id: actorId, name: actorName },
    module: "curriculum",
    entityType: "Assignment",
    entityId: input.assignmentId,
    action: "UPDATE",
    oldValues: { lessonId: assignment.lessonId },
    newValues: { lessonId: null },
  });

  const curriculumId = assignment.lesson?.curriculumId;
  if (curriculumId) revalidatePath(`/curriculums/${curriculumId}/edit`);
  return { ok: true };
}
