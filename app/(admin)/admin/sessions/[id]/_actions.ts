"use server";

import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { enqueueNewFeedback } from "@/lib/email/triggers";
import { hasRole } from "@/lib/auth/permissions";
import { publishEvent } from "@/lib/events/publish";
import { canStartSession, canCompleteSession } from "@/lib/sessions/status";

type Result = { ok: true } | { ok: false; error: string };
type Sdb = ReturnType<typeof scopedDb>;

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
  if (hasRole(user, "SUPER_ADMIN")) return true;
  if (hasRole(user, "CENTER_MANAGER")) return !!cls.centerId && cls.centerId === user.centerId;
  if (hasRole(user, "TEACHER")) return cls.teacherId === user.id || cls.assistantId === user.id;
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

  // Loại B (Nhóm 01 L1) — ClassSession scoped auto; StudentSessionFeedback/Attendance
  // chưa scoped → cách ly qua buổi (sdb.findUnique IDOR-filter) + gate GV/CM bên dưới.
  // ⚠️ select kèm centerId — findUnique trên model scoped lọc hậu kỳ theo field này.
  const sdb = scopedDb(await resolveActor(session.user.id));
  const sess = await sdb.classSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      centerId: true,
      class: { select: { teacherId: true, assistantId: true, centerId: true } },
    },
  });
  if (!sess) return { ok: false, error: "Buổi học không tồn tại" };

  const allowed = await canManageSessionClass(
    { id: session.user.id, role: session.user.role, centerId: session.user.centerId },
    sess.class,
  );
  if (!allowed) return { ok: false, error: "Không có quyền nhận xét buổi học này" };

  let txResults: Array<{ id: string } | { count: number }>;
  try {
    txResults = await sdb.$transaction(
      items.map((it) => {
        const comment = it.comment.trim();
        const rating = it.rating ?? null;
        if (comment.length === 0) {
          // Xoá nhận xét nếu để trống.
          return sdb.studentSessionFeedback.deleteMany({
            where: { classSessionId: sessionId, studentId: it.studentId },
          });
        }
        return sdb.studentSessionFeedback.upsert({
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

  // R7-17 — emit "comment.added" cho mỗi nhận xét per-HV vừa lưu → PH của HV đó
  // nhận thông báo (lib/_handlers/comment-notif.ts). Phát SAU commit: transaction
  // ở đây là dạng batch-array ($transaction([...])) — không nhận promise non-Prisma
  // (publishEvent) vào mảng nên không gắn được tx. dedupeKey theo commentId
  // (StudentSessionFeedback.id) → sửa nhận xét không tạo thông báo trùng.
  try {
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.comment.trim().length === 0) continue; // dòng xoá → không phát event
      const row = txResults[i];
      const commentId = row && "id" in row ? row.id : null;
      if (!commentId) continue;
      await publishEvent(
        "comment.added",
        { studentId: it.studentId, sessionId, commentId, byUserId: session.user.id },
        { dedupeKey: `comment.added:${commentId}` },
      );
    }
  } catch (err) {
    console.error("[saveSessionFeedback] publish comment.added error:", err);
  }

  // A2 — đẩy email "nhận xét mới" cho phụ huynh (chỉ con liên quan, không lộ con khác).
  // Lưu ý: Student scoped → HV học bù đến từ CƠ SỞ KHÁC bị lọc khỏi email này với
  // actor center-scope (in-app notification qua event comment.added không ảnh hưởng).
  try {
    const withComment = items.filter((it) => it.comment.trim().length > 0);
    if (withComment.length > 0) {
      const [students, cls] = await Promise.all([
        sdb.student.findMany({
          where: { id: { in: withComment.map((i) => i.studentId) }, parentUserId: { not: null } },
          select: { id: true, name: true, parentName: true, parentUser: { select: { email: true, name: true } } },
        }),
        sdb.classSession.findUnique({
          where: { id: sessionId },
          // ⚠️ kèm centerId — findUnique model scoped lọc hậu kỳ theo field này.
          select: { centerId: true, class: { select: { name: true } } },
        }),
      ]);
      const byId = new Map(withComment.map((i) => [i.studentId, i]));
      for (const s of students) {
        const email = s.parentUser?.email;
        if (!email) continue;
        const it = byId.get(s.id);
        await enqueueNewFeedback({
          to: email,
          parentName: s.parentUser?.name ?? s.parentName,
          studentName: s.name,
          className: cls?.class.name ?? "",
          comment: it?.comment.trim() ?? "",
          rating: it?.rating ?? null,
        });
      }
    }
  } catch (err) {
    console.error("[saveSessionFeedback] enqueue email error:", err);
  }

  revalidatePath(`/sessions/${sessionId}`);
  return { ok: true };
}

// ── LMS-3 — checklist sau buổi ────────────────────────────────────────────

const PRESENT_STATUSES = ["PRESENT", "LATE"] as const;

async function loadSessionForGate(sessionId: string) {
  const session = await auth();
  if (!session?.user) return { ok: false as const, error: "Chưa đăng nhập" };
  const sdb = scopedDb(await resolveActor(session.user.id));
  // ⚠️ select kèm centerId — findUnique trên model scoped lọc hậu kỳ theo field này.
  const sess = await sdb.classSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      centerId: true,
      lessonId: true,
      status: true,
      class: { select: { id: true, teacherId: true, assistantId: true, centerId: true } },
    },
  });
  if (!sess) return { ok: false as const, error: "Buổi học không tồn tại" };
  const allowed = await canManageSessionClass(
    { id: session.user.id, role: session.user.role, centerId: session.user.centerId },
    sess.class,
  );
  if (!allowed) return { ok: false as const, error: "Không có quyền thao tác buổi học này" };
  return { ok: true as const, sess, sdb };
}

