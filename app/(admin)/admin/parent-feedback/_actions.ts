"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { db } from "@/lib/db";
import { resolveActor } from "@/lib/auth/actor";
import { passesScope } from "@/lib/db-scope";

// P1-g — admin phản hồi lại đánh giá phụ huynh.
const schema = z.object({
  id: z.string().min(1),
  response: z.string().trim().min(1, "Nhập nội dung phản hồi").max(2000),
});

export async function respondToFeedback(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!(await checkPermission("parent-feedback:view"))) return { ok: false, error: "Không có quyền" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };

  // Cách ly cơ sở (best-effort): ParentFeedback.studentId là cột phẳng (không FK).
  // Nếu có gắn HV → HV phải thuộc tầm nhìn actor; feedback ẩn danh (studentId=null) → cho qua.
  const fb = await db.parentFeedback.findUnique({
    where: { id: parsed.data.id },
    select: { studentId: true },
  });
  if (!fb) return { ok: false, error: "Không tìm thấy đánh giá" };
  if (fb.studentId && session.user.id) {
    const actor = await resolveActor(session.user.id);
    if (!actor.isSuperAdmin && !actor.isHoLevel) {
      const st = await db.student.findUnique({
        where: { id: fb.studentId },
        select: { centerId: true },
      });
      if (st && !passesScope("Student", st, actor)) {
        return { ok: false, error: "Không tìm thấy đánh giá" };
      }
    }
  }

  await db.parentFeedback.update({
    where: { id: parsed.data.id },
    data: {
      adminResponse: parsed.data.response,
      respondedById: session.user.id ?? null,
      respondedAt: new Date(),
    },
  });
  revalidatePath("/parent-feedback");
  return { ok: true };
}
