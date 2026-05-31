"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getAuditActor } from "@/lib/audit/log";

// =============================================================================
// ADMIN NOTIFICATIONS — Phase NHÓM 3
// Tạo / publish / xoá thông báo cho phụ huynh.
// =============================================================================

const createSchema = z
  .object({
    title: z.string().trim().min(3, "Tiêu đề quá ngắn").max(200),
    body: z.string().trim().min(5, "Nội dung quá ngắn").max(5000),
    audience: z.enum(["ALL_PARENTS", "CENTER", "CLASS", "STUDENT"]),
    centerId: z.string().trim().optional().nullable(),
    classId: z.string().trim().optional().nullable(),
    studentId: z.string().trim().optional().nullable(),
    publish: z.boolean().optional(),
  })
  .refine((d) => d.audience !== "CENTER" || !!d.centerId, {
    message: "Chọn cơ sở",
    path: ["centerId"],
  })
  .refine((d) => d.audience !== "CLASS" || !!d.classId, {
    message: "Chọn lớp",
    path: ["classId"],
  })
  .refine((d) => d.audience !== "STUDENT" || !!d.studentId, {
    message: "Chọn học viên",
    path: ["studentId"],
  });

export async function createNotification(
  input: unknown,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "notifications:manage")) {
    return { ok: false, error: "Không có quyền" };
  }

  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;
  const { actorId, actorName } = getAuditActor(session);

  await db.notification.create({
    data: {
      title: d.title,
      body: d.body,
      audience: d.audience,
      centerId: d.audience === "CENTER" ? d.centerId : null,
      classId: d.audience === "CLASS" ? d.classId : null,
      studentId: d.audience === "STUDENT" ? d.studentId : null,
      isPublished: d.publish ?? true,
      publishedAt: d.publish === false ? null : new Date(),
      createdById: actorId,
      createdByName: actorName,
    },
  });

  revalidatePath("/notifications");
  return { ok: true };
}

export async function toggleNotificationPublish(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "notifications:manage")) {
    return { ok: false, error: "Không có quyền" };
  }

  const n = await db.notification.findUnique({
    where: { id },
    select: { isPublished: true },
  });
  if (!n) return { ok: false, error: "Không tìm thấy" };

  const willPublish = !n.isPublished;
  await db.notification.update({
    where: { id },
    data: {
      isPublished: willPublish,
      ...(willPublish ? { publishedAt: new Date() } : {}),
    },
  });
  revalidatePath("/notifications");
  return { ok: true };
}

export async function deleteNotification(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "notifications:manage")) {
    return { ok: false, error: "Không có quyền" };
  }
  await db.notification.delete({ where: { id } }).catch(() => null);
  revalidatePath("/notifications");
  return { ok: true };
}
