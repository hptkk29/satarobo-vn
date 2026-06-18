"use server";

import { revalidatePath } from "next/cache";
import { requireActiveStudent } from "@/lib/portal/session";
import { postParentMessage } from "@/lib/comms/messaging";

// LMS-15 — PH gửi tin (mở thread mới hoặc trả lời thread cũ) cho con đang chọn.
export async function sendParentMessage(input: {
  threadId?: string;
  subject?: string | null;
  body: string;
}): Promise<{ ok: boolean; error?: string; threadId?: string }> {
  const { ctx, studentId } = await requireActiveStudent();
  const res = await postParentMessage({
    parentUserId: ctx.parentUserId,
    parentName: ctx.parentName,
    studentId,
    threadId: input.threadId,
    subject: input.subject ?? null,
    body: input.body,
  });
  if (!res.ok) return res;
  revalidatePath("/portal/tin-nhan");
  if (input.threadId) revalidatePath(`/portal/tin-nhan/${input.threadId}`);
  return { ok: true, threadId: res.threadId };
}
