import type { Role } from "@prisma/client";

// =============================================================================
// PERMISSION MATRIX — Phase 5.2 (Expanded from 26 to 70+ actions)
// =============================================================================
//
// HISTORY:
// - Phase 4.7: 26 actions covering employees, honors, jobs, leads, blog, payroll
// - Phase 5.2: Expanded to 70+ actions to close RBAC gaps for ALL admin resources
//   + merged with legacy lib/permissions.ts (which had 6 roles missing HR).
//
// PATTERN:
// - Action format: `<resource>:<verb>` — verb is one of view-all, view-own,
//   view-public, create, edit, delete, settings, view-salary, view-personal.
// - Check: `can(role, action)` returns boolean.
// - Enforce in Server Action: `assertCan(role, action)` throws on deny.
// - Field-level for Employee: `getEmployeeFieldVisibility(role)` returns object.
//
// ALL 9 ROLES (Phase T0.1 — rename MANAGER->CENTER_MANAGER, SALES->SALES_CSM,
// thêm PARENT; TRAINING thêm sau ở migration 20260624000000_fl_foundation — comment
// này trước đó bị bỏ sót, sửa 06/07/2026):
// SUPER_ADMIN, CENTER_MANAGER, HR, SALES_CSM, TEACHER, TRAINING, MARKETING, ACCOUNTANT, PARENT
//
// PARENT = phụ huynh (portal hocvien.satarobo.vn). KHÔNG có quyền admin nào —
// không xuất hiện trong bất kỳ array PERMISSIONS nào → can(PARENT, adminAction)
// luôn false. Quyền portal (xem data con) check riêng qua activeSite, không qua
// matrix này. NGOẠI LỆ DUY NHẤT (US-05 chat, 08/08/2026): `chat:read`/`chat:send`
// — chat là tính năng dùng chung portal+admin+teacher, PH là vai chat hạng nhất
// (docs/chat-realtime/permissions.md); các action chat:* còn lại PARENT vẫn false.
//
// Legacy lib/permissions.ts (6 roles, missing HR) đã xoá ở Sprint 5.2.
// 15 callsite cũ migrated sang can(role, "resource:action") trực tiếp.
//
// =============================================================================

