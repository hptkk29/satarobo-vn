// app/(teacher)/teacher/hoan-thanh/_actions.ts — Đề xuất hoàn thành khoá (site GV).
// proposeCourseCompletion: GV đề xuất (own-class) → CourseCompletionRequest PENDING.
// reviewCourseCompletion: CENTER_MANAGER duyệt đề xuất của các cơ sở MÌNH ĐANG QUẢN LÝ
// → tạo CourseCompletion (UI quản lý ở admin — action sẵn sàng). GV KHÔNG tự xác nhận
// hoàn thành (completions:manage). Review-scope qua `roleManagesCenter` — xem tại chỗ kiểm.
"use server";

import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { roleManagesCenter } from "@/lib/auth/managed-centers";
import { scopedDb } from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkPermission } from "@/lib/auth/check-permission";
import { hasRole } from "@/lib/auth/permissions";
import { completeCourse } from "@/lib/completion/service";

type Result = { ok: true } | { ok: false; error: string };

const proposeSchema = z.object({
  enrollmentId: z.string().min(1),
  note: z.string().max(1000).optional().nullable(),
});

export async function proposeCourseCompletion(input: unknown): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("completions:propose-own"))) {
    return { ok: false, error: "Không có quyền đề xuất hoàn thành khoá" };
  }
  const parsed = proposeSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const { enrollmentId, note } = parsed.data;

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const classIds = [...actor.assignedClassIds];

  // Own-class + thông tin ghi danh đọc QUA quan hệ class (enrollment dev centerId=null
  // bị scopedDb lọc nếu query thẳng).
  const clsMatch = classIds.length
    ? await sdb.class.findMany({
        where: { id: { in: classIds } },
        select: {
          centerId: true,
          enrollments: {
            where: { id: enrollmentId, deletedAt: null },
            select: {
              studentId: true,
              courseId: true,
              course: { select: { nextCourseId: true } },
            },
          },
        },
      })
    : [];
  const hit = clsMatch.find((c) => c.enrollments.length > 0);
  if (!hit)
    return { ok: false, error: "Ghi danh không thuộc lớp bạn phụ trách" };
  const enr = hit.enrollments[0];

  const [existingCompletion, existingReq] = await Promise.all([
    sdb.courseCompletion.findFirst({
      where: { studentId: enr.studentId, courseId: enr.courseId },
      select: { id: true },
    }),
    sdb.courseCompletionRequest.findFirst({
      where: { enrollmentId, status: "PENDING" },
      select: { id: true },
    }),
  ]);
  if (existingCompletion)
    return { ok: false, error: "Học viên đã hoàn thành khoá này" };
  if (existingReq) return { ok: false, error: "Đã có đề xuất đang chờ duyệt" };

  try {
    await sdb.courseCompletionRequest.create({
      data: {
        enrollmentId,
        studentId: enr.studentId,
        courseId: enr.courseId,
        centerId: hit.centerId,
        requesterId: session.user.id,
        nextCourseId: enr.course.nextCourseId ?? null,
        note: note?.trim() || null,
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi gửi đề xuất: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/teacher/hoan-thanh");
  return { ok: true };
}

const reviewSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  note: z.string().max(1000).optional().nullable(),
});

/**
 * CENTER_MANAGER duyệt đề xuất hoàn thành của cơ sở MÌNH ĐANG QUẢN LÝ — có thể là nhiều
 * cơ sở (SUPER_ADMIN: mọi cơ sở) → tạo CourseCompletion.
 */
export async function reviewCourseCompletion(input: unknown): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  const isSuper = hasRole(session.user, "SUPER_ADMIN");
  if (!isSuper && !hasRole(session.user, "CENTER_MANAGER")) {
    return { ok: false, error: "Không có quyền duyệt" };
  }
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ",
    };
  }
  const { id, decision, note } = parsed.data;

  const actor = await resolveActor(session.user.id);
  const sdb = scopedDb(actor);
  const req = await sdb.courseCompletionRequest.findUnique({
    where: { id },
    select: { status: true, centerId: true, studentId: true, courseId: true },
  });
  if (!req) return { ok: false, error: "Không tìm thấy đề xuất" };
  // ── A-01-6 · bất biến L-A6 (26/08/2026) ────────────────────────────────────────
  // Trước đây: `req.centerId !== (session.user.centerId ?? null)` — so với ĐÚNG MỘT cơ
  // sở neo trên JWT ⇒ quản lý giữ hai cơ sở không duyệt nổi đề xuất của cơ sở thứ hai.
  //
  // Nay đo bằng tập cơ sở người này đang giữ CHÍNH vai `CENTER_MANAGER`
  // (`PermEntry.roleCode` + `PermEntry.centerScope`, tức đúng dòng `UserOrgRole` đẻ ra
  // quyền). Vai đúng ở đây là `CENTER_MANAGER` theo HAI đường độc lập cùng chỉ về nó:
  // cổng vai ngay trên gác `hasRole(session.user, "CENTER_MANAGER")` (→ RoleDef cùng tên,
  // `lib/auth/legacy-role-map.ts:24`), và `completions:manage` — quyền nghiệp vụ của việc
  // này — trong RBAC v2 CHỈ khai ở RoleDef `CENTER_MANAGER` (`prisma/seed-roles.ts:474`;
  // TEACHER bị siết có chủ đích, CENTER_CLASS_MANAGER không có).
  //
  // ⚠️ KHÔNG dùng `actor.visibleCenterIds` (và không AND thêm nó): vế đó nở theo vai KIÊM
  // NHIỆM ⇒ QLCS@CS1 kiêm kế toán/marketing cấp được CHỨNG CHỈ cho học viên cơ sở họ chỉ
  // có quyền XEM. Lý lẽ đầy đủ: khối chú thích đầu `lib/auth/managed-centers.ts`.
  //
  // ⚠️ Cổng GHI phải TỰ kiểm: `CourseCompletionRequest` ∈ `SCOPE_EXEMPT` (lib/db-scope.ts)
  // ⇒ `findUnique` ở trên KHÔNG lọc cơ sở hộ; và nhánh APPROVED bên dưới gọi
  // `completeCourse` (sinh CourseCompletion + mã chứng chỉ) TRƯỚC khi ghi status.
  //
  // Đề xuất chưa gắn cơ sở (`centerId` null — lớp chưa gắn Center) nay TỪ CHỐI với quản
  // lý (fail-closed, chỉ SUPER_ADMIN xử được).
  if (!isSuper && !roleManagesCenter(actor, "CENTER_MANAGER", req.centerId)) {
    return { ok: false, error: "Đề xuất thuộc cơ sở khác" };
  }
  if (req.status !== "PENDING")
    return { ok: false, error: "Đề xuất đã được xử lý" };

  if (decision === "APPROVED") {
    const res = await completeCourse({
      studentId: req.studentId,
      courseId: req.courseId,
      createdById: session.user.id,
    });
    if (!res.ok)
      return { ok: false, error: res.error ?? "Lỗi xác nhận hoàn thành" };
  }

  try {
    await sdb.courseCompletionRequest.update({
      where: { id },
      data: {
        status: decision,
        reviewedById: session.user.id,
        reviewedByName: session.user.name ?? null,
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null,
      },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi duyệt: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }
  revalidatePath("/teacher/hoan-thanh");
  return { ok: true };
}
