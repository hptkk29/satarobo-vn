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
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Leads", href: "/admin/leads", icon: Users },
  { label: "Học viên", href: "/admin/students", icon: GraduationCap },
  { label: "Lớp học", href: "/admin/classes", icon: BookOpen },
  { label: "Giáo viên", href: "/admin/teachers", icon: UserCog },
  { label: "Tuyển dụng", href: "/admin/jobs", icon: Briefcase },
  { label: "Nội dung", href: "/admin/content", icon: FileText },
  { label: "Marketing", href: "/admin/marketing", icon: BarChart3 },
  { label: "Cài đặt", href: "/admin/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r bg-white">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/admin/dashboard" className="text-xl font-bold">
          <span className="text-[#F97316]">Sata</span>
          <span className="text-[#7C3AED]">Robo</span>
          <span className="ml-1 text-xs font-normal text-gray-400">Admin</span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto py-4">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-6 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-orange-50 text-[#F97316] border-r-2 border-[#F97316]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
