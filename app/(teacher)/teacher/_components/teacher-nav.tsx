"use client";

// L5 — navigation khung site giáo viên (shadcn/Tailwind thuần, không Magic/Motion).
// Trên host giaovien clean URL là /lich, /lop (rewrite → /teacher/*) nên active
// match cả 2 dạng path. L6/Vy bổ sung mục mới: thêm vào NAV_ITEMS là đủ.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Home, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/teacher", label: "Việc chưa xong", icon: Home },
  { href: "/teacher/lich", label: "Lịch dạy", icon: CalendarDays },
  { href: "/teacher/lop", label: "Lớp của tôi", icon: Users },
] as const;

/** Path đang đứng có khớp item không — chấp nhận cả clean URL (bỏ /teacher). */
function isActive(pathname: string, href: string): boolean {
  const clean = href === "/teacher" ? "/" : href.slice("/teacher".length);
  return pathname === href || pathname === clean;
}

export function TeacherNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Điều hướng giáo viên"
      className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2"
    >
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              active
                ? "bg-orange-50 text-orange-600"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
            )}
          >
            <Icon className="h-4 w-4" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
