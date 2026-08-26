"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { checkPermission } from "@/lib/auth/check-permission";
import { resolveActor } from "@/lib/auth/actor";
import { scopedDb } from "@/lib/db-scope";
import { recordOutgoingMessage } from "@/lib/crm/messenger-service";
import { MESSENGER_SEND_SAN_SANG, LY_DO_CHUA_GUI_DUOC } from "@/lib/crm/messenger-send-gate";

type Result = { ok: true } | { ok: false; error: string };

// R1-03 — reply 1 hội thoại (ghi message OUT). Chặn IDOR qua scopedDb.
export async function replyAction(conversationId: string, text: string): Promise<Result> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Chưa đăng nhập" };
  // RBAC gate: gửi tin = tương tác lead → cần quyền sửa lead (không chỉ đăng nhập).
  if (!(await checkPermission("leads:edit"))) return { ok: false, error: "Không có quyền" };

  // ─── S-2a (25/08/2026) — CHẶN CỨNG: nói thật thay vì báo thành công giả ───────
  //
  // Action này trước đây ghi một dòng `MessengerMessage` hướng OUT rồi trả
  // `{ ok: true }`, giao diện bắn toast "Đã gửi" — trong khi repo KHÔNG có lời gọi
  // nào ra Meta Send API, tức **khách không nhận được gì**.
  //
  // Chặn ở ĐÂY chứ không chỉ tắt nút: dòng OUT set `MessengerConversation.respondedAt`,
  // mà `lib/crm/sla.ts` đọc đúng cột đó để bật cảnh báo SLA-0. Để đường ghi mở là
  // ai gọi thẳng action cũng tắt được cảnh báo chậm phản hồi của một khách chưa ai
  // trả lời — báo cáo SLA đẹp lên bằng số liệu bịa.
  //
  // Nối Send API là tích hợp ngoài (token theo từng Page, quyền `pages_messaging`,
  // cửa sổ 24h) — xem `lib/crm/messenger-send-gate.ts` để biết còn thiếu gì và cách mở.
  if (!MESSENGER_SEND_SAN_SANG) return { ok: false, error: LY_DO_CHUA_GUI_DUOC };

  if (!text?.trim()) return { ok: false, error: "Nội dung trống" };

  const actor = await resolveActor(session.user.id);
  // Chỉ reply hội thoại trong phạm vi cơ sở của actor.
  const conv = await scopedDb(actor).messengerConversation.findUnique({ where: { id: conversationId } });
  if (!conv) return { ok: false, error: "Không có quyền với hội thoại này" };

  // ⚠️ Khi mở cờ: phải GỬI RA META TRƯỚC, gửi xong mới ghi dòng OUT dưới đây.
  // Ghi trước rồi gửi là quay lại đúng lỗi vừa vá — sổ nói đã trả lời, khách thì không.
  await recordOutgoingMessage({ conversationId, text: text.trim(), sentAt: new Date() });
  revalidatePath("/admin/crm/messenger");
  return { ok: true };
}
