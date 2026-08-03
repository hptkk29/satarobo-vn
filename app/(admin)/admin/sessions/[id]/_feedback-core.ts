// _feedback-core.ts — LOGIC THẬT của phiếu nhận xét theo buổi (saveSessionFeedback /
// saveSessionEval), tách khỏi _actions.ts ("use server") vì 2 lý do:
//   1. Test được (tests/e2e/r7/session-feedback-fixes.spec.ts): runner Playwright stub
//      `@/lib/auth` → auth() = null, wrapper action không chạy được happy-path; core
//      nhận `user` tường minh nên spec gọi thẳng.
//   2. An toàn: MỌI export của file "use server" là HTTP endpoint — hàm nhận `user`
//      làm tham số KHÔNG được phép nằm trong đó (client forge user = leo quyền).
//      Caller hợp lệ DUY NHẤT: _actions.ts + PDF route (đều SAU auth()).
//
// Fix đợt rà soát nhận-xét-theo-buổi 08/2026:
//   #1 dòng comment RỖNG chỉ xoá phiếu khi phiếu KHÔNG có phần mở rộng
//      (projectName/notes/rubric); phiếu mở rộng → clear comment/rating, GIỮ rubric
//      (hết cảnh "Lưu tất cả" ở /teacher/nhan-xet nuốt phiếu rubric đã chấm).
//   #3 gate theo isSessionOwnedByTeacher — GV dạy thay (substituteTeacherId) /
//      thực dạy (actualTeacherId) nhận xét được, khớp gate điểm danh.
//   #4 email "nhận xét mới" CHỈ enqueue khi comment THỰC SỰ đổi (so old↔new đọc
//      trước khi ghi) — re-save không spam phụ huynh.
//   #5 createdById chỉ set khi CREATE — re-save không cướp tác giả phiếu.
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { getSessionRosterStudentIds } from "@/lib/attendance/roster";
import { enqueueNewFeedback } from "@/lib/email/triggers";
import { hasRole } from "@/lib/auth/permissions";
import { publishEvent } from "@/lib/events/publish";
import { isSessionOwnedByTeacher } from "@/lib/lms/session-ownership";

export type FeedbackResult = { ok: true } | { ok: false; error: string };

/** Người thao tác (wrapper đã auth()) — đúng 3 field mà gate cần. */
export type SessionGateUser = { id: string; role: string; centerId: string | null };

/** Dữ liệu buổi cần cho gate ownership (kèm cả dạy thay/thực dạy). */
export type SessionOwnershipGate = {
  classId: string;
  substituteTeacherId: string | null;
  actualTeacherId: string | null;
  class: { centerId: string | null };
};

/**
 * FIX #3 — quyền thao tác NHẬN XÉT trên 1 buổi: SUPER_ADMIN, CENTER_MANAGER cùng
 * cơ sở, hoặc GV SỞ HỮU BUỔI theo isSessionOwnedByTeacher (lớp được phân công ∪
 * dạy thay ∪ thực dạy) — khớp gate điểm danh, thay cho canManageSessionClass
 * (chỉ teacherId/assistantId của LỚP, làm GV dạy thay điểm danh được mà nhận xét không).
 */
