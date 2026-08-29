"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  // Trophy, // tạm ẩn cùng mục "Vinh danh" trong NAV_GROUPS (bật lại: bỏ comment)
  AlertTriangle,
  ArrowLeftRight,
  Award,
  BarChart3,
  BadgeCheck,
  Bell,
  BookMarked,
  BookOpen,
  Boxes,
  Briefcase,
  Cake,
  CalendarCheck,
  CalendarDays,
  CalendarOff,
  CheckCheck,
  ChevronDown,
  ClipboardCheck,
  ClipboardEdit,
  ClipboardList,
  Clock,
  Coins,
  CreditCard,
  DoorOpen,
  FileText,
  FlaskConical,
  Gauge,
  GraduationCap,
  HeartHandshake,
  IdCard,
  Image as ImageIcon,
  KeyRound,
  ListOrdered,
  LayoutDashboard,
  Mail,
  MapPin,
  MessageCircle,
  MessageSquarePlus,
  MessagesSquare,
  Network,
  Newspaper,
  NotebookPen,
  Package,
  Package2,
  Plug,
  Presentation,
  RefreshCw,
  ScrollText,
  Send,
  Settings,
  Share2,
  ShoppingBag,
  SlidersHorizontal,
  Star,
  type LucideIcon,
  Undo2,
  UserCog,
  UserPlus,
  Users,
  UsersRound,
  Wallet,
  Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatUnread } from "@/components/chat/use-chat-unread";
