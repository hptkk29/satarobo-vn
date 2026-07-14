import {
  Award,
  BookOpenText,
  Camera,
  CalendarDays,
  ClipboardCheck,
  Clock,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string;
  /** Nhóm gập sẵn khi mở trang. */
  collapsed?: boolean;
  /** Hiển thị thẳng các mục, không bọc trong nhóm gập (vd: Tổng quan). */
  standalone?: boolean;
  items: NavItem[];
}

/**
 * Điều hướng site giáo viên — cấu trúc 4 nhóm port từ TeachUI (`src/lib/nav.ts`),
 * nhưng GIỮ NGUYÊN slug tiếng Việt `/teacher/*` của repo.
 *
 * Không đổi tên route ⇒ không phải sửa `proxy.ts`, `lib/auth/route-policy.ts`
 * hay e2e test đang bám vào các path này.
 *
 * Trên host `giaovien.satarobo.vn`, proxy rewrite clean URL (`/lich` → `/teacher/lich`),
 * nên `isNavItemActive()` phải khớp cả hai dạng path.
 *
 * "Đơn từ" của TeachUI CHƯA có (cần model mới — batch 2). "Danh sách Trial" đã có
 * (model TrialClassV2 đủ) → thêm nhóm Trial.
 */
export const navGroups: NavGroup[] = [
  {
    label: "Tổng quan",
    standalone: true,
    items: [{ label: "Tổng quan", href: "/teacher", icon: LayoutDashboard }],
  },
  {
    label: "Giảng dạy",
    items: [
      { label: "Lớp của tôi", href: "/teacher/lop", icon: Users },
      { label: "Lịch làm việc", href: "/teacher/lich", icon: CalendarDays },
      { label: "Điểm danh", href: "/teacher/diem-danh", icon: ListChecks },
      { label: "Nhận xét", href: "/teacher/nhan-xet", icon: MessageSquareText },
      { label: "Bài tập", href: "/teacher/cham-bai", icon: ClipboardCheck },
      { label: "Tài liệu", href: "/teacher/tai-lieu", icon: BookOpenText },
    ],
  },
  {
    label: "Trial",
    items: [{ label: "Danh sách Trial", href: "/teacher/trial", icon: Sparkles }],
  },
  {
    label: "Học viên & Học bạ",
    items: [
      { label: "Học viên", href: "/teacher/hoc-vien", icon: GraduationCap },
      { label: "Học bạ", href: "/teacher/hoc-ba", icon: BookOpenText },
      { label: "Hoàn thành khoá", href: "/teacher/hoan-thanh", icon: Award },
      { label: "Ảnh lớp", href: "/teacher/anh-lop", icon: Camera },
    ],
  },
  {
    label: "Ca & Chấm công",
    items: [{ label: "Bảng công", href: "/teacher/bang-cong", icon: Clock }],
  },
];

/** Bỏ tiền tố `/teacher` để ra clean URL tương ứng ("/teacher" → "/"). */
function cleanUrl(href: string): string {
  return href === "/teacher" ? "/" : href.slice("/teacher".length);
}

/**
 * Path hiện tại có thuộc mục này không — chấp nhận cả clean URL (host giaovien).
 * Trang con vẫn sáng mục cha (vd `/teacher/lop/abc` → "Lớp của tôi"), TRỪ mục
 * gốc `/teacher` (nếu không nó sáng ở mọi trang).
 */
export function isNavItemActive(pathname: string, href: string): boolean {
  const clean = cleanUrl(href);
  if (href === "/teacher") return pathname === "/teacher" || pathname === "/";
  return (
    pathname === href ||
    pathname === clean ||
    pathname.startsWith(`${href}/`) ||
    pathname.startsWith(`${clean}/`)
  );
}
