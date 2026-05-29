"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertCan } from "@/lib/auth/permissions";
import { revalidatePath } from "next/cache";

type Result = { ok: true } | { ok: false; error: string };

/** FIX 7 — thêm 1 khoá tiên quyết: `courseId` yêu cầu `requiredCourseId`. */
export async function addCoursePrerequisite(
  courseId: string,
  requiredCourseId: string,
): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user.role, "courses:create");
  } catch {
    return { ok: false, error: "Không có quyền cấu hình khoá học" };
  }

  if (!courseId || !requiredCourseId) {
    return { ok: false, error: "Chọn đủ khoá và khoá tiên quyết" };
  }
  if (courseId === requiredCourseId) {
    return { ok: false, error: "Khoá không thể tiên quyết chính nó" };
  }

  // Chặn vòng lặp trực tiếp A→B và B→A.
  const reverse = await db.coursePrerequisite.findUnique({
    where: {
      courseId_requiredCourseId: {
        courseId: requiredCourseId,
        requiredCourseId: courseId,
      },
    },
    select: { id: true },
  });
  if (reverse) {
    return { ok: false, error: "Đã có quan hệ ngược — sẽ tạo vòng lặp tiên quyết" };
  }

  try {
    await db.coursePrerequisite.create({ data: { courseId, requiredCourseId } });
  } catch {
    return { ok: false, error: "Cặp tiên quyết này đã tồn tại hoặc lỗi DB" };
  }
  revalidatePath("/course-prerequisites");
  return { ok: true };
}

/** FIX 7 — xoá 1 khoá tiên quyết. */
export async function removeCoursePrerequisite(id: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  try {
    assertCan(session.user.role, "courses:create");
  } catch {
    return { ok: false, error: "Không có quyền cấu hình khoá học" };
  }
  try {
    await db.coursePrerequisite.delete({ where: { id } });
  } catch {
    return { ok: false, error: "Không xoá được (có thể đã bị xoá)" };
  }
  revalidatePath("/course-prerequisites");
  return { ok: true };
}
