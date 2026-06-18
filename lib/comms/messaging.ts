import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { resolveActor } from "@/lib/auth/actor";
import { canStaffAccessStudent, isManagerActor } from "@/lib/auth/lms-scope";
import { publishEvent } from "@/lib/events/publish";

// =============================================================================
// LMS-15 — Nhắn tin 2 chiều PH ↔ GV/Trung tâm (thread theo học viên).
// Quyền: PH chỉ thread của con mình; staff theo canStaffAccessStudent (cơ sở/lớp).
// =============================================================================

export type ThreadSummary = {
  id: string;
  studentId: string;
  studentName: string;
  subject: string | null;
  lastMessageAt: string;
  lastBody: string | null;
  unread: number;
};

export type MessageView = {
  id: string;
  senderRole: string;
  senderName: string;
  body: string;
  createdAt: string;
  mine: boolean;
};

const MAX_BODY = 4000;

function trimBody(raw: string): string {
  return raw.trim().slice(0, MAX_BODY);
}

// ─── PHỤ HUYNH ──────────────────────────────────────────────────────────────

/** PH sở hữu HV này? */
async function parentOwnsStudent(parentUserId: string, studentId: string): Promise<boolean> {
  const s = await db.student.findFirst({
    where: { id: studentId, parentUserId, deletedAt: null },
    select: { id: true },
  });
  return !!s;
}

export async function listParentThreads(parentUserId: string): Promise<ThreadSummary[]> {
  const threads = await db.messageThread.findMany({
    where: { student: { parentUserId, deletedAt: null } },
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true,
      studentId: true,
      subject: true,
      lastMessageAt: true,
      student: { select: { name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { body: true },
      },
      _count: { select: { messages: { where: { senderRole: "STAFF", parentReadAt: null } } } },
    },
  });
  return threads.map((t) => ({
    id: t.id,
    studentId: t.studentId,
    studentName: t.student?.name ?? "",
    subject: t.subject,
    lastMessageAt: t.lastMessageAt.toISOString(),
    lastBody: t.messages[0]?.body ?? null,
    unread: t._count.messages,
  }));
}

export async function postParentMessage(input: {
  parentUserId: string;
  parentName: string;
  studentId: string;
  threadId?: string;
  subject?: string | null;
  body: string;
}): Promise<{ ok: true; threadId: string } | { ok: false; error: string }> {
  const body = trimBody(input.body);
  if (!body) return { ok: false, error: "Nội dung trống" };
  if (!(await parentOwnsStudent(input.parentUserId, input.studentId))) {
    return { ok: false, error: "Không có quyền nhắn cho học viên này" };
  }

  let threadId = input.threadId;
  if (threadId) {
    const t = await db.messageThread.findFirst({
      where: { id: threadId, student: { parentUserId: input.parentUserId } },
      select: { id: true },
    });
    if (!t) return { ok: false, error: "Không tìm thấy hội thoại" };
  } else {
    const created = await db.messageThread.create({
      data: {
        studentId: input.studentId,
        subject: input.subject?.trim() || null,
        createdByUserId: input.parentUserId,
      },
      select: { id: true },
    });
    threadId = created.id;
  }

  await db.$transaction([
    db.message.create({
      data: {
        threadId,
        senderUserId: input.parentUserId,
        senderRole: "PARENT",
        senderName: input.parentName,
        body,
        parentReadAt: new Date(), // người gửi coi như đã đọc tin của mình
      },
    }),
    db.messageThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
  ]);

  await publishEvent("comment.added", { threadId, studentId: input.studentId, by: "PARENT" }).catch(
    () => {},
  );
  return { ok: true, threadId };
}

