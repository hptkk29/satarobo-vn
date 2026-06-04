"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";

// P1-g — admin phản hồi lại đánh giá phụ huynh.
const schema = z.object({
  id: z.string().min(1),
  response: z.string().trim().min(1, "Nhập nội dung phản hồi").max(2000),
});

export async function respondToFeedback(input: unknown): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "parent-feedback:view")) return { ok: false, error: "Không có quyền" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };

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
