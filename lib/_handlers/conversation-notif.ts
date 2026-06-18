// lib/_handlers/conversation-notif.ts — LMS-15: consumer cho DomainEvent
// "conversation.message_posted" (nhắn 2 chiều PH↔GV theo enrollment).
// authorSide=PARENT → báo GV chính + trợ giảng của lớp (StaffNotification inbox).
// authorSide=STAFF  → báo PH của HV (Notification audience STUDENT — portal feed),
// theo đúng mẫu lib/_handlers/comment-notif.ts. Idempotent qua dedupeKey theo messageId.
import { db } from "@/lib/db";
import { on, type DomainEventLite } from "@/lib/events/registry";

const str = (v: unknown): string => (v == null ? "" : String(v));

export async function onConversationMessagePosted(event: DomainEventLite): Promise<void> {
  const enrollmentId = str(event.payload.enrollmentId);
  const messageId = str(event.payload.messageId);
  const authorSide = str(event.payload.authorSide);
  if (!enrollmentId || !messageId) return;

  const enr = await db.enrollment.findFirst({
    where: { id: enrollmentId, deletedAt: null },
    select: {
      studentId: true,
      student: { select: { name: true, centerId: true } },
      class: { select: { name: true, teacherId: true, assistantId: true } },
    },
  });
  if (!enr) return;

  const dedupeKey = `conversation.message_posted:${messageId}`;
  const className = enr.class?.name ?? "lớp";
  const studentName = enr.student?.name ?? "học viên";

  if (authorSide === "PARENT") {
    // PH gửi → báo GV chính + trợ giảng phụ trách lớp (StaffNotification inbox).
    const staffIds = [...new Set(
      [enr.class?.teacherId, enr.class?.assistantId].filter(
        (x): x is string => !!x,
      ),
    )];
    for (const userId of staffIds) {
      await db.staffNotification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey } },
        create: {
          userId,
          category: "CLASS",
          title: "Tin nhắn mới từ phụ huynh",
          body: `Phụ huynh ${studentName} (lớp ${className}) vừa gửi một tin nhắn.`,
          href: `/tin-nhan?e=${enrollmentId}`,
          dedupeKey,
        },
        update: {},
      });
    }
    return;
  }

  if (authorSide === "STAFF") {
    // GV trả lời → báo PH của HV (Notification audience STUDENT — portal feed).
    if (!enr.studentId) return;
    await db.notification.upsert({
      where: { dedupeKey },
      create: {
        title: "Tin nhắn mới từ giáo viên",
        body: `Giáo viên lớp ${className} vừa gửi tin nhắn. Vui lòng xem trong mục Tin nhắn.`,
        audience: "STUDENT",
        studentId: enr.studentId,
        centerId: enr.student?.centerId ?? null,
        createdByName: "Hệ thống",
        dedupeKey,
      },
      update: {},
    });
  }
}

export function registerConversationNotifHandlers(): void {
  on("conversation.message_posted", onConversationMessagePosted);
}
