"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { completeCourse } from "@/lib/completion/service";

// B4 — đánh dấu hoàn thành khoá + đánh giá cuối khoá (GV/quản lý).

const schema = z.object({
  studentId: z.string().min(1, "Thiếu học viên"),
  courseId: z.string().min(1, "Thiếu khoá"),
  classId: z.string().optional().or(z.literal("")),
  finalAssessment: z.string().trim().max(4000).optional().or(z.literal("")),
  finalGrade: z.string().trim().max(50).optional().or(z.literal("")),
});

export async function markCourseCompletion(
  input: unknown,
): Promise<{ ok: boolean; error?: string; certificateCode?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "completions:manage")) return { ok: false, error: "Không có quyền" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  const d = parsed.data;

  const res = await completeCourse({
    studentId: d.studentId,
    courseId: d.courseId,
    classId: d.classId || null,
    finalAssessment: d.finalAssessment || null,
    finalGrade: d.finalGrade || null,
    createdById: session.user.id,
  });
  if (!res.ok) return { ok: false, error: res.error };

  revalidatePath("/admin/hoan-thanh-khoa");
  return { ok: true, certificateCode: res.certificateCode };
}
