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

// ── LMS-3 — checklist sau buổi ────────────────────────────────────────────

const PRESENT_STATUSES = ["PRESENT", "LATE"] as const;

async function loadSessionForGate(sessionId: string) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Chưa đăng nhập" };
  const sess = await db.classSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      lessonId: true,
      class: { select: { id: true, teacherId: true, assistantId: true, centerId: true } },
    },
  });
  if (!sess) return { ok: false as const, error: "Buổi học không tồn tại" };
  const allowed = await canManageSessionClass(
    { id: session.user.id, role: session.user.role, centerId: session.user.centerId },
    sess.class,
  );
  if (!allowed) return { ok: false as const, error: "Không có quyền thao tác buổi học này" };
  return { ok: true as const, sess };
}

/** Tính 2 bước suy ra: điểm danh xong + đã nhận xét HS có mặt. */
async function deriveSteps(sessionId: string): Promise<{ ckAttendance: boolean; ckFeedback: boolean }> {
  const [attCount, presentRows, feedbackRows] = await Promise.all([
    db.attendance.count({ where: { sessionId } }),
    db.attendance.findMany({
      where: { sessionId, status: { in: [...PRESENT_STATUSES] } },
      select: { studentId: true },
    }),
    db.studentSessionFeedback.findMany({
      where: { classSessionId: sessionId },
      select: { studentId: true },
    }),
  ]);
  const fbSet = new Set(feedbackRows.map((f) => f.studentId));
  const ckFeedback =
    presentRows.length === 0 ? false : presentRows.every((p) => fbSet.has(p.studentId));
  return { ckAttendance: attCount > 0, ckFeedback };
}

const checklistSchema = z.object({
  sessionId: z.string().min(1),
  ckLessonConfirmed: z.boolean(),
  ckMedia: z.boolean(),
  ckHomework: z.boolean(),
  ckIncident: z.boolean(),
  incidentNote: z.string().trim().max(3000).optional().or(z.literal("")),
});

/** Lưu các bước thủ công + đồng bộ 2 bước suy ra. */
export async function updateSessionChecklist(input: unknown): Promise<Result> {
  const parsed = checklistSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const gate = await loadSessionForGate(parsed.data.sessionId);
  if (!gate.ok) return gate;

  const derived = await deriveSteps(parsed.data.sessionId);
  try {
    await db.classSession.update({
      where: { id: parsed.data.sessionId },
      data: {
        ckLessonConfirmed: parsed.data.ckLessonConfirmed,
        ckMedia: parsed.data.ckMedia,
        ckHomework: parsed.data.ckHomework,
        ckIncident: parsed.data.ckIncident,
        incidentNote: parsed.data.incidentNote || null,
        ckAttendance: derived.ckAttendance,
        ckFeedback: derived.ckFeedback,
      },
    });
  } catch (err) {
    return { ok: false, error: `Lỗi lưu checklist: ${err instanceof Error ? err.message : "Unknown"}` };
  }
  revalidatePath(`/sessions/${parsed.data.sessionId}`);
  return { ok: true };
}

/** Bắt đầu buổi học. */
export async function startSession(sessionId: string): Promise<Result> {
  const gate = await loadSessionForGate(sessionId);
  if (!gate.ok) return gate;
  await db.classSession.update({
    where: { id: sessionId },
    data: { status: "IN_PROGRESS", startedAt: new Date() },
  });
  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}

/** Hoàn tất buổi — chỉ khi (1) điểm danh, (2) xác nhận bài, (3) nhận xét đã xong. */
export async function completeSession(sessionId: string): Promise<Result> {
  const gate = await loadSessionForGate(sessionId);
  if (!gate.ok) return gate;

  const derived = await deriveSteps(sessionId);
  const sess = await db.classSession.findUnique({
    where: { id: sessionId },
    select: { ckLessonConfirmed: true },
  });
  if (!derived.ckAttendance) return { ok: false, error: "Chưa điểm danh — không thể hoàn tất" };
  if (!sess?.ckLessonConfirmed) return { ok: false, error: "Chưa xác nhận bài đã dạy" };
  if (!derived.ckFeedback) {
    return { ok: false, error: "Chưa nhận xét đủ học sinh có mặt" };
  }

  await db.classSession.update({
    where: { id: sessionId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      ckAttendance: true,
      ckFeedback: true,
    },
  });
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