export type Action =
  // --- Employees (existing) ---
  | "employees:view-all"
  | "employees:view-public"
  | "employees:create"
  | "employees:edit"
  | "employees:delete"
  | "employees:view-salary"
  | "employees:view-personal"

  // --- Honors (existing) ---
  | "honors:view"
  | "honors:create"
  | "honors:edit"
  | "honors:delete"
  | "honors:settings"

  // --- Jobs (existing) ---
  | "jobs:view"
  | "jobs:create"
  | "jobs:edit"
  | "jobs:delete"

  // --- Leads (expanded) ---
  | "leads:view-all"
  | "leads:view-own"
  | "leads:create"
  | "leads:edit"
  | "leads:assign"
  | "leads:assign-config" // 03/08 — tách riêng màn "Cấu hình chia lead" khỏi leads:assign
  | "leads:delete"
  | "leads:export"
  | "leads:import" // Task #07 — import danh sách "khách đã đăng ký" từ Excel (Lead REGISTERED + LeadChild)
  // #11 T2 (OI-4) — xem PII lead: SĐT/email/tên PH-HS/ghi chú tư vấn.
  // ⚠️ MARKETING **CÓ** quyền này (user chốt 21/07, ĐẢO quyết định "che PII cho
  // MARKETING" ngày 10-20/07 — lý do đầy đủ ở ma trận bên dưới). Comment cũ ghi
  // ngược đã khiến 2 lần rà soát kết luận nhầm là "lỗ hở quyền"; danh sách vai
  // là nguồn đúng duy nhất, đừng suy từ comment.
  | "leads:view-pii"

  // --- Trial classes (Phase T1.4) ---
  | "trials:view"
  | "trials:manage"
  | "trials:feedback"
  // --- Trial class V2 (R7-02) ---
  | "trials:assign-teacher"
  | "trials:override-capacity"
  | "training:manage"
  | "reports:training"
  // FL W0-NAV-2 (QĐ-T3b) — 2 việc vận hành CM giữ qua action RIÊNG (KHÔNG trả training:manage):
  | "trials:config" // cấu hình số buổi lớp trải nghiệm
  | "lesson-change:approve" // duyệt LessonChangeRequest (chấp nhận/từ chối đề xuất chỉnh bài)

  // --- Notifications (Phase NHÓM 3) ---
  | "notifications:manage"

  // --- Parent requests (Phase NHÓM 3) ---
  | "parent-requests:manage"

  // --- Parent feedback (Phase NHÓM 3) ---
  | "parent-feedback:view"

  // --- Media / ảnh lớp (Phase NHÓM 3) ---
  | "media:view"
  | "media:upload"
  | "media:approve"

  // --- HR attendance / chấm công QR (Phase NHÓM 4) ---
  | "hr_attendance:checkin"
  | "hr_attendance:view"
  | "hr_attendance:adjust"

  // --- Blog / News (existing + expanded) ---
  | "blog:view"
  | "blog:create"
  | "blog:edit"
  | "blog:delete"
  | "news:view"
  | "news:create"
  | "news:edit"
  | "news:delete"
  | "news:publish"

  // --- Payroll (existing) ---
  | "payroll:view"
  | "payroll:edit"

  // --- Students (NEW) ---
  | "students:view-all"
  | "students:view-own-class"
  | "students:create"
  | "students:edit"
  | "students:change-code"
  | "students:delete"
  | "students:import"

  // --- Classes (NEW) ---
  | "classes:view-all"
  | "classes:view-own"
  | "classes:create"
  | "classes:edit"
  | "classes:delete"

  // --- Class groups (Phase T0.2) ---
  | "class_group:view-all"
  | "class_group:create"
  | "class_group:edit"
  | "class_group:delete"

  // --- Enrollments (NEW) ---
  | "enrollments:view-all"
  | "enrollments:view-own"
  | "enrollments:create"
  | "enrollments:edit"
  | "enrollments:transfer"
  | "enrollments:cancel"
  | "enrollments:delete"

  // --- Evaluations / surveys (R7-16) ---
  | "evaluations:manage"
  | "evaluations:view-aggregate"
  | "evaluations:view-detail"

  // --- Report cards (R7-15) ---
  | "report-cards:manage"
  | "report-cards:review"

  // --- Course completion (B4) ---
  | "completions:manage"
  | "completions:propose-own"

  // --- SataCoin (C4) ---
  | "satacoin:manage"

  // --- Class sessions + Attendance (NEW) ---
  | "sessions:view"
  | "sessions:create"
  | "sessions:edit"
  | "attendance:view"
  | "attendance:mark"
  | "attendance:edit"

  // --- Courses + Packages (NEW) ---
  | "courses:view"
  | "courses:create"
  | "courses:edit"
  | "courses:delete"
  | "course-packages:view"
  | "course-packages:edit"

  // --- Curriculum + Lessons (NEW) ---
  | "curriculum:view"
  | "curriculum:create"
  | "curriculum:edit"
  | "curriculum:delete"

  // --- Questions + Exams + Assignments (NEW) ---
  | "questions:view"
  | "questions:author"
  | "questions:edit"
  | "questions:delete"
  | "exams:view"
  | "exams:create"
  | "exams:edit"
  | "exams:grade"
  | "exams:delete"
  | "assignments:view"
  | "assignments:create"
  | "assignments:edit"
  | "assignments:grade"
  | "assignments:delete"
  | "assignments:assign-own"
  | "assignments:author-own"

  // --- Documents (NEW) ---
  | "documents:view"
  | "documents:upload"
  | "documents:delete"

  // --- Teaching materials (FL W0 — GV xem tài liệu giảng dạy lớp mình) ---
  | "teaching-materials:view-own-class"

  // --- Centers + Rooms + Holidays (NEW) ---
  | "centers:view"
  | "centers:edit"
  | "rooms:view"
  | "rooms:edit"
  | "holidays:view"
  | "holidays:edit"

  // --- Inventory (NEW) ---
  | "inventory:view"
  | "inventory:edit"
  | "inventory:movement"
  | "inventory:audit"

  // --- ZMRoboKit (NEW) ---
  | "kits:view"
  | "kits:edit"

  // --- Site content / CMS (NEW) ---
  | "site-content:view"
  | "site-content:edit"

  // --- Audit logs (NEW) ---
  | "audit-logs:view"
  // #05 — break-glass: xem đầy đủ PII (bỏ mask) trong audit viewer, kèm reason + log riêng.
  | "audit-logs:view-pii"

  // --- Settings / system (NEW) ---
  | "settings:view"
  | "settings:edit"
  | "users:manage" // CRUD User accounts (different from Employee records)
  | "roles:assign"
  | "roles:manage" // A0-02 — CRUD RoleDef + gán RolePermission (chỉ SUPER_ADMIN)

  // --- Phase 5.6 — Financial (Payment + Order) ---
  | "payments:manage"
  | "payments:view" // 03/08 — chỉ XEM đối soát (Công nợ, Biến động số dư); không thao tác
  | "payments:record" // R7-04 — Sale ghi nhận khoản
  | "payments:confirm" // R7-04 — Kế toán xác nhận (tách nhiệm vụ)
  | "payments:view-pii" // #15 (câu 32) — break-glass xem đầy đủ CCCD PH + địa chỉ (reason + audit)
  | "installments:approve" // FIX lead→payment→enroll (C4) — duyệt kế hoạch trả góp 2 đợt
  | "discounts:approve" // BGĐ 31/07 — duyệt giảm giá nhập tay (kèm giải trình)
  | "orders:view"
  | "orders:manage"
  | "orders:view-pii" // che SĐT/email/địa chỉ khách trên đơn hàng — vai CRM/kế toán mới xem đầy đủ

  // --- Phase 5.7 — Vouchers ---

  // --- Phase 5.10 — Products (sales/rental catalog) ---
  | "products:view"
  | "products:manage"

  // --- Phase 5.13 — Email System ---
  | "emails:view"
  | "emails:manage"

  // --- Chat realtime (US-05, Đợt 0 — docs/chat-realtime/permissions.md) ---
  | "chat:read"
  | "chat:send"
  | "chat:announce"
  | "chat:moderate"
  | "chat:admin";

