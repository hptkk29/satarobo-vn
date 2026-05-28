"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getAuditActor } from "@/lib/audit/log";

// =============================================================================
// ADMIN PARENT REQUESTS — Phase NHÓM 3
// Duyệt / từ chối yêu cầu phụ huynh. KHÔNG tự động thực thi nghiệp vụ (chuyển
// lớp/bảo lưu) — staff xử lý thủ công ở module tương ứng rồi đánh dấu APPROVED.
// =============================================================================

const handleSchema = z.object({
  id: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED"]),
  response: z.string().trim().max(2000).optional().nullable(),
});

export async function handleParentRequest(input: {
  id: string;
  decision: "APPROVED" | "REJECTED";
  response?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "parent-requests:manage")) {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = handleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }

  const req = await db.parentRequest.findUnique({
    where: { id: parsed.data.id },
    select: { status: true },
  });
  if (!req) return { ok: false, error: "Không tìm thấy yêu cầu" };
  if (req.status !== "PENDING") {
    return { ok: false, error: "Yêu cầu đã được xử lý" };
  }

  const { actorId, actorName } = getAuditActor(session);
  await db.parentRequest.update({
    where: { id: parsed.data.id },
    data: {
      status: parsed.data.decision,
      response: parsed.data.response?.trim() || null,
      handledById: actorId,
      handledByName: actorName,
      handledAt: new Date(),
    },
  });

  revalidatePath("/parent-requests");
  revalidatePath("/portal/yeu-cau");
  return { ok: true };
}
