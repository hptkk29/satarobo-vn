// Badge "Tin nhắn" của shell portal — TỔNG chưa đọc của hệ chat MỚI.
//
// Thay `countUnreadForParent` (`lib/conversation/service.ts`) của hệ `ConversationMessage`
// cũ: tab `/portal/tin-nhan` nay đọc hệ `Conversation/Message`, để badge chạy nguồn cũ
// thì con số trên nav và nội dung trong tab là hai thế giới khác nhau. Hệ cũ vẫn còn
// nguyên trong repo (chốt Q3 — thay ở route, không xoá code).
//
// Dùng lại `listConversationsForUser` (đúng 2 truy vấn, không N+1) thay vì viết SQL đếm
// riêng: chỉ có MỘT định nghĩa "hội thoại của tôi" cho cả badge lẫn màn M1 — hai định
// nghĩa là hai con số lệch nhau.

import { listConversationsForUser } from "@/lib/chat/queries";

export async function countChatUnreadForUser(userId: string): Promise<number> {
  const list = await listConversationsForUser(userId);
  return list.reduce((sum, c) => sum + c.unreadCount, 0);
}