/** Tính 2 bước suy ra: điểm danh xong + đã nhận xét HS có mặt. */
// Attendance ∈ SCOPE_EXEMPT (chờ backfill PROD) + StudentSessionFeedback không scoped
// → sdb pass-through; cách ly đã chốt ở loadSessionForGate (buổi trong tầm nhìn).
async function deriveSteps(
  sdb: Sdb,
  sessionId: string,
): Promise<{ ckAttendance: boolean; ckFeedback: boolean }> {
  const [attCount, presentRows, feedbackRows] = await Promise.all([
    sdb.attendance.count({ where: { sessionId } }),
    sdb.attendance.findMany({
      where: { sessionId, status: { in: [...PRESENT_STATUSES] } },
      select: { studentId: true },
    }),
    sdb.studentSessionFeedback.findMany({
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
  ckClean: z.boolean(),
  ckEquipment: z.boolean(),
  ckKit: z.boolean(),
  ckLessonConfirmed: z.boolean(),
  ckMedia: z.boolean(),
  ckHomework: z.boolean(),
  ckIncident: z.boolean(),
  incidentNote: z.string().trim().max(3000).optional().or(z.literal("")),
  lessonNotes: z.string().trim().max(5000).optional().or(z.literal("")),
});

/** Lưu các bước thủ công + đồng bộ 2 bước suy ra. */
export async function updateSessionChecklist(input: unknown): Promise<Result> {
  const parsed = checklistSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const gate = await loadSessionForGate(parsed.data.sessionId);
  if (!gate.ok) return gate;

  const derived = await deriveSteps(gate.sdb, parsed.data.sessionId);
  try {
    await gate.sdb.classSession.update({
      where: { id: parsed.data.sessionId },
      data: {
        ckClean: parsed.data.ckClean,
        ckEquipment: parsed.data.ckEquipment,
        ckKit: parsed.data.ckKit,
        ckLessonConfirmed: parsed.data.ckLessonConfirmed,
        ckMedia: parsed.data.ckMedia,
        ckHomework: parsed.data.ckHomework,
        ckIncident: parsed.data.ckIncident,
        incidentNote: parsed.data.incidentNote || null,
        lessonNotes: parsed.data.lessonNotes || null,
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
  // FIX-H4 — chỉ bắt đầu được khi đang SCHEDULED. Mã lỗi INVALID_SESSION_STATE.
  if (!canStartSession(gate.sess.status)) {
    return { ok: false, error: "INVALID_SESSION_STATE" };
  }
  await gate.sdb.classSession.update({
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
  // FIX-H4 — chỉ hoàn tất được khi đang IN_PROGRESS (chặn re-complete buổi đã xong/hủy).
  if (!canCompleteSession(gate.sess.status)) {
    return { ok: false, error: "INVALID_SESSION_STATE" };
  }

  const derived = await deriveSteps(gate.sdb, sessionId);
  const sess = await gate.sdb.classSession.findUnique({
    where: { id: sessionId },
    // ⚠️ kèm centerId — findUnique model scoped lọc hậu kỳ theo field này.
    select: { centerId: true, ckLessonConfirmed: true },
  });
  if (!derived.ckAttendance) return { ok: false, error: "Chưa điểm danh — không thể hoàn tất" };
  if (!sess?.ckLessonConfirmed) return { ok: false, error: "Chưa xác nhận bài đã dạy" };
  if (!derived.ckFeedback) {
    return { ok: false, error: "Chưa nhận xét đủ học sinh có mặt" };
  }

  await gate.sdb.classSession.update({
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