// =============================================================================
// MATRIX — Mỗi action liệt kê rõ những role được phép.
// =============================================================================

export const PERMISSIONS: Record<Action, Role[]> = {
  // --- Employees ---
  "employees:view-all": ["SUPER_ADMIN", "HR"],
  "employees:view-public": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "employees:create": ["SUPER_ADMIN", "HR"],
  "employees:edit": ["SUPER_ADMIN", "HR", "CENTER_MANAGER"],
  "employees:delete": ["SUPER_ADMIN"],
  "employees:view-salary": ["SUPER_ADMIN", "HR", "ACCOUNTANT"],
  "employees:view-personal": ["SUPER_ADMIN", "HR"],

  // --- Honors ---
  "honors:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "honors:create": ["SUPER_ADMIN", "CENTER_MANAGER", "HR", "MARKETING"],
  "honors:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "HR", "MARKETING"],
  "honors:delete": ["SUPER_ADMIN"],
  "honors:settings": ["SUPER_ADMIN"],

  // --- Jobs ---
  // FL W0-NAV-2 hygiene: SALES_CSM bỏ Tuyển dụng (HR/Marketing/quản lý mới cần).
  "jobs:view": ["SUPER_ADMIN", "CENTER_MANAGER", "HR", "MARKETING"],
  "jobs:create": ["SUPER_ADMIN", "CENTER_MANAGER", "HR"],
  "jobs:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "HR"],
  "jobs:delete": ["SUPER_ADMIN", "HR"],

  // --- Leads ---
  "leads:view-all": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],
  // SUPER_ADMIN có mặt ở mọi action *-own để khớp bypass `isSuperAdmin` của can() v2
  // (lib/auth/can.ts) — nếu thiếu, shadow-compare đẻ lệch v1=false/v2=true mỗi lần
  // admin chạm trang này. Behavior-neutral: call-site chỉ thu hẹp khi `!viewAll && viewOwn`.
  "leads:view-own": ["SUPER_ADMIN", "SALES_CSM"],
  // #11 T2 — Q9: Sale/QL cơ sở (trực tiếp CSKH) ĐƯỢC xem PII lead.
  // 21/07 (user chốt): MARKETING XEM ĐƯỢC tên + SĐT lead (làm outreach/chiến dịch cần liên
  // hệ) → thêm MARKETING (ĐẢO quyết định "che PII cho MARKETING" của a+b 20/07). Lưu ý:
  // canViewLeadPii bao cả email (email-logs) + ghi chú tư vấn (lead detail) → MARKETING thấy
  // luôn các mục này. Cách ly cơ sở vẫn do scopedDb.
  "leads:view-pii": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "MARKETING"],
  "leads:create": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "MARKETING"],
  "leads:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "MARKETING"],
  "leads:assign": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "leads:assign-config": ["SUPER_ADMIN"],
  "leads:delete": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "leads:export": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],
  // Task #07 — theo pattern students:import. SALES_CSM được cấp theo quyết định
  // user 07/07/2026 (Sale là người giữ danh sách đăng ký thật — câu 33 phiếu Sale).
  // v2: đã seed CENTER scope cho CENTER_SALES_CSM trong seed-roles.ts cùng ngày.
  "leads:import": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],

  // --- Trial classes (Phase T1.4) ---
  "trials:view": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "TEACHER"],
  "trials:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],
  "trials:feedback": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  // R7-02 — gán GV + override sĩ số chỉ quản lý cơ sở; cấu hình số buổi = Đào tạo/Admin.
  "trials:assign-teacher": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "trials:override-capacity": ["SUPER_ADMIN", "CENTER_MANAGER"],
  // FL W0 (QĐ-T1): cấu hình đào tạo/LMS = TRAINING (Đào tạo). CENTER_MANAGER chỉ xem nội dung LMS.
  "training:manage": ["SUPER_ADMIN", "TRAINING"],
  // 10/07 — BGĐ: "báo cáo của chức năng nào thì role chức năng đó xem". Ba báo cáo đào
  // tạo trước đây gác bằng `classes:view-all` ⇒ HR/Kế toán/Marketing mở được bằng URL.
  // Không tái dùng `training:manage` (QL cơ sở sẽ mất báo cáo lớp của chính mình) cũng
  // không dùng `curriculum:view` (kéo cả GV vào xem hiệu suất đồng nghiệp).
  "reports:training": ["SUPER_ADMIN", "CENTER_MANAGER"],
  // FL W0-NAV-2 (QĐ-T3b): trả lại cho CM 2 việc vận hành qua action riêng — KHÔNG mở lại training:manage.
  // CM cần cấu hình số buổi lớp trải nghiệm + duyệt đề xuất chỉnh bài của GV.
  "trials:config": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "lesson-change:approve": ["SUPER_ADMIN", "TRAINING"],

  // --- Notifications (Phase NHÓM 3) ---
  "notifications:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],

  // --- Parent requests (Phase NHÓM 3) ---
  "parent-requests:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],

  // --- Parent feedback (Phase NHÓM 3) ---
  "parent-feedback:view": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],

  // --- Media / ảnh lớp (Phase NHÓM 3) ---
  "media:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "media:upload": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "media:approve": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- HR attendance / chấm công QR (Phase NHÓM 4) ---
  // checkin = mọi nhân viên (không gồm PARENT). view = quản lý cơ sở + HR.
  // TRAINING thêm 03/08: checkin là self-action của MỌI nhân viên, sót role này
  // từ khi thêm TRAINING (FL W0) ⇒ tài khoản chỉ-Đào-tạo bị đá khỏi cả 4 trang
  // chấm công (checkin, lich-ca, yeu-cau-cong, chinh-cong) — không chấm công được ngày nào.
  "hr_attendance:checkin": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "TEACHER", "MARKETING", "ACCOUNTANT",
    "TRAINING",
  ],
  "hr_attendance:view": ["SUPER_ADMIN", "CENTER_MANAGER", "HR"],
  // Chỉnh bản ghi công + duyệt yêu cầu chỉnh công (giới hạn thời gian áp ở action).
  "hr_attendance:adjust": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Blog / News ---
  "blog:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "blog:create": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],
  "blog:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],
  "blog:delete": ["SUPER_ADMIN"],
  // FL W0-NAV-2 hygiene: SALES_CSM + ACCOUNTANT bỏ Tin tức (nội dung website = Marketing/quản lý/HR/GV).
  "news:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "TEACHER", "MARKETING",
  ],
  "news:create": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],
  "news:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],
  "news:delete": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "news:publish": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],

  // --- Payroll ---
  "payroll:view": ["SUPER_ADMIN", "ACCOUNTANT", "HR"],
  "payroll:edit": ["SUPER_ADMIN", "ACCOUNTANT"],

  // --- Students ---
  "students:view-all": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "MARKETING", "ACCOUNTANT", "HR"],
  "students:view-own-class": ["SUPER_ADMIN", "TEACHER", "CENTER_MANAGER"],
  "students:create": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],
  // FL W0 (QĐ-T4): kế toán KHÔNG sửa hồ sơ học viên (gỡ ACCOUNTANT).
  "students:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],
  "students:change-code": ["SUPER_ADMIN"], // R7-05 C10 — chỉ SUPER_ADMIN sửa mã HV (audit + reason)
  "students:delete": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "students:import": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Classes ---
  "classes:view-all": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "ACCOUNTANT", "HR", "MARKETING"],
  "classes:view-own": ["SUPER_ADMIN", "TEACHER"],
  "classes:create": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "classes:edit": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "classes:delete": ["SUPER_ADMIN"],

  // --- Class groups (Phase T0.2) ---
  "class_group:view-all": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "class_group:create": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "class_group:edit": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "class_group:delete": ["SUPER_ADMIN"],

  // --- Enrollments ---
  "enrollments:view-all": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "ACCOUNTANT"],
  "enrollments:view-own": ["SUPER_ADMIN", "TEACHER"],
  "enrollments:create": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],
  "enrollments:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],
  "enrollments:transfer": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "completions:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  // GV chỉ ĐỀ XUẤT hoàn thành khoá (xác nhận thật = completions:manage của trung tâm).
  "completions:propose-own": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],

  // --- Evaluations / surveys (R7-16) ---
  "evaluations:manage": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "evaluations:view-aggregate": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "evaluations:view-detail": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Report cards (R7-15) ---
  // #17 (câu 55, Đào tạo & GV — Toại 06/07/2026): sau khi PHÁT HÀNH học bạ chỉ QL cơ
  // sở + Phan Thành Toại (Đào tạo/TRAINING) được sửa; Toại giữ quyền duyệt/phát hành.
  // → TRAINING nhận CẢ manage (để nộp lại RECALLED→PENDING_REVIEW) LẪN review (duyệt/
  // phát hành/thu hồi). GIỮ TEACHER ở manage (GV vẫn viết DRAFT + đánh giá buổi). Việc
  // "siết sửa-sau-thu-hồi về đúng review-havers (QL/Đào tạo/Admin), chặn GV" làm ở tầng
  // action (saveReportCardAction → canEditReportCardContent), KHÔNG gỡ TEACHER ở đây.
  "report-cards:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "report-cards:review": ["SUPER_ADMIN", "CENTER_MANAGER", "TRAINING"],
  "satacoin:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "enrollments:cancel": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "enrollments:delete": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Sessions + Attendance ---
  // FL W0-NAV-2 hygiene (BA #07 3.C): SALES_CSM bỏ Buổi học/Điểm danh (module dư — Sale lo lead/tuyển sinh).
  "sessions:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "sessions:create": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "sessions:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "attendance:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "attendance:mark": ["TEACHER", "SUPER_ADMIN", "CENTER_MANAGER"],
  // Task #16 (Kiệt duyệt 07/07/2026, Phương án A): CSKH (SALES_CSM) được SỬA/hồi tố
  // điểm danh — cửa sổ 7 ngày enforce ở call-site (markAttendance). v2 seed CENTER cho
  // CENTER_SALES_CSM + RoleDef mới CENTER_CLASS_MANAGER (prisma/seed-roles.ts).
  "attendance:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],

  // --- Courses + Packages ---
  // FL W0-NAV-2 hygiene: SALES_CSM + ACCOUNTANT bỏ "Khoá dạy" (Sale bán qua Gói học = course-packages; KT không cần).
  // 03/08 — gỡ CENTER_MANAGER: chủ dự án chặn phần LMS ở vai Quản lý cơ sở.
  "courses:view": ["SUPER_ADMIN", "TRAINING", "HR", "TEACHER", "MARKETING"],
  // Chỉnh chương trình học (curriculum + khóa học + gói combo) CHỈ Đào tạo + SUPER_ADMIN
  // (user chốt 24/07): gỡ khỏi CENTER_MANAGER + MARKETING.
  "courses:create": ["SUPER_ADMIN", "TRAINING"],
  "courses:edit": ["SUPER_ADMIN", "TRAINING"],
  "courses:delete": ["SUPER_ADMIN", "TRAINING"],
  "course-packages:view": [
    "SUPER_ADMIN", "TRAINING", "CENTER_MANAGER", "SALES_CSM", "MARKETING",
  ],
  // FL-R2 W5 — course-packages = GIÁ/BÁN (tiền) → siết về [SUPER_ADMIN, CENTER_MANAGER]
  // cho khớp action requireAdmin (course-packages/_actions.ts). Trước đây matrix nới
  // TRAINING/MARKETING nhưng action chặn → mở form được mà submit fail (mất công nhập).
  "course-packages:edit": ["SUPER_ADMIN", "TRAINING"],

  // --- Curriculum + Lessons ---
  // FL W0 (QĐ-T1): biên soạn nội dung LMS = TRAINING (Đào tạo). TEACHER + CENTER_MANAGER chỉ XEM.
  "curriculum:view": ["SUPER_ADMIN", "TRAINING", "TEACHER"],
  "curriculum:create": ["SUPER_ADMIN", "TRAINING"],
  "curriculum:edit": ["SUPER_ADMIN", "TRAINING"],
  "curriculum:delete": ["SUPER_ADMIN", "TRAINING"],

  // --- Questions / Exams / Assignments ---
  // FL W0 (QĐ-T1): kho câu hỏi/đề thi/bài tập biên soạn bởi TRAINING. TEACHER chỉ XEM + chấm bài/đề.
  "questions:view": ["SUPER_ADMIN", "TRAINING", "TEACHER"],
  "questions:author": ["SUPER_ADMIN", "TRAINING"],
  "questions:edit": ["SUPER_ADMIN", "TRAINING"],
  "questions:delete": ["SUPER_ADMIN", "TRAINING"],
  "exams:view": ["SUPER_ADMIN", "TRAINING", "TEACHER"],
  "exams:create": ["SUPER_ADMIN", "TRAINING"],
  "exams:edit": ["SUPER_ADMIN", "TRAINING"],
  "exams:grade": ["TEACHER", "SUPER_ADMIN", "TRAINING", "CENTER_MANAGER"],
  "exams:delete": ["SUPER_ADMIN", "TRAINING"],
  "assignments:view": ["SUPER_ADMIN", "TRAINING", "TEACHER"],
  "assignments:create": ["SUPER_ADMIN", "TRAINING"],
  "assignments:edit": ["SUPER_ADMIN", "TRAINING"],
  "assignments:grade": ["TEACHER", "SUPER_ADMIN", "TRAINING", "CENTER_MANAGER"],
  "assignments:delete": ["SUPER_ADMIN", "TRAINING"],
  // Site GV (L6): GV GIAO bài từ template có sẵn cho LỚP MÌNH phụ trách. KHÁC
  // assignments:create (TRAINING soạn kho toàn hệ thống) — capability này CHỈ cho
  // giao lại template, và action tự khoá classId ∈ assignedClassIds (cấp LỚP,
  // không phải cấp cơ sở). GV KHÔNG soạn kho/không sửa bài admin.
  "assignments:assign-own": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  // Site GV (L6) — "Kho bài tập của tôi": GV TỰ SOẠN đề trắc nghiệm/tự luận + tự
  // xoá đề của MÌNH (AssignmentTemplate.createdById = employeeId/userId của GV).
  // KHÁC assignments:create (TRAINING soạn kho toàn hệ thống) — capability này chỉ
  // đụng template do chính GV tạo (own-scope qua createdById), KHÔNG sửa/xoá bài admin.
  "assignments:author-own": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],

  // --- Documents ---
  // FL W0 (QĐ-T1): tài liệu LMS biên soạn/upload bởi TRAINING. TEACHER + CENTER_MANAGER chỉ XEM.
  "documents:view": ["SUPER_ADMIN", "TRAINING", "TEACHER"],
  "documents:upload": ["SUPER_ADMIN", "TRAINING"],
  "documents:delete": ["SUPER_ADMIN", "TRAINING"],

  // --- Teaching materials (FL W0) — GV xem tài liệu giảng dạy của lớp mình ---
  "teaching-materials:view-own-class": ["SUPER_ADMIN", "TRAINING", "TEACHER"],

  // --- Centers / Rooms / Holidays ---
  "centers:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "centers:edit": ["SUPER_ADMIN"],
  // FL W0-NAV-2 hygiene: SALES_CSM bỏ Phòng học (module dư).
  "rooms:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "rooms:edit": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "holidays:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "holidays:edit": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Inventory ---
  "inventory:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER", "ACCOUNTANT"],
  "inventory:edit": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "inventory:movement": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "inventory:audit": ["SUPER_ADMIN", "ACCOUNTANT"],

  // --- ZMRoboKit ---
  "kits:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "MARKETING",
  ],
  "kits:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],

  // --- Site content / CMS ---
  "site-content:view": ["SUPER_ADMIN", "MARKETING"],
  "site-content:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],

  // --- Audit logs ---
  // Câu 13 BGĐ (đã ký): BGĐ (SUPER_ADMIN) + Quản lý cơ sở (CENTER_MANAGER, mỗi
  // người chỉ xem cơ sở mình — scope ép ở tầng query theo orgUnit) được xem; PII
  // che mặc định. view-pii = break-glass "xem đầy đủ" có kiểm soát (reason + log
  // riêng audit.pii-unmasked). Cùng tập role với view — kiểm soát nằm ở reason+audit.
  "audit-logs:view": ["SUPER_ADMIN"],
  "audit-logs:view-pii": ["SUPER_ADMIN"],

  // --- Settings / system ---
  "settings:view": ["SUPER_ADMIN"],
  "settings:edit": ["SUPER_ADMIN"],
  "users:manage": ["SUPER_ADMIN"], // create/disable User accounts
  "roles:assign": ["SUPER_ADMIN"],
  "roles:manage": ["SUPER_ADMIN"], // A0-02 — chỉ SUPER_ADMIN cấu hình role/permission

  // --- Phase 5.6 — Financial ---
  "payments:manage": ["SUPER_ADMIN", "ACCOUNTANT"],
  "payments:view": ["SUPER_ADMIN", "CENTER_MANAGER", "ACCOUNTANT"],
  "payments:record": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "ACCOUNTANT"],
  "payments:confirm": ["SUPER_ADMIN", "ACCOUNTANT"],
  // #15 (câu 32) — CCCD PH + địa chỉ mask mặc định; break-glass "Xem đầy đủ" (reason
  // ≥10 ký tự + audit) chỉ cho kế toán + admin. v2: HO_ACCOUNTANT GLOBAL,
  // CENTER_ACCOUNTANT CENTER (prisma/seed-roles.ts). KHÔNG mở cho CENTER_MANAGER.
  "payments:view-pii": ["SUPER_ADMIN", "ACCOUNTANT"],
  // C4 — duyệt kế hoạch trả góp 2 đợt: chỉ quản lý cơ sở + admin (audit + reason bắt buộc khi từ chối).
  // #09 (09/07): v2 chuyển quyền này sang HO_ACCOUNTANT (de-xuat-scope §3.3 "tiền tập
  // trung"). `lib/orders/installments.ts` gate bằng matrix v1 (không theo cờ) làm lớp
  // phòng thủ, nên v1 PHẢI có ACCOUNTANT — nếu không, sau flip kế toán Hội sở qua được
  // gate v2 ở wrapper rồi bị chính lib chặn. CENTER_MANAGER giữ ở v1 cho tới khi flip:
  // gate thật nằm ở `checkPermission` trong _installment-approval-actions.ts.
  "installments:approve": ["SUPER_ADMIN", "CENTER_MANAGER", "ACCOUNTANT"],
  // BGĐ 31/07 — duyệt giảm giá: Quản lý cơ sở (người đệ trình là Sale/CSKH cơ sở).
  // ACCOUNTANT giữ như installments:approve để kế toán Hội sở không bị lib chặn sau flip v2.
  "discounts:approve": ["SUPER_ADMIN", "CENTER_MANAGER", "ACCOUNTANT"],
  "orders:view": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "ACCOUNTANT"],
  "orders:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "ACCOUNTANT"],
  // Xem đầy đủ liên hệ khách trên đơn (CRM + kế toán); vai khác thấy bản che.
  "orders:view-pii": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "ACCOUNTANT"],

  // --- Phase 5.7 — Vouchers ---

  // --- Phase 5.10 — Products ---
  "products:view": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "MARKETING", "ACCOUNTANT"],
  "products:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "ACCOUNTANT"],

  // --- Phase 5.13 — Email System ---
  // R7 hygiene (BA #07 3.C): ACCOUNTANT bỏ Email Templates/Logs — không phải chức năng kế toán.
  "emails:view": ["SUPER_ADMIN", "MARKETING"],
  "emails:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],

  // --- Chat realtime (US-05 — nguồn sự thật: docs/chat-realtime/permissions.md) ---
  // Matrix v1 chỉ gate VAI được vào chat; quyền đọc/gửi thật là participant-based
  // enforce ở tầng action (delta 00-dieu-chinh mục E.3). SALES_CSM P0: 403 toàn bộ
  // (F5 đã dời) — cố ý KHÔNG xuất hiện ở bất kỳ action chat:* nào.
  "chat:read": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER", "PARENT"],
  // ⚠️ chat:send CỐ Ý KHÔNG có SUPER_ADMIN — ngoại lệ DUY NHẤT của luật "SUPER_ADMIN
  // phủ mọi action" (permissions.test.ts): US-15 AC4 — chế độ xem của Admin là CHỈ
  // ĐỌC, không gửi CHAT vào hội thoại mình không phải thành viên. can() v2 bypass
  // SUPER_ADMIN vẫn true ⇒ chốt chặn thật nằm ở participant-check trong Server
  // Action (US-06); v1 deny thêm một lớp + pin ý định ngay tại matrix.
  "chat:send": ["CENTER_MANAGER", "TEACHER", "PARENT"],
  "chat:announce": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  // Gỡ tin người khác: GV nhóm mình (+ lý do) hoặc Admin. QLCS ❌ (permissions.md).
  "chat:moderate": ["SUPER_ADMIN", "TEACHER"],
  // /admin/hoi-thoai + khoá hội thoại + tra cứu F-AUDIT — chỉ Admin HO (US-15 AC5).
  "chat:admin": ["SUPER_ADMIN"],
};

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