import { type Action } from "@/lib/auth/permissions";
import { PAGE_GATES } from "@/lib/auth/page-gates";

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Hiện mục nếu user có quyền với BẤT KỲ action nào trong đây. Bỏ trống = luôn hiện. */
  perm?: Action[];
  /** Mục có badge số động. `"chat"` = tổng tin nhắn chưa đọc (layout tính, sidebar vẽ). */
  badge?: "chat";
  /**
   * Mục gắn feature flag — chỉ hiện khi flag BẬT (R7-16: "eval").
   *
   * ⚠️ "classGroup" là cờ GỠ, không phải cờ mở: mặc định TẮT nên mục biến mất,
   * env `CLASS_GROUP_ENABLED="true"` mới hiện lại. Xem lib/flags.ts.
   */
  flag?: "eval" | "scorm" | "classGroup";
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
      // Nhập nhanh khách hàng sau đăng nhập, thay biểu mẫu công khai
      // sale.satarobo.vn (nghỉ 22/08/2026). perm khớp PAGE_GATES["/nhap-khach-hang"].
      //
      // 23/08/2026: trang DỜI VÀO ADMIN — bấm mục này nay ở lại trong khung
      // admin thay vì nhảy sang satarobo.vn rồi phải bấm quay lại. Địa chỉ
      // public cũ vẫn sống, đá 307 về đây.
      { label: "Nhập khách hàng", href: "/nhap-khach-hang", icon: UserPlus, perm: ["leads:create"] },
      // PR #81 — nhập liệu ban đầu: import Excel "đã đăng ký" rồi chốt hàng loạt.
      // perm khớp gate trang (leads:view-all AND leads:import) — sidebar dùng OR nên
      // để leads:import (Sale có leads:import nhưng KHÔNG có view-all → trang tự
      // redirect; đặt view-all ở đây để không hiện link chết cho Sale).
      { label: "Chốt hàng loạt", href: "/leads/bulk-convert", icon: Workflow, perm: ["leads:view-all"] },
      { label: "Cấu hình chia lead", href: "/leads/cau-hinh-chia", icon: Settings, perm: ["leads:assign-config"] },
      // Đợt D — sổ lượt luân phiên (chỉ đọc). Đặt cạnh Cấu hình chia lead vì hai
      // trang trả lời hai nửa của cùng một câu hỏi: chia KIỂU GÌ, và đã chia RA SAO.
      // perm rộng hơn cấu hình (view-all thay vì assign-config): người phải trả lời
      // "sao bạn kia nhiều lead hơn" là Quản lý cơ sở, không phải Super Admin.
      { label: "Quản lý chia lead", href: "/quan-ly-chia-lead", icon: ListOrdered, perm: ["lead_pool:manage"] },
      { label: "Bàn giao lead", href: "/ban-giao-lead", icon: ArrowLeftRight, perm: ["leads:assign"] },
      { label: "Chuyển lead liên CS", href: "/leads/bao-cao-chuyen", icon: Workflow, perm: ["leads:assign"] },
      // BGĐ 31/07 — nguồn giới thiệu (affiliate): mã + link ?ref= + đối soát.
      { label: "Nguồn giới thiệu", href: "/affiliates", icon: Share2, perm: ["leads:view-all"] },
      // R1-01 — hội thoại Messenger của Page. Trang có thật từ lâu nhưng CHƯA BAO GIỜ
      // có lối vào: chỉ gõ URL mới tới (rà 11/08).
      { label: "Messenger CRM", href: "/crm/messenger", icon: MessagesSquare, perm: ["leads:view-all", "leads:view-own"] },
      // GĐ6 — hai lối vào cũ ĐÃ GỠ khỏi menu. Route /trials và /trial-classes vẫn sống
      // dưới dạng chuyển hướng (thông báo cũ trong DB và tài liệu hướng dẫn còn trỏ tới
      // đó), nhưng không còn là chỗ để người ta bấm vào và nhập liệu song song nữa.
      { label: "Lớp Trial", href: "/lop-trial", icon: FlaskConical, perm: ["trials:view"] },
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
      // `session-feedback:view-all` tới từ nhánh main (xem nhận xét/đánh giá từng
      // buổi) — giữ nguyên, đừng gỡ khi giải quyết xung đột.
      { label: "Lớp học", href: "/classes", icon: BookOpen, perm: ["classes:view-all", "classes:view-own", "session-feedback:view-all"] },
      // 20/08/2026 — chủ dự án yêu cầu ẩn hẳn tính năng Nhóm lớp khỏi sidebar.
      // Giữ mục lại (thay vì xoá dòng) để bật lại chỉ tốn 1 env, không cần nhớ
      // icon/perm/thứ tự cũ. Route /class-groups cũng đã bị layout chặn.
      { label: "Nhóm lớp", href: "/class-groups", icon: Boxes, perm: ["class_group:view-all"], flag: "classGroup" },
      { label: "Buổi học", href: "/sessions", icon: CalendarDays, perm: ["sessions:view"] },
      { label: "Lịch tổng", href: "/lich", icon: CalendarCheck, perm: ["sessions:view", "classes:view-all", "classes:view-own"] },
      // attendance:edit đi kèm vì CSKH (Sale) chỉ có quyền SỬA hồi tố (Task #16),
      // không có attendance:view — thiếu nó thì họ dùng được trang mà không thấy link.
      { label: "Điểm danh", href: "/attendance", icon: ClipboardCheck, perm: ["attendance:view", "attendance:edit"] },
      { label: "Ảnh lớp học", href: "/media", icon: ImageIcon, perm: [...PAGE_GATES["/media"]] },
      // MEDIA-REVIEW (26/08) — cổng duyệt ảnh theo NGÀY → LỚP, tách khỏi "Ảnh lớp học"
      // (thư viện tra cứu). Đặt ngay dưới để hai mục ảnh nằm cạnh nhau.
      { label: "Duyệt ảnh", href: "/duyet-media", icon: CheckCheck, perm: [...PAGE_GATES["/duyet-media"]] },
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
      { label: "Tin nhắn", href: "/tin-nhan", icon: MessageCircle, perm: [...PAGE_GATES["/tin-nhan"]], badge: "chat" },
      // US-15 — tra cứu có lý do + khoá hội thoại. `chat:admin` CHỈ SUPER_ADMIN có
      // (AC5: QLCS không vào được), và nó seed scope GLOBAL nên dùng làm gate cấp trang
      // được — khác chat:read/chat:send (CENTER/ASSIGNED), xem lib/auth/page-gates.ts.
      // KHÔNG đưa vào PAGE_GATES: bảng đó dành cho route có nhiều action OR với nhau.
      { label: "Quản trị hội thoại", href: "/hoi-thoai", icon: MessagesSquare, perm: ["chat:admin"] },
      { label: "Yêu cầu phụ huynh", href: "/parent-requests", icon: MessageSquarePlus, perm: ["parent-requests:manage"] },
      { label: "Đánh giá PH", href: "/parent-feedback", icon: Star, perm: ["parent-feedback:view"] },
      { label: "Khảo sát / NPS", href: "/khao-sat", icon: Gauge, perm: ["parent-feedback:view"] },
      { label: "Đánh giá & Khảo sát", href: "/evaluations", icon: ClipboardList, perm: ["evaluations:manage"], flag: "eval" },
      { label: "Thông báo PH", href: "/notifications", icon: Bell, perm: ["notifications:manage"] },
      // FL W0-NAV-2 hygiene: Cảnh báo rủi ro = CSKH/quản lý (giữ Sale), ẩn khỏi KT (BA #07 3.C) + MKT/HR/Training.
      { label: "Cảnh báo rủi ro", href: "/canh-bao-rui-ro", icon: AlertTriangle, perm: [...PAGE_GATES["/canh-bao-rui-ro"]] },
      // FL W0-NAV-2 hygiene: Chăm sóc HV = CSKH/quản lý + GV (giữ Sale & GV), ẩn khỏi KT.
      { label: "Chăm sóc HV", href: "/cham-soc-hv", icon: HeartHandshake, perm: [...PAGE_GATES["/cham-soc-hv"]] },
      // Sinh nhật HV (06/08/2026) — cùng nhóm chăm sóc; gate students:view-all nên
      // Sale/QLCS/Kế toán/MKT/HR thấy, GV không (GV được báo riêng theo buổi dạy).
      { label: "Sinh nhật HV", href: "/sinh-nhat", icon: Cake, perm: [...PAGE_GATES["/sinh-nhat"]] },
    ],
  },
  {
    label: "Nhân sự & Giáo viên",
    items: [
      { label: "Giáo viên", href: "/teachers", icon: UserCog, perm: ["employees:view-all"] },
      { label: "Nhân sự", href: "/nhan-su", icon: IdCard, perm: ["employees:view-all"] },
      // P2 · US-08/09/10 — vị trí + phân công + điều động. Vị trí mang bộ vai trò nên
      // cùng cổng với cấu hình role (SUPER_ADMIN). Đặt ở nhóm Nhân sự vì đó là luồng
      // công việc thật: xem nhân sự → xếp vị trí → phân công.
      { label: "Vị trí công việc", href: "/nhan-su/vi-tri", icon: Briefcase, perm: [...PAGE_GATES["/nhan-su/vi-tri"]] },
      { label: "Chấm công", href: "/cham-cong", icon: Clock, perm: ["hr_attendance:view"] },
      { label: "Điểm danh vào ca", href: "/cham-cong/checkin", icon: Clock, perm: ["hr_attendance:checkin"] },
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
      // 20/08/2026 — hàng chờ DUYỆT ĐƠN của quản lý cơ sở (một nút duyệt cho cả giảm
      // giá lẫn kế hoạch thanh toán). Thiếu mục này thì trang chỉ tới được từ TRONG
      // chi tiết một đơn đang chờ — tức phải tìm ra đơn rồi mới biết hàng chờ tồn tại.
      // perm dùng OR: ai có MỘT trong hai quyền duyệt là thấy link.
      {
        label: "Duyệt đơn hàng",
        href: "/orders/duyet",
        icon: BadgeCheck,
        perm: ["discounts:approve", "installments:approve"],
      },
      // Ghi nhận khoản thu là việc của quầy (payments:record) — xem ghi chú trong
      // app/(admin)/admin/payments/page.tsx. Đừng thu lại còn mỗi payments:manage.
      { label: "Thanh toán", href: "/payments", icon: CreditCard, perm: ["payments:manage", "payments:record"] },
      { label: "Công nợ", href: "/cong-no", icon: Wallet, perm: ["payments:manage", "payments:view"] },
      // Đối soát tiền về từ SePay — nơi kiểm "máy đã tự xác nhận đúng chưa".
      { label: "Biến động số dư", href: "/bien-dong-so-du", icon: Wallet, perm: ["payments:manage", "payments:view"] },
      { label: "Hoàn tiền", href: "/hoan-tien", icon: Undo2, perm: ["payments:manage"] },
      { label: "Phương thức TT", href: "/payment-methods", icon: CreditCard, perm: ["payments:manage"] },
      { label: "Hoa hồng", href: "/crm/commission", icon: Coins, perm: ["payments:manage"] },
    ],
  },
  {
    label: "Website & Marketing",
    items: [
      { label: "Tin tức", href: "/news", icon: Newspaper, perm: ["news:view"] },
      { label: "Nội dung website", href: "/site-content", icon: ImageIcon, perm: [...PAGE_GATES["/site-content"]] },
      { label: "Tracking", href: "/marketing", icon: BarChart3, perm: [...PAGE_GATES["/marketing"]] },
      { label: "Funnel Marketing", href: "/marketing/funnel", icon: Workflow, perm: ["leads:view-all"] },
    ],
  },
  {
    // Email/OTP TÁCH khỏi "Hệ thống & Cấu hình" (11/08/2026): chủ dự án chốt nhóm hệ
    // thống chỉ SUPER_ADMIN thấy, nhưng `emails:view` là quyền THẬT của Marketing Hội sở
    // (seed-roles.ts) — nhét chung nhóm thì hoặc lộ nhóm hệ thống cho Marketing, hoặc
    // phải cắt quyền họ đang dùng. Tách nhóm giữ đúng cả hai.
    label: "Email & OTP",
    items: [
      { label: "Email Templates", href: "/email-templates", icon: Mail, perm: ["emails:view"] },
      { label: "Email Logs", href: "/email-logs", icon: Send, perm: ["emails:view"] },
      // AUTH-SĐT P4 dựng /otp-logs nhưng quên link — màn trả lời "phụ huynh báo
      // không nhận được mã" mà nhân viên trực phải gõ tay URL thì coi như không có.
      { label: "OTP Logs", href: "/otp-logs", icon: MessageCircle, perm: ["emails:view"] },
    ],
  },
  {
    // ⚠️ CHỈ SUPER_ADMIN (chốt 11/08/2026). Mọi mục ở đây phải gác bằng action mà KHÔNG
    // RoleDef nào giữ (users:manage · user-groups:manage · roles:manage · centers:edit ·
    // audit-logs:view · settings:view) ⇒ vai khác vào chỉ qua bypass SUPER_ADMIN.
    // Thêm mục mới vào nhóm này = kiểm lại danh sách vai giữ action đó TRƯỚC, đừng mượn
    // action rộng như `centers:view` (7 vai giữ — đúng lỗi vừa vá).
    label: "Hệ thống & Cấu hình",
    items: [
      { label: "Tài khoản", href: "/users", icon: KeyRound, perm: ["users:manage"] },
      // US-03 — nhóm người dùng: grant ad-hoc (ALLOW/DENY) không sửa vai chuẩn.
      { label: "Nhóm người dùng", href: "/user-groups", icon: UsersRound, perm: ["user-groups:manage"] },
      // Màn cấu hình VAI TRÒ (RoleDef + RolePermission) — trung tâm của RBAC v2 mà từ
      // trước tới nay chỉ vào được bằng URL.
      { label: "Vai trò & quyền", href: "/roles", icon: KeyRound, perm: ["roles:manage"] },
      // P1 · US-05 AC4 — cây tổ chức (HO → vùng → cơ sở).
      { label: "Cây tổ chức", href: "/to-chuc", icon: Network, perm: [...PAGE_GATES["/to-chuc"]] },
      { label: "Audit Log", href: "/audit-log", icon: ScrollText, perm: ["audit-logs:view"] },
      // C6/NĐ13 — HV quá hạn lưu trữ + xoá ẩn danh / xuất dữ liệu. Trang tự gác bằng
      // `isSuperAdmin`; `settings:view` ở đây chỉ là cổng HIỆN MỤC và cũng chỉ
      // SUPER_ADMIN có, nên hai tầng không lệch nhau.
      { label: "Tuân thủ dữ liệu", href: "/compliance", icon: AlertTriangle, perm: ["settings:view"] },
      { label: "Chạy lại webhook", href: "/crm/webhook-replay", icon: RefreshCw, perm: ["settings:edit"] },
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
      // US-16 AC4 — đo pilot chat (kích hoạt TK + đọc thông báo đầu ≤48h) theo từng lớp.
      // `chat:admin` khớp ĐÚNG gate của trang (chỉ SUPER_ADMIN) — không mượn PAGE_GATES vì
      // route này cố ý không khai ở đó.
      { label: "Đo pilot chat", href: "/bao-cao/chat-pilot", icon: MessagesSquare, perm: ["chat:admin"] },
    ],
  },
];

