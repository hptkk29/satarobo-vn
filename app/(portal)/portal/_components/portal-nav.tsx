"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  CalendarDays,
  BookOpen,
  ClipboardList,
  FileText,
  Award,
  CreditCard,
  User,
  Bell,
} from "lucide-react";

const ITEMS = [
  { label: "Trang chủ", href: "/portal", icon: Home },
  { label: "Thông báo", href: "/portal/thong-bao", icon: Bell },
  { label: "Lịch học", href: "/portal/lich-hoc", icon: CalendarDays },
  { label: "Bài giảng", href: "/portal/bai-giang", icon: BookOpen },
  { label: "Bài tập", href: "/portal/bai-tap", icon: ClipboardList },
  { label: "Bài thi", href: "/portal/bai-thi", icon: FileText },
  { label: "Kết quả", href: "/portal/ket-qua", icon: Award },
  { label: "Học phí", href: "/portal/hoc-phi", icon: CreditCard },
  { label: "Hồ sơ", href: "/portal/ho-so", icon: User },
];

export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === "/portal"
            ? pathname === "/portal"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-orange-500 text-white"
                : "text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
