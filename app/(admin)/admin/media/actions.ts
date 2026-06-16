"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getAuditActor } from "@/lib/audit/log";
import { ENROLLMENT_ACTIVE_STATUS_LIST } from "@/lib/enrollment-status";

// =============================================================================
// ADMIN MEDIA — Phase NHÓM 3
// GV upload ảnh lớp (PENDING) + tag học sinh → CENTER_MANAGER duyệt.
// =============================================================================

/** Học sinh đang học của 1 lớp — cho form tag. */
export async function getClassStudentsForTag(
  classId: string,
): Promise<{ id: string; name: string }[]> {
  const session = await auth();
  if (!session?.user || !can(session.user, "media:upload")) return [];
  const enr = await db.enrollment.findMany({
    where: { classId, status: { in: ENROLLMENT_ACTIVE_STATUS_LIST } },
    select: { student: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return enr.map((e) => e.student);
}

const uploadSchema = z
  .object({
    classId: z.string().min(1, "Chọn lớp"),
    fileUrl: z.string().url("File không hợp lệ"),
    fileName: z.string().optional().nullable(),
    caption: z.string().trim().max(1000).optional().nullable(),
    studentIds: z.array(z.string()).optional(),
    // Đánh dấu rõ "ảnh chung cả lớp" (#8). Khi true → không gắn thẻ HS cụ thể.
    isClassWide: z.boolean().optional(),
  })
  .refine((v) => v.isClassWide || (v.studentIds?.length ?? 0) > 0, {
    message: "Chọn học viên trong ảnh hoặc đánh dấu 'Ảnh chung cả lớp'",
    path: ["studentIds"],
  });

export async function uploadClassMedia(input: {
  classId: string;
  fileUrl: string;
  fileName?: string | null;
  caption?: string | null;
  studentIds?: string[];
  isClassWide?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "media:upload")) return { ok: false, error: "Không có quyền" };

  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;
  // Class-wide & tag theo HS là loại trừ nhau: class-wide thì bỏ qua studentIds.
  const isClassWide = !!d.isClassWide;
  const tagIds = isClassWide ? [] : (d.studentIds ?? []);
  const { actorId, actorName } = getAuditActor(session);
  // GV upload → PENDING; manager upload → APPROVED luôn.
  const autoApprove = can(session.user, "media:approve");

  await db.classSessionMedia.create({
    data: {
      classId: d.classId,
      fileUrl: d.fileUrl,
      fileName: d.fileName || null,
      caption: d.caption || null,
      status: autoApprove ? "APPROVED" : "PENDING",
      isClassWide,
      uploadedById: actorId,
      uploadedByName: actorName,
      ...(autoApprove
        ? { approvedById: actorId, approvedByName: actorName, approvedAt: new Date() }
        : {}),
      tags: tagIds.length
        ? { create: tagIds.map((studentId) => ({ studentId })) }
        : undefined,
    },
  });

  revalidatePath("/media");
  return { ok: true };
}

export async function reviewMedia(input: {
  id: string;
  decision: "APPROVED" | "REJECTED";
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "media:approve")) return { ok: false, error: "Không có quyền duyệt" };

  const { actorId, actorName } = getAuditActor(session);
  await db.classSessionMedia.update({
    where: { id: input.id },
    data: {
      status: input.decision,
      approvedById: actorId,
      approvedByName: actorName,
      approvedAt: new Date(),
    },
  });
  revalidatePath("/media");
  revalidatePath("/portal/hinh-anh");
  return { ok: true };
}

export async function deleteMedia(id: string): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "media:approve")) return { ok: false, error: "Không có quyền" };
  await db.classSessionMedia.delete({ where: { id } }).catch(() => null);
  revalidatePath("/media");
  return { ok: true };
}
