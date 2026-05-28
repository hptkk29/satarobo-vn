"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  UserCog,
  BarChart3,
  Settings,
  Briefcase,
  Trophy,
  IdCard,
  Image as ImageIcon,
  Newspaper,
  Package,
  Boxes,
  MapPin,
  DoorOpen,
  CalendarOff,
  ClipboardList,
  CalendarDays,
  ClipboardCheck,
  KeyRound,
  ScrollText,
  CreditCard,
  ShoppingBag,
  Ticket,
  Package2,
  Mail,
  Send,
  FlaskConical,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Tổng quan",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { label: "CRM", href: "/crm", icon: BarChart3 },
    ],
  },
  {
    label: "Khách hàng",
    items: [
      { label: "Leads", href: "/leads", icon: Users },
      { label: "Học thử", href: "/trials", icon: FlaskConical },
      { label: "Học viên", href: "/students", icon: GraduationCap },
      { label: "Lớp học", href: "/classes", icon: BookOpen },
      { label: "Nhóm lớp", href: "/class-groups", icon: Boxes },
      { label: "Đăng ký học", href: "/enrollments", icon: ClipboardList },
    ],
  },
  {
    label: "Vận hành lớp",
    items: [
      { label: "Buổi học", href: "/sessions", icon: CalendarDays },
      { label: "Điểm danh", href: "/attendance", icon: ClipboardCheck },
    ],
  },
  {
    label: "Hệ thống cơ sở",
    items: [
      { label: "Cơ sở", href: "/centers", icon: MapPin },
      { label: "Phòng học", href: "/rooms", icon: DoorOpen },
      { label: "Lịch nghỉ", href: "/holidays", icon: CalendarOff },
    ],
  },
  {
    label: "Nội bộ",
    items: [
      { label: "Giáo viên", href: "/teachers", icon: UserCog },
      { label: "Nhân sự", href: "/nhan-su", icon: IdCard },
      { label: "Tài khoản", href: "/users", icon: KeyRound },
      { label: "Tuyển dụng", href: "/jobs", icon: Briefcase },
      { label: "Vinh danh", href: "/honors", icon: Trophy },
    ],
  },
  {
    label: "Sản phẩm",
    items: [
      { label: "Khoá học (Packages)", href: "/course-packages", icon: Boxes },
      { label: "Học cụ (Kits)", href: "/kits", icon: Package },
      { label: "Sản phẩm bán/thuê", href: "/products", icon: Package2 },
    ],
  },
  {
    label: "Marketing",
    items: [
      { label: "Tin tức", href: "/news", icon: Newspaper },
      { label: "Thông báo PH", href: "/notifications", icon: Bell },
      { label: "Hình ảnh trang", href: "/site-content", icon: ImageIcon },
      { label: "Tracking", href: "/marketing", icon: BarChart3 },
    ],
  },
  {
    label: "Tài chính",
    items: [
      { label: "Đơn hàng", href: "/orders", icon: ShoppingBag },
      { label: "Mã khuyến mãi", href: "/vouchers", icon: Ticket },
      { label: "Phương thức TT", href: "/payment-methods", icon: CreditCard },
    ],
  },
  {
    label: "Hệ thống",
    items: [
      { label: "Email Templates", href: "/email-templates", icon: Mail },
      { label: "Email Logs", href: "/email-logs", icon: Send },
      { label: "Audit Log", href: "/audit-log", icon: ScrollText },
      { label: "Cài đặt", href: "/settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-64 flex-col border-r border-neutral-200 bg-white">
      <div className="flex h-16 items-center border-b border-neutral-200 px-6">
        <Link
          href="/dashboard"
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
