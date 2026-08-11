"use client";

import { useRouter } from "next/navigation";
import { logoutToGate } from "@/lib/auth/logout-client";
import { BookOpenText, LogOut, ChevronDown, User, Search } from "lucide-react";
import { NotificationBell } from "@/components/admin/notification-bell";
import { RoleSwitcher } from "@/components/admin/role-switcher";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { roleLabel } from "@/lib/labels";

interface TopbarProps {
  userName?: string | null;
  userRole?: string;
  /** #13 — mọi vai trò user giữ; ≤1 vai thì RoleSwitcher tự ẩn. */
  roles?: string[];
  /** null = đang xem gộp mọi vai trò. */
  activeRole?: string | null;
}

export function Topbar({ userName, userRole, roles = [], activeRole = null }: TopbarProps) {
  const router = useRouter();
  const initials = userName
    ? userName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <header className="flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-6">
      {/* Search bar — Enter → trang kết quả /search?q= (tìm gộp lead/học viên/tin tức). */}
      <form action="/search" method="GET" className="hidden md:flex flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <input
            type="search"
            name="q"
            placeholder="Tìm leads, học viên, blog..."
            aria-label="Tìm leads, học viên, tin tức"
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-neutral-200 bg-neutral-50 focus:bg-white focus:border-primary focus:outline-none transition-colors"
          />
        </div>
      </form>

      <div className="flex items-center gap-2">
        {/* Module nhắc việc — chuông thông báo việc cần xử lý */}
        <RoleSwitcher roles={roles} activeRole={activeRole} />
        <NotificationBell />

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-neutral-50 outline-none transition-colors">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-primary text-white text-xs">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="hidden text-left md:block">
              <p className="text-sm font-medium text-neutral-900">{userName ?? "Admin"}</p>
              <p className="text-xs text-neutral-500">
                {roleLabel(userRole)}
              </p>
            </div>
            <ChevronDown className="h-4 w-4 text-neutral-400" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {/* /settings/profile không tồn tại (link chết cũ) → trỏ trang Cài đặt
                (có đổi mật khẩu). */}
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <User className="mr-2 h-4 w-4" /> Hồ sơ cá nhân
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/huong-dan")}>
              <BookOpenText className="mr-2 h-4 w-4" /> Hướng dẫn sử dụng
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-state-danger-ink focus:text-state-danger-ink"
              onClick={() => logoutToGate()}
            >
              <LogOut className="mr-2 h-4 w-4" /> Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