// Per-user override grant — Phase 5.3.0
export type UserGrant = {
  action: string;
  grant: "ALLOW" | "DENY";
};

export type CanUser = {
  role: Role | string | null | undefined;
  roles?: (Role | string)[]; // Đợt 3B — đa vai trò (union quyền). Trống → dùng role.
  grants?: UserGrant[];
};

/** Đợt 3B — các vai trò HỮU HIỆU của 1 user (union). Trống roles → [role]. */
export function getEffectiveRoles(user: {
  role?: Role | string | null;
  roles?: (Role | string)[] | null;
}): Role[] {
  const arr =
    user.roles && user.roles.length > 0
      ? user.roles
      : user.role
        ? [user.role]
        : [];
  // Dedup (#13): User.roles trùng phần tử → không nhân đôi item ở RoleSwitcher
  // (trùng React key) / không hiện nút chuyển vai cho user thực chất 1 vai.
  return [...new Set(arr.filter(Boolean))] as Role[];
}

function roleListAllows(roles: Role[], action: Action): boolean {
  const allowed = PERMISSIONS[action];
  if (!allowed) return false;
  return roles.some((r) => allowed.includes(r));
}

/**
 * Check if a user (role / role[] / CanUser) can perform action.
 *
 * Đa vai trò: quyền = HỢP (union) — true nếu BẤT KỲ vai trò nào được phép.
 * Resolution (CanUser): SUPER_ADMIN bypass > grant DENY > grant ALLOW > union role.
 * Back-compat: truyền 1 Role string / null vẫn chạy như cũ.
 */
