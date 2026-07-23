"use client";

import { useState } from "react";
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
  MessageSquarePlus,
  MessageSquare,
  Star,
  ImageIcon,
  MessageCircle,
  GraduationCap,
  ScrollText,
  Coins,
  Menu,
  X,
} from "lucide-react";

const ITEMS = [
  { label: "Trang chủ", href: "/portal", icon: Home },
  { label: "Thông báo", href: "/portal/thong-bao", icon: Bell },
  { label: "Lịch học", href: "/portal/lich-hoc", icon: CalendarDays },
  { label: "Bài giảng", href: "/portal/bai-giang", icon: BookOpen },
  { label: "Bài tập", href: "/portal/bai-tap", icon: ClipboardList },
  { label: "Bài thi", href: "/portal/bai-thi", icon: FileText },
  { label: "Kết quả", href: "/portal/ket-qua", icon: Award },
  { label: "Nhận xét", href: "/portal/nhan-xet", icon: MessageCircle },
  { label: "Tin nhắn", href: "/portal/tin-nhan", icon: MessageSquare },
  { label: "Hình ảnh", href: "/portal/hinh-anh", icon: ImageIcon },
  { label: "Yêu cầu", href: "/portal/yeu-cau", icon: MessageSquarePlus },
  { label: "Học phí", href: "/portal/hoc-phi", icon: CreditCard },
  { label: "Đánh giá", href: "/portal/danh-gia", icon: Star },
  { label: "Đánh giá GV", href: "/portal/danh-gia-gv", icon: Star, flag: "eval" as const },
  { label: "Khảo sát", href: "/portal/khao-sat", icon: ClipboardList },
  { label: "Học bạ", href: "/portal/hoc-ba", icon: ScrollText },
  { label: "SataCoin", href: "/portal/satacoin", icon: Coins },
  { label: "Hồ sơ con", href: "/portal/ho-so-con", icon: GraduationCap },
  { label: "Hồ sơ", href: "/portal/ho-so", icon: User },
  { label: "Hướng dẫn", href: "/portal/huong-dan", icon: BookOpen },
];

// Sidebar DỌC (commit 2): desktop hiển thị cố định bên trái; mobile thu gọn thành
// nút "Menu" mở/đóng. Mọi mục truy cập được, không scroll ngang.
export function PortalNav({
  notifCount = 0,
  msgCount = 0,
  evalV2Enabled = false,
}: {
  notifCount?: number;
  msgCount?: number;
  evalV2Enabled?: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Mục gắn flag "eval" chỉ hiện khi EVAL_V2_ENABLED (R7-16).
  const items = ITEMS.filter((it) => !("flag" in it) || (it.flag === "eval" && evalV2Enabled));

  function List({ onNavigate }: { onNavigate?: () => void }) {
    return (
      <nav className="flex flex-col gap-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            item.href === "/portal"
              ? pathname === "/portal"
              : pathname.startsWith(item.href);
          const badge =
            item.href === "/portal/thong-bao" && notifCount > 0
              ? notifCount
              : item.href === "/portal/tin-nhan" && msgCount > 0
                ? msgCount
                : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-orange-500 text-white"
                  : "text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
              {badge > 0 && (
                <span className="inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
                  {badge > 9 ? "9+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <>
      {/* Mobile: nút Menu mở danh sách dọc */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex w-full items-center justify-between rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-700"
          aria-expanded={open}
        >
          <span className="inline-flex items-center gap-2">
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            Menu
          </span>
          {!open && notifCount + msgCount > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">
              {notifCount + msgCount > 9 ? "9+" : notifCount + msgCount}
            </span>
          )}
        </button>
        {open && (
          <div className="mt-2 rounded-xl border border-neutral-200 bg-white p-2">
            <List onNavigate={() => setOpen(false)} />
          </div>
        )}
      </div>

      {/* Desktop: sidebar dọc cố định */}
      <aside className="hidden w-56 shrink-0 lg:block">
        <div className="sticky top-20 rounded-xl border border-neutral-200 bg-white p-2">
          <List />
        </div>
      </aside>
    </>
  );
}
