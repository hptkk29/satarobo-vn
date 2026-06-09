"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { recordOutgoingMessage } from "@/lib/crm/messenger-service";

type Result = { ok: true } | { ok: false; error: string };

// R1-03 — reply 1 hội thoại (ghi message OUT). Chặn IDOR qua scopedDb.
export async function replyAction(conversationId: string, text: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  if (!text?.trim()) return { ok: false, error: "Nội dung trống" };

  const actor = await resolveActor(session.user.id);
  // Chỉ reply hội thoại trong phạm vi cơ sở của actor.
  const conv = await scopedDb(actor).messengerConversation.findUnique({ where: { id: conversationId } });
  if (!conv) return { ok: false, error: "Không có quyền với hội thoại này" };

  await recordOutgoingMessage({ conversationId, text: text.trim(), sentAt: new Date() });
  revalidatePath("/admin/crm/messenger");
  return { ok: true };
}
