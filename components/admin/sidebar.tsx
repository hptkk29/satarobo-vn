"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  Award,
  ArrowLeftRight,
  Coins,
  Plug,
  BookOpen,
  UserCog,
  BarChart3,
  Settings,
  SlidersHorizontal,
  Briefcase,
  // Trophy, // tạm ẩn cùng mục "Vinh danh" trong NAV_GROUPS (bật lại: bỏ comment)
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
  ClipboardEdit,
  CalendarCheck,
  KeyRound,
  ScrollText,
  CreditCard,
  ShoppingBag,
  Package2,
  Mail,
  Send,
  FlaskConical,
  Bell,
  MessageSquarePlus,
  MessageCircle,
  RefreshCw,
  FileText,
  Presentation,
  BookMarked,
  NotebookPen,
  AlertTriangle,
  HeartHandshake,
  Gauge,
  Star,
  Clock,
  ChevronDown,
  Share2,
  Workflow,
  Wallet,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { type Action } from "@/lib/auth/permissions";
import { PAGE_GATES } from "@/lib/auth/page-gates";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hiện mục nếu user có quyền với BẤT KỲ action nào trong đây. Bỏ trống = luôn hiện. */
  perm?: Action[];
  /** Mục gắn feature flag — chỉ hiện khi flag bật (R7-16: "eval"). */
  flag?: "eval" | "scorm";
  /**
   * R3: nhãn cụm con (sub-section) trong 1 NavGroup. Các item liền kề cùng `cluster`
   * được gom dưới 1 nhãn nhỏ — render trước item ĐẦU TIÊN hiển thị của cụm (robust với
   * filter quyền: bất kể package hay course là item đầu còn lại sau lọc).
   */
  cluster?: string;
};