export function can(
  userOrRole: CanUser | Role | Role[] | string | null | undefined,
  action: Action,
): boolean {
  // Path 0: mảng vai trò → union.
  if (Array.isArray(userOrRole)) {
    return roleListAllows(userOrRole, action);
  }

  // Path 1: legacy signature — role string / null / undefined
  if (
    userOrRole === null ||
    userOrRole === undefined ||
    typeof userOrRole === "string"
  ) {
    const role = userOrRole;
    if (!role) return false;
    return PERMISSIONS[action]?.includes(role as Role) ?? false;
  }

  // Path 2: user object (role + roles + grants)
  const user = userOrRole;
  const effective = getEffectiveRoles(user);

  // 2a. SUPER_ADMIN bypass — không thể bị DENY override (chống tự khoá).
  if (effective.includes("SUPER_ADMIN")) {
    return PERMISSIONS[action]?.includes("SUPER_ADMIN") ?? false;
  }

  // 2b. Per-user grants — DENY > ALLOW > role fallback
  const grant = user.grants?.find((g) => g.action === action);
  if (grant?.grant === "DENY") return false;
  if (grant?.grant === "ALLOW") return true;

  // 2c. Union role matrix fallback
  return roleListAllows(effective, action);
}

// =============================================================================
// FULL ACTION LIST — single source of truth, sync với PERMISSIONS matrix
// =============================================================================

