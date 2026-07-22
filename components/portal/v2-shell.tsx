"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { logoutToGate } from "@/lib/auth/logout-client";
import { useSetActiveSite } from "@/components/portal/use-set-active-site";
import type { SwitcherChild } from "@/lib/portal/child-switcher-data";
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
  MessagesSquare,
  Menu,
  Settings,
  BookOpen,
  Star,
  UserRound,
  ChevronDown,
  LogOut,
  Palette,
  KeyRound,
  Check,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PortalAppearanceProvider } from "@/components/portal/appearance-provider";
import { PortalThemeToggle } from "@/components/portal/theme-toggle";

// Portal v2 (merge SataUI) — shell Cổng phụ huynh: sidebar coral + topbar profile chip.
// Nav map sang route /portal/* của main. Bọc .portal-v2 để accent coral.

type NavItem = { label: string; href: string; icon: LucideIcon; shortLabel?: string };
const parentNav: NavItem[] = [
  { label: "Tổng quan", href: "/portal", icon: Home },
  { label: "Các con", href: "/portal/ho-so-con", icon: Users },
  { label: "Lịch học", href: "/portal/lich", icon: CalendarDays },
  { label: "Nhận xét", href: "/portal/nhan-xet", icon: MessageSquareText },
  { label: "Hình ảnh lớp", href: "/portal/hinh-anh", icon: ImageIcon },
  { label: "Học bạ", href: "/portal/hoc-ba", icon: Award },
  { label: "Học phí & công nợ", href: "/portal/hoc-phi", icon: Wallet, shortLabel: "Học phí" },
  { label: "Yêu cầu học bù", href: "/portal/yeu-cau", icon: CalendarPlus },
  { label: "Khảo sát trung tâm", href: "/portal/khao-sat", icon: ClipboardList },
  { label: "Thông báo", href: "/portal/thong-bao", icon: Bell },
  { label: "Tin nhắn", href: "/portal/tin-nhan", icon: MessagesSquare },
  { label: "Hồ sơ", href: "/portal/ho-so", icon: Settings },
];

// Cổng học sinh (student-mode) — 6 mục, sidebar cam. Nav gọn quanh việc học của con.
const STUDENT_ROOT = "/portal/hoc-sinh";
const studentNav: NavItem[] = [
  { label: "Tổng quan", href: "/portal/hoc-sinh", icon: Home },
  { label: "Lịch học", href: "/portal/hoc-sinh/lich", icon: CalendarDays },
  { label: "Bài tập", href: "/portal/hoc-sinh/bai-tap", icon: ClipboardList },
  { label: "Buổi học", href: "/portal/hoc-sinh/buoi-hoc", icon: BookOpen },
  { label: "Đánh giá giáo viên", href: "/portal/hoc-sinh/danh-gia-gv", icon: Star, shortLabel: "Đánh giá" },
  { label: "Thông báo", href: "/portal/hoc-sinh/thong-bao", icon: Bell },
];

// Mobile (<lg): bottom nav = 4 mục hay dùng nhất; phần còn lại gom menu "Thêm".
const PARENT_BOTTOM = ["/portal", "/portal/lich", "/portal/hoc-phi", "/portal/thong-bao"];
const STUDENT_BOTTOM = ["/portal/hoc-sinh", "/portal/hoc-sinh/lich", "/portal/hoc-sinh/bai-tap", "/portal/hoc-sinh/thong-bao"];

function Logo({ href }: { href: string }) {
  return (
    <Link href={href} aria-label="Sata Robo — Trang chủ" className="flex items-center">
      <Image
        src="/brand/logo-satarobo.png"
        alt="Sata Robo"
        width={484}
        height={280}
        priority
        className="h-10 w-auto object-contain"
      />
    </Link>
  );
}

function isActive(pathname: string, href: string): boolean {
  // Trên host hocvien.* middleware REWRITE "/" → /portal và "/x" → /portal/x nhưng
  // URL trình duyệt giữ nguyên → usePathname() trả "/" hoặc "/hoc-ba" (thiếu prefix
  // /portal) → chuẩn hoá trước khi so, nếu không không mục nav nào được tô sáng.
  const p =
    pathname === "/" ? "/portal" : pathname.startsWith("/portal") ? pathname : `/portal${pathname}`;
  // Mục "Tổng quan" (parent /portal, student /portal/hoc-sinh) khớp CHÍNH XÁC —
  // nếu không sẽ sáng ở mọi trang con.
  if (href === "/portal" || href === STUDENT_ROOT) return p === href;
  return p === href || p.startsWith(`${href}/`);
}

