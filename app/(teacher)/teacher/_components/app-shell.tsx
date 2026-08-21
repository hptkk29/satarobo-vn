"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { useChatUnread } from "@/components/chat/use-chat-unread";
import { cn } from "@/lib/utils";
import { Sidebar, SidebarContent } from "./sidebar";
import { TeacherThemeRoot } from "./teacher-theme";
import { Topbar } from "./topbar";

/**
 * Khung site giáo viên — port từ TeachUI `components/layout/app-shell.tsx`.
 * Sidebar cố định 16rem trên desktop, chuyển thành drawer trượt trên mobile.
 */
export function AppShell({
  userId,
  userName,
  adminReturnUrl,
  elearningUrl,
  chatUnread = 0,
  children,
}: {
  /** `User.id` — topic realtime `user:{id}` cho badge tin nhắn. */
  userId: string;
  userName: string;
  /** F3 (Q41) — URL admin cho GV kiêm nhiệm; undefined = không hiện lối về admin. */
  adminReturnUrl?: string;
  /** EL-01 — lối vào khu đào tạo nội bộ; null = cờ OFF → ẩn mục menu. */
  elearningUrl?: string | null;
  /** Số tin chưa đọc do layout (RSC) tính — số ban đầu, KHÔNG fetch ở client. */
  chatUnread?: number;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sidebar được render Ở HAI NƠI (desktop + drawer) nhưng CHỈ MỘT hook ở đây ⇒ đúng một
  // người nghe kênh `user:{id}` và một lượt hỏi lại server cho mỗi cụm tín hiệu.
  const chatCount = useChatUnread(userId, chatUnread);

  return (
    <TeacherThemeRoot>
      <Sidebar chatUnread={chatCount} />

      {/* Drawer mobile */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          drawerOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!drawerOpen}
      >
        <div
          className={cn(
            "absolute inset-0 bg-slate-900/40 transition-opacity",
            drawerOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setDrawerOpen(false)}
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-64 border-r border-border shadow-xl transition-transform",
            drawerOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="absolute top-4 right-3 z-10 rounded-lg p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Đóng menu"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
          <SidebarContent
            onNavigate={() => setDrawerOpen(false)}
            chatUnread={chatCount}
          />
        </div>
      </div>

      {/* Cột nội dung */}
      <div className="flex min-h-screen flex-1 flex-col lg:pl-64 print:pl-0">
        <Topbar
          userId={userId}
          userName={userName}
          adminReturnUrl={adminReturnUrl}
          elearningUrl={elearningUrl}
          onMenuClick={() => setDrawerOpen(true)}
        />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6 lg:px-8 print:max-w-none print:p-0">
          {children}
        </main>
      </div>

      <Toaster richColors position="top-right" closeButton />
    </TeacherThemeRoot>
  );
}