export const ALL_ACTIONS = Object.keys(PERMISSIONS) as Action[];

export function assertCan(
  roleOrRoles: CanUser | Role | Role[] | string | undefined | null,
  action: Action,
): void {
  if (!can(roleOrRoles, action)) {
    throw new Error(`Forbidden: không có quyền ${action}`);
  }
}

// =============================================================================
// FIELD-LEVEL VISIBILITY — Employee
// =============================================================================

export function getEmployeeFieldVisibility(
  roleOrRoles: Role | string | (Role | string)[] | null | undefined,
): {
  basic: boolean; // name, jobTitle, department, avatar, bio, joinedAt
  contact: boolean; // phone, email
  salary: boolean; // salaryRank, salaryLevel, bhxhBase
  personal: boolean; // dateOfBirth, gender, contractType, managerId, nationalId
} {
  const roles = (Array.isArray(roleOrRoles) ? roleOrRoles : [roleOrRoles]).filter(
    Boolean,
  ) as Role[];
  if (roles.length === 0) {
    return { basic: false, contact: false, salary: false, personal: false };
  }
  const any = (allowed: Role[]) => roles.some((r) => allowed.includes(r));
  return {
    basic: true,
    contact: any(["SUPER_ADMIN", "CENTER_MANAGER", "HR"]),
    salary: any(["SUPER_ADMIN", "HR", "ACCOUNTANT"]),
    personal: any(["SUPER_ADMIN", "HR"]),
  };
}

