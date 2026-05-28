"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getPortalContext } from "@/lib/portal/session";
import { db } from "@/lib/db";

// Phase NHÓM 3 — phụ huynh gửi đánh giá (gắn với con đang chọn).
const schema = z.object({
  rating: z.number().int().min(1).max(5),
  content: z.string().trim().min(5, "Vui lòng nhập nội dung").max(2000),
});

export async function createParentFeedback(input: {
  rating: number;
  content: string;
}): Promise<{ ok: boolean; error?: string }> {
  const ctx = await getPortalContext();
  if (!ctx) return { ok: false, error: "Chưa đăng nhập" };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  await db.parentFeedback.create({
    data: {
      parentUserId: ctx.parentUserId,
      parentName: ctx.parentName,
      studentId: ctx.activeStudent?.id ?? null,
      studentName: ctx.activeStudent?.name ?? null,
      rating: parsed.data.rating,
      content: parsed.data.content,
    },
  });

  revalidatePath("/portal/danh-gia");
  revalidatePath("/parent-feedback");
  return { ok: true };
}
