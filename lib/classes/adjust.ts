import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit/audit-log";
import { publishEvent } from "@/lib/events/publish";
import { detectSessionConflicts } from "@/lib/lms/schedule-conflict";
import { sessionWindow } from "@/lib/lms/schedule-conflict";
import { vnAddDays } from "@/lib/time/vn";
import { findLockedSessions } from "@/lib/classes/phases-service";

// =============================================================================
// R7-06 — Điều chỉnh buổi học: HỦY buổi (sinh buổi bù cuối lịch, giữ tổng số buổi)
// + CHỈNH buổi (đổi ngày/giáo viên/phòng). Buổi đã COMPLETED bị khoá — không sửa.
// Side-effect (thông báo) đi qua DomainEvent `class.session_changed` (idempotent).
// =============================================================================

const MAKEUP_GAP_DAYS = 7;

/**
 * PURE — ngày buổi bù: SAU buổi muộn nhất hiện có (mặc định +7 ngày so với max),
 * để "nối thêm 1 buổi ở cuối" giữ nguyên tổng số buổi. existingDates rỗng →
 * +7 ngày so với afterDate.
 */
export function buildMakeupDate(existingDates: Date[], afterDate: Date): Date {
  let latest = afterDate;
  for (const d of existingDates) {
    if (d.getTime() > latest.getTime()) latest = d;
  }
  return vnAddDays(latest, MAKEUP_GAP_DAYS);
}

/**
 * HỦY 1 buổi (status=CANCELLED, KHÔNG xoá) + sinh 1 buổi bù ở cuối lịch (giữ tổng
 * số buổi active). Ghi AuditLog. Buổi đã COMPLETED → không cho huỷ.
 */
export async function cancelSession(opts: {
  sessionId: string;
  reason: string;
  actorId: string | null;
  actorName: string;
}): Promise<{ ok: boolean; makeupSessionId?: string; error?: string }> {
  const { sessionId, reason, actorId, actorName } = opts;
  if (!reason || reason.trim().length === 0) {
    return { ok: false, error: "Lý do (reason) là bắt buộc khi huỷ buổi" };
  }

  const session = await db.classSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      classId: true,
      date: true,
      status: true,
      topic: true,
      lessonId: true,
      planId: true,
      centerId: true,
    },
  });
  if (!session) return { ok: false, error: "Buổi học không tồn tại" };
  if (session.status === "COMPLETED") {
    return { ok: false, error: "Buổi đã hoàn thành — không thể huỷ" };
  }
  if (session.status === "CANCELLED") {
    return { ok: false, error: "Buổi đã bị huỷ trước đó" };
  }

  // 19/08 — KHÔNG huỷ buổi ĐÃ ĐƯỢC DÙNG (đã điểm danh / có nhận xét / đã giao bài / có
  // ảnh lớp). Chặn theo `status` là chưa đủ: điểm danh KHÔNG đổi status buổi (chỉ
  // completeSession đổi, mà nó nằm sau cờ SESSION_LIFECYCLE_V2 đang OFF), nên một buổi đã
  // dạy xong với 20 bản ghi điểm danh vẫn mang nhãn SCHEDULED và huỷ được. Huỷ xong thì
  // buổi đó rơi khỏi mọi phép tính chuyên cần (buổi CANCELLED không tính học, không tính
  // vắng) ⇒ số buổi đã học của cả lớp tụt xuống mà không ai biết vì sao.
  // Dùng chung định nghĩa "buổi đã dùng" với màn đổi lịch (findLockedSessions).
  const lockedCancel = await findLockedSessions(
    [sessionId],
    new Map([[sessionId, session.status]]),
  );
  const cancelReason = lockedCancel.get(sessionId);
  if (cancelReason) {
    return {
      ok: false,
      error: `Buổi ${cancelReason} — không thể huỷ. Sửa dữ liệu của buổi trước, hoặc dời buổi thay vì huỷ.`,
    };
  }

  // Các buổi còn lại của lớp (không tính buổi đang huỷ) để tính ngày buổi bù cuối.
  const siblings = await db.classSession.findMany({
    where: { classId: session.classId, id: { not: sessionId }, status: { not: "CANCELLED" } },
    select: { date: true },
  });
  const makeupDate = buildMakeupDate(
    siblings.map((s) => s.date),
    session.date,
  );

  const result = await db.$transaction(async (tx) => {
    await tx.classSession.update({
      where: { id: sessionId },
      data: { status: "CANCELLED" },
    });

    const makeup = await tx.classSession.create({
      data: {
        classId: session.classId,
        date: makeupDate,
        topic: session.topic,
        lessonId: session.lessonId,
        planId: session.planId,
        centerId: session.centerId, // FL3-02 — denormalize từ buổi gốc/lớp cho scopedDb
        status: "SCHEDULED",
      },
      select: { id: true },
    });

    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "classes",
      entityType: "ClassSession",
      entityId: sessionId,
      action: "CANCEL_SESSION",
      oldValues: { status: session.status, date: session.date },
      newValues: { status: "CANCELLED", makeupSessionId: makeup.id, makeupDate },
      reason,
      tx,
    });

    await publishEvent(
      "class.session_changed",
      {
        classId: session.classId,
        sessionId,
        change: "CANCELLED",
        makeupSessionId: makeup.id,
      },
      { tx },
    );

    return { makeupSessionId: makeup.id };
  });

  return { ok: true, makeupSessionId: result.makeupSessionId };
}

/**
 * CHỈNH 1 buổi: đổi ngày (+ giáo viên/phòng). Buổi COMPLETED → khoá.
 * ⚠️ Schema: ClassSession có cột `roomId` (W2-4b) nhưng KHÔNG có cột teacherId.
 * → date + roomId được ghi thẳng vào buổi; teacherId vẫn ghi AuditLog làm yêu cầu
 *   thay-thế GV cấp buổi (substitute) cho tới khi có cột riêng (ngoài scope).
 */