type NavGroup = { label: string; items: NavItem[] };

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Tổng quan",
    items: [
      { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }, // luôn hiện
      { label: "CRM", href: "/crm", icon: BarChart3, perm: ["leads:view-all"] },
    ],
  },
  {
    label: "CRM & Tuyển sinh",
    items: [
      { label: "Leads", href: "/leads", icon: Users, perm: ["leads:view-all", "leads:view-own"] },
      // PR #81 — nhập liệu ban đầu: import Excel "đã đăng ký" rồi chốt hàng loạt.
      // perm khớp gate trang (leads:view-all AND leads:import) — sidebar dùng OR nên
      // để leads:import (Sale có leads:import nhưng KHÔNG có view-all → trang tự
      // redirect; đặt view-all ở đây để không hiện link chết cho Sale).
      { label: "Chốt hàng loạt", href: "/leads/bulk-convert", icon: Workflow, perm: ["leads:view-all"] },
      { label: "Cấu hình chia lead", href: "/leads/cau-hinh-chia", icon: Settings, perm: ["leads:assign"] },
      { label: "Bàn giao lead", href: "/ban-giao-lead", icon: ArrowLeftRight, perm: ["leads:assign"] },
      { label: "Chuyển lead liên CS", href: "/leads/bao-cao-chuyen", icon: Workflow, perm: ["leads:assign"] },
      // BGĐ 31/07 — nguồn giới thiệu (affiliate): mã + link ?ref= + đối soát.
      { label: "Nguồn giới thiệu", href: "/affiliates", icon: Share2, perm: ["leads:view-all"] },
      { label: "Học thử", href: "/trials", icon: FlaskConical, perm: ["trials:view"] },
      { label: "Lớp trải nghiệm", href: "/trial-classes", icon: FlaskConical, perm: ["trials:view"] },
    ],
  },
  {
    label: "Học viên & Đăng ký học",
    items: [
      { label: "Học viên", href: "/students", icon: GraduationCap, perm: [...PAGE_GATES["/students"]] },
      // PR #81 — màn vận hành TK phụ huynh chờ kích hoạt (gate students:edit, cùng
      // quyền với nút cấp TK per-student). Thiếu link ở đây thì màn thành ẩn.
      { label: "Tài khoản phụ huynh", href: "/students/tai-khoan", icon: KeyRound, perm: ["students:edit"] },
      { label: "Đăng ký học", href: "/enrollments", icon: ClipboardList, perm: ["enrollments:view-all"] },
      { label: "Chuyển lớp / cơ sở", href: "/chuyen-lop", icon: ArrowLeftRight, perm: [...PAGE_GATES["/chuyen-lop"]] },
      { label: "Sắp hết khoá", href: "/students/sap-het-khoa", icon: GraduationCap, perm: ["enrollments:view-all"] },
      { label: "Hoàn thành khoá & chứng chỉ", href: "/hoan-thanh-khoa", icon: Award, perm: ["completions:manage"] },
      // FL W0-NAV-2 hygiene: Học bạ (học thuật) gate `curriculum:view` (Super/Training/CM/GV) — ẩn khỏi Sale/KT/MKT/HR.
      { label: "Học bạ", href: "/hoc-ba", icon: ScrollText, perm: [...PAGE_GATES["/hoc-ba"]] },
      { label: "Học bạ năng lực", href: "/report-cards", icon: NotebookPen, perm: ["report-cards:manage", "report-cards:review"] },
      { label: "SataCoin", href: "/satacoin", icon: Coins, perm: ["satacoin:manage"] },
    ],
  },
  {
    label: "Lớp học & Lịch học",
    items: [
      { label: "Lớp học", href: "/classes", icon: BookOpen, perm: ["classes:view-all", "classes:view-own"] },
      { label: "Nhóm lớp", href: "/class-groups", icon: Boxes, perm: ["class_group:view-all"] },
      { label: "Buổi học", href: "/sessions", icon: CalendarDays, perm: ["sessions:view"] },
      // attendance:edit đi kèm vì CSKH (Sale) chỉ có quyền SỬA hồi tố (Task #16),
      // không có attendance:view — thiếu nó thì họ dùng được trang mà không thấy link.
      { label: "Điểm danh", href: "/attendance", icon: ClipboardCheck, perm: ["attendance:view", "attendance:edit"] },
      { label: "Ảnh lớp học", href: "/media", icon: ImageIcon, perm: [...PAGE_GATES["/media"]] },
      { label: "Học bù", href: "/hoc-bu", icon: RefreshCw, perm: ["parent-requests:manage"] },
      { label: "Cơ sở", href: "/centers", icon: MapPin, perm: ["centers:view"] },
      { label: "Phòng học", href: "/rooms", icon: DoorOpen, perm: ["rooms:view"] },
      { label: "Lịch nghỉ", href: "/holidays", icon: CalendarOff, perm: ["holidays:view"] },
    ],
  },
  {
    label: "LMS / Học liệu",
    items: [
      { label: "Chương trình học", href: "/curriculums", icon: BookMarked, perm: ["curriculum:view"] },
      // BGĐ 31/07 — hộp thư đề xuất sửa giáo án của GV (trước chỉ nằm trong trang
      // sửa từng giáo trình → Đào tạo không thấy đề xuất mới).
      { label: "Đề xuất sửa giáo án", href: "/de-xuat-giao-an", icon: ClipboardEdit, perm: ["lesson-change:approve"] },
      // FL-R2-W5 (R2-LMS-1): 1 entry "Khoá học" → /courses (khoá dạy); gói bán quản lý
      // ngay trong chi tiết khoá. Gộp DB Course/Package + xoá /course-packages = 2-phase
      // deferred (Order đa hình, KHÔNG drop packageId giờ) — route /course-packages GIỮ tạm.
      { label: "Khoá học", href: "/courses", icon: Boxes, perm: ["courses:view"] },
      { label: "Khoá tiên quyết", href: "/course-prerequisites", icon: Workflow, perm: ["courses:create"] },
      { label: "Tài liệu giảng dạy", href: "/documents", icon: FileText, perm: ["documents:view"] },
      { label: "Bài tập về nhà", href: "/assignments", icon: NotebookPen, perm: ["assignments:view"] },
      { label: "Tài liệu lớp tôi", href: "/teaching-materials", icon: Presentation, perm: ["teaching-materials:view-own-class"] },
      { label: "SCORM / Bài giảng tương tác", href: "/scorm", icon: Package, perm: ["training:manage"], flag: "scorm" },
    ],
  },
  {
    label: "CSKH & Phụ huynh",
    items: [
      // FL W0-NAV-2 hygiene: Tin nhắn (CSKH) gate CSKH+GV — ẩn khỏi KT (BA #07 3.C) + MKT/HR/Training.
      { label: "Tin nhắn", href: "/tin-nhan", icon: MessageCircle, perm: [...PAGE_GATES["/tin-nhan"]] },
      { label: "Yêu cầu phụ huynh", href: "/parent-requests", icon: MessageSquarePlus, perm: ["parent-requests:manage"] },
      { label: "Đánh giá PH", href: "/parent-feedback", icon: Star, perm: ["parent-feedback:view"] },
      { label: "Khảo sát / NPS", href: "/khao-sat", icon: Gauge, perm: ["parent-feedback:view"] },
      { label: "Đánh giá & Khảo sát", href: "/evaluations", icon: ClipboardList, perm: ["evaluations:manage"], flag: "eval" },
      { label: "Thông báo PH", href: "/notifications", icon: Bell, perm: ["notifications:manage"] },
      // FL W0-NAV-2 hygiene: Cảnh báo rủi ro = CSKH/quản lý (giữ Sale), ẩn khỏi KT (BA #07 3.C) + MKT/HR/Training.
      { label: "Cảnh báo rủi ro", href: "/canh-bao-rui-ro", icon: AlertTriangle, perm: [...PAGE_GATES["/canh-bao-rui-ro"]] },
      // FL W0-NAV-2 hygiene: Chăm sóc HV = CSKH/quản lý + GV (giữ Sale & GV), ẩn khỏi KT.
      { label: "Chăm sóc HV", href: "/cham-soc-hv", icon: HeartHandshake, perm: [...PAGE_GATES["/cham-soc-hv"]] },
    ],
  },
  {
    label: "Nhân sự & Giáo viên",
    items: [
      { label: "Giáo viên", href: "/teachers", icon: UserCog, perm: ["employees:view-all"] },
      { label: "Nhân sự", href: "/nhan-su", icon: IdCard, perm: ["employees:view-all"] },
      { label: "Chấm công", href: "/cham-cong", icon: Clock, perm: ["hr_attendance:view"] },
      { label: "Lịch ca của tôi", href: "/cham-cong/lich-ca", icon: CalendarDays, perm: ["hr_attendance:checkin"] },
      { label: "Yêu cầu chỉnh công", href: "/cham-cong/yeu-cau-cong", icon: ClipboardEdit, perm: ["hr_attendance:checkin"] },
      { label: "Duyệt chỉnh công", href: "/cham-cong/chinh-cong", icon: ClipboardEdit, perm: ["hr_attendance:adjust"] },
      // BGĐ 31/07 — duyệt đơn GV (nghỉ dạy / dạy thay) — duyệt là cập nhật lịch thật.
      { label: "Đơn từ giáo viên", href: "/don-tu", icon: ClipboardList, perm: ["hr_attendance:adjust"] },
      // FL W0-NAV-2 hygiene: Tổng hợp công ca = view tổng hợp (quản lý/HR), ẩn khỏi Sale/KT (BA #07 3.C).
      { label: "Tổng hợp công ca", href: "/cham-cong/lich-ca-nhan-vien", icon: Users, perm: ["hr_attendance:view"] },
      { label: "Duyệt ca (Excel)", href: "/cham-cong/duyet-ca", icon: CalendarCheck, perm: ["hr_attendance:view"] },
      { label: "Tuyển dụng", href: "/jobs", icon: Briefcase, perm: ["jobs:view"] },
      // Tạm ẩn khu Vinh danh khỏi admin (giữ code + dữ liệu). Bật lại: bỏ comment
      // dòng dưới + import Trophy, và xoá app/(admin)/admin/honors/layout.tsx.
      // { label: "Vinh danh", href: "/honors", icon: Trophy, perm: ["honors:settings"] },
    ],
  },
  {
    label: "Sản phẩm & Kho",
    items: [
      { label: "Học cụ (Kits)", href: "/kits", icon: Package, perm: ["kits:view"] },
      { label: "Sản phẩm bán/thuê", href: "/products", icon: Package2, perm: ["products:view"] },
      // FL W0-NAV-2 (BA #07 3.C): kế toán có quyền inventory:view/audit nhưng thiếu menu kho → thêm.
      { label: "Tồn kho", href: "/inventory/dashboard", icon: Boxes, perm: ["inventory:view"] },
      { label: "Kiểm kê kho", href: "/inventory/audit", icon: ClipboardCheck, perm: ["inventory:audit"] },
    ],
  },
  {
    label: "Tài chính",
    items: [
      { label: "Đơn hàng", href: "/orders", icon: ShoppingBag, perm: ["orders:view"] },
      { label: "Thanh toán", href: "/payments", icon: CreditCard, perm: ["payments:manage"] },
      { label: "Công nợ", href: "/cong-no", icon: Wallet, perm: ["payments:manage"] },
      // Đối soát tiền về từ SePay — nơi kiểm "máy đã tự xác nhận đúng chưa".
      { label: "Biến động số dư", href: "/bien-dong-so-du", icon: Wallet, perm: ["payments:manage"] },
      { label: "Hoàn tiền", href: "/hoan-tien", icon: Undo2, perm: ["payments:manage"] },
      { label: "Phương thức TT", href: "/payment-methods", icon: CreditCard, perm: ["payments:manage"] },
    ],
  },
  {
    label: "Website & Marketing",
    items: [
      { label: "Tin tức", href: "/news", icon: Newspaper, perm: ["news:view"] },
      { label: "Nội dung website", href: "/site-content", icon: ImageIcon, perm: [...PAGE_GATES["/site-content"]] },
      { label: "Tracking", href: "/marketing", icon: BarChart3, perm: [...PAGE_GATES["/marketing"]] },
    ],
  },
  {
    label: "Hệ thống & Cấu hình",
    items: [
      { label: "Tài khoản", href: "/users", icon: KeyRound, perm: ["users:manage"] },
      { label: "Email Templates", href: "/email-templates", icon: Mail, perm: ["emails:view"] },
      { label: "Email Logs", href: "/email-logs", icon: Send, perm: ["emails:view"] },
      // AUTH-SĐT P4 dựng /otp-logs nhưng quên link — màn trả lời "phụ huynh báo
      // không nhận được mã" mà nhân viên trực phải gõ tay URL thì coi như không có.
      // Cùng quyền `emails:view` với Email Logs (chủ ý của P4: không đẻ action RBAC mới).
      { label: "OTP Logs", href: "/otp-logs", icon: MessageCircle, perm: ["emails:view"] },
      { label: "Audit Log", href: "/audit-log", icon: ScrollText, perm: ["audit-logs:view"] },
      { label: "Tích hợp", href: "/tich-hop", icon: Plug, perm: ["settings:view"] },
      { label: "Cấu hình vận hành", href: "/cau-hinh-van-hanh", icon: SlidersHorizontal, perm: ["settings:view"] },
      { label: "Cài đặt", href: "/settings", icon: Settings, perm: ["settings:view"] },
    ],
  },
  {
    label: "Báo cáo",
    items: [
      { label: "Báo cáo Lead", href: "/bao-cao/lead", icon: BarChart3, perm: ["leads:view-all", "leads:view-own"] },
      { label: "Báo cáo trải nghiệm", href: "/bao-cao/trial", icon: FlaskConical, perm: ["trials:view"] },
      // FL W0-NAV-2 hygiene: 3 báo cáo đào tạo gate `courses:create` (Super/Training/CM) — ẩn khỏi Sale/KT
      // (trước đây lọt qua classes:view-all). BA #07 3.C.
      { label: "Báo cáo đào tạo", href: "/bao-cao/dao-tao", icon: BookOpen, perm: [...PAGE_GATES["/bao-cao/dao-tao"]] },
      { label: "Báo cáo trung tâm", href: "/bao-cao/trung-tam", icon: Coins, perm: ["payments:manage"] },
      { label: "Hiệu suất giáo viên", href: "/bao-cao/hieu-suat-gv", icon: GraduationCap, perm: [...PAGE_GATES["/bao-cao/hieu-suat-gv"]] },
      { label: "Cohort tiến độ", href: "/bao-cao/cohort", icon: Users, perm: [...PAGE_GATES["/bao-cao/cohort"]] },
      { label: "Churn / rời bỏ", href: "/bao-cao/churn", icon: BarChart3, perm: ["enrollments:view-all"] },
      { label: "Doanh thu vs mục tiêu", href: "/bao-cao/doanh-thu", icon: Coins, perm: ["payments:manage"] },
    ],
  },
];