export function PortalV2Shell({
  parentName,
  parentEmail,
  activeStudentName,
  notifCount,
  msgCount = 0,
  switcherChildren = [],
  children,
}: {
  parentName: string;
  parentEmail?: string | null;
  activeStudentName?: string | null;
  notifCount: number;
  msgCount?: number;
  switcherChildren?: SwitcherChild[];
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Mode = phụ huynh (coral, nav đầy đủ) hoặc học sinh (cam, 6 mục quanh việc học).
  // Suy từ URL (/portal/hoc-sinh/*) — stateless, sống qua điều hướng.
  const norm = pathname === "/" ? "/portal" : pathname.startsWith("/portal") ? pathname : `/portal${pathname}`;
  const isStudent = norm === STUDENT_ROOT || norm.startsWith(`${STUDENT_ROOT}/`);
  const nav = isStudent ? studentNav : parentNav;
  const rootHref = isStudent ? STUDENT_ROOT : "/portal";
  const bottomHrefs = isStudent ? STUDENT_BOTTOM : PARENT_BOTTOM;
  const bottomNav = bottomHrefs.flatMap((href) => {
    const item = nav.find((i) => i.href === href);
    return item ? [item] : [];
  });
  const moreNav = nav.filter((i) => !bottomHrefs.includes(i.href));

  // Badge số chưa đọc theo mục nav (Thông báo = chuông, Tin nhắn = hội thoại).
  const badgeFor = (href: string): number =>
    href.endsWith("/thong-bao") ? notifCount : href === "/portal/tin-nhan" ? msgCount : 0;
  const nameWords = parentName.trim().split(/\s+/).filter((w) => /\p{L}/u.test(w[0] ?? ""));
  const initials = nameWords.slice(-1)[0]?.[0]?.toUpperCase() ?? "P";

  return (
    // Giao diện (sáng/tối + màu nhấn theo vai trò) — scope trong .portal-v2,
    // không đụng admin/public. Provider tự render wrapper vì class `.dark` và
    // CSS variable màu nhấn phải nằm trên đúng phần tử này.
    <PortalAppearanceProvider
      role={isStudent ? "student" : "parent"}
      className="portal-v2 flex min-h-screen bg-muted/50"
    >
      {/* Sidebar (desktop) */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-border/60 bg-card lg:flex">
        <div className="flex h-16 shrink-0 items-center justify-center border-b border-border/40 px-5">
          <Logo href={rootHref} />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {nav.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const badge = badgeFor(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all",
                  active
                    ? "bg-primary/10 font-bold text-primary"
                    : "font-medium text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-[18px] shrink-0" />
                <span className="flex-1 text-left">{item.label}</span>
                {badge > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="m-4 shrink-0 rounded-xl border border-primary/20 bg-primary/5 p-3.5">
          <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary">
            <UserRound className="size-3.5" /> {isStudent ? "Cổng Học Sinh" : "Cổng Phụ Huynh"}
          </p>
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-card/75 px-4 backdrop-blur-md lg:px-6">
          {/* Switcher: Chế độ Phụ huynh / các con */}
          <ProfileSwitcher
            parentName={parentName}
            childrenList={switcherChildren}
            mode={isStudent ? "student" : "parent"}
            activeStudentName={activeStudentName ?? null}
          />


          <div className="ml-auto flex items-center gap-2">
            <PortalThemeToggle />

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
              <DropdownMenuContent align="end" className="w-60 rounded-2xl">
                <div className="flex flex-col gap-0.5 px-1.5 py-2">
                  <span className="text-sm font-bold text-foreground">{parentName}</span>
                  {parentEmail && <span className="truncate text-xs font-medium text-muted-foreground">{parentEmail}</span>}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/portal/ho-so")} className="cursor-pointer gap-2.5">
                  <Settings className="size-4 text-muted-foreground" /> Hồ sơ liên lạc
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => router.push("/portal/giao-dien")}
                  className="cursor-pointer gap-2.5"
                >
                  <Palette className="size-4 text-muted-foreground" /> Giao diện
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => router.push("/portal/ho-so")} className="cursor-pointer gap-2.5">
                  <KeyRound className="size-4 text-muted-foreground" /> Đổi mật khẩu
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => logoutToGate()}
                  className="cursor-pointer gap-2.5 text-destructive focus:text-destructive"
                >
                  <LogOut className="size-4" /> Đăng xuất
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-clip p-4 sm:p-6">{children}</main>

        {/* Bottom nav (mobile): 4 mục đầu + menu "Thêm" chứa các mục còn lại */}
        <nav className="sticky bottom-0 z-40 flex items-center justify-around border-t border-border bg-card px-1 py-1.5 lg:hidden">
          {bottomNav.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            const badge = badgeFor(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-medium",
                  active ? "text-accent" : "text-muted-foreground",
                )}
              >
                <span className="relative">
                  <Icon className="size-5" />
                  {badge > 0 && (
                    <span className="absolute -right-2.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-white">
                      {badge > 9 ? "9+" : badge}
                    </span>
                  )}
                </span>
                <span className="truncate">{item.shortLabel ?? item.label}</span>
              </Link>
            );
          })}
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Mở thêm mục"
              className={cn(
                "relative flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1 text-[10px] font-medium focus:outline-none",
                moreNav.some((item) => isActive(pathname, item.href))
                  ? "text-accent"
                  : "text-muted-foreground",
              )}
            >
              <Menu className="size-5" />
              <span className="truncate">Thêm</span>
              {moreNav.some((item) => badgeFor(item.href) > 0) && (
                <span className="absolute right-1/4 top-0.5 size-2 rounded-full bg-destructive" />
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="w-56 rounded-2xl">
              {moreNav.map((item) => {
                const Icon = item.icon;
                const badge = badgeFor(item.href);
                return (
                  <DropdownMenuItem
                    key={item.href}
                    onClick={() => router.push(item.href)}
                    className={cn(
                      "cursor-pointer gap-2.5",
                      isActive(pathname, item.href) && "font-bold text-accent focus:text-accent",
                    )}
                  >
                    <Icon className="size-4 text-muted-foreground" /> {item.label}
                    {badge > 0 && (
                      <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-white">
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </nav>
      </div>
    </PortalAppearanceProvider>
  );
}

// Switcher topbar: "Chế độ Phụ huynh" (về Tổng quan) + đổi con đang xem (setActiveSite).
const SWITCH_COLORS = [
  "oklch(0.748 0.169 56.8)",
  "oklch(0.62 0.18 250)",
  "oklch(0.62 0.17 150)",
  "oklch(0.6 0.2 300)",
  "oklch(0.62 0.2 20)",
];

function ProfileSwitcher({
  parentName,
  childrenList,
  mode,
  activeStudentName,
}: {
  parentName: string;
  childrenList: SwitcherChild[];
  mode: "parent" | "student";
  activeStudentName: string | null;
}) {
  const router = useRouter();
  const { pending, switchTo } = useSetActiveSite();
  const isStudent = mode === "student";

  // Đổi con → vào Cổng học sinh của con đó (setActiveSite + điều hướng student mode).
  const enterStudent = (id: string) =>
    switchTo(id, {
      onSuccess: (r) => {
        r.push(STUDENT_ROOT);
        r.refresh();
      },
    });
  const goParent = () => router.push("/portal");

  // Chip: cam khi ở Cổng học sinh, coral khi Cổng phụ huynh.
  const chipCls = isStudent
    ? "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15"
    : "border-accent/30 bg-accent-soft text-accent hover:bg-accent/15";
  const chipAvatar = isStudent ? "bg-primary" : "bg-accent";
  const chipOverline = isStudent ? "Học sinh" : "Phụ huynh";
  const chipName = isStudent ? (activeStudentName ?? "Học sinh").split(/\s+/).slice(-2).join(" ") : parentName;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className={cn(
          "flex items-center gap-2.5 rounded-xl border px-3 py-1.5 transition-colors focus:outline-none disabled:opacity-60",
          chipCls,
        )}
      >
        <span className={cn("grid size-6 shrink-0 place-items-center rounded-md text-white", chipAvatar)}>
          <UserRound className="size-3.5" />
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="text-[10px] font-bold uppercase tracking-wider opacity-70">{chipOverline}</span>
          <span className="max-w-[12rem] truncate text-sm font-bold">{chipName}</span>
        </span>
        <ChevronDown className="size-3.5 shrink-0 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 rounded-2xl">
        <DropdownMenuItem onClick={goParent} className="cursor-pointer gap-2.5 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
            <UserRound className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className={cn("block text-sm font-bold", isStudent ? "text-foreground" : "text-accent")}>Chế độ Phụ huynh</span>
            <span className="block truncate text-xs text-muted-foreground">{parentName}</span>
          </span>
          {!isStudent && <Check className="size-4 shrink-0 text-accent" />}
        </DropdownMenuItem>

        {childrenList.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <div className="px-1.5 py-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">Các con</div>
            {childrenList.map((c, i) => (
              <DropdownMenuItem
                key={c.id}
                disabled={pending}
                onClick={() => enterStudent(c.id)}
                className="cursor-pointer gap-2.5 py-2"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-xs font-bold text-white"
                  style={{ backgroundColor: SWITCH_COLORS[i % SWITCH_COLORS.length] }}
                >
                  {c.initials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-sm font-bold", isStudent && c.active ? "text-primary" : "text-foreground")}>
                    {c.name.split(/\s+/).slice(-2).join(" ")}
                  </span>
                  {c.courseName && <span className="block truncate text-xs text-muted-foreground">{c.courseName}</span>}
                </span>
                {isStudent && c.active && <Check className="size-4 shrink-0 text-primary" />}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
