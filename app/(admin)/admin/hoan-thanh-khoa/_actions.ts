"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { scopedDb } from "@/lib/db-scope";
import { resolveActor } from "@/lib/auth/actor";
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

// =============================================================================
// Bulk — hoàn thành khoá hàng loạt theo LỚP. courseId suy từ Class.courseId
// (không hỏi user chọn khoá riêng). Học viên đã có CourseCompletion cho khoá
// này → BỎ QUA (không lỗi). Dùng chung completeCourse() để sinh mã chứng chỉ
// nhất quán với form đơn lẻ.
// =============================================================================

const bulkSchema = z.object({
  classId: z.string().min(1, "Thiếu lớp"),
  studentIds: z.array(z.string().min(1)).min(1, "Chưa chọn học viên nào"),
  finalAssessment: z.string().trim().max(4000).optional().or(z.literal("")),
  finalGrade: z.string().trim().max(50).optional().or(z.literal("")),
});

export type BulkCompleteResult = {
  ok: boolean;
  error?: string;
  created: number;
  skipped: number;
  errors: { studentId: string; error: string }[];
};

export async function bulkCompleteByClass(input: unknown): Promise<BulkCompleteResult> {
  const empty = { created: 0, skipped: 0, errors: [] as { studentId: string; error: string }[] };
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập", ...empty };
  if (!can(session.user, "completions:manage")) return { ok: false, error: "Không có quyền", ...empty };

  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ", ...empty };
  const d = parsed.data;

  // scopedDb: cách ly cơ sở — CENTER_MANAGER không thao tác lớp của CS khác.
  const sdb = scopedDb(await resolveActor(session.user.id));

  // courseId suy từ lớp — không tin tưởng client gửi courseId.
  const klass = await sdb.class.findUnique({
    where: { id: d.classId },
    select: { id: true, courseId: true },
  });
  if (!klass) return { ok: false, error: "Lớp không tồn tại", ...empty };

  let created = 0;
  let skipped = 0;
  const errors: { studentId: string; error: string }[] = [];

  // Dedupe danh sách học viên gửi lên.
  const uniqueIds = Array.from(new Set(d.studentIds));

  for (const studentId of uniqueIds) {
    // Đã hoàn thành khoá này → bỏ qua (không upsert/đè).
    const existing = await sdb.courseCompletion.findUnique({
      where: { studentId_courseId: { studentId, courseId: klass.courseId } },
      select: { id: true },
    });
    if (existing) {
      skipped += 1;
      continue;
    }

    const res = await completeCourse({
      studentId,
      courseId: klass.courseId,
      classId: klass.id,
      finalAssessment: d.finalAssessment || null,
      finalGrade: d.finalGrade || null,
      createdById: session.user.id,
    });
    if (res.ok) created += 1;
    else errors.push({ studentId, error: res.error ?? "Lỗi" });
  }

  revalidatePath("/admin/hoan-thanh-khoa");
  return { ok: true, created, skipped, errors };
}