export type EmployeeFieldVisibility = ReturnType<typeof getEmployeeFieldVisibility>;

// SEC-H04 — nguồn DUY NHẤT map nhóm visibility → field Employee. Khớp CHÍNH XÁC với
// các input gate trong employee-form.tsx (visibility.contact/salary/personal). Dùng cho
// CẢ redact-khi-đọc (không serialize PII xuống client) LẪN strip-khi-ghi (client không
// set/xoá được field ngoài quyền). isCEO KHÔNG nằm đây: non-nullable + đã chặn ở M15.
export const EMPLOYEE_GATED_FIELDS = {
  contact: ["email", "phone"],
  salary: ["salaryRank", "salaryLevel", "bhxhBase"],
  personal: [
    "dateOfBirth",
    "gender",
    "contractType",
    "managerId",
    "endDate",
    "nationalId",
    "address",
    "emergencyContact",
    "notes",
  ],
} as const;

/**
 * Redact-khi-đọc (H04): set field thuộc nhóm bị ẩn → null TRƯỚC khi serialize xuống
 * bất kỳ client component. Giữ nguyên shape (field vẫn có, giá trị null) nên type ổn
 * định + UI (đã ẩn theo cùng visibility) không đổi. Trả về BẢN SAO, không mutate input.
 */