export async function adjustSession(opts: {
  sessionId: string;
  date?: Date;
  teacherId?: string | null;
  roomId?: string | null;
  actorId: string | null;
  actorName: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { sessionId, date, teacherId, roomId, actorId, actorName } = opts;

  const session = await db.classSession.findUnique({
    where: { id: sessionId },
    select: { id: true, classId: true, date: true, status: true, roomId: true },
  });
  if (!session) return { ok: false, error: "Buổi học không tồn tại" };
  if (session.status === "COMPLETED") {
    return { ok: false, error: "Buổi đã hoàn thành — không thể chỉnh" };
  }

  const hasDate = date !== undefined;
  const hasTeacher = teacherId !== undefined;
  const hasRoom = roomId !== undefined;
  if (!hasDate && !hasTeacher && !hasRoom) {
    return { ok: false, error: "Không có thay đổi nào" };
  }

  // 19/08 — DỜI NGÀY một buổi đã được dùng là VIẾT LẠI LỊCH SỬ: điểm danh ngày 05/08 bỗng
  // hiện thành 12/08, phiếu nhận xét và ảnh lớp đi theo. Màn đổi lịch theo giai đoạn đã
  // chặn bằng findLockedSessions từ lâu, riêng đường "Điều chỉnh" từng buổi thì quên.
  // Chỉ chặn khi ĐỔI NGÀY — đổi GV dạy thay / phòng vẫn cho, đó là ghi nhận thực tế.
  if (hasDate && date.getTime() !== session.date.getTime()) {
    const locked = await findLockedSessions(
      [sessionId],
      new Map([[sessionId, session.status]]),
    );
    const reason = locked.get(sessionId);
    if (reason) {
      return { ok: false, error: `Buổi ${reason} — không thể dời ngày.` };
    }
  }

  // W2-4 (LMS-6) / T4.2 — chặn đổi buổi gây trùng GV/phòng với LỚP KHÁC.
  // GV/phòng hiệu lực = substitute (nếu đổi) ⊕ GV/phòng cấp lớp. Date hiệu lực =
  // ngày mới (nếu đổi) ⊕ ngày cũ. Thiếu dữ liệu (không GV & không phòng, hoặc lớp
  // chưa có startTime) → KHÔNG chặn (default an toàn).
  const cls = await db.class.findUnique({
    where: { id: session.classId },
    select: { teacherId: true, roomId: true, startTime: true, endTime: true },
  });
  if (cls?.startTime) {
    const effTeacherId = hasTeacher ? teacherId ?? null : cls.teacherId;
    const effRoomId = hasRoom ? roomId ?? null : session.roomId ?? cls.roomId;
    const candDate = hasDate ? date! : session.date;
    // Mốc đầu PHẢI áp giờ lớp. Bản cũ truyền `candDate` thô (thường 00:00 vì ô chọn
    // ngày không kèm giờ) trong khi mốc cuối lại áp giờ ⇒ khung kéo dài bất thường
    // (vd 00:00 → 19:30) và đè lên mọi buổi khác trong ngày. Cùng họ lỗi với
    // sessionWindow — xem ghi chú ở lib/lms/schedule-conflict.ts.
    const khung = sessionWindow(candDate, cls.startTime, cls.endTime);
    const conflict = await detectSessionConflicts({
      sessionId,
      excludeClassId: session.classId,
      centerId: null, // soát toàn hệ thống: GV có thể dạy 2 cơ sở
      teacherId: effTeacherId,
      roomId: effRoomId,
      startAt: khung.startAt,
      endAt: khung.endAt,
    });
    if (conflict.teacherConflict) {
      return { ok: false, error: "Trùng lịch giáo viên: GV đã có buổi dạy lớp khác vào khung giờ này." };
    }
    if (conflict.roomConflict) {
      return { ok: false, error: "Trùng phòng: phòng đã được lớp khác sử dụng vào khung giờ này." };
    }
  }

  const oldValues: Record<string, unknown> = { date: session.date };
  const newValues: Record<string, unknown> = {};
  if (hasDate) newValues.date = date;
  // teacherId (P4b reconcile): GV dạy-thay cấp buổi nay PERSIST vào cột
  // ClassSession.substituteTeacherId (cột đã có ở FixLMS lineage), không chỉ audit.
  // GV hiệu lực cho conflict detection ở trên đã xét substitute. null = trả về GV lớp.
  if (hasTeacher) newValues.substituteTeacherId = teacherId;
  // roomId (W2-4b): có cột cấp buổi → ghi thẳng vào ClassSession.roomId.
  if (hasRoom) {
    oldValues.roomId = session.roomId;
    newValues.roomId = roomId ?? null;
  }

  await db.$transaction(async (tx) => {
    if (hasDate || hasRoom || hasTeacher) {
      await tx.classSession.update({
        where: { id: sessionId },
        data: {
          ...(hasDate ? { date: date! } : {}),
          ...(hasRoom ? { roomId: roomId ?? null } : {}),
          ...(hasTeacher ? { substituteTeacherId: teacherId ?? null } : {}),
        },
      });
    }

    await writeAudit({
      actor: { id: actorId, name: actorName },
      module: "classes",
      entityType: "ClassSession",
      entityId: sessionId,
      action: "ADJUST_SESSION",
      oldValues,
      newValues,
      tx,
    });

    await publishEvent(
      "class.session_changed",
      {
        classId: session.classId,
        sessionId,
        change: "ADJUSTED",
        fields: Object.keys(newValues),
      },
      { tx },
    );
  });

  return { ok: true };
}
