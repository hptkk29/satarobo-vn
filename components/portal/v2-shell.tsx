"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import {
  Home,
  Users,
  CalendarDays,
  MessageSquareText,
  Image as ImageIcon,
  Award,
  Wallet,
  CalendarPlus,
  ClipboardList,
  Bell,
  Settings,
  UserRound,
  ChevronDown,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Portal v2 (merge SataUI) — shell Cổng phụ huynh: sidebar coral + topbar profile chip.
// Nav map sang route /portal/* của main. Bọc .portal-v2 để accent coral.

type NavItem = { label: string; href: string; icon: LucideIcon };
const parentNav: NavItem[] = [
  { label: "Tổng quan", href: "/portal", icon: Home },
  { label: "Các con", href: "/portal/ho-so-con", icon: Users },
  { label: "Lịch học", href: "/portal/lich", icon: CalendarDays },
  { label: "Nhận xét", href: "/portal/nhan-xet", icon: MessageSquareText },
  { label: "Hình ảnh lớp", href: "/portal/hinh-anh", icon: ImageIcon },
  { label: "Học bạ", href: "/portal/hoc-ba", icon: Award },
  { label: "Học phí & công nợ", href: "/portal/hoc-phi", icon: Wallet },
  { label: "Yêu cầu học bù", href: "/portal/yeu-cau", icon: CalendarPlus },
  { label: "Khảo sát trung tâm", href: "/portal/khao-sat", icon: ClipboardList },
  { label: "Thông báo", href: "/portal/thong-bao", icon: Bell },
  { label: "Hồ sơ", href: "/portal/ho-so", icon: Settings },
];

function Logo() {
  return (
    <Link href="/portal" className="text-lg font-bold">
      <span className="bg-gradient-to-r from-orange-500 to-rose-500 bg-clip-text text-transparent">Sata</span>
      <span className="bg-gradient-to-r from-rose-500 to-orange-500 bg-clip-text text-transparent">Robo</span>
      <span className="ml-1 text-xs font-normal text-muted-foreground">Phụ huynh</span>
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  return href === "/portal" ? pathname === "/portal" : pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalV2Shell({
  parentName,
  notifCount,
  children,
}: {
  parentName: string;
  notifCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const initials = parentName.trim().split(/\s+/).slice(-1)[0]?.[0]?.toUpperCase() ?? "P";

  return (
    <div className="portal-v2 flex min-h-screen bg-muted/50" data-mode="parent">
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-card lg:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border/40 px-5">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {parentNav.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex w-full items-center gap-3 rounded-r-xl py-2.5 text-sm transition-all",
                  active
                    ? "border-l-4 border-accent bg-accent-soft pl-2 font-bold text-accent"
                    : "pl-3 font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="m-4 shrink-0 space-y-1 rounded-xl border border-accent/20 bg-accent-soft p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent">
            <UserRound className="size-3.5" /> Cổng Phụ Huynh
          </p>
          <p className="text-xs font-medium leading-relaxed text-muted-foreground">
            Quản lý lịch trình, học phí và tiến độ học tập của các con.
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-card/75 px-4 backdrop-blur-md lg:px-6">
          {/* Profile chip */}
          <span className="flex items-center gap-2.5 rounded-xl border border-accent/30 bg-accent-soft px-3 py-1.5 text-accent">
            <span className="grid size-6 shrink-0 place-items-center rounded-md bg-accent text-white">
              <UserRound className="size-3.5" />
            </span>
            <span className="flex flex-col items-start leading-tight">
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">Phụ huynh</span>
              <span className="max-w-[12rem] truncate text-sm font-bold">{parentName}</span>
            </span>
          </span>

          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/portal/thong-bao"
              aria-label="Thông báo"
              className="relative grid size-10 place-items-center rounded-xl text-foreground transition-colors hover:bg-muted"
            >
              <Bell className="size-5" />
              {notifCount > 0 && (
                <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-destructive text-[10px] font-bold text-white">
                  {notifCount > 9 ? "9+" : notifCount}
                </span>
              )}
            </Link>

            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-muted focus:outline-none">
                <span className="grid size-9 place-items-center rounded-lg bg-foreground text-sm font-bold uppercase text-background">
                  {initials}
                </span>
                <span className="hidden text-left md:block">
                  <span className="block text-sm font-semibold leading-tight text-foreground">{parentName}</span>
                  <span className="block text-xs font-medium text-muted-foreground">Phụ huynh</span>
                </span>
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl">
                <DropdownMenuLabel className="text-sm font-bold">{parentName}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/portal/ho-so")} className="cursor-pointer gap-2.5">
                  <Settings className="size-4 text-muted-foreground" /> Hồ sơ liên lạc
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => signOut({ callbackUrl: "/login" })}
                  className="cursor-pointer gap-2.5 text-destructive focus:text-destructive"
                >
                  <LogOut className="size-4" /> Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-clip p-4 sm:p-6">{children}</main>

        {/* Bottom nav (mobile) */}
        <nav className="sticky bottom-0 z-40 flex items-center justify-around border-t border-border bg-card px-1 py-1.5 lg:hidden">
          {parentNav.slice(0, 5).map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-medium",
                  active ? "text-accent" : "text-muted-foreground",
                )}
              >
                <Icon className="size-5" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
