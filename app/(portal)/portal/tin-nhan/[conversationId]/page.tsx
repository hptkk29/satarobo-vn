// M2 — Luồng hội thoại (nhóm lớp) phía phụ huynh: US-09 + US-10 AC3.
//
// RSC tải: trạng thái hội thoại + 30 tin mới nhất + thành viên + thông báo mới nhất,
// rồi giao cho Client Component `ChatThread` (realtime + optimistic). Không có
// `useEffect` fetch nào ở tầng client cho dữ liệu ban đầu.
//
// Cổng chặn: `listConversationsForUser` chỉ trả hội thoại mà người dùng còn là thành
// viên hiệu lực ⇒ không tìm thấy = `notFound()`. Không phân biệt "không tồn tại" với
// "không phải thành viên" — đúng quy ước của tầng query (không xác nhận hộ id có thật).

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Megaphone, Users } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  getConversationMembers,
  getMessagesPage,
  listConversationsForUser,
} from "@/lib/chat/queries";
import { listAnnouncements } from "@/lib/chat/announcements";
import { ChatThread } from "@/components/chat/portal/chat-thread";
import { AnnouncementReadMarker } from "@/components/chat/portal/announcement-read-marker";
import { formatChatTimestamp } from "@/components/chat/portal/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tin nhắn | Sata Robo", robots: { index: false } };

/** US-09 AC3 — ô nhập vô hiệu kèm ĐÚNG lý do, không gộp thành một câu chung chung. */
function sendGate(status: string): { canSend: boolean; reason: string | null } {
  if (status === "ARCHIVED") {
    return {
      canSend: false,
      reason: "Lớp đã kết thúc — hội thoại chỉ còn đọc, không gửi tin được.",
    };
  }
  if (status === "LOCKED") {
    return {
      canSend: false,
      reason: "Hội thoại đang bị khoá — vui lòng liên hệ quản trị viên.",
    };
  }
  return { canSend: true, reason: null };
}

export default async function PortalConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) notFound();
  const userId = session.user.id;
  const { conversationId } = await params;

  const conversations = await listConversationsForUser(userId);
  const conversation = conversations.find((c) => c.conversationId === conversationId);
  if (!conversation) notFound();

  const [page, members, announcements] = await Promise.all([
    getMessagesPage(conversationId, userId),
    getConversationMembers(conversationId, userId),
    listAnnouncements(conversationId, userId, { limit: 1 }),
  ]);

  const pinned = announcements.announcements[0] ?? null;
  const gate = sendGate(conversation.status);

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2">
        <Link
          href="/portal/tin-nhan"
          aria-label="Quay lại danh sách tin nhắn"
          className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-5" />
        </Link>
        <div className="min-w-0 flex-1 py-1">
          <h1 className="truncate text-lg font-bold text-foreground">
            {conversation.displayName}
          </h1>
          <p className="text-xs text-muted-foreground">
            {members.length} thành viên
            {conversation.statusLabel ? ` · ${conversation.statusLabel}` : ""}
          </p>
        </div>
        <Link
          href={`/portal/tin-nhan/${conversationId}/thanh-vien`}
          aria-label="Thành viên nhóm"
          className="grid size-11 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Users className="size-5" />
        </Link>
      </div>

      {pinned && (
        // Ghim thông báo MỚI NHẤT trên cùng (US-09 AC2). Mốc "đã đọc" ghi khi khối này
        // vào viewport (US-10 AC3) — không phải khi mở trang.
        <AnnouncementReadMarker messageId={pinned.id}>
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-primary">
                <Megaphone className="size-3.5" /> Thông báo mới nhất
              </p>
              <Link
                href={`/portal/tin-nhan/${conversationId}/thong-bao`}
                className="inline-flex min-h-[32px] shrink-0 items-center text-[11px] font-semibold text-primary hover:underline"
              >
                Xem tất cả thông báo
              </Link>
            </div>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground">
              {pinned.body}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {formatChatTimestamp(pinned.createdAt)}
            </p>
          </div>
        </AnnouncementReadMarker>
      )}

      <ChatThread
        conversationId={conversationId}
        currentUserId={userId}
        members={members.map((m) => ({
          userId: m.userId,
          displayName: m.displayName,
          roleLabel: m.roleLabel,
        }))}
        initialMessages={page.messages}
        initialCursor={page.nextCursor}
        initialHasMore={page.hasMore}
        canSend={gate.canSend}
        disabledReason={gate.reason}
      />
    </div>
  );
}
