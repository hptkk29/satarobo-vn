"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { ChevronDown, LogOut, User } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Chữ cái đầu để dựng avatar khi không có ảnh — tối đa 2 ký tự. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "GV";
  const last = parts[parts.length - 1]!;
  const first = parts[0]!;
  return (parts.length === 1 ? first.slice(0, 2) : first[0]! + last[0]!).toUpperCase();
}

export function UserMenu({ name }: { name: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring">
        <span className="brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
          {initialsOf(name)}
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
        <DropdownMenuLabel className="sm:hidden">
          <span className="block truncate text-sm font-bold text-foreground">{name}</span>
          <span className="block text-xs font-normal text-muted-foreground">Giáo viên</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="sm:hidden" />

        <DropdownMenuItem render={<Link href="/teacher/ho-so" />}>
          <User className="h-4 w-4" aria-hidden />
          Hồ sơ cá nhân
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          variant="destructive"
          onClick={() => signOut({ callbackUrl: "/login" })}
        >
          <LogOut className="h-4 w-4" aria-hidden />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