// `granted` do layout tính sẵn ở server bằng grantedMenuActions() — CÙNG hàm quyết định
// với cổng trang (evaluatePermission + cờ RBAC_V2_ENABLED). Sidebar không tự phán quyền
// nữa: trước 10/07 nó gọi can() v1 tĩnh, nên bật cờ là menu và cổng lệch nhau.

const STORAGE_KEY = "satarobo:sidebar:collapsed";

export function Sidebar({
  granted,
  evalV2Enabled = false,
  scormEnabled = false,
}: {
  granted: string[];
  evalV2Enabled?: boolean;
  scormEnabled?: boolean;
}) {
  const pathname = usePathname();

  // Lọc menu theo quyền — chỉ giữ mục user được phép thấy. Mục không có `perm`
  // (Dashboard) luôn hiện. Mục gắn flag chỉ hiện khi flag bật. Nhóm rỗng sau lọc → ẩn.
  const grantedSet = useMemo(() => new Set(granted), [granted]);
  const visibleGroups = useMemo(() => {
    return NAV_GROUPS.map((g) => ({
      label: g.label,
      items: g.items.filter(
        (it) =>
          (!it.flag ||
            (it.flag === "eval" && evalV2Enabled) ||
            (it.flag === "scorm" && scormEnabled)) &&
          (!it.perm || it.perm.some((p) => grantedSet.has(p))),
      ),
    })).filter((g) => g.items.length > 0);
  }, [grantedSet, evalV2Enabled, scormEnabled]);

  // Nhóm đang chứa trang hiện tại (deterministic SSR + client → không hydration mismatch).
  const activeGroupLabel = useMemo(() => {
    for (const g of visibleGroups) {
      if (g.items.some((it) => pathname.startsWith(it.href))) return g.label;
    }
    return visibleGroups[0]?.label ?? null;
  }, [visibleGroups, pathname]);

  // Collapsed = set tên nhóm đang thu gọn. Mặc định thu gọn mọi nhóm trừ nhóm active.
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    const s = new Set<string>();
    for (const g of NAV_GROUPS) if (g.label !== activeGroupLabel) s.add(g.label);
    return s;
  });

  // Sau mount: nạp trạng thái đã lưu (localStorage) — chạy client-only nên không
  // gây hydration mismatch.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setCollapsed(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);

  function toggleGroup(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

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
        {visibleGroups.map((group) => {
          const isCollapsed = collapsed.has(group.label);
          return (
            <div key={group.label} className="mb-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className="flex w-full items-center justify-between px-6 py-1 text-[10px] uppercase tracking-widest font-semibold text-neutral-400 hover:text-neutral-600"
                aria-expanded={!isCollapsed}
              >
                <span>{group.label}</span>
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 transition-transform",
                    isCollapsed && "-rotate-90",
                  )}
                />
              </button>
              {!isCollapsed &&
                group.items.map((item, idx) => {
                  const Icon = item.icon;
                  const active = pathname.startsWith(item.href);
                  // R3: nhãn cụm con — chỉ render trước item ĐẦU TIÊN hiển thị của cụm.
                  const showCluster =
                    !!item.cluster && item.cluster !== group.items[idx - 1]?.cluster;
                  return (
                    <Fragment key={item.href}>
                      {showCluster && (
                        <div className="px-6 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-neutral-300">
                          {item.cluster}
                        </div>
                      )}
                      <Link
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
                    </Fragment>
                  );
                })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-neutral-200 p-4 text-xs text-neutral-400">
        <p className="font-medium">Sata Robo Admin</p>
        <p>v4.UI.FINAL · 2026</p>
      </div>
    </aside>
  );
}
