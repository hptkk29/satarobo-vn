// M1 — Danh sách hội thoại của phụ huynh (US-08).
//
// ĐÃ THAY hệ chat cũ (`lib/conversation/service.ts` + `ConversationMessage`) bằng hệ
// `Conversation/ConversationParticipant/Message` — chốt Q3, `docs/chat-realtime/
// 00-dieu-chinh-cho-repo.md`. Hệ cũ GIỮ NGUYÊN trong repo, chỉ không còn dùng ở route này.
//
// RSC thuần: `listConversationsForUser` đã lo phạm vi (participant còn hiệu lực),
// thứ tự (lastMessageAt DESC, NULL cuối) và dòng preview (tin đã gỡ → "Tin nhắn đã
// được gỡ"). Trang này KHÔNG lọc lại gì — chỉ tách khối ARCHIVED xuống dưới (AC4).

import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { auth } from "@/lib/auth";
import { listConversationsForUser, type ConversationListItem } from "@/lib/chat/queries";
import { formatConversationTime } from "@/components/chat/portal/format";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tin nhắn | Sata Robo", robots: { index: false } };

function ConversationRow({ item, now }: { item: ConversationListItem; now: Date }) {
  const preview = item.lastMessage;
  return (
    <li>
      <Link
        href={`/portal/tin-nhan/${item.conversationId}`}
        // AC5 — vùng chạm ≥44px trên mobile 360px; `min-w-0` + `truncate` để tên lớp
        // dài không đẩy badge ra ngoài khung.
        className="flex min-h-[64px] items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 transition-colors hover:bg-muted"
      >
        <span
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-full",
            item.isArchived ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
          )}
          aria-hidden
        >
          <MessagesSquare className="size-5" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-sm text-foreground",
                item.unreadCount > 0 ? "font-bold" : "font-semibold",
              )}
            >
              {item.displayName}
            </span>
            {item.lastMessageAt && (
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {formatConversationTime(item.lastMessageAt, now)}
              </span>
            )}
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-xs",
                preview?.deleted ? "italic text-muted-foreground" : "text-muted-foreground",
              )}
            >
              {preview ? preview.text : "Chưa có tin nhắn nào"}
            </span>
            {item.unreadCount > 0 && (
              <span className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                {item.unreadCount > 9 ? "9+" : item.unreadCount}
              </span>
            )}
          </span>
          {item.statusLabel && (
            <span className="mt-1 inline-flex rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
              {item.statusLabel}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}

export default async function PortalMessagesPage() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
        Vui lòng đăng nhập để xem tin nhắn.
      </p>
    );
  }

  const conversations = await listConversationsForUser(session.user.id);
  // AC4 — ARCHIVED xuống dưới; trong mỗi khối giữ NGUYÊN thứ tự của query.
  const active = conversations.filter((c) => !c.isArchived);
  const archived = conversations.filter((c) => c.isArchived);
  const now = new Date();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-foreground">Tin nhắn</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nhóm lớp của con — trao đổi trực tiếp với giáo viên và trung tâm.
        </p>
      </div>

      {conversations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Chưa có hội thoại nào. Nhóm lớp sẽ xuất hiện ở đây khi lớp của con bắt đầu hoạt động.
        </p>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <ul className="space-y-2">
              {active.map((c) => (
                <ConversationRow key={c.conversationId} item={c} now={now} />
              ))}
            </ul>
          )}

          {archived.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Đã lưu trữ
              </h2>
              <ul className="space-y-2">
                {archived.map((c) => (
                  <ConversationRow key={c.conversationId} item={c} now={now} />
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
