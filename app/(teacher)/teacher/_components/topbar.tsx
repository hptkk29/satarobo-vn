"use client";

import { Menu } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { NotificationBell } from "./notification-bell";

/**
 * Topbar site GV.
 *
 * Ô tìm kiếm toàn cục của TeachUI KHÔNG port — bản gốc là input chết, thêm một ô
 * không tìm được gì là nợ UX.
 *
 * Chuông thông báo (03/08): nguồn việc tồn đã có thật từ lâu (StaffNotification —
 * điểm danh bị sửa hồi tố, lịch dạy thay ngày mai, nhắc chốt buổi) nhưng chỉ hiện
 * ở chuông admin, mà GV thuần thì bị đá khỏi host admin từ 10/07 ⇒ ba luồng notify
 * đó chưa từng tới người nhận chính. Nay dùng chung API bell.
 */
export function Topbar({
  userName,
  adminReturnUrl,
  onMenuClick,
}: {
  userName: string;
  adminReturnUrl?: string;
  onMenuClick: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-card/90 px-4 backdrop-blur sm:px-6 print:hidden">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted lg:hidden"
        aria-label="Mở menu"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      <div className="ml-auto flex items-center gap-1 sm:gap-3">
        <NotificationBell />
        <ThemeToggle />
        <UserMenu name={userName} adminReturnUrl={adminReturnUrl} />
      </div>
    </header>
  );
}
