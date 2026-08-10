// M1 — danh sách hội thoại (US-08). Component THUẦN (không `"use client"`): nó chỉ nhận
// dữ liệu đã dựng sẵn và render link, nên chạy được trong Server Component và không tốn
// một byte JS nào ở client.
//
// AC4 — khối ARCHIVED xếp XUỐNG DƯỚI khối ACTIVE (tầng query cố ý không làm việc này:
// `compareConversations` chỉ sắp theo `lastMessageAt` để một quy tắc dùng chung mọi bề mặt).
import Link from "next/link";
import { Archive, Lock, MessageSquare, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StaffConversationItem } from "./types";

const dayFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  day: "2-digit",
  month: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("vi-VN", {
  timeZone: "Asia/Ho_Chi_Minh",
  hour: "2-digit",
  minute: "2-digit",
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** Trong 24h hiện giờ, xa hơn hiện ngày — đủ để quét mắt, không chiếm chỗ trên mobile. */
function stamp(d: Date | null): string {
  if (!d) return "";
  return Date.now() - d.getTime() < DAY_MS ? timeFmt.format(d) : dayFmt.format(d);
}

export function ConversationList({
  items,
  basePath,
  selectedId,
  emptyHint,
  startHref,
  startLabel,
}: {
  items: StaffConversationItem[];
  /** "/tin-nhan" (admin) hoặc "/teacher/tin-nhan" (site GV). */
  basePath: string;
  selectedId: string | null;
  emptyHint: string;
  /** F5 — vai không có nhóm lớp tự sinh (sale) cần được CHỈ ĐƯỜNG, không chỉ báo "trống". */
  startHref?: string;
  startLabel?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
        <p>{emptyHint}</p>
        {startHref && startLabel && (
          <Link
            href={startHref}
            className="mt-3 inline-flex min-h-[36px] items-center rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground"
          >
            {startLabel}
          </Link>
        )}
      </div>
    );
  }

  const ordered = [...items].sort((a, b) => Number(a.isArchived) - Number(b.isArchived));
  const firstArchivedId = ordered.find((c) => c.isArchived)?.conversationId ?? null;

  return (
    <ul className="space-y-1.5">
      {ordered.map((c) => {
        const active = c.conversationId === selectedId;
        const isGroup = c.type === "CLASS_GROUP";
        return (
          <li key={c.conversationId}>
            {c.conversationId === firstArchivedId && (
              <p className="px-1 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Đã lưu trữ
              </p>
            )}
            <Link
              href={`${basePath}?c=${c.conversationId}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                // ≥44px chiều cao — vùng chạm mobile (US-08 AC5).
                "flex min-h-[56px] items-center gap-2.5 rounded-xl border px-3 py-2 transition-colors",
                active
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                  c.isArchived ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                )}
                aria-hidden
              >
                {isGroup ? <Users className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
              </span>

              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                    {c.displayName}
                  </span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {stamp(c.lastMessageAt)}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-1">
                  {c.statusLabel && (
                    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-muted px-1.5 py-px text-[10px] text-muted-foreground">
                      {c.isArchived ? (
                        <Archive className="h-2.5 w-2.5" aria-hidden />
                      ) : (
                        <Lock className="h-2.5 w-2.5" aria-hidden />
                      )}
                      {c.statusLabel}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {c.preview ?? "Chưa có tin nhắn"}
                  </span>
                  {c.unreadCount > 0 && (
                    <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                      {c.unreadCount > 9 ? "9+" : c.unreadCount}
                    </span>
                  )}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
