"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { TeacherRank, EmploymentType, TeacherStatus } from "@prisma/client";

type Result = { ok: true } | { ok: false; error: string };

const MANAGER_ROLES = ["SUPER_ADMIN", "CENTER_MANAGER"] as const;

// Gác quyền quản lý GV: SUPER_ADMIN toàn quyền; CENTER_MANAGER chỉ trong cơ sở mình.
async function requireTeacherManager(targetUserId: string) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Chưa đăng nhập" };
  const role = session.user.role;
  if (!MANAGER_ROLES.includes(role as (typeof MANAGER_ROLES)[number])) {
    return { ok: false as const, error: "Không có quyền quản lý giáo viên" };
  }
  if (role === "CENTER_MANAGER") {
    const target = await db.user.findUnique({
      where: { id: targetUserId },
      select: { centerId: true },
    });
    if (!target || target.centerId !== session.user.centerId) {
      return { ok: false as const, error: "Giáo viên không thuộc cơ sở của bạn" };
    }
  }
  return { ok: true as const, session };
}

const profileSchema = z.object({
  userId: z.string().min(1),
  rank: z.nativeEnum(TeacherRank),
  employmentType: z.nativeEnum(EmploymentType),
  status: z.nativeEnum(TeacherStatus),
  bio: z.string().trim().max(2000).optional().or(z.literal("")),
  courseIds: z.array(z.string().min(1)).max(50),
});

/** FIX 10 phần 1 — lưu hồ sơ chuyên môn + khoá dạy được. */
export async function updateTeacherProfile(input: unknown): Promise<Result> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { userId, rank, employmentType, status, bio, courseIds } = parsed.data;

  const gate = await requireTeacherManager(userId);
  if (!gate.ok) return gate;

  // Xác nhận user là TEACHER.
  const teacher = await db.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!teacher || teacher.role !== "TEACHER") {
    return { ok: false, error: "User không phải giáo viên" };
  }

  try {
    await db.$transaction(async (tx) => {
      const profile = await tx.teacherProfile.upsert({
        where: { userId },
        update: { rank, employmentType, status, bio: bio || null },
        create: { userId, rank, employmentType, status, bio: bio || null },
        select: { id: true },
      });
      // Thay toàn bộ khoá dạy được.
      await tx.teacherCourse.deleteMany({ where: { teacherProfileId: profile.id } });
      if (courseIds.length > 0) {
        await tx.teacherCourse.createMany({
          data: courseIds.map((courseId) => ({
            teacherProfileId: profile.id,
            courseId,
          })),
          skipDuplicates: true,
        });
      }
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi lưu hồ sơ: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  revalidatePath("/teachers");
  revalidatePath(`/teachers/${userId}`);
  return { ok: true };
}

// ── PHẦN 2 — phân công lớp ────────────────────────────────────────────────

const assignSchema = z.object({
  classId: z.string().min(1),
  teacherUserId: z.string().min(1),
  as: z.enum(["teacher", "assistant"]),
});

/** Gán GV làm GV chính / trợ giảng cho 1 lớp. */
export async function assignClassToTeacher(input: unknown): Promise<Result> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { classId, teacherUserId, as } = parsed.data;

  const gate = await requireTeacherManager(teacherUserId);
  if (!gate.ok) return gate;

  const cls = await db.class.findFirst({
    where: { id: classId, deletedAt: null },
    select: { id: true, centerId: true },
  });
  if (!cls) return { ok: false, error: "Lớp không tồn tại" };
  if (gate.session.user.role === "CENTER_MANAGER" && cls.centerId !== gate.session.user.centerId) {
    return { ok: false, error: "Lớp không thuộc cơ sở của bạn" };
  }

  try {
    await db.class.update({
      where: { id: classId },
      data: as === "teacher" ? { teacherId: teacherUserId } : { assistantId: teacherUserId },
    });
  } catch (err) {
    return { ok: false, error: `Lỗi gán lớp: ${err instanceof Error ? err.message : "Unknown"}` };
  }

  revalidatePath(`/teachers/${teacherUserId}`);
  revalidatePath("/teachers");
  revalidatePath(`/classes/${classId}/edit`);
  return { ok: true };
}

const unassignSchema = z.object({
  classId: z.string().min(1),
  teacherUserId: z.string().min(1),
  as: z.enum(["teacher", "assistant"]),
});

/** Gỡ GV khỏi lớp (chính / trợ giảng). */
export async function unassignClassFromTeacher(input: unknown): Promise<Result> {
  const parsed = unassignSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { classId, teacherUserId, as } = parsed.data;

  const gate = await requireTeacherManager(teacherUserId);
  if (!gate.ok) return gate;

  const cls = await db.class.findUnique({
    where: { id: classId },
    select: { centerId: true, teacherId: true, assistantId: true },
  });
  if (!cls) return { ok: false, error: "Lớp không tồn tại" };
  if (gate.session.user.role === "CENTER_MANAGER" && cls.centerId !== gate.session.user.centerId) {
    return { ok: false, error: "Lớp không thuộc cơ sở của bạn" };
  }

  try {
    await db.class.update({
      where: { id: classId },
      data: as === "teacher" ? { teacherId: null } : { assistantId: null },
    });
  } catch (err) {
    return { ok: false, error: `Lỗi gỡ lớp: ${err instanceof Error ? err.message : "Unknown"}` };
  }

  revalidatePath(`/teachers/${teacherUserId}`);
  revalidatePath("/teachers");
  revalidatePath(`/classes/${classId}/edit`);
  return { ok: true };
}
