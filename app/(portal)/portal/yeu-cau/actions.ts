"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { requireActiveStudent, assertOwnsStudent } from "@/lib/portal/session";

// =============================================================================
// PORTAL PARENT REQUESTS — Phase NHÓM 3
// Phụ huynh gửi yêu cầu cho con đang chọn (activeSite) + tự huỷ khi còn PENDING.
// =============================================================================

const createSchema = z.object({
  type: z.enum(["ABSENCE", "MAKEUP", "TRANSFER_CLASS", "TRANSFER_CENTER", "RESERVE", "OTHER"]),
  content: z.string().trim().min(5, "Vui lòng mô tả chi tiết hơn").max(2000),
  preferredDate: z.string().optional().nullable(),
  sessionId: z.string().optional().nullable(),
});

export async function createParentRequest(input: {
  type: string;
  content: string;
  preferredDate?: string | null;
  sessionId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { ctx, studentId } = await requireActiveStudent();

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;

  // Báo vắng: buổi phải thuộc lớp con đang học → lấy luôn ngày buổi làm preferredDate.
  let sessionId: string | null = null;
  let sessionDate: Date | null = null;
  if (d.type === "ABSENCE" && d.sessionId) {
    const sess = await db.classSession.findFirst({
      where: {
        id: d.sessionId,
        class: {
          enrollments: {
            some: { studentId, status: { in: ["CONFIRMED", "STUDYING", "ACTIVE"] } },
          },
        },
      },
      select: { id: true, date: true },
    });
    if (!sess) return { ok: false, error: "Buổi học không hợp lệ" };
    sessionId = sess.id;
    sessionDate = sess.date;
  }

  const preferredDate =
    sessionDate ??
    (d.preferredDate && !Number.isNaN(new Date(d.preferredDate).getTime())
      ? new Date(d.preferredDate)
      : null);

  await db.parentRequest.create({
    data: {
      studentId,
      parentUserId: ctx.parentUserId,
      type: d.type,
      content: d.content,
      preferredDate,
      sessionId,
      status: "PENDING",
    },
  });

  revalidatePath("/portal/yeu-cau");
  revalidatePath("/parent-requests");
  return { ok: true };
}

export async function cancelParentRequest(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user || session.user.role !== "PARENT") {
    return { ok: false, error: "Chưa đăng nhập" };
  }

  const req = await db.parentRequest.findUnique({
    where: { id },
    select: { studentId: true, status: true },
  });
  if (!req) return { ok: false, error: "Không tìm thấy yêu cầu" };
  if (!(await assertOwnsStudent(req.studentId))) {
    return { ok: false, error: "Không có quyền" };
  }
  if (req.status !== "PENDING") {
    return { ok: false, error: "Chỉ huỷ được yêu cầu đang chờ xử lý" };
  }

  await db.parentRequest.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  revalidatePath("/portal/yeu-cau");
  revalidatePath("/parent-requests");
  return { ok: true };
}
