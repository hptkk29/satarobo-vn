// lib/conversation/service.ts — LMS-15: nhắn 2 chiều PH↔GV theo từng enrollment.
// THUẦN nghiệp vụ (không auth/scope — gọi sau khi server-action đã gác quyền + ownership).
// postMessage emit DomainEvent "conversation.message_posted" → handler tạo thông báo
// cho phía đối diện (lib/_handlers/conversation-notif.ts). Idempotent theo messageId.
import "server-only";
import {
  type ConversationMessage,
  type ConversationSide,
  type Prisma,
} from "@prisma/client";
import { db } from "@/lib/db";
import { publishEvent } from "@/lib/events/publish";

type TxClient = Prisma.TransactionClient;

const MAX_BODY = 2000;

export type ThreadMessage = {
  id: string;
  authorUserId: string;
  authorSide: ConversationSide;
  body: string;
  createdAt: Date;
  readByParentAt: Date | null;
  readByStaffAt: Date | null;
};

/**
 * Gửi 1 tin nhắn vào luồng của enrollment. Validate body (1..2000 ký tự).
 * Tạo ConversationMessage + emit "conversation.message_posted" (dedupeKey theo
 * messageId → replay không tạo thông báo trùng). Truyền `tx` để ghi cùng transaction.
 */
export async function postMessage(input: {
  enrollmentId: string;
  authorUserId: string;
  authorSide: ConversationSide;
  body: string;
  tx?: TxClient;
}): Promise<ConversationMessage> {
  const body = (input.body ?? "").trim();
  if (body.length === 0) throw new Error("Nội dung tin nhắn không được để trống");
  if (body.length > MAX_BODY) throw new Error(`Tin nhắn tối đa ${MAX_BODY} ký tự`);

  const client = input.tx ?? db;
  // #03 Pha A — denormalize centerId từ Enrollment. Bắt buộc set ở MỌI đường tạo, nếu
  // không dòng mới sẽ null và bị ẩn nhầm sau khi flip SCOPED_MODELS ở pha B (bài học #04).
  const enr = await client.enrollment.findUnique({
    where: { id: input.enrollmentId },
    select: { centerId: true },
  });
  const msg = await client.conversationMessage.create({
    data: {
      enrollmentId: input.enrollmentId,
      authorUserId: input.authorUserId,
      authorSide: input.authorSide,
      body,
      centerId: enr?.centerId ?? null,
    },
  });

  await publishEvent(
    "conversation.message_posted",
    {
      enrollmentId: input.enrollmentId,
      messageId: msg.id,
      authorSide: input.authorSide,
    },
    { tx: input.tx, dedupeKey: `conversation.message_posted:${msg.id}` },
  );

  return msg;
}

/** Toàn bộ tin nhắn của 1 luồng (enrollment) theo thứ tự thời gian tăng dần. */
export async function getThread(enrollmentId: string): Promise<ThreadMessage[]> {
  return db.conversationMessage.findMany({
    where: { enrollmentId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      authorUserId: true,
      authorSide: true,
      body: true,
      createdAt: true,
      readByParentAt: true,
      readByStaffAt: true,
    },
  });
}

/** Tổng số tin của GV mà PH chưa đọc, trên các enrollment của con PH (badge nav). */
export async function countUnreadForParent(parentUserId: string): Promise<number> {
  return db.conversationMessage.count({
    where: {
      authorSide: "STAFF",
      readByParentAt: null,
      enrollment: {
        deletedAt: null,
        student: { parentUserId, deletedAt: null },
      },
    },
  });
}

/**
 * Đánh dấu đã đọc cho 1 PHÍA: set thời điểm đọc cho tin của phía ĐỐI DIỆN chưa đọc.
 * side=PARENT → đọc tin của STAFF (readByParentAt); side=STAFF → đọc tin của PARENT
 * (readByStaffAt). Trả số tin vừa cập nhật.
 */
export async function markThreadRead(
  enrollmentId: string,
  side: ConversationSide,
): Promise<number> {
  const now = new Date();
  if (side === "PARENT") {
    const r = await db.conversationMessage.updateMany({
      where: { enrollmentId, authorSide: "STAFF", readByParentAt: null },
      data: { readByParentAt: now },
    });
    return r.count;
  }
  const r = await db.conversationMessage.updateMany({
    where: { enrollmentId, authorSide: "PARENT", readByStaffAt: null },
    data: { readByStaffAt: now },
  });
  return r.count;
}
