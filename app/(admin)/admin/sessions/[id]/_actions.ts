"use server";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

type Result = { ok: true } | { ok: false; error: string };

type ClassGate = {
  teacherId: string | null;
  assistantId: string | null;
  centerId: string | null;
};

/**
 * LMS-2/3 — quyền thao tác trên 1 buổi học của lớp: SUPER_ADMIN, CENTER_MANAGER
 * cùng cơ sở, hoặc GV chính/trợ giảng của lớp.
 */
export async function canManageSessionClass(
  user: { id: string; role: string; centerId: string | null },
  cls: ClassGate,
): Promise<boolean> {
  if (user.role === "SUPER_ADMIN") return true;
  if (user.role === "CENTER_MANAGER") return !!cls.centerId && cls.centerId === user.centerId;
  if (user.role === "TEACHER") return cls.teacherId === user.id || cls.assistantId === user.id;
  return false;
}

const feedbackSchema = z.object({
  sessionId: z.string().min(1),
  items: z
    .array(
      z.object({
        studentId: z.string().min(1),
        comment: z.string().trim().max(3000),
        rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
      }),
    )
    .max(100),
});

/** LMS-2 — lưu hàng loạt nhận xét từng HS cho 1 buổi. */
export async function saveSessionFeedback(input: unknown): Promise<Result> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { sessionId, items } = parsed.data;

  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };

  const sess = await db.classSession.findUnique({
    where: { id: sessionId },
    select: { id: true, class: { select: { teacherId: true, assistantId: true, centerId: true } } },
  });
  if (!sess) return { ok: false, error: "Buổi học không tồn tại" };

  const allowed = await canManageSessionClass(
    { id: session.user.id, role: session.user.role, centerId: session.user.centerId },
    sess.class,
  );
  if (!allowed) return { ok: false, error: "Không có quyền nhận xét buổi học này" };

  try {
    await db.$transaction(
      items.map((it) => {
        const comment = it.comment.trim();
        const rating = it.rating ?? null;
        if (comment.length === 0) {
          // Xoá nhận xét nếu để trống.
          return db.studentSessionFeedback.deleteMany({
            where: { classSessionId: sessionId, studentId: it.studentId },
          });
        }
        return db.studentSessionFeedback.upsert({
          where: { classSessionId_studentId: { classSessionId: sessionId, studentId: it.studentId } },
          update: { comment, rating, createdById: session.user.id },
          create: {
            classSessionId: sessionId,
            studentId: it.studentId,
            comment,
            rating,
            createdById: session.user.id,
          },
        });
      }),
    );
  } catch (err) {
    return { ok: false, error: `Lỗi lưu nhận xét: ${err instanceof Error ? err.message : "Unknown"}` };
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}
