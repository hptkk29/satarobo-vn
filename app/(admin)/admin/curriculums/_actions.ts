"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  curriculumSchema,
  lessonSchema,
  type CurriculumInput,
  type LessonInput,
} from "@/lib/validators/curriculum";

type Result<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const ALLOWED_ROLES = ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"] as const;

async function requireRole(): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!ALLOWED_ROLES.includes(session.user.role as (typeof ALLOWED_ROLES)[number])) {
    return { ok: false, error: "Không có quyền quản lý giáo trình" };
  }
  return { ok: true };
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
    select: { curriculumId: true, order: true },
  });
  if (!current) return { ok: false, error: "Bài học không tồn tại" };

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
    await db.lesson.update({ where: { id }, data });
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
