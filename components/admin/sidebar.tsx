"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  UserCog,
  FileText,
  BarChart3,
  Settings,
  Briefcase,
  Trophy,
  IdCard,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Tổng quan",
    items: [{ label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "Khách hàng",
    items: [
      { label: "Leads", href: "/admin/leads", icon: Users },
      { label: "Học viên", href: "/admin/students", icon: GraduationCap },
      { label: "Lớp học", href: "/admin/classes", icon: BookOpen },
    ],
  },
  {
    label: "Nội bộ",
    items: [
      { label: "Giáo viên", href: "/admin/teachers", icon: UserCog },
      { label: "Nhân sự", href: "/admin/nhan-su", icon: IdCard },
      { label: "Tuyển dụng", href: "/admin/jobs", icon: Briefcase },
      { label: "Vinh danh", href: "/admin/honors", icon: Trophy },
    ],
  },
  {
    label: "Marketing",
    items: [
      { label: "Nội dung blog", href: "/admin/content", icon: FileText },
      { label: "Hình ảnh trang", href: "/admin/site-content", icon: ImageIcon },
      { label: "Tracking", href: "/admin/marketing", icon: BarChart3 },
    ],
  },
  {
    label: "Hệ thống",
    items: [{ label: "Cài đặt", href: "/admin/settings", icon: Settings }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-200 bg-white">
      <div className="flex h-16 items-center border-b border-neutral-200 px-6">
        <Link
          href="/admin/dashboard"
          className="group text-xl font-bold transition-opacity hover:opacity-90"
        >
          <span className="bg-gradient-to-r from-orange-500 to-purple-700 bg-clip-text text-transparent">
            Sata
          </span>
          <span className="bg-gradient-to-r from-purple-700 to-orange-500 bg-clip-text text-transparent">
            Robo
          </span>
          <span className="ml-1 text-xs font-normal text-neutral-400">Admin</span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-2">
            <p className="px-6 mb-1 text-[10px] uppercase tracking-widest font-semibold text-neutral-400">
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 px-6 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-orange-50 text-orange-700 border-l-2 border-orange-500"
                      : "text-neutral-600 hover:bg-neutral-50 hover:text-neutral-900",
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="border-t border-neutral-200 p-4 text-xs text-neutral-400">
        <p className="font-medium">Sata Robo Admin</p>
        <p>v4.UI.FINAL · 2026</p>
      </div>
    </aside>
  );
}
