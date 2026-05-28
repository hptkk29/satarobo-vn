"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { getAuditActor } from "@/lib/audit/log";

// =============================================================================
// ADMIN MEDIA — Phase NHÓM 3
// GV upload ảnh lớp (PENDING) + tag học sinh → CENTER_MANAGER duyệt.
// =============================================================================

const ACTIVE_ENROLLMENT = ["CONFIRMED", "STUDYING", "ACTIVE"] as const;

/** Học sinh đang học của 1 lớp — cho form tag. */
export async function getClassStudentsForTag(
  classId: string,
): Promise<{ id: string; name: string }[]> {
  const session = await auth();
  if (!session?.user || !can(session.user, "media:upload")) return [];
  const enr = await db.enrollment.findMany({
    where: { classId, status: { in: [...ACTIVE_ENROLLMENT] } },
    select: { student: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });
  return enr.map((e) => e.student);
}

const uploadSchema = z.object({
  classId: z.string().min(1, "Chọn lớp"),
  fileUrl: z.string().url("File không hợp lệ"),
  fileName: z.string().optional().nullable(),
  caption: z.string().trim().max(1000).optional().nullable(),
  studentIds: z.array(z.string()).optional(),
});

export async function uploadClassMedia(input: {
  classId: string;
  fileUrl: string;
  fileName?: string | null;
  caption?: string | null;
  studentIds?: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!can(session.user, "media:upload")) return { ok: false, error: "Không có quyền" };

  const parsed = uploadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const d = parsed.data;
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
      uploadedById: actorId,
      uploadedByName: actorName,
      ...(autoApprove
        ? { approvedById: actorId, approvedByName: actorName, approvedAt: new Date() }
        : {}),
      tags: d.studentIds?.length
        ? { create: d.studentIds.map((studentId) => ({ studentId })) }
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
