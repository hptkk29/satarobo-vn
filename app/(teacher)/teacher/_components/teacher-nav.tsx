"use client";

// L5 — navigation khung site giáo viên (shadcn/Tailwind thuần, không Magic/Motion).
// Trên host giaovien clean URL là /lich, /lop (rewrite → /teacher/*) nên active
// match cả 2 dạng path. L6/Vy bổ sung mục mới: thêm vào NAV_ITEMS là đủ.
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Award,
  BookOpenText,
  CalendarDays,
  ClipboardCheck,
  Clock,
  GraduationCap,
  Home,
  MessageSquareText,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/teacher", label: "Việc chưa xong", icon: Home },
  { href: "/teacher/lich", label: "Lịch dạy", icon: CalendarDays },
  { href: "/teacher/lop", label: "Lớp của tôi", icon: Users },
  // Batch 1 (10/07) — port từ satarobo-ui-giaovien: nhận xét buổi + chấm bài.
  { href: "/teacher/nhan-xet", label: "Nhận xét", icon: MessageSquareText },
  { href: "/teacher/cham-bai", label: "Chấm bài", icon: ClipboardCheck },
  // Batch 2 (10/07) — tài liệu giảng dạy + học bạ.
  { href: "/teacher/tai-lieu", label: "Tài liệu", icon: BookOpenText },
  { href: "/teacher/hoc-ba", label: "Học bạ", icon: GraduationCap },
  // Batch 3 (10/07) — bảng công + hoàn thành khoá.
  { href: "/teacher/bang-cong", label: "Bảng công", icon: Clock },
  { href: "/teacher/hoan-thanh", label: "Hoàn thành", icon: Award },
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
