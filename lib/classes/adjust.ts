import "server-only";
import { db } from "@/lib/db";
import { writeAudit } from "@/lib/audit/audit-log";
import { publishEvent } from "@/lib/events/publish";
import { findScheduleConflicts } from "@/lib/classes/generate";
import { sessionEndAt } from "@/lib/lms/scheduling";

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
  const out = new Date(latest);
  out.setDate(out.getDate() + MAKEUP_GAP_DAYS);
  return out;
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
    },
  });
  if (!session) return { ok: false, error: "Buổi học không tồn tại" };
  if (session.status === "COMPLETED") {
    return { ok: false, error: "Buổi đã hoàn thành — không thể huỷ" };
  }
  if (session.status === "CANCELLED") {
    return { ok: false, error: "Buổi đã bị huỷ trước đó" };
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

  // W2-4 (LMS-6) — chặn đổi buổi gây trùng GV/phòng với LỚP KHÁC.
  // GV/phòng hiệu lực = substitute (nếu đổi) ⊕ GV/phòng cấp lớp. Date hiệu lực =
  // ngày mới (nếu đổi) ⊕ ngày cũ. Thiếu dữ liệu (không GV & không phòng, hoặc lớp
  // chưa có startTime) → KHÔNG chặn (default an toàn).
  const cls = await db.class.findUnique({
    where: { id: session.classId },
    select: { teacherId: true, roomId: true, startTime: true, endTime: true },
  });
  if (cls?.startTime) {
    const effTeacherId = hasTeacher ? teacherId ?? null : cls.teacherId;
    const effRoomId = hasRoom ? roomId ?? null : cls.roomId;
    const candDate = hasDate ? date! : session.date;
    const conflict = await findScheduleConflicts({
      classId: session.classId,
      teacherId: effTeacherId,
      roomId: effRoomId,
      candidates: [
        { id: sessionId, startAt: candDate, endAt: sessionEndAt(candDate, cls.startTime, cls.endTime) },
      ],
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
  // teacherId: chưa có cột cấp buổi → chỉ ghi audit (substitute request).
  if (hasTeacher) newValues.substituteTeacherId = teacherId;
  // roomId (W2-4b): có cột cấp buổi → ghi thẳng vào ClassSession.roomId.
  if (hasRoom) {
    oldValues.roomId = session.roomId;
    newValues.roomId = roomId ?? null;
  }

  await db.$transaction(async (tx) => {
    if (hasDate || hasRoom) {
      await tx.classSession.update({
        where: { id: sessionId },
        data: {
          ...(hasDate ? { date: date! } : {}),
          ...(hasRoom ? { roomId: roomId ?? null } : {}),
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
