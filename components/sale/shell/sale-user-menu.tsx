"use client";

import Link from "next/link";
import { ChevronDown, LogOut } from "lucide-react";
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

/**
 * Menu người dùng ở góc phải thanh đầu trang — hình dáng theo
 * `app/(teacher)/teacher/_components/user-menu.tsx`.
 *
 * ⚠️ `DropdownMenuGroup` BỌC NGOÀI `DropdownMenuLabel` là BẮT BUỘC, không phải
 *    cho đẹp: `DropdownMenuLabel` ở kho này là `Menu.GroupLabel` của base-ui, và
 *    thiếu `Menu.Group` bọc ngoài thì mở dropdown **sập cả tab** (đúng lỗi
 *    RoleSwitcher 10/07). Cùng cái bẫy đã ghi ở menu site GV.
 *
 * KHÔNG mượn của site GV: lối "về trang quản trị" (Sale thuần không có vai admin
 * để mà về) và lối "đào tạo nội bộ" (khác cờ, khác quyền). Bịa hai mục đó ra ở
 * đây là dựng hai liên kết chết.
 *
 * Menu hiện chỉ có lối ra vì `/sale/ho-so` chưa tồn tại. Thêm mục khi có trang
 * thật — không đặt sẵn mục dẫn tới 404.
 */
export function SaleUserMenu({ name }: { name: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-[color:var(--primary)]/40">
        <span className="s-brand-gradient flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white">
          {initialsOf(name, "TV")}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-semibold text-foreground">
            {name}
          </span>
          <span className="block text-xs text-muted-foreground">Tư vấn tuyển sinh</span>
        </span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        {/* Trên màn hẹp tên người bị ẩn ở nút bấm, nên nhắc lại trong menu —
            không thì mở menu ra không biết đang là ai. */}
        <DropdownMenuGroup className="sm:hidden">
          <DropdownMenuLabel>{name}</DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator className="sm:hidden" />
        {/* `render={<Link/>}` chứ không `asChild`: dropdown ở kho này là base-ui,
            không phải Radix — `asChild` không tồn tại và chỉ báo lỗi lúc typecheck
            nếu may mắn. Cùng cách site GV gắn liên kết vào mục menu. */}
        <DropdownMenuItem render={<Link href="/dang-xuat" />}>
          <LogOut className="h-4 w-4" aria-hidden />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
