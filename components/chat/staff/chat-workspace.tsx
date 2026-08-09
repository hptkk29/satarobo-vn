// components/chat/staff/chat-workspace.tsx — MÀN CHAT DÙNG CHUNG cho site admin
// (`/tin-nhan`) và site giáo viên (`/teacher/tin-nhan`).
//
// Server Component: đọc dữ liệu qua `lib/chat/*` rồi giao cho các component client.
// Hai trang chỉ khác nhau ở cổng quyền vào trang + khung layout của site — mọi thứ còn
// lại (danh sách, luồng, thông báo, gỡ tin) là MỘT bản dùng chung, để hai bề mặt không
// bao giờ trôi lệch tính năng như hệ cũ.
//
// ⚠️ ĐỌC QUA `lib/chat/queries.ts` (dùng `db` trần) — CÓ CHỦ ĐÍCH, không đổi sang
// `scopedDb`: phạm vi đọc chat là PARTICIPANT-BASED, chặt hơn cách ly theo cơ sở
// (luật E-bis #5 + khối chú thích đầu `queries.ts`). GV dạy chéo cơ sở và học viên
// chuyển cơ sở đi qua scopedDb sẽ bị hiểu nhầm là "không phải thành viên".
//
// ⚠️ QUYỀN GỬI/THÔNG BÁO/GỠ TIN TÍNH Ở ĐÂY = Ở SERVER (US-10 AC1 "assert cả UI lẫn
// server"). Kết quả chỉ dùng để ẩn/hiện nút; mỗi Server Action tương ứng vẫn tự kiểm
// `can()` với target đọc từ DB, nên gọi thẳng action mà không qua nút vẫn bị chặn.
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { checkPermission } from "@/lib/auth/check-permission";
import {
  getConversationMembers,
  getMessagesPage,
  listConversationsForUser,
} from "@/lib/chat/queries";
import { getAnnouncementReadStats, listAnnouncements } from "@/lib/chat/announcements";
import { ChatThread } from "./chat-thread";
import { ConversationList } from "./conversation-list";
import { AnnouncementReadStats } from "./announcement-read-stats";
import type {
  StaffAnnouncementStats,
  StaffChatMember,
  StaffChatMessage,
  StaffConversationItem,
} from "./types";

/** Số thông báo mỗi trang ở tab "Xem tất cả thông báo". */
const ANNOUNCEMENT_PAGE_SIZE = 20;
/** Trần số thông báo được dựng sẵn thống kê đã-đọc ở server (mỗi bản = vài truy vấn). */
const STATS_PREFETCH_LIMIT = 10;

const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function disabledReasonOf(status: string): string | null {
  if (status === "ARCHIVED") return "Lớp đã kết thúc — hội thoại đã lưu trữ, chỉ xem lại.";
  if (status === "LOCKED") return "Hội thoại đang bị khoá — không gửi được tin mới.";
  return null;
}

export type StaffChatWorkspaceProps = {
  /** `User.id` người đang xem (đã qua `auth()` ở trang cha). */
  userId: string;
  /** Đường dẫn gốc của màn chat trên site đó: "/tin-nhan" hoặc "/teacher/tin-nhan". */
  basePath: string;
  /** `?c=` — hội thoại đang mở. */
  conversationId?: string;
  /** `?tab=thong-bao` — màn "Xem tất cả thông báo" (US-09 AC2). */
  tab?: string;
  /** `?ac=` — cursor trang thông báo. */
  announcementCursor?: string;
  /** Câu gợi ý khi người dùng chưa có hội thoại nào (khác nhau giữa admin và GV). */
  emptyHint: string;
};

export async function StaffChatWorkspace({
  userId,
  basePath,
  conversationId,
  tab,
  announcementCursor,
  emptyHint,
}: StaffChatWorkspaceProps) {
  const conversations = await listConversationsForUser(userId);

  const items: StaffConversationItem[] = conversations.map((c) => ({
    conversationId: c.conversationId,
    type: c.type,
    displayName: c.displayName,
    isArchived: c.isArchived,
    statusLabel: c.statusLabel,
    lastMessageAt: c.lastMessageAt,
    unreadCount: c.unreadCount,
    preview: c.lastMessage?.text ?? null,
  }));

  // Chỉ mở được hội thoại NẰM TRONG danh sách của chính mình → id lạ gõ tay rơi về
  // "chưa chọn", không lộ hội thoại có tồn tại hay không.
  const selected = conversationId
    ? (conversations.find((c) => c.conversationId === conversationId) ?? null)
    : null;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <aside
        className={`w-full shrink-0 lg:w-80 ${selected ? "hidden lg:block" : "block"}`}
        aria-label="Danh sách hội thoại"
      >
        <ConversationList
          items={items}
          basePath={basePath}
          selectedId={selected?.conversationId ?? null}
          emptyHint={emptyHint}
        />
      </aside>

      <section className={`min-w-0 flex-1 ${selected ? "block" : "hidden lg:block"}`}>
        {selected ? (
          tab === "thong-bao" ? (
            <AnnouncementsPanel
              userId={userId}
              basePath={basePath}
              conversationId={selected.conversationId}
              title={selected.displayName}
              classId={selected.type === "CLASS_GROUP" ? selected.subjectId : null}
              centerId={selected.centerId}
              cursor={announcementCursor}
            />
          ) : (
            <ThreadPanel
              userId={userId}
              basePath={basePath}
              conversationId={selected.conversationId}
              title={selected.displayName}
              status={selected.status}
              type={selected.type}
              classId={selected.type === "CLASS_GROUP" ? selected.subjectId : null}
              centerId={selected.centerId}
            />
          )
        ) : (
          items.length > 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
              Chọn một hội thoại bên trái để đọc và trả lời.
            </div>
          )
        )}
      </section>
    </div>
  );
}

