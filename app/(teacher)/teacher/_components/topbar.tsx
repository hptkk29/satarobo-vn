"use client";

import { Menu } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * Topbar site GV.
 *
 * TeachUI có thêm ô tìm kiếm toàn cục và chuông thông báo. Ô tìm kiếm ở bản gốc
 * là input chết (placeholder "Tìm leads, học viên, blog...") nên KHÔNG port —
 * thêm một ô không tìm được gì là nợ UX. Chuông thông báo cần nguồn việc tồn
 * thật (buổi chưa điểm danh / bài chưa chấm / đơn đã duyệt) → làm ở batch sau
 * cùng lúc với các trang sinh ra thông báo đó.
 */
export function Topbar({
  userName,
  onMenuClick,
}: {
  userName: string;
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
        <ThemeToggle />
        <UserMenu name={userName} />
      </div>
    </header>
  );
}
