"use client";

import Link from "next/link";
import { logoutToGate } from "@/lib/auth/logout-client";
import {
  BookOpenText,
  ChevronDown,
  LayoutGrid,
  LogOut,
  User,
} from "lucide-react";
import { initialsOf } from "@/lib/ui/initials";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({
  name,
  adminReturnUrl,
}: {
  name: string;
  /** F3 (Q41) — GV kiêm nhiệm: lối quay về trang quản trị. undefined = ẩn. */
  adminReturnUrl?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
          {initialsOf(name, "GV")}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-bold text-foreground">
            {name}
          </span>
          <span className="block text-xs text-muted-foreground">Giáo viên</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* Group BẮT BUỘC: DropdownMenuLabel = Menu.GroupLabel của base-ui — thiếu
            <Menu.Group> bọc ngoài là mở dropdown crash cả tab (như RoleSwitcher 10/07). */}
        <DropdownMenuGroup className="sm:hidden">
          <DropdownMenuLabel>
            <span className="block truncate text-sm font-bold text-foreground">
              {name}
            </span>
            <span className="block text-xs font-normal text-muted-foreground">
              Giáo viên
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
        </DropdownMenuGroup>

        <DropdownMenuItem render={<Link href="/teacher/ho-so" />}>
          <User className="h-4 w-4" aria-hidden />
          Hồ sơ cá nhân
        </DropdownMenuItem>

        <DropdownMenuItem render={<Link href="/teacher/huong-dan" />}>
          <BookOpenText className="h-4 w-4" aria-hidden />
          Hướng dẫn sử dụng
        </DropdownMenuItem>

        {adminReturnUrl ? (
          <DropdownMenuItem
            onClick={() => window.location.assign(adminReturnUrl)}
          >
            <LayoutGrid className="h-4 w-4" aria-hidden />
            Về trang quản trị
          </DropdownMenuItem>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem variant="destructive" onClick={() => logoutToGate()}>
          <LogOut className="h-4 w-4" aria-hidden />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