export async function canManageSessionRecord(
  user: SessionGateUser,
  sess: SessionOwnershipGate,
): Promise<boolean> {
  if (hasRole(user, "SUPER_ADMIN")) return true;
  if (hasRole(user, "CENTER_MANAGER")) {
    return !!sess.class.centerId && sess.class.centerId === user.centerId;
  }
  if (hasRole(user, "TEACHER")) {
    const actor = await resolveActor(user.id);
    return isSessionOwnedByTeacher(
      {
        classId: sess.classId,
        substituteTeacherId: sess.substituteTeacherId,
        actualTeacherId: sess.actualTeacherId,
      },
      { userId: user.id, assignedClassIds: actor.assignedClassIds },
    );
  }
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

// Phiếu nhận xét buổi (site GV) — 1 HV/lần: Dự án + 4 mục văn xuôi + rubric 9 tiêu chí.
const sessionEvalSchema = z.object({
  sessionId: z.string().min(1),
  studentId: z.string().min(1),
  projectName: z.string().trim().max(200).nullable().optional(),
  notes: z.object({
    knowledge: z.string().trim().max(3000),
    skill: z.string().trim().max(3000),
    attitude: z.string().trim().max(3000),
    proposal: z.string().trim().max(3000),
  }),
  // { criterionId: level 1-5 } — chấp nhận mọi key (9 tiêu chí lib/lms/session-eval-rubric).
  rubric: z.record(z.string(), z.coerce.number().int().min(1).max(5)),
});

// ⚠️ select kèm centerId — findUnique trên model scoped lọc hậu kỳ theo field này.
const SESSION_GATE_SELECT = {
  id: true,
  centerId: true,
  classId: true,
  substituteTeacherId: true,
  actualTeacherId: true,
  class: { select: { centerId: true } },
} as const;

/**
 * LMS-2 — lưu hàng loạt nhận xét nhanh (comment + sao) từng HS cho 1 buổi.
 * Core thuần (không auth()) — xem đầu file về caller hợp lệ.
 */
export async function saveSessionFeedbackCore(
  user: SessionGateUser,
  input: unknown,
): Promise<FeedbackResult> {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { sessionId, items } = parsed.data;

  // Loại B (Nhóm 01 L1) — ClassSession scoped auto; StudentSessionFeedback/Attendance
  // chưa scoped → cách ly qua buổi (sdb.findUnique IDOR-filter) + gate ownership dưới.
  const actor = await resolveActor(user.id);
  const sdb = scopedDb(actor);
  const sess = await sdb.classSession.findUnique({
    where: { id: sessionId },
    select: SESSION_GATE_SELECT,
  });
  if (!sess) return { ok: false, error: "Buổi học không tồn tại" };

  const allowed = await canManageSessionRecord(user, sess);
  if (!allowed) return { ok: false, error: "Không có quyền nhận xét buổi học này" };

  // SEC-M02: mỗi studentId PHẢI thuộc roster hợp lệ của buổi (enrolled ∪ học bù SCHEDULED)
  // — chống ghi phiếu giả cho HV lớp/cơ sở khác rồi gửi thông báo tới phụ huynh họ.
  const rosterIds = await getSessionRosterStudentIds(actor, sessionId);
  if (items.some((it) => !rosterIds.has(it.studentId))) {
    return { ok: false, error: "Có học viên không thuộc danh sách buổi này" };
  }

  // FIX #1/#4/#5 — đọc phiếu hiện hữu TRƯỚC khi ghi (StudentSessionFeedback ∉
  // SCOPED_MODELS → sdb pass-through; cách ly đã chốt qua gate buổi ở trên):
  //   • biết dòng rỗng có được xoá không (phiếu mở rộng thì KHÔNG),
  //   • biết comment có thực sự đổi không (quyết định gửi email).
  const existingRows = items.length
    ? await sdb.studentSessionFeedback.findMany({
        where: { classSessionId: sessionId, studentId: { in: items.map((i) => i.studentId) } },
        select: { studentId: true, comment: true, projectName: true, notes: true, rubric: true },
      })
    : [];
  const existingBy = new Map(existingRows.map((r) => [r.studentId, r]));
  const hasExtended = (r: (typeof existingRows)[number]) =>
    r.projectName !== null || r.notes !== null || r.rubric !== null;

  const ops: Prisma.PrismaPromise<unknown>[] = [];
  // Vị trí op UPSERT của từng item (-1 = item không sinh upsert) — để map id phiếu
  // từ kết quả transaction về đúng HV khi phát event.
  const upsertOpIdxByItem = new Array<number>(items.length).fill(-1);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const comment = it.comment.trim();
    const rating = it.rating ?? null;
    const old = existingBy.get(it.studentId);
    if (comment.length === 0) {
      if (!old) continue; // chưa có phiếu — không có gì để xoá
      if (hasExtended(old)) {
        // FIX #1 — phiếu mở rộng (rubric/notes/projectName): chỉ gỡ comment/sao,
        // GIỮ NGUYÊN phần rubric GV đã chấm.
        ops.push(
          sdb.studentSessionFeedback.updateMany({
            where: { classSessionId: sessionId, studentId: it.studentId },
            data: { comment: null, rating: null },
          }),
        );
      } else {
        // Phiếu thuần comment — xoá như hành vi cũ.
        ops.push(
          sdb.studentSessionFeedback.deleteMany({
            where: { classSessionId: sessionId, studentId: it.studentId },
          }),
        );
      }
      continue;
    }
    upsertOpIdxByItem[i] = ops.length;
    ops.push(
      sdb.studentSessionFeedback.upsert({
        where: {
          classSessionId_studentId: { classSessionId: sessionId, studentId: it.studentId },
        },
        // FIX #5 — update KHÔNG ghi đè createdById (giữ tác giả phiếu gốc cho PDF/portal).
        update: { comment, rating },
        create: {
          classSessionId: sessionId,
          studentId: it.studentId,
          comment,
          rating,
          createdById: user.id,
        },
      }),
    );
  }

  let txResults: unknown[] = [];
  try {
    if (ops.length > 0) txResults = await sdb.$transaction(ops);
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
      const opIdx = upsertOpIdxByItem[i];
      if (opIdx < 0) continue;
      const row = txResults[opIdx];
      const commentId =
        row && typeof row === "object" && "id" in row && typeof (row as { id: unknown }).id === "string"
          ? (row as { id: string }).id
          : null;
      if (!commentId) continue;
      await publishEvent(
        "comment.added",
        { studentId: items[i].studentId, sessionId, commentId, byUserId: user.id },
        { dedupeKey: `comment.added:${commentId}` },
      );
    }
  } catch (err) {
    console.error("[saveSessionFeedback] publish comment.added error:", err);
  }

  // A2 — đẩy email "nhận xét mới" cho phụ huynh (chỉ con liên quan, không lộ con khác).
  // FIX #4 — CHỈ dòng có comment THỰC SỰ ĐỔI so với phiếu cũ (EmailQueue không có khoá
  // dedupe, enqueue lại = PH nhận email trùng). Lưu ý: Student scoped → HV học bù đến
  // từ CƠ SỞ KHÁC bị lọc khỏi email này với actor center-scope (in-app notification
  // qua event comment.added không ảnh hưởng).
  try {
    const changed = items.filter((it, i) => {
      if (upsertOpIdxByItem[i] < 0) return false;
      const oldComment = (existingBy.get(it.studentId)?.comment ?? "").trim();
      return oldComment !== it.comment.trim();
    });
    if (changed.length > 0) {
      const [students, cls] = await Promise.all([
        sdb.student.findMany({
          where: { id: { in: changed.map((i) => i.studentId) }, parentUserId: { not: null } },
          select: { id: true, name: true, parentName: true, parentUser: { select: { email: true, name: true } } },
        }),
        sdb.classSession.findUnique({
          where: { id: sessionId },
          // ⚠️ kèm centerId — findUnique model scoped lọc hậu kỳ theo field này.
          select: { centerId: true, class: { select: { name: true } } },
        }),
      ]);
      const byId = new Map(changed.map((i) => [i.studentId, i]));
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

  return { ok: true };
}

/**
 * Site GV — lưu PHIẾU nhận xét buổi học của MỘT học viên (khớp reference TeachUI
 * StudentEvalDialog). Ghi projectName/notes/rubric; comment (nullable) = gộp 4 mục
 * để badge "đã nhận xét" + portal PH + email vẫn chạy. Core thuần (không auth()).
 */
export async function saveSessionEvalCore(
  user: SessionGateUser,
  input: unknown,
): Promise<FeedbackResult> {
  const parsed = sessionEvalSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ" };
  }
  const { sessionId, studentId, projectName, notes, rubric } = parsed.data;

  const actor = await resolveActor(user.id);
  const sdb = scopedDb(actor);
  const sess = await sdb.classSession.findUnique({
    where: { id: sessionId },
    select: SESSION_GATE_SELECT,
  });
  if (!sess) return { ok: false, error: "Buổi học không tồn tại" };

  const allowed = await canManageSessionRecord(user, sess);
  if (!allowed) return { ok: false, error: "Không có quyền nhận xét buổi học này" };

  // SEC-M02: studentId PHẢI thuộc roster hợp lệ của buổi (enrolled ∪ học bù SCHEDULED) —
  // chống ghi phiếu giả cho HV lớp/cơ sở khác rồi gửi thông báo tới phụ huynh họ.
  const rosterIds = await getSessionRosterStudentIds(actor, sessionId);
  if (!rosterIds.has(studentId)) {
    return { ok: false, error: "Học viên không thuộc danh sách buổi này" };
  }

  // comment tương thích cũ = 4 mục nối lại (rỗng hết → null, phiếu rubric-only vẫn lưu).
  const comment =
    [notes.knowledge, notes.skill, notes.attitude, notes.proposal]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n") || null;

  // FIX #4 — đọc comment cũ trước khi ghi: re-save không đổi văn xuôi thì KHÔNG email lại.
  const old = await sdb.studentSessionFeedback.findUnique({
    where: { classSessionId_studentId: { classSessionId: sessionId, studentId } },
    select: { comment: true },
  });
  const commentChanged = (old?.comment ?? null) !== comment;

  let saved: { id: string };
  try {
    saved = await sdb.studentSessionFeedback.upsert({
      where: { classSessionId_studentId: { classSessionId: sessionId, studentId } },
      // FIX #5 — update KHÔNG ghi đè createdById (giữ tác giả phiếu gốc).
      update: {
        projectName: projectName ?? null,
        notes,
        rubric,
        comment,
      },
      create: {
        classSessionId: sessionId,
        studentId,
        projectName: projectName ?? null,
        notes,
        rubric,
        comment,
        createdById: user.id,
      },
      select: { id: true },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Lỗi lưu phiếu: ${err instanceof Error ? err.message : "Unknown"}`,
    };
  }

  // Thông báo PH — in-app (event) + email (khi văn xuôi ĐỔI), như saveSessionFeedback.
  try {
    await publishEvent(
      "comment.added",
      { studentId, sessionId, commentId: saved.id, byUserId: user.id },
      { dedupeKey: `comment.added:${saved.id}` },
    );
  } catch (err) {
    console.error("[saveSessionEval] publish comment.added error:", err);
  }
  if (comment && commentChanged) {
    try {
      const [student, cls] = await Promise.all([
        sdb.student.findFirst({
          where: { id: studentId, parentUserId: { not: null } },
          select: {
            name: true,
            parentName: true,
            parentUser: { select: { email: true, name: true } },
          },
        }),
        sdb.classSession.findUnique({
          where: { id: sessionId },
          select: { centerId: true, class: { select: { name: true } } },
        }),
      ]);
      const email = student?.parentUser?.email;
      if (email) {
        await enqueueNewFeedback({
          to: email,
          parentName: student.parentUser?.name ?? student.parentName,
          studentName: student.name,
          className: cls?.class.name ?? "",
          comment,
          rating: null,
        });
      }
    } catch (err) {
      console.error("[saveSessionEval] enqueue email error:", err);
    }
  }

  return { ok: true };
}
