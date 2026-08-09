// components/chat/staff/types.ts — kiểu dữ liệu đi qua biên RSC → Client của màn chat
// nhân viên (site admin + site giáo viên).
//
// VÌ SAO KHAI LẠI THAY VÌ IMPORT TỪ `lib/chat/queries.ts`: file đó import `@/lib/db`
// (Prisma). `import type` bị xoá lúc biên dịch nên về lý thuyết an toàn, nhưng chỉ cần
// một lần ai đó đổi `import type` thành `import` (vd để lấy hằng `DELETED_MESSAGE_TEXT`)
// là kéo cả Prisma vào bundle client. Khai lại ở đây = biên rõ ràng, đúng tiền lệ
// `components/chat/chat-store.ts` (khối đầu file đó).
//
// `createdAt` để kiểu `Date`: React Server Components serialize Date qua biên RSC nguyên
// vẹn, và `useChatChannel`/`chat-store` nhận cả `Date` lẫn chuỗi ISO.

export type StaffChatKind = "CHAT" | "ANNOUNCEMENT" | "SYSTEM";

/** Một tin trong luồng — đúng hình dạng `ChatMessageView` của `lib/chat/queries.ts`. */
export type StaffChatMessage = {
  id: string;
  conversationId: string;
  kind: StaffChatKind;
  senderId: string | null;
  body: string;
  deleted: boolean;
  replyToId: string | null;
  clientMsgId: string | null;
  createdAt: Date;
};

/**
 * Thành viên hội thoại. `contact` CÓ MẶT với nhân viên và KHÔNG TỒN TẠI với phụ huynh —
 * quyết định đó nằm ở `getConversationMembers` (BR-30), UI chỉ hiển thị cái mình nhận
 * được, KHÔNG tự lọc lại.
 */
export type StaffChatMember = {
  userId: string;
  displayName: string;
  roleLabel: string;
  contact?: { phone: string | null; email: string | null };
};

/** Một dòng trong danh sách hội thoại (M1). */
export type StaffConversationItem = {
  conversationId: string;
  type: string;
  displayName: string;
  /** US-08 AC4 — nhóm này xếp dưới khối ACTIVE. */
  isArchived: boolean;
  statusLabel: string | null;
  lastMessageAt: Date | null;
  unreadCount: number;
  preview: string | null;
};

/**
 * Quyền của người đang xem TRÊN CHÍNH hội thoại đang mở — tính bằng `checkPermission`
 * ở SERVER (US-10 AC1: "assert cả UI lẫn server"). UI chỉ dùng để ẩn/hiện nút; mọi
 * Server Action vẫn tự kiểm quyền lần nữa qua `runAction` → `can()`.
 */
export type StaffChatCapabilities = {
  canSend: boolean;
  canAnnounce: boolean;
  canModerate: boolean;
};

/** US-10 AC4 — "đã đọc 12/30" + ai chưa đọc. */
export type StaffAnnouncementStats = {
  messageId: string;
  readCount: number;
  totalRecipients: number;
  unreadMembers: { userId: string; displayName: string }[];
};

/** Cùng hợp đồng với `ActionResult` của `lib/actions/factory.ts` (mã EN + thông điệp VI). */
export type StaffActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string; field?: string } };
