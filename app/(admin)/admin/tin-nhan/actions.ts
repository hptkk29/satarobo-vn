"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { postStaffMessage } from "@/lib/comms/messaging";

// LMS-15 — GV/quản lý trả lời 1 hội thoại (scope kiểm trong service).
export async function replyStaffMessage(input: {
  threadId: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Chưa đăng nhập" };
  const res = await postStaffMessage({
    userId: session.user.id,
    userName: session.user.name ?? "Trung tâm",
    threadId: input.threadId,
    body: input.body,
  });
  if (!res.ok) return res;
  revalidatePath(`/admin/tin-nhan/${input.threadId}`);
  revalidatePath("/admin/tin-nhan");
  return { ok: true };
}
