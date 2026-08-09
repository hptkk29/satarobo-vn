"use server";

// lib/chat/_actions.ts — CỬA DUY NHẤT cho Client Component gọi vào module chat.
//
// ⚠️ LUẬT E-bis #1 (docs/chat-realtime/00-dieu-chinh-cho-repo.md): file `"use server"`
// CHỈ được export **async function**. Server-actions loader sinh export VALUE cho MỌI
// tên được export — một `export type` / `export const` ở đây làm cả module ném
// `ReferenceError` lúc eval ⇒ chết TOÀN BỘ action trong file. Vì vậy:
//   - KHÔNG `export type`, KHÔNG `export const`, KHÔNG re-export `export { x } from`.
//   - Cần type ở nơi khác → import thẳng từ file định nghĩa (`lib/chat/queries.ts`, …).
//
// Vì sao có file này thay vì gọi thẳng: các hàm trong `lib/chat/queries.ts` /
// `announcements.ts` nhận `userId` TƯỜNG MINH (test được không cần phiên). Ở biên
// HTTP thì `userId` KHÔNG BAO GIỜ được nhận từ client — mọi hàm dưới đây tự `auth()`
// rồi mới truyền xuống. `sendChatMessage`/`recallOwnMessage` đã tự `auth()` bên trong
// nên chỉ bọc mỏng để client có một chỗ import duy nhất.

import { auth } from "@/lib/auth";
import { sendChatMessage } from "@/lib/chat/messages";
import { recallOwnMessage } from "@/lib/chat/moderation";
import { markAnnouncementRead } from "@/lib/chat/announcements";
import {
  fetchMessagesSince,
  getMessagesPage,
  markConversationRead,
  type MessagePage,
  type MessagesSincePage,
} from "@/lib/chat/queries";
import type { ActionResult } from "@/lib/actions/factory";
import type { SentChatMessage } from "@/lib/chat/messages";
import type { DeletedChatMessage } from "@/lib/chat/moderation";

/** Lớp lỗi nghiệp vụ của module chat — thông điệp đã viết SẴN cho người dùng cuối. */
const DOMAIN_ERROR_NAMES = new Set(["ChatQueryError", "ChatAnnouncementError"]);

/**
 * Lỗi tầng đọc → cùng hình dạng `ActionResult` với các action ghi (client chỉ xử 1 kiểu).
 *
 * CHỈ lỗi nghiệp vụ mới được đi nguyên văn ra client. Lỗi khác (Prisma, mạng…) trả
 * thông điệp chung — `PrismaClientKnownRequestError` cũng có thuộc tính `code`, lọc
 * theo `code` là đủ để rò tên bảng/ràng buộc ra màn hình phụ huynh.
 */
function readFail(err: unknown): { ok: false; error: { code: string; message: string } } {
  if (err instanceof Error && DOMAIN_ERROR_NAMES.has(err.name)) {
    const code =
      "code" in err && typeof (err as { code: unknown }).code === "string"
        ? (err as { code: string }).code
        : "FORBIDDEN";
    return { ok: false, error: { code, message: err.message } };
  }
  console.error("[chat/_actions] lỗi không lường trước:", err);
  return {
    ok: false,
    error: { code: "INTERNAL", message: "Không tải được tin nhắn — vui lòng thử lại" },
  };
}

// ─── Ghi ────────────────────────────────────────────────────────────────────

/** F-SEND — gửi tin CHAT. `sendChatMessage` tự `auth()` + rate limit + broadcast. */
export async function sendChatMessageAction(
  input: unknown,
): Promise<ActionResult<SentChatMessage>> {
  return sendChatMessage(input);
}

/** US-12 AC1 — tác giả tự thu hồi tin ≤15'. Server là chốt chặn, không phải nút UI. */
export async function recallOwnMessageAction(
  input: unknown,
): Promise<ActionResult<DeletedChatMessage>> {
  return recallOwnMessage(input);
}

/** US-07 AC5 — hội thoại đang mở ở foreground: `unreadCount` về 0. */
export async function markConversationReadAction(
  conversationId: string,
  lastReadMessageId: string | null,
): Promise<ActionResult<{ unreadCount: number }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: { code: "AUTH", message: "Chưa đăng nhập" } };
  try {
    const res = await markConversationRead(conversationId, session.user.id, lastReadMessageId);
    return { ok: true, data: { unreadCount: res.unreadCount } };
  } catch (err) {
    return readFail(err);
  }
}

/**
 * US-10 AC3 — ghi mốc PH đã đọc thông báo. UI gọi khi thông báo VÀO VIEWPORT
 * (IntersectionObserver), KHÔNG phải khi mở app: server không tự suy ra được điều đó.
 * Idempotent — gọi lại giữ nguyên `readAt`.
 */
export async function markAnnouncementReadAction(
  messageId: string,
): Promise<ActionResult<{ alreadyRead: boolean }>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: { code: "AUTH", message: "Chưa đăng nhập" } };
  try {
    const res = await markAnnouncementRead(messageId, session.user.id);
    return { ok: true, data: { alreadyRead: res.alreadyRead } };
  } catch (err) {
    return readFail(err);
  }
}

// ─── Đọc (cho client — RSC gọi thẳng `lib/chat/queries.ts`) ─────────────────

/**
 * US-07 AC2 — đường BÙ TIN duy nhất khi kênh realtime rớt. `useChatChannel` gọi hàm
 * này ở MỌI lần channel về `SUBSCRIBED`.
 */
export async function fetchMessagesSinceAction(
  conversationId: string,
  lastSeenMessageId: string | null,
): Promise<ActionResult<MessagesSincePage>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: { code: "AUTH", message: "Chưa đăng nhập" } };
  try {
    return { ok: true, data: await fetchMessagesSince(conversationId, session.user.id, lastSeenMessageId) };
  } catch (err) {
    return readFail(err);
  }
}

/** US-09 AC1 — cuộn lên tải tiếp 30 tin cũ hơn (cursor `(createdAt, id)`, không OFFSET). */
export async function getMessagesPageAction(
  conversationId: string,
  cursor: string | null,
): Promise<ActionResult<MessagePage>> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: { code: "AUTH", message: "Chưa đăng nhập" } };
  try {
    return { ok: true, data: await getMessagesPage(conversationId, session.user.id, { cursor }) };
  } catch (err) {
    return readFail(err);
  }
}