export async function getParentThread(
  parentUserId: string,
  threadId: string,
): Promise<MessageView[] | null> {
  const thread = await db.messageThread.findFirst({
    where: { id: threadId, student: { parentUserId } },
    select: { id: true },
  });
  if (!thread) return null;
  // PH mở thread → đánh dấu đã đọc tin của staff.
  await db.message.updateMany({
    where: { threadId, senderRole: "STAFF", parentReadAt: null },
    data: { parentReadAt: new Date() },
  });
  const msgs = await db.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    select: { id: true, senderRole: true, senderName: true, body: true, createdAt: true },
  });
  return msgs.map((m) => ({
    id: m.id,
    senderRole: m.senderRole,
    senderName: m.senderName,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    mine: m.senderRole === "PARENT",
  }));
}

// ─── STAFF (GV / quản lý) ────────────────────────────────────────────────────

/** Thread thuộc phạm vi staff (cơ sở/lớp) — cho inbox admin. */
export async function listStaffThreads(userId: string): Promise<ThreadSummary[]> {
  const actor = await resolveActor(userId);
  let where: Prisma.MessageThreadWhereInput = {};
  if (!(actor.isSuperAdmin || actor.isHoLevel)) {
    where = isManagerActor(actor)
      ? { student: { centerId: { in: actor.visibleCenterIds } } }
      : { student: { enrollments: { some: { classId: { in: [...actor.assignedClassIds] } } } } };
  }
  const threads = await db.messageThread.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: 100,
    select: {
      id: true,
      studentId: true,
      subject: true,
      lastMessageAt: true,
      student: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { body: true } },
      _count: { select: { messages: { where: { senderRole: "PARENT", staffReadAt: null } } } },
    },
  });
  return threads.map((t) => ({
    id: t.id,
    studentId: t.studentId,
    studentName: t.student?.name ?? "",
    subject: t.subject,
    lastMessageAt: t.lastMessageAt.toISOString(),
    lastBody: t.messages[0]?.body ?? null,
    unread: t._count.messages,
  }));
}

async function staffCanAccessStudent(userId: string, studentId: string): Promise<boolean> {
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { centerId: true, enrollments: { select: { classId: true } } },
  });
  if (!student) return false;
  const actor = await resolveActor(userId);
  return canStaffAccessStudent(actor, {
    studentCenterId: student.centerId,
    studentClassIds: student.enrollments.map((e) => e.classId),
  });
}

export async function postStaffMessage(input: {
  userId: string;
  userName: string;
  threadId: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const body = trimBody(input.body);
  if (!body) return { ok: false, error: "Nội dung trống" };
  const thread = await db.messageThread.findUnique({
    where: { id: input.threadId },
    select: { id: true, studentId: true },
  });
  if (!thread) return { ok: false, error: "Không tìm thấy hội thoại" };
  if (!(await staffCanAccessStudent(input.userId, thread.studentId))) {
    return { ok: false, error: "Không có quyền nhắn trong hội thoại này" };
  }

  await db.$transaction([
    db.message.create({
      data: {
        threadId: input.threadId,
        senderUserId: input.userId,
        senderRole: "STAFF",
        senderName: input.userName,
        body,
        staffReadAt: new Date(),
      },
    }),
    db.messageThread.update({ where: { id: input.threadId }, data: { lastMessageAt: new Date() } }),
  ]);

  await publishEvent("comment.added", {
    threadId: input.threadId,
    studentId: thread.studentId,
    by: "STAFF",
  }).catch(() => {});
  return { ok: true };
}

export async function getStaffThread(
  userId: string,
  threadId: string,
): Promise<MessageView[] | null> {
  const thread = await db.messageThread.findUnique({
    where: { id: threadId },
    select: { id: true, studentId: true },
  });
  if (!thread) return null;
  if (!(await staffCanAccessStudent(userId, thread.studentId))) return null;
  await db.message.updateMany({
    where: { threadId, senderRole: "PARENT", staffReadAt: null },
    data: { staffReadAt: new Date() },
  });
  const msgs = await db.message.findMany({
    where: { threadId },
    orderBy: { createdAt: "asc" },
    select: { id: true, senderRole: true, senderName: true, body: true, createdAt: true },
  });
  return msgs.map((m) => ({
    id: m.id,
    senderRole: m.senderRole,
    senderName: m.senderName,
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    mine: m.senderRole === "STAFF",
  }));
}
