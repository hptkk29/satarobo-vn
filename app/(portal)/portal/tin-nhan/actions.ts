"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { assertOwnsStudent } from "@/lib/portal/session";
import { postMessage } from "@/lib/conversation/service";

// =============================================================================
// PORTAL — LMS-15: PH gửi tin nhắn vào luồng của 1 enrollment (của con mình).
// Ownership BẮT BUỘC: enrollment phải thuộc con của PH đang đăng nhập
// (assertOwnsStudent). KHÔNG lộ studentId trên URL — chỉ dùng enrollmentId.
// =============================================================================

const sendSchema = z.object({
  enrollmentId: z.string().min(1),
  body: z.string().trim().min(1, "Vui lòng nhập nội dung").max(2000, "Tin nhắn tối đa 2000 ký tự"),
});

export async function sendParentMessage(input: {
  enrollmentId: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") {
    return { ok: false, error: "Chưa đăng nhập" };
  }

  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  // Ownership: enrollment → student → phải là con của PH đang đăng nhập.
  const enr = await db.enrollment.findUnique({
    where: { id: parsed.data.enrollmentId },
    select: { studentId: true },
  });
  if (!enr || !(await assertOwnsStudent(enr.studentId))) {
    return { ok: false, error: "Không có quyền gửi tin nhắn cho học viên này" };
  }

  try {
    await postMessage({
      enrollmentId: parsed.data.enrollmentId,
      authorUserId: session.user.id,
      authorSide: "PARENT",
      body: parsed.data.body,
    });
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Lỗi gửi tin nhắn" };
  }

  revalidatePath("/portal/tin-nhan");
  return { ok: true };
}