export function redactEmployeeFields<T extends Record<string, unknown>>(
  employee: T,
  visibility: EmployeeFieldVisibility,
): T {
  const out: Record<string, unknown> = { ...employee };
  for (const group of ["contact", "salary", "personal"] as const) {
    if (visibility[group]) continue;
    for (const field of EMPLOYEE_GATED_FIELDS[group]) {
      if (field in out) out[field] = null;
    }
  }
  return out as T;
}

/**
 * Strip-khi-ghi: XOÁ key thuộc nhóm bị ẩn khỏi payload create/update (mutate tại chỗ).
 * Prisma bỏ qua key vắng → DB giữ nguyên giá trị cũ (chống mất data khi client gửi null
 * do đã bị redact) + chặn client set field ngoài quyền (write-side hardening).
 */
export function stripHiddenEmployeeFields(
  data: Record<string, unknown>,
  visibility: EmployeeFieldVisibility,
): void {
  for (const group of ["contact", "salary", "personal"] as const) {
    if (visibility[group]) continue;
    for (const field of EMPLOYEE_GATED_FIELDS[group]) delete data[field];
  }
}

// =============================================================================
// HELPERS — convenience for common patterns
// =============================================================================

/** Quick role check — true if role is in the provided list. */
export function isRole(
  role: Role | string | null | undefined,
  ...allowed: Role[]
): boolean {
  if (!role) return false;
  return allowed.includes(role as Role);
}

/** True if SUPER_ADMIN — equivalent to legacy isSuperAdmin(). */
export function isSuperAdmin(role: Role | string | null | undefined): boolean {
  return role === "SUPER_ADMIN";
}

// =============================================================================
// MULTI-ROLE HELPERS — Đợt 3B
// =============================================================================

type RoleHolder = { role?: Role | string | null; roles?: (Role | string)[] | null };

/** User có giữ vai trò r không (xét union roles, fallback role). */
export function hasRole(user: RoleHolder, r: Role): boolean {
  return getEffectiveRoles(user).includes(r);
}

/** User có giữ BẤT KỲ vai trò nào trong danh sách không. */
export function hasAnyRole(user: RoleHolder, allowed: Role[]): boolean {
  const eff = getEffectiveRoles(user);
  return allowed.some((r) => eff.includes(r));
}

/** True nếu user có ≥1 vai trò NHÂN VIÊN (≠ PARENT). */
export function hasStaffRole(user: RoleHolder): boolean {
  return getEffectiveRoles(user).some((r) => r !== "PARENT");
}

/** True nếu user CHỈ là PARENT (không kèm vai trò nhân viên). */
export function isParentOnly(user: RoleHolder): boolean {
  const eff = getEffectiveRoles(user);
  return eff.length > 0 && eff.every((r) => r === "PARENT");
}

// Vai trò ĐƯỢC PHÉP xem thông tin liên hệ phụ huynh (SĐT/email) — dữ liệu PII.
// GIÁO VIÊN/trợ giảng/MARKETING/HR KHÔNG được xem (P0-3: chống lộ SĐT toàn lớp ở
// trang tiến độ lớp). CENTER_MANAGER/ACCOUNTANT vẫn cần center scope ở tầng query.
const PARENT_CONTACT_ROLES: Role[] = [
  "SUPER_ADMIN",
  "CENTER_MANAGER",
  "ACCOUNTANT",
  "SALES_CSM",
];

/** User có được xem SĐT/email phụ huynh không (PII). */
export function canViewParentContact(user: RoleHolder): boolean {
  return hasAnyRole(user, PARENT_CONTACT_ROLES);
}

// #11: canViewLeadPii đã chuyển sang lib/auth/check-permission.ts (async, qua checkPermission —
// sau flip #09). Không import check-permission vào file này: permission-eval import
// ngược permissions.ts, sẽ tạo vòng.