// `granted` do layout tính sẵn ở server bằng grantedMenuActions() — CÙNG hàm quyết định
// với cổng trang (evaluatePermission + cờ RBAC_V2_ENABLED). Sidebar không tự phán quyền
// nữa: trước 10/07 nó gọi can() v1 tĩnh, nên bật cờ là menu và cổng lệch nhau.

const STORAGE_KEY = "satarobo:sidebar:collapsed";

export function Sidebar({
  granted,
  userId,
  chatUnread = 0,
  evalV2Enabled = false,
  scormEnabled = false,
  classGroupEnabled = false,
}: {
  granted: string[];
  /** `User.id` — topic realtime `user:{id}` để badge "Tin nhắn" tự nhảy. */
  userId: string;
  /** Số chưa đọc do layout (RSC) tính sẵn; sidebar KHÔNG tự fetch lúc mount. */
  chatUnread?: number;
  evalV2Enabled?: boolean;
  scormEnabled?: boolean;
  /** Cờ GỠ — mặc định false ⇒ mục "Nhóm lớp" ẩn. */
  classGroupEnabled?: boolean;
}) {
  const pathname = usePathname();

  // Số SỐNG: seed = số server, sau đó chỉ nhảy khi kênh `user:{id}` báo có tin mới.
  // Không `router.refresh()` ⇒ trang admin đang mở không bị render lại vì một cái badge.
  const chatCount = useChatUnread(userId, chatUnread);

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
            (it.flag === "scorm" && scormEnabled) ||
            (it.flag === "classGroup" && classGroupEnabled)) &&
          (!it.perm || it.perm.some((p) => grantedSet.has(p))),
      ),
    })).filter((g) => g.items.length > 0);
  }, [grantedSet, evalV2Enabled, scormEnabled, classGroupEnabled]);

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
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex h-16 items-center border-b border-border px-6">
        <Link
          href="/dashboard"
          className="group text-xl font-bold transition-opacity hover:opacity-90"
        >
          {/* DESIGN.md §7 — KHÔNG gradient trong admin. Bản cũ tô "Sata" bằng gradient
              cam→tím và "Robo" bằng tím→cam, tức hai chữ chạy NGƯỢC CHIỀU nhau: chỗ nối
              đổi màu đột ngột, và ở cỡ 20px chữ mảnh bị bệt. Gradient chữ thuộc site
              public. Ở đây dùng hai màu ĐẶC của thương hiệu — vẫn nhận ra lockup mà đọc
              rõ ở mọi cỡ. */}
          <span className="text-[color:var(--accent)]">Sata</span>
          <span className="text-[color:var(--primary)]">Robo</span>
          <span className="ml-1.5 text-xs font-normal text-muted-foreground">Admin</span>
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
                className="flex w-full items-center justify-between px-6 py-1 text-[10px] uppercase tracking-widest font-semibold text-muted-foreground hover:text-muted-foreground"
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
                        <div className="px-6 pb-0.5 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                          {item.cluster}
                        </div>
                      )}
                      <Link
                        href={item.href}
                        className={cn(
                          "flex items-center gap-3 px-6 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary-soft text-primary border-l-2 border-primary"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        {item.badge === "chat" && chatCount > 0 && (
                          <span
                            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-state-danger px-1 text-[10px] font-bold text-white"
                            aria-label={`${chatCount} tin chưa đọc`}
                          >
                            {chatCount > 9 ? "9+" : chatCount}
                          </span>
                        )}
                      </Link>
                    </Fragment>
                  );
                })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-4 text-xs text-muted-foreground">
        <p className="font-medium">Sata Robo Admin</p>
        <p>v4.UI.FINAL · 2026</p>
      </div>
    </aside>
  );
}