async function ThreadPanel({
  userId,
  basePath,
  conversationId,
  title,
  status,
  type,
  classId,
  centerId,
}: {
  userId: string;
  basePath: string;
  conversationId: string;
  title: string;
  status: string;
  type: string;
  classId: string | null;
  centerId: string | null;
}) {
  const target = { classId, centerId };
  const [page, memberViews, pinnedPage, canSend, canAnnounce, canModerate] = await Promise.all([
    getMessagesPage(conversationId, userId),
    getConversationMembers(conversationId, userId),
    listAnnouncements(conversationId, userId, { limit: 1 }),
    checkPermission("chat:send", target),
    checkPermission("chat:announce", target),
    checkPermission("chat:moderate", target),
  ]);

  const members: StaffChatMember[] = memberViews.map((m) => ({
    userId: m.userId,
    displayName: m.displayName,
    roleLabel: m.roleLabel,
    ...(m.contact ? { contact: m.contact } : {}),
  }));

  const pinnedRaw = pinnedPage.announcements.find((a) => !a.deleted) ?? null;

  return (
    <ChatThread
      // Đổi hội thoại = luồng khác hẳn → remount để state trong hook không dính lại.
      key={conversationId}
      conversationId={conversationId}
      currentUserId={userId}
      title={title}
      subtitle={`${type === "CLASS_GROUP" ? "Nhóm lớp" : "Hội thoại riêng"} · ${members.length} thành viên`}
      initialMessages={page.messages as StaffChatMessage[]}
      initialHasMore={page.hasMore}
      initialCursor={page.nextCursor}
      members={members}
      capabilities={{ canSend, canAnnounce, canModerate }}
      pinnedAnnouncement={(pinnedRaw as StaffChatMessage | null) ?? null}
      disabledReason={disabledReasonOf(status)}
      announcementsHref={`${basePath}?c=${conversationId}&tab=thong-bao`}
      backHref={basePath}
    />
  );
}

/** US-09 AC2 — "Xem tất cả thông báo": lọc `kind=ANNOUNCEMENT`, mới nhất trước. */
async function AnnouncementsPanel({
  userId,
  basePath,
  conversationId,
  title,
  classId,
  centerId,
  cursor,
}: {
  userId: string;
  basePath: string;
  conversationId: string;
  title: string;
  classId: string | null;
  centerId: string | null;
  cursor?: string;
}) {
  const [page, canAnnounce] = await Promise.all([
    listAnnouncements(conversationId, userId, {
      limit: ANNOUNCEMENT_PAGE_SIZE,
      cursor: cursor ?? null,
    }),
    checkPermission("chat:announce", { classId, centerId }),
  ]);

  // Thống kê đã-đọc chỉ dành cho người có quyền gửi thông báo (permissions.md: PH ❌),
  // và chỉ dựng sẵn cho vài bản đầu — phần còn lại người dùng bấm "Làm mới" khi cần.
  const statsById = new Map<string, StaffAnnouncementStats>();
  if (canAnnounce) {
    const prefetch = page.announcements.slice(0, STATS_PREFETCH_LIMIT).filter((a) => !a.deleted);
    const results = await Promise.all(
      prefetch.map(async (a) => {
        try {
          return await getAnnouncementReadStats(a.id, userId);
        } catch {
          return null; // thống kê hỏng KHÔNG được làm chết cả trang thông báo
        }
      }),
    );
    for (const s of results) if (s) statsById.set(s.messageId, s);
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground sm:text-base">
            Thông báo · {title}
          </h2>
          <p className="text-xs text-muted-foreground">Mới nhất trước</p>
        </div>
        <Link
          href={`${basePath}?c=${conversationId}`}
          className="text-xs font-medium text-primary underline"
        >
          ← Về luồng hội thoại
        </Link>
      </div>

      {page.announcements.length === 0 ? (
        <p className="p-10 text-center text-sm text-muted-foreground">
          Nhóm này chưa có thông báo nào.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {page.announcements.map((a) => (
            <li key={a.id} className="px-4 py-3">
              <div className="flex items-start gap-2">
                <Megaphone className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p
                    className={`whitespace-pre-wrap text-sm ${a.deleted ? "italic text-muted-foreground" : "text-foreground"}`}
                  >
                    {a.body}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">{timeFmt.format(a.createdAt)}</p>
                  {canAnnounce && !a.deleted && (
                    <AnnouncementReadStats
                      messageId={a.id}
                      initial={statsById.get(a.id)}
                      className="mt-2"
                    />
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {page.hasMore && page.nextCursor && (
        <div className="border-t border-border p-3 text-center">
          <Link
            href={`${basePath}?c=${conversationId}&tab=thong-bao&ac=${encodeURIComponent(page.nextCursor)}`}
            className="text-sm font-medium text-primary underline"
          >
            Xem thông báo cũ hơn
          </Link>
        </div>
      )}
    </div>
  );
}
