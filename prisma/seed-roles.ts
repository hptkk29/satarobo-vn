// prisma/seed-roles.ts — A0-02: seed danh mục RoleDef + RolePermission mẫu (Doc 15 §2.3).
// 15 role (EL-02 thêm AUDITOR); KHÔNG có HO_MANAGER. SUPER_ADMIN/PARENT = isSystem (không xóa/đổi code).
// Idempotent: upsert RoleDef theo code + reset permission của role mỗi lần chạy.
// ⚠️ NGUYÊN TỬ: cả vòng lặp nằm trong một `$transaction` — đọc chú thích ở `seedRoles()`
// trước khi sửa. Tách ra = mất quyền toàn hệ thống giữa lúc seed (cờ v2 đang BẬT trên prod).
import { PrismaClient, type ScopeType } from "@prisma/client";

type Perm = { action: string; scopeType: ScopeType };
type RoleSeed = { code: string; name: string; isSystem?: boolean; perms: Perm[] };

// Action phải nằm trong ACTION_REGISTRY (lib/auth/action-registry.ts).
//
// ─── R1: scopeType KHÔNG phải nơi cách ly cơ sở ──────────────────────────────
// `can.ts` trả FALSE khi scope cần target mà call-site không truyền:
//   CENTER → target.centerId · CLASS/ASSIGNED → target.classId
//   OWN    → target.createdById · CHILDREN → target.parentUserId
// Mà phần lớn call-site là page-gate gọi trần: `checkPermission("leads:view-all")`
// (9 chỗ), `students:view-all` (8), `leads:edit` (15), `classes:view-own` (6)…
// ⇒ Gán CENTER/OWN/CLASS cho những action đó KHÔNG phải "siết scope", mà là KHOÁ
//   TRANG của role ngay khi flip #09.
//
// Cách ly cơ sở đến từ `scopedDb` (#03/#04: Lead/Student/Class/Enrollment/Attendance
// ∈ SCOPED_MODELS) + `checkEnrollmentScope`, KHÔNG từ scopeType. GLOBAL ở tầng
// permission = giữ nguyên hiện trạng v1 (v1 vốn không có scope), không phải nới quyền.
//
// Quy tắc: action còn ≥1 call-site gọi trần ⇒ GLOBAL. Chỉ giữ scope hẹp khi MỌI
// call-site đã truyền target (vd `attendance:edit` — công của #16).
// Kiểm bằng: `pnpm exec tsx scripts/rbac-scope-audit.ts` (CI: lib/auth/rbac-scope.test.ts).
// Quyết định giữ/siết/bỏ: docs/ke-hoach-go-live-2607/de-xuat-scope-v2-center-manager-teacher.md
// (Kiệt duyệt 09/07/2026).
export const ROLE_SEED: RoleSeed[] = [
  {
    code: "SUPER_ADMIN", name: "Quản trị tối cao", isSystem: true,
    perms: [
      { action: "roles:manage", scopeType: "GLOBAL" },
      { action: "roles:assign", scopeType: "GLOBAL" },
      // US-03 — quản nhóm người dùng + grant nhóm (chỉ SUPER_ADMIN, như roles:manage).
      { action: "user-groups:manage", scopeType: "GLOBAL" },
      // #17 (câu 55): học bạ. SUPER_ADMIN đã bypass toàn bộ quyền trong can() v2
      // (lib/auth/can.ts) → 2 dòng này KHÔNG đổi hành vi, thêm cho khớp v1 + rõ ý.
      { action: "report-cards:manage", scopeType: "GLOBAL" },
      { action: "report-cards:review", scopeType: "GLOBAL" },
      // US-05 chat (08/08): bypass làm 5 dòng này không đổi hành vi — khai cho rõ ý.
      // Riêng chat:send Admin bị chặn ở tầng action (US-15 AC4 — chỉ đọc khi không
      // phải thành viên); v1 matrix cố ý không cấp (xem permissions.ts).
      { action: "chat:read", scopeType: "GLOBAL" },
      { action: "chat:send", scopeType: "GLOBAL" },
      { action: "chat:announce", scopeType: "GLOBAL" },
      { action: "chat:moderate", scopeType: "GLOBAL" },
      { action: "chat:admin", scopeType: "GLOBAL" },
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:program:manage", scopeType: "GLOBAL" },
      { action: "elearning:content:author", scopeType: "GLOBAL" },
      { action: "elearning:content:publish", scopeType: "GLOBAL" },
      { action: "elearning:assignment:create", scopeType: "GLOBAL" },
      { action: "elearning:assignment:extend", scopeType: "GLOBAL" },
      { action: "elearning:requirement:manage", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-team", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-all", scopeType: "GLOBAL" },
      { action: "elearning:video-analytics:view", scopeType: "GLOBAL" },
      { action: "elearning:exam:grade", scopeType: "GLOBAL" },
      { action: "elearning:exam:unlock", scopeType: "GLOBAL" },
      { action: "elearning:certificate:issue", scopeType: "GLOBAL" },
      { action: "elearning:certificate:revoke", scopeType: "GLOBAL" },
      { action: "elearning:report:export", scopeType: "GLOBAL" },
    ],
  },
  {
    // Mapping ACCOUNTANT (v1) đã duyệt — Kiệt 06/07/2026, xem Document/0-yeucau/
    // 3-ke-hoach-trien-khai/phases/rolepermission-mapping-proposal.md §1.
    // HO_ACCOUNTANT nhận ĐỦ 23 action của ACCOUNTANT (v1) — khớp "KT hội sở thì thấy
    // hết" (BGĐ câu 10 + Kế toán tổng hợp câu 30). Không tách bớt: HO accountant có
    // oversight toàn hệ thống.
    code: "HO_ACCOUNTANT", name: "Kế toán Hội sở",
    perms: [
      { action: "payments:manage", scopeType: "GLOBAL" },
      { action: "payments:view", scopeType: "GLOBAL" },
      { action: "orders:manage", scopeType: "GLOBAL" },
      // G-A (21/08/2026) — cổng tạo đơn nay kiểm `orders:create`; ai có
      // `orders:manage` phải có kèm để không mất chức năng đang dùng.
      { action: "orders:create", scopeType: "GLOBAL" },
      { action: "payroll:view", scopeType: "GLOBAL" },
      { action: "payroll:edit", scopeType: "GLOBAL" },
      { action: "payments:record", scopeType: "GLOBAL" },
      { action: "payments:confirm", scopeType: "GLOBAL" },
      // #15 (câu 32) — break-glass xem đầy đủ CCCD PH + địa chỉ ở màn thanh toán.
      { action: "payments:view-pii", scopeType: "GLOBAL" },
      { action: "orders:view", scopeType: "GLOBAL" },
      { action: "orders:view-pii", scopeType: "GLOBAL" },
      { action: "products:view", scopeType: "GLOBAL" },
      { action: "products:manage", scopeType: "GLOBAL" },
      { action: "students:view-all", scopeType: "GLOBAL" },
      { action: "classes:view-all", scopeType: "GLOBAL" },
      { action: "enrollments:view-all", scopeType: "GLOBAL" },
      { action: "inventory:view", scopeType: "GLOBAL" },
      { action: "inventory:audit", scopeType: "GLOBAL" },
      // #09 (09/07) — nhận bàn giao từ CENTER_MANAGER theo de-xuat-scope §3.3 "tiền & kho
      // tập trung → HO_ACCOUNTANT". Trước đó chỉ XOÁ khỏi CM mà quên THÊM vào đây ⇒ 2 action
      // này mồ côi ở v2 (sau flip không role thường nào làm được). Xem test "không action mồ côi".
      { action: "inventory:edit", scopeType: "GLOBAL" },
      { action: "installments:approve", scopeType: "GLOBAL" },
      // BGĐ 31/07 — kế toán Hội sở giám sát giảm giá cùng QL cơ sở (khớp v1 ACCOUNTANT).
      { action: "discounts:approve", scopeType: "GLOBAL" },
      { action: "centers:view", scopeType: "GLOBAL" },
      { action: "holidays:view", scopeType: "GLOBAL" },
      { action: "employees:view-public", scopeType: "GLOBAL" },
      { action: "employees:view-salary", scopeType: "GLOBAL" },
      { action: "honors:view", scopeType: "GLOBAL" },
      { action: "hr_attendance:checkin", scopeType: "GLOBAL" },
      { action: "blog:view", scopeType: "GLOBAL" },
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
    ],
  },
  {
    // Mapping HR (v1) đã duyệt — Kiệt chọn Phương án A (addendum
    // phieu-kiet-hr-addendum.docx) — tạo CENTER_HR bên cạnh HO_HR, giống pattern
    // ACCOUNTANT (HO_ACCOUNTANT full oversight GLOBAL, CENTER_ACCOUNTANT subset
    // CENTER). HO_HR nhận ĐỦ 23 action — khớp "Hồ sơ nhân viên toàn hệ thống"
    // (BGĐ câu 10).
    code: "HO_HR", name: "Nhân sự Hội sở",
    perms: [
      { action: "employees:view-all", scopeType: "GLOBAL" },
      { action: "employees:edit", scopeType: "GLOBAL" },
      { action: "employees:view-public", scopeType: "GLOBAL" },
      { action: "employees:create", scopeType: "GLOBAL" },
      { action: "employees:view-salary", scopeType: "GLOBAL" },
      { action: "employees:view-personal", scopeType: "GLOBAL" },
      { action: "honors:view", scopeType: "GLOBAL" },
      { action: "honors:create", scopeType: "GLOBAL" },
      { action: "honors:edit", scopeType: "GLOBAL" },
      { action: "jobs:view", scopeType: "GLOBAL" },
      { action: "jobs:create", scopeType: "GLOBAL" },
      { action: "jobs:edit", scopeType: "GLOBAL" },
      { action: "jobs:delete", scopeType: "GLOBAL" },
      { action: "hr_attendance:checkin", scopeType: "GLOBAL" },
      { action: "hr_attendance:view", scopeType: "GLOBAL" },
      { action: "blog:view", scopeType: "GLOBAL" },
      { action: "news:view", scopeType: "GLOBAL" },
      { action: "payroll:view", scopeType: "GLOBAL" },
      { action: "students:view-all", scopeType: "GLOBAL" },
      { action: "classes:view-all", scopeType: "GLOBAL" },
      { action: "courses:view", scopeType: "GLOBAL" },
      { action: "centers:view", scopeType: "GLOBAL" },
      { action: "holidays:view", scopeType: "GLOBAL" },
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:program:manage", scopeType: "GLOBAL" },
      { action: "elearning:content:author", scopeType: "GLOBAL" },
      { action: "elearning:assignment:create", scopeType: "GLOBAL" },
      { action: "elearning:assignment:extend", scopeType: "GLOBAL" },
      { action: "elearning:requirement:manage", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-team", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-all", scopeType: "GLOBAL" },
      { action: "elearning:video-analytics:view", scopeType: "GLOBAL" },
      { action: "elearning:exam:grade", scopeType: "GLOBAL" },
      { action: "elearning:exam:unlock", scopeType: "GLOBAL" },
      { action: "elearning:certificate:issue", scopeType: "GLOBAL" },
      { action: "elearning:certificate:revoke", scopeType: "GLOBAL" },
      { action: "elearning:report:export", scopeType: "GLOBAL" },
    ],
  },
  {
    // Role MỚI — Kiệt duyệt Phương án A (06/07/2026, addendum HR). CENTER_HR nhận
    // subset "vận hành hằng ngày tại cơ sở" (khớp "Hồ sơ, chấm công" — SỬA gì của
    // câu 10 BGĐ) — giống cách CENTER_ACCOUNTANT chỉ có subset của HO_ACCOUNTANT.
    // KHÔNG có: employees:create/view-salary/view-personal, honors:create/edit,
    // jobs:*, payroll:view (giữ tập trung ở HO_HR, tránh 1 thực tập sinh cấp cơ sở
    // có quyền xem lương/hồ sơ cá nhân toàn công ty).
    // Đối tượng ban đầu: 2 "Thực Tập Sinh Nhân sự" CS1 (Lê Thị Tuyết Mai) + CS2
    // (Trần Thị Thúy Liên) — xem phieu-hanh-chinh câu 62. Cả 2 CHƯA có tài khoản
    // User trong hệ thống — gán UserOrgRole là bước SAU, khi tài khoản được tạo
    // (patch-rbac-staff.ts đã sửa để tự route đúng theo centerId).
    code: "CENTER_HR", name: "Nhân sự cơ sở",
    perms: [
      { action: "employees:view-all", scopeType: "CENTER" },
      { action: "employees:view-public", scopeType: "CENTER" },
      { action: "employees:edit", scopeType: "CENTER" },
      // Shadow prod 10/07: checkin đồng nhất GLOBAL mọi role (self-action). view giữ CENTER.
      { action: "hr_attendance:checkin", scopeType: "GLOBAL" },
      { action: "hr_attendance:view", scopeType: "CENTER" },
      // R1 — 8 và 10 call-site gọi trần.
      { action: "students:view-all", scopeType: "GLOBAL" },
      { action: "classes:view-all", scopeType: "GLOBAL" },
      { action: "centers:view", scopeType: "CENTER" },
      { action: "holidays:view", scopeType: "CENTER" },
      // User chốt 09/07: TTS Nhân sự LÀ người đăng tin tuyển dụng (gồm cả xoá tin).
      // Trước đó jobs:* bị xếp nhầm vào "thu hẹp có chủ đích" của Phương án A.
      { action: "jobs:view", scopeType: "GLOBAL" },
      { action: "jobs:create", scopeType: "GLOBAL" },
      { action: "jobs:edit", scopeType: "GLOBAL" },
      { action: "jobs:delete", scopeType: "GLOBAL" },
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
    ],
  },
  {
    // Mapping MARKETING (v1) đã duyệt — Kiệt 06/07/2026, xem mapping-proposal.md §5.
    // BGĐ chỉ ghi "Ok" (không tách cơ sở) → toàn bộ 35 action GLOBAL, không split.
    // OI-4 RESOLVED 21/07 (user chốt): MARKETING XEM PII lead (tên/SĐT/email/ghi chú) để
    // outreach → thêm leads:view-pii. Parity với v1 permissions.ts. (RBAC_V2 OFF nên chỉ có
    // hiệu lực khi re-seed + flip cờ; v1 đã áp runtime.) Cách ly cơ sở vẫn do scopedDb.
    code: "HO_MARKETING", name: "Marketing Hội sở",
    perms: [
      { action: "leads:view-all", scopeType: "GLOBAL" },
      { action: "leads:view-pii", scopeType: "GLOBAL" },
      { action: "blog:edit", scopeType: "GLOBAL" },
      { action: "employees:view-public", scopeType: "GLOBAL" },
      { action: "honors:view", scopeType: "GLOBAL" },
      { action: "honors:create", scopeType: "GLOBAL" },
      { action: "honors:edit", scopeType: "GLOBAL" },
      { action: "jobs:view", scopeType: "GLOBAL" },
      { action: "leads:create", scopeType: "GLOBAL" },
      { action: "leads:edit", scopeType: "GLOBAL" },
      { action: "leads:export", scopeType: "GLOBAL" },
      { action: "notifications:manage", scopeType: "GLOBAL" },
      { action: "parent-feedback:view", scopeType: "GLOBAL" },
      { action: "hr_attendance:checkin", scopeType: "GLOBAL" },
      { action: "blog:view", scopeType: "GLOBAL" },
      { action: "blog:create", scopeType: "GLOBAL" },
      { action: "news:view", scopeType: "GLOBAL" },
      { action: "news:create", scopeType: "GLOBAL" },
      { action: "news:edit", scopeType: "GLOBAL" },
      { action: "news:publish", scopeType: "GLOBAL" },
      // #09 (09/07) — nhận bàn giao từ CENTER_MANAGER (de-xuat-scope §3.3 "nội dung đối ngoại
      // → HO_MARKETING"). Trước đó chỉ xoá khỏi CM, quên thêm vào đây ⇒ mồ côi ở v2.
      { action: "news:delete", scopeType: "GLOBAL" },
      { action: "honors:settings", scopeType: "GLOBAL" },
      { action: "students:view-all", scopeType: "GLOBAL" },
      { action: "classes:view-all", scopeType: "GLOBAL" },
      { action: "courses:view", scopeType: "GLOBAL" },
      // 24/07: chỉnh khóa học CHỈ Đào tạo + SUPER_ADMIN → gỡ courses:edit khỏi Marketing.
      { action: "course-packages:view", scopeType: "GLOBAL" },
      { action: "centers:view", scopeType: "GLOBAL" },
      { action: "holidays:view", scopeType: "GLOBAL" },
      { action: "kits:view", scopeType: "GLOBAL" },
      { action: "kits:edit", scopeType: "GLOBAL" },
      { action: "site-content:view", scopeType: "GLOBAL" },
      { action: "site-content:edit", scopeType: "GLOBAL" },
      { action: "products:view", scopeType: "GLOBAL" },
      { action: "emails:view", scopeType: "GLOBAL" },
      { action: "emails:manage", scopeType: "GLOBAL" },
      // 11/08 (chủ dự án chốt) — Marketing góp ảnh vào KHO của lớp; GV mới là người
      // chọn ảnh gửi phụ huynh. CHỈ xem + đưa vào kho: KHÔNG `media:upload` (đăng
      // thẳng tới PH) và KHÔNG `media:approve`. GLOBAL vì Marketing là vai Hội sở
      // xuyên cơ sở (chủ dự án chọn phạm vi toàn hệ thống) + `media:view` là action
      // gác trang /media (page-gates.test: action làm gate phải GLOBAL).
      { action: "media:view", scopeType: "GLOBAL" },
      { action: "media:upload-draft", scopeType: "GLOBAL" },
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
    ],
  },
  {
    // Mapping TRAINING (v1, 33 action LMS) đã duyệt — Kiệt 06/07/2026 (mapping-
    // proposal.md §2) — role thật đang dùng bởi Phan Thành Toại (Lead Đào tạo).
    // Toàn bộ GLOBAL: nội dung/giáo trình dùng chung cả 2 cơ sở, không tách theo
    // trung tâm (Phòng Đào tạo, câu 74a: "quản lý đào tạo chỉ quản lý nội dung").
    // ⚠️ SỬA 06/07/2026: RoleDef code ĐÚNG là "TRAINING" (không phải "HO_TRAINING")
    // — `prisma/patch-rbac-staff.ts` (K1, đã chạy PROD 02/07 + DEV trước đó) đã tạo
    // RoleDef "TRAINING" @ HO cho user có legacy role TRAINING (vd Phan Thành Toại
    // đã có UserOrgRole(TRAINING@HO) từ trước, chỉ thiếu permission — đây là phần bổ
    // sung permission cho role đã gán, KHÔNG cần gán UserOrgRole mới).
    code: "TRAINING", name: "Đào tạo (toàn LMS)",
    // 24/07 (user chốt): KHOÁ CHẶT về chỉ curriculum + LMS + DUYỆT học bạ. Gỡ:
    // students/classes:view-all (hết xem HV/lớp toàn hệ thống — Toại về đúng CS1),
    // reports:training, evaluations:manage, trials:config, report-cards:manage
    // (chỉ còn report-cards:review = duyệt). GIỮ training:manage (chìa khoá LMS:
    // gác SCORM + mở khoá curriculum + soạn đề/câu hỏi — bỏ là hỏng LMS).
    perms: [
      { action: "training:manage", scopeType: "GLOBAL" },
      { action: "lesson-change:approve", scopeType: "GLOBAL" },
      { action: "courses:view", scopeType: "GLOBAL" },
      { action: "courses:create", scopeType: "GLOBAL" },
      { action: "courses:edit", scopeType: "GLOBAL" },
      { action: "courses:delete", scopeType: "GLOBAL" },
      { action: "course-packages:view", scopeType: "GLOBAL" },
      // #09 (09/07) — nhận bàn giao từ CENTER_MANAGER (de-xuat-scope §3.3 "chương trình
      // & giáo án → TRAINING"). Trước đó chỉ xoá khỏi CM, quên thêm vào đây ⇒ mồ côi ở v2.
      { action: "course-packages:edit", scopeType: "GLOBAL" },
      { action: "curriculum:view", scopeType: "GLOBAL" },
      { action: "curriculum:create", scopeType: "GLOBAL" },
      { action: "curriculum:edit", scopeType: "GLOBAL" },
      { action: "curriculum:delete", scopeType: "GLOBAL" },
      { action: "questions:view", scopeType: "GLOBAL" },
      { action: "questions:author", scopeType: "GLOBAL" },
      { action: "questions:edit", scopeType: "GLOBAL" },
      { action: "questions:delete", scopeType: "GLOBAL" },
      { action: "exams:view", scopeType: "GLOBAL" },
      { action: "exams:create", scopeType: "GLOBAL" },
      { action: "exams:edit", scopeType: "GLOBAL" },
      // ⚠️ exams:grade — perm chưa có call-site (chết); GIỮ để khỏi re-seed prod, gỡ đợt seed sau (24/07).
      { action: "exams:grade", scopeType: "GLOBAL" },
      { action: "exams:delete", scopeType: "GLOBAL" },
      { action: "assignments:view", scopeType: "GLOBAL" },
      { action: "assignments:create", scopeType: "GLOBAL" },
      { action: "assignments:edit", scopeType: "GLOBAL" },
      { action: "assignments:grade", scopeType: "GLOBAL" },
      { action: "assignments:delete", scopeType: "GLOBAL" },
      { action: "documents:view", scopeType: "GLOBAL" },
      { action: "documents:upload", scopeType: "GLOBAL" },
      { action: "documents:delete", scopeType: "GLOBAL" },
      { action: "teaching-materials:view-own-class", scopeType: "GLOBAL" },
      // Duyệt học bạ (câu 55, Toại): report-cards:review CHO PHÉP đọc + duyệt học bạ
      // cross-center (report-cards: prefix → CHỈ ReportCard). Enrollment đã TÁCH khỏi
      // prefix này 24/07 — chỉ map enrollments: → /ghi danh của Toại về CS1; trang học
      // bạ đọc ghi danh cross-center qua checkEnrollmentScope (isHoLevel). Bỏ manage
      // (sửa/tạo học bạ) — Đào tạo chỉ duyệt (24/07).
      { action: "report-cards:review", scopeType: "GLOBAL" },
      // 18/08 (chủ dự án) — Đào tạo ĐỌC được nhận xét/đánh giá từng buổi của từng HV
      // trong lớp. Ngoại lệ HẸP của đợt khoá chặt 24/07: CHỈ đọc phiếu nhận xét buổi,
      // KHÔNG kèm sessions:*/classes:* (không mở lại module Lớp/Buổi học cho Đào tạo).
      // Trang /admin/classes/[id] mở ĐÚNG một tab "Đánh giá & Nhận xét" cho vai này.
      { action: "session-feedback:view-all", scopeType: "GLOBAL" },
      // 03/08 — checkin là self-action của mọi nhân viên; sót từ khi thêm TRAINING
      // (FL W0) nên tài khoản chỉ-Đào-tạo không mở được trang chấm công nào.
      { action: "hr_attendance:checkin", scopeType: "GLOBAL" },
      // ⛔ KHÔNG THÊM LẠI `chat:read` CHO ĐÀO TẠO (gỡ 09/08/2026).
      // Bản seed 08/08 có `{ action: "chat:read", scopeType: "GLOBAL" }` ở đây với lý do
      // "giám sát nội dung giảng dạy". Đối chiếu intended-vs-implemented lộ ra 3 điều:
      //   1. `docs/chat-realtime/permissions.md` KHÔNG có vai Đào tạo ở bất kỳ ô nào —
      //      bảng ma trận chỉ có PH / GV / QLCS / Sale / Admin. Quyền này không có hợp đồng.
      //   2. GLOBAL ⇒ đọc được MỌI hội thoại, kể cả 1-1 GV↔PH (`DM_TEACHER_PARENT`,
      //      centerId=null) — tức mạnh hơn cả Admin. Ô "Đọc" của Admin trong ma trận là
      //      ⚠️ *có điều kiện*: không phải thành viên thì phải đi đường tra cứu F-AUDIT
      //      (bắt buộc nhập lý do + ghi AuditLog TRƯỚC khi trả nội dung). Đào tạo đọc
      //      thẳng qua `can()` thì không để lại một dòng vết nào.
      //   3. Không có call-site: P0 không có màn chat cho Đào tạo, nên đây là quyền chết
      //      — chỉ còn tác dụng nếu ai đó gắn `chat:read` vào một bề mặt đọc mới.
      // Mở lại CHỈ KHI có story + màn hình thật, và khi đó phải đi qua đường F-AUDIT như
      // Admin (lý do + audit), KHÔNG phải bằng một dòng grant GLOBAL ở đây.
      // Pin chống tái phát: `lib/auth/chat-permissions.test.ts` — "TRAINING không có bất
      // kỳ action chat:* nào ở CẢ v1 lẫn v2".
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:program:manage", scopeType: "GLOBAL" },
      { action: "elearning:content:author", scopeType: "GLOBAL" },
      { action: "elearning:content:publish", scopeType: "GLOBAL" },
      { action: "elearning:assignment:create", scopeType: "GLOBAL" },
      { action: "elearning:assignment:extend", scopeType: "GLOBAL" },
      { action: "elearning:requirement:manage", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-team", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-all", scopeType: "GLOBAL" },
      { action: "elearning:video-analytics:view", scopeType: "GLOBAL" },
      { action: "elearning:exam:grade", scopeType: "GLOBAL" },
      { action: "elearning:exam:unlock", scopeType: "GLOBAL" },
      { action: "elearning:report:export", scopeType: "GLOBAL" },
    ],
  },
  {
    // HO_SALE — ĐẢO CHÍNH SÁCH 23/08/2026 (chủ dự án chốt).
    //
    // Cũ (Doc 15 §2): "xem lead TOÀN HỆ THỐNG nhưng KHÔNG sửa".
    // Mới: NGƯỢC LẠI — nhập được, sửa được, nhưng CHỈ phần của mình:
    //   · nhập phiếu (`leads:create`) — phiếu vẫn TỰ CHIA về Sale cơ sở đã chọn,
    //     không giữ lại ở Hội sở (chốt 04/08 "lead không bao giờ về Hội sở" GIỮ NGUYÊN);
    //   · chỉ thấy phiếu do CHÍNH MÌNH nhập (`leads:view-own` scope OWN →
    //     `Lead.createdById`), KHÔNG thấy phiếu người khác nhập;
    //   · chỉ sửa các ô CÓ TRONG biểu mẫu `/nhap-khach-hang`
    //     (`leads:edit-own-intake`) — Sale cơ sở mới toàn quyền sửa.
    //
    // ⚠️ `leads:view-all` ĐÃ GỠ có chủ đích. Giữ lại là mâu thuẫn trực tiếp với
    // "không thấy lead của người khác": v2 là ALLOW-wins, không có DENY để bù.
    // ⚠️ KHÔNG cấp `leads:edit` — quyền đó gác ~10 action khác (đổi trạng thái,
    // giao việc, chuyển cơ sở, thêm con…). Đó là lý do có key hẹp riêng.
    code: "HO_SALE", name: "Sale Hội sở (phiếu mình nhập)",
    perms: [
      { action: "leads:create", scopeType: "GLOBAL" },
      // GLOBAL chứ KHÔNG "OWN" — luật R1 đầu file: action bị gọi TRẦN (không kèm
      // target) thì scope OWN luôn trả false và người ta bị đá khỏi trang.
      // `leads:view-own` đúng là gọi trần ở `/leads` + `/leads/[id]`; giới hạn
      // "chỉ phiếu mình nhập" nằm ở MỆNH ĐỀ LỌC của truy vấn, không ở scopeType.
      { action: "leads:view-own", scopeType: "GLOBAL" },
      // Ngược lại, key này LUÔN được gọi kèm target `{ createdById }` trong
      // `updateLeadFields` ⇒ OWN có tác dụng thật, là chốt chặn cuối ở server.
      { action: "leads:edit-own-intake", scopeType: "OWN" },
      // Nhập xong phải đọc lại được SĐT/tên mình vừa gõ, không thì màn danh sách
      // hiện phiếu của chính mình mà bị che.
      { action: "leads:view-pii", scopeType: "GLOBAL" },
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
    ],
  },
  {
    // #09 — Kiệt duyệt 09/07/2026 (de-xuat-scope-v2-center-manager-teacher.md §3).
    // Trước đó role này chỉ có 6 perm (stub) trong khi v1 cho 111 → flip là mất
    // quyền quản lý cơ sở. Scope theo R1 (xem đầu file): GLOBAL cho action bị gọi
    // trần, cách ly cơ sở do scopedDb.
    // SIẾT có chủ đích (bỏ khỏi v1): nội dung marketing (blog/news/site-content/
    // honors/emails) → HO_MARKETING · chương trình (courses:create/edit,
    // course-packages:edit, lesson-change:approve, trials:config) → TRAINING ·
    // tiền & kho quản lý tập trung (payments:manage, vouchers:manage,
    // products:manage, inventory:edit/audit, kits:edit) → HO_ACCOUNTANT ·
    // employees:edit + jobs:create/edit → CENTER_HR ·
    // ⚠️ 03/08/2026 chủ dự án ĐẢO một phần: `orders:manage` + `installments:approve`
    // TRẢ LẠI cho vai này để quầy tự xuất QR (xem ghi chú tại chỗ khai 2 quyền đó).
    // holidays:edit → SUPER_ADMIN · students:delete + enrollments:delete →
    // SUPER_ADMIN (QL dùng enrollments:cancel; CLAUDE.md cấm hard-delete).
    code: "CENTER_MANAGER", name: "Quản lý cơ sở",
    perms: [
      // ── Lead ──
      { action: "leads:view-all", scopeType: "GLOBAL" },
      // ⚠️ Đợt E (22/08/2026) — `leads:view-pii` ĐÃ GỠ khỏi vai này theo Q9 chủ dự
      // án chốt 21/08: Quản lý cơ sở KHÔNG thấy SĐT lead. Đảo #11 T2 (Kiệt ký
      // 10/07) từng cấp quyền này. Giữ nguyên leads:view-all — QL vẫn điều hành
      // được, chỉ không đọc được số. Khoá bằng lib/auth/lead-pii-policy.test.ts.
      // ⚠️ Đổi ở đây CHƯA có hiệu lực trên prod: phải chạy workflow seed-prod-roles.yml
      // sau khi merge vào main, nếu không prod vẫn giữ quyền cũ trong DB.
      { action: "leads:create", scopeType: "GLOBAL" },
      { action: "leads:edit", scopeType: "GLOBAL" },
      { action: "leads:assign", scopeType: "GLOBAL" },
      { action: "leads:import", scopeType: "GLOBAL" },
      { action: "leads:export", scopeType: "GLOBAL" },
      // ── Học viên · lớp · ghi danh ──
      { action: "students:view-all", scopeType: "GLOBAL" },
      { action: "students:create", scopeType: "GLOBAL" },
      { action: "students:edit", scopeType: "GLOBAL" },
      { action: "students:import", scopeType: "GLOBAL" },
      { action: "classes:view-all", scopeType: "GLOBAL" },
      { action: "classes:create", scopeType: "GLOBAL" },
      { action: "classes:edit", scopeType: "GLOBAL" },
      { action: "class_group:view-all", scopeType: "GLOBAL" },
      { action: "class_group:create", scopeType: "GLOBAL" },
      { action: "class_group:edit", scopeType: "GLOBAL" },
      { action: "enrollments:view-all", scopeType: "GLOBAL" },
      { action: "enrollments:create", scopeType: "GLOBAL" },
      { action: "enrollments:edit", scopeType: "GLOBAL" },
      { action: "enrollments:cancel", scopeType: "GLOBAL" },
      { action: "enrollments:transfer", scopeType: "GLOBAL" },
      // ── Điểm danh · buổi học · phòng ──
      { action: "attendance:view", scopeType: "GLOBAL" },
      { action: "attendance:mark", scopeType: "GLOBAL" },
      // Ngoại lệ R1: 0 call-site trần (#16 đã truyền target) → giữ CENTER thật sự.
      { action: "attendance:edit", scopeType: "CENTER" },
      { action: "sessions:view", scopeType: "GLOBAL" },
      { action: "sessions:create", scopeType: "GLOBAL" },
      { action: "sessions:edit", scopeType: "GLOBAL" },
      { action: "session-feedback:view-all", scopeType: "GLOBAL" },
      { action: "rooms:view", scopeType: "GLOBAL" },
      { action: "rooms:edit", scopeType: "GLOBAL" },
      // ── Trải nghiệm · phụ huynh · media ──
      { action: "trials:view", scopeType: "GLOBAL" },
      { action: "trials:manage", scopeType: "GLOBAL" },
      { action: "trials:assign-teacher", scopeType: "GLOBAL" },
      { action: "trials:feedback", scopeType: "GLOBAL" },
      { action: "trials:override-capacity", scopeType: "GLOBAL" },
      { action: "parent-requests:manage", scopeType: "GLOBAL" },
      { action: "parent-feedback:view", scopeType: "GLOBAL" },
      { action: "media:view", scopeType: "GLOBAL" },
      { action: "media:upload", scopeType: "GLOBAL" },
      { action: "media:approve", scopeType: "GLOBAL" },
      // ── Học tập ──
      { action: "evaluations:manage", scopeType: "GLOBAL" },
      { action: "evaluations:view-aggregate", scopeType: "GLOBAL" },
      { action: "evaluations:view-detail", scopeType: "GLOBAL" },
      { action: "exams:grade", scopeType: "GLOBAL" },
      { action: "assignments:grade", scopeType: "GLOBAL" },
      // L6 site GV — capability "own" (parity v1↔v2): soạn đề kho riêng + giao bài +
      // đề xuất hoàn thành (QL cơ sở cũng dùng được; xác nhận thật = completions:manage).
      // GLOBAL vì gọi TRẦN (không target); cách ly cơ sở ép ở tầng action.
      { action: "assignments:author-own", scopeType: "GLOBAL" },
      { action: "assignments:assign-own", scopeType: "GLOBAL" },
      { action: "completions:propose-own", scopeType: "GLOBAL" },
      { action: "completions:manage", scopeType: "GLOBAL" },
      { action: "satacoin:manage", scopeType: "GLOBAL" },
      { action: "notifications:manage", scopeType: "GLOBAL" },
      // ── Nhân sự · chấm công ──
      { action: "hr_attendance:view", scopeType: "CENTER" },
      // Shadow prod 10/07 (25+2 lệch): adjust bị pending-tasks cfg.can() gọi TRẦN → GLOBAL
      // (đúng R1); checkin call-site truyền {centerId} nhưng OWN đòi createdById → GLOBAL
      // (action tự ghi userId từ session, permission chỉ gate "là nhân viên").
      { action: "hr_attendance:adjust", scopeType: "GLOBAL" },
      { action: "hr_attendance:checkin", scopeType: "GLOBAL" },
      // ── Thu tiền tại quầy · xuất kit (user chốt 09/07 câu 4: "có, có") ──
      { action: "payments:record", scopeType: "GLOBAL" },
      { action: "inventory:movement", scopeType: "GLOBAL" },
      // BGĐ 31/07 — duyệt giảm giá do Sale/CSKH cơ sở đệ trình ("đệ trình Qly CS duyệt").
      // GLOBAL theo R1 (call-site gọi trần), cách ly cơ sở do scopedDb.
      { action: "discounts:approve", scopeType: "GLOBAL" },
      // Chủ dự án chốt 03/08/2026 — ĐẢO một phần quyết định #09 (siết tiền về Hội sở).
      // Lý do: luồng thu tại quầy là "Sale tạo đơn → QLCS duyệt → hiện QR cho khách
      // quét NGAY TẠI QUẦY". Nghiệm thu 03/08 đo ra QLCS không có 2 quyền này ⇒ quầy
      // tắc, phải gọi kế toán Hội sở mới xuất được QR. Cấp lại cho Quản lý cơ sở:
      //   · installments:approve — duyệt kế hoạch trả góp 2 đợt (sinh phiếu thu)
      //   · orders:manage       — gác của "Xuất QR / Tạo lại QR" (_qr-actions.ts)
      // GLOBAL theo R1 (call-site gọi trần); cách ly cơ sở vẫn do scopedDb gác, nên
      // QLCS CS1 không đụng được đơn/phiếu thu của CS2.
      { action: "installments:approve", scopeType: "GLOBAL" },
      { action: "orders:manage", scopeType: "GLOBAL" },
      // G-A (21/08/2026) — kèm theo `orders:manage`, xem chú thích ở HO_ACCOUNTANT.
      { action: "orders:create", scopeType: "GLOBAL" },
      // Chủ dự án chốt 03/08/2026 — QLCS cần ĐỐI SOÁT tiền về nhưng CHỈ XEM.
      // `payments:view` mở Công nợ + Biến động số dư ở chế độ đọc; mọi thao tác tiền
      // (sửa/hoàn/cấu hình) vẫn đòi payments:manage / payments:confirm mà vai này KHÔNG có.
      { action: "payments:view", scopeType: "GLOBAL" },
      // Giữ Học bạ hiển thị: màn đó gác [curriculum:view | students:view-own-class],
      // mà curriculum:view vừa bị gỡ theo yêu cầu "chặn phần LMS".
      { action: "students:view-own-class", scopeType: "GLOBAL" },
      // QĐ-T3b (FL W0-NAV-2) trả CM 2 việc vận hành: trials:config ĐÃ về ở cả v1+v2,
      // còn lesson-change:approve sót lại v1-only ⇒ trên prod (v2) chỉ Đào tạo duyệt
      // được đề xuất chỉnh bài của GV, người đó nghỉ là đề xuất treo. Đưa về khớp QĐ.
      // ── Đọc tham chiếu ──
      { action: "centers:view", scopeType: "GLOBAL" },
      { action: "holidays:view", scopeType: "GLOBAL" },
      // 10/07 — báo cáo đào tạo theo chức năng (xem lib/auth/page-gates.ts).
      { action: "reports:training", scopeType: "GLOBAL" },
      // 24/07 — cấu hình lớp học thử: gỡ khỏi Đào tạo (chỉ LMS) → về QL cơ sở (khớp v1).
      { action: "trials:config", scopeType: "GLOBAL" },
      { action: "kits:view", scopeType: "GLOBAL" },
      { action: "inventory:view", scopeType: "GLOBAL" },
      { action: "products:view", scopeType: "GLOBAL" },
      { action: "orders:view", scopeType: "GLOBAL" },
      // Gói bán = GIÁ, không phải học liệu — giữ cho vai này để luồng tạo đơn/báo giá
      // không gãy khi chặn phần LMS (03/08).
      { action: "course-packages:view", scopeType: "GLOBAL" },
      { action: "orders:view-pii", scopeType: "GLOBAL" },
      { action: "honors:view", scopeType: "GLOBAL" },
      { action: "blog:view", scopeType: "GLOBAL" },
      { action: "news:view", scopeType: "GLOBAL" },
      { action: "jobs:view", scopeType: "GLOBAL" },
      { action: "employees:view-public", scopeType: "GLOBAL" },
      // #17 (câu 55): QL cơ sở duyệt/phát hành/thu hồi + sửa lại học bạ đã thu hồi.
      // Scope GLOBAL (KHÔNG CENTER) — cố ý: report-cards:* được check ở authContext
      // KHÔNG kèm target (cách ly đã do scopedDb — ReportCard ∈ SCOPED_MODELS #03 Pha B), nên CENTER-scope sẽ trả false
      // sau flip #09 (scopeMatches cần target.centerId). Cách ly cơ sở đã được ép TAY
      // ở checkEnrollmentScope (actor.visibleCenterIds) trong action → GLOBAL an toàn.
      { action: "report-cards:manage", scopeType: "GLOBAL" },
      { action: "report-cards:review", scopeType: "GLOBAL" },
      // #05 (câu 13 BGĐ): QL cơ sở xem audit log + break-glass xem đầy đủ PII.
      // Scope GLOBAL (KHÔNG CENTER) — cố ý, cùng lý do report-cards ở trên: viewer
      // hợp nhất check `audit-logs:view*` KHÔNG kèm target (AuditLog không có centerId
      // dạng target), nên CENTER-scope sẽ trả false sau flip #09. Cách ly cơ sở đã ép
      // TAY ở tầng query (queryUnifiedAuditLogs lọc orgUnitId ∈ visibleOrgUnitIds) →
      // GLOBAL an toàn: mỗi QL cơ sở vẫn chỉ thấy log cơ sở mình.
      // ── US-05 chat (08/08) — QLCS = MEMBER nhóm lớp cơ sở mình (chốt 07/08):
      // đọc + gửi CHAT + gửi ANNOUNCEMENT, KHÔNG moderate (gỡ tin người khác) và
      // KHÔNG chat:admin (/admin/hoi-thoai — US-15 AC5). Scope CENTER thật: call-site
      // chat luôn truyền target (participant-based, action mới viết sau test US-05)
      // — DM có centerId=null nên CENTER tự deny (khớp permissions.md: QLCS ❌ 1-1).
      { action: "chat:read", scopeType: "CENTER" },
      { action: "chat:send", scopeType: "CENTER" },
      { action: "chat:announce", scopeType: "CENTER" },
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:assignment:create", scopeType: "GLOBAL" },
      { action: "elearning:assignment:extend", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-team", scopeType: "GLOBAL" },
      { action: "elearning:video-analytics:view", scopeType: "GLOBAL" },
      { action: "elearning:report:export", scopeType: "GLOBAL" },
    ],
  },
  {
    // Role MỚI — Task #16 (Kiệt duyệt 07/07/2026, Phương án A). "Quản lý lớp học" chuyên
    // trách theo dõi lớp + điểm danh trong 1 cơ sở (subset của CENTER_MANAGER, không có
    // quyền tiền/nhân sự). Cửa sổ hồi tố 7 ngày cho attendance:edit enforce ở call-site
    // (markAttendance). CHƯA gán UserOrgRole cho ai — để trống cho tương lai.
    code: "CENTER_CLASS_MANAGER", name: "Quản lý lớp học",
    perms: [
      { action: "attendance:edit", scopeType: "CENTER" },
      { action: "attendance:view", scopeType: "CENTER" },
      { action: "classes:view-all", scopeType: "GLOBAL" },
      { action: "students:view-all", scopeType: "GLOBAL" },
      // 10/07 — gate CSKH (/tin-nhan, /canh-bao-rui-ro, /cham-soc-hv) doi
      // parent-requests:manage. Giao vu la vai #16 sinh ra de lam CSKH => phai co.
      { action: "parent-requests:manage", scopeType: "GLOBAL" },
      // US-05 chat (08/08) — cùng bộ với CENTER_MANAGER (vai QLCS thu hẹp): nhóm lớp
      // cơ sở mình, không moderate/admin. CENTER an toàn — call-site chat luôn có target.
      // 09/08: Giáo vụ ĐƯỢC dẫn xuất thành participant nhóm lớp y như QLCS
      // (lib/chat/sync-membership.ts → CHAT_CENTER_MANAGER_ROLE_CODES) — trước đó 3 perm
      // này là QUYỀN CHẾT vì phạm vi đọc chat là participant-based.
      { action: "chat:read", scopeType: "CENTER" },
      { action: "chat:send", scopeType: "CENTER" },
      { action: "chat:announce", scopeType: "CENTER" },
      // 09/08 — CHÌA KHOÁ CỬA /tin-nhan cho Giáo vụ. 3 perm chat:* ở trên KHÔNG mở nổi
      // cửa: gate cấp trang gọi checkAnyPermission KHÔNG kèm target nên scope CENTER trả
      // FALSE (lib/auth/can.ts:18) — đó chính là lý do PAGE_GATES["/tin-nhan"] gác bằng
      // [students:view-own-class | classes:view-own], hai action GLOBAL.
      // Vì sao `classes:view-own` chứ KHÔNG phải `students:view-own-class`: action kia
      // cũng là gate của /hoc-ba, mà BGĐ 10/07 chốt Giáo vụ KHÔNG xem học bạ — mượn nó
      // là mở nhầm cửa thứ hai. `classes:view-own` chỉ làm gate ở /tin-nhan; các
      // call-site còn lại (/classes, /classes/[id], /lich) vai này đã vào được sẵn bằng
      // `classes:view-all` nên KHÔNG nới thêm quyền nào. GLOBAL là bắt buộc —
      // page-gates.test.ts khoá "action làm gate phải GLOBAL ở mọi RoleDef giữ nó".
      { action: "classes:view-own", scopeType: "GLOBAL" },
      // 11/08 (chủ dự án chốt) — Giáo vụ góp ảnh vào KHO của lớp cơ sở mình; GV mới
      // là người chọn ảnh gửi phụ huynh. KHÔNG `media:upload`/`media:approve`.
      // GLOBAL + cách ly cơ sở do scopedDb/passesScope ở tầng query (mẫu R1) — vai
      // này KHÔNG phải manager actor nên canManageClass không dùng được, xem
      // canStageToClass trong app/(admin)/admin/media/actions.ts.
      { action: "media:view", scopeType: "GLOBAL" },
      { action: "media:upload-draft", scopeType: "GLOBAL" },
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
    ],
  },
  {
    // Mapping SALES_CSM (v1) đã duyệt — Kiệt 06/07/2026, xem mapping-proposal.md §3.
    // BGĐ câu 10: "tách riêng cho mỗi sale chỉ thấy riêng data của mình" → action
    // gắn với lead do mình phụ trách = OWN (giữ nguyên pattern leads:view-own đã có).
    // Action nghiệp vụ khác trong phạm vi 1 cơ sở (học viên/lớp/tham chiếu vận hành)
    // = CENTER (Sale chỉ làm việc tại 1 cơ sở — câu 9 phiếu BGĐ: không ai làm 2 cơ
    // sở cùng lúc). hr_attendance:checkin = OWN (chấm công cho chính mình).
    // ⚠️ Escalate riêng (KHÔNG xử lý ở seed này): tính năng "share toggle" cho lead
    // dùng chung trong team — xem mapping-proposal.md §3, không khớp 6 scopeType.
    code: "CENTER_SALES_CSM", name: "Tư vấn & CSKH cơ sở",
    perms: [
      { action: "leads:view-own", scopeType: "GLOBAL" },
      // #11 T2 — như CENTER_MANAGER: Sale trực tiếp gọi khách phải thấy SĐT.
      { action: "leads:view-pii", scopeType: "GLOBAL" },
      { action: "leads:create", scopeType: "GLOBAL" },
      { action: "leads:edit", scopeType: "GLOBAL" },
      // Task #07 — quyết định user 07/07/2026: Sale được import danh sách "đã đăng
      // ký" (Sale giữ Google Sheet gốc — câu 33). CENTER: import gán vào cơ sở mình.
      { action: "leads:import", scopeType: "GLOBAL" },
      { action: "students:create", scopeType: "GLOBAL" },
      { action: "students:view-all", scopeType: "GLOBAL" },
      { action: "students:edit", scopeType: "GLOBAL" },
      { action: "classes:view-all", scopeType: "GLOBAL" },
      // Task #16 (Kiệt duyệt 07/07/2026, Phương án A) — CSKH được SỬA/hồi tố điểm danh
      // trong phạm vi cơ sở; cửa sổ 7 ngày enforce ở call-site (markAttendance).
      { action: "attendance:edit", scopeType: "CENTER" },
      { action: "enrollments:view-all", scopeType: "GLOBAL" },
      { action: "enrollments:create", scopeType: "GLOBAL" },
      { action: "enrollments:edit", scopeType: "GLOBAL" },
      { action: "employees:view-public", scopeType: "CENTER" },
      { action: "honors:view", scopeType: "CENTER" },
      { action: "trials:view", scopeType: "GLOBAL" },
      { action: "trials:manage", scopeType: "GLOBAL" },
      // ── F5 (Đợt 3, mở phạm vi 10/08/2026): nhắn riêng 1-1 với PHỤ HUYNH MÌNH PHỤ TRÁCH ──
      // Scope **OWN**, giống hệt vai PARENT, và CỐ Ý KHÔNG dùng CENTER: `scopeMatches`
      // cho CENTER chỉ cần `target.centerId` khớp, mà nhóm lớp LUÔN có `centerId` ⇒ cấp
      // CENTER là mở toang cửa nhóm lớp cho Sale — trái ma trận permissions.md (Sale ❌
      // ở mọi ô nhóm lớp). Với OWN thì `openDmTargetOf`/`sendTargetOf` gán
      // `createdById = actor.userId` nên chỉ khớp khi Sale là THÀNH VIÊN hội thoại; chốt
      // chặn thật là quan hệ phân công (`Enrollment.saleId`) kiểm trong handler.
      { action: "chat:read", scopeType: "OWN" },
      { action: "chat:send", scopeType: "OWN" },
      { action: "parent-requests:manage", scopeType: "GLOBAL" },
      { action: "hr_attendance:checkin", scopeType: "GLOBAL" },
      { action: "blog:view", scopeType: "CENTER" },
      { action: "course-packages:view", scopeType: "CENTER" },
      { action: "centers:view", scopeType: "CENTER" },
      { action: "holidays:view", scopeType: "CENTER" },
      { action: "kits:view", scopeType: "CENTER" },
      { action: "payments:record", scopeType: "GLOBAL" },
      { action: "orders:view", scopeType: "GLOBAL" },
      // G-A (biên bản chốt 4 cổng, 21/08/2026) — mở trục chốt đơn cho Sale:
      // Order → payments:record → đủ điều kiện convert. GLOBAL vì cổng gọi trần
      // (can() v2 với scope CENTER cần target); phạm vi "chỉ đơn gắn lead của
      // mình" do `checkOrderCreateOwnership()` gác, cách ly cơ sở do scopedDb gác.
      // KHÔNG cấp `orders:manage` (mở/huỷ/hoàn toàn hệ thống).
      { action: "orders:create", scopeType: "GLOBAL" },
      { action: "orders:view-pii", scopeType: "GLOBAL" },
      { action: "products:view", scopeType: "GLOBAL" },
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
    ],
  },
  {
    // #09 — Kiệt duyệt 09/07/2026 (de-xuat-scope-v2-center-manager-teacher.md §4).
    // Trước đó 3 perm (stub) trong khi v1 cho 35 → flip là GV không mở nổi /classes
    // (gate `classes:view-own`, classes/page.tsx:74) và mất site GV #06.
    // Cách ly "chỉ lớp mình" đến từ actor.assignedClassIds + checkEnrollmentScope,
    // KHÔNG từ scopeType (R1 — 6 call-site trần cho classes:view-own).
    // SIẾT có chủ đích: completions:manage (QL xác nhận hoàn thành khoá) ·
    // sessions:create (GV chốt buổi, không xếp lịch — câu 48) · inventory:movement
    // (user chốt 09/07 câu 6: "không"). GIỮ satacoin:manage (câu 5: "GV tự thưởng được").
    code: "TEACHER", name: "Giáo viên",
    perms: [
      { action: "attendance:mark", scopeType: "CLASS" }, // 0 call-site trần → CLASS thật
      { action: "students:view-own-class", scopeType: "GLOBAL" }, // R1 — 1 call-site trần
      // ── Lớp mình dạy ──
      { action: "classes:view-own", scopeType: "GLOBAL" },
      { action: "teaching-materials:view-own-class", scopeType: "GLOBAL" },
      { action: "sessions:view", scopeType: "GLOBAL" },
      { action: "sessions:edit", scopeType: "GLOBAL" },
      { action: "session-feedback:view-all", scopeType: "GLOBAL" },
      { action: "attendance:view", scopeType: "GLOBAL" },
      { action: "assignments:view", scopeType: "GLOBAL" },
      { action: "assignments:grade", scopeType: "GLOBAL" },
      { action: "exams:view", scopeType: "GLOBAL" },
      { action: "exams:grade", scopeType: "GLOBAL" },
      { action: "enrollments:view-own", scopeType: "GLOBAL" },
      { action: "evaluations:view-aggregate", scopeType: "GLOBAL" },
      { action: "trials:view", scopeType: "GLOBAL" },
      { action: "trials:feedback", scopeType: "GLOBAL" },
      { action: "media:view", scopeType: "GLOBAL" },
      { action: "media:upload", scopeType: "GLOBAL" },
      { action: "satacoin:manage", scopeType: "GLOBAL" },
      { action: "hr_attendance:checkin", scopeType: "GLOBAL" },
      // ── Đọc tham chiếu ──
      { action: "courses:view", scopeType: "GLOBAL" },
      { action: "curriculum:view", scopeType: "GLOBAL" },
      { action: "documents:view", scopeType: "GLOBAL" },
      { action: "questions:view", scopeType: "GLOBAL" },
      { action: "news:view", scopeType: "GLOBAL" },
      { action: "blog:view", scopeType: "GLOBAL" },
      { action: "honors:view", scopeType: "GLOBAL" },
      { action: "holidays:view", scopeType: "GLOBAL" },
      { action: "centers:view", scopeType: "GLOBAL" },
      { action: "rooms:view", scopeType: "GLOBAL" },
      { action: "inventory:view", scopeType: "GLOBAL" },
      { action: "employees:view-public", scopeType: "GLOBAL" },
      // #09-gate (vá gap sau #17): GV viết/sửa NHÁP học bạ lớp mình (câu 55). v1 đã có
      // report-cards:manage@TEACHER; thêm v2 để sau khi flip RBAC_V2 GV KHÔNG mất quyền
      // viết DRAFT. Cách ly lớp ép qua checkEnrollmentScope tại action (giống TRAINING/
      // CENTER_MANAGER dùng GLOBAL). KHÔNG có report-cards:review → GV không duyệt/sửa
      // học bạ đã PUBLISHED/RECALLED (#17 đã siết ở tầng action).
      { action: "report-cards:manage", scopeType: "GLOBAL" },
      // L6 site GV — capability "own" (parity v1↔v2): GV tự soạn đề vào kho riêng +
      // giao bài cho lớp mình + ĐỀ XUẤT hoàn thành khoá (xác nhận thật vẫn là
      // completions:manage của trung tâm — GV KHÔNG có). Cách ly lớp/chủ sở hữu ép ở
      // tầng action (assignedClassIds / createdById).
      // scope GLOBAL: 3 action gọi TRẦN qua checkPermission (page/action gate không
      // truyền target) — non-GLOBAL sẽ khoá trang sau flip (xem rbac-scope.test). Cách
      // ly lớp/chủ sở hữu ép ở tầng action (assignedClassIds / createdById).
      { action: "assignments:author-own", scopeType: "GLOBAL" },
      { action: "assignments:assign-own", scopeType: "GLOBAL" },
      { action: "completions:propose-own", scopeType: "GLOBAL" },
      // ── US-05 chat (08/08) — GV theo PHÂN CÔNG lớp (Class.teacherId/assistantId →
      // actor.assignedClassIds), KHÔNG theo centerId (GV biên chế HO dạy chéo cơ sở —
      // permissions.md "Vai & nguồn scope"). ASSIGNED thật: call-site chat truyền
      // target.classId (action mới viết sau test US-05, không có call-site trần).
      // moderate = gỡ tin người khác trong NHÓM MÌNH + bắt buộc lý do (TS-03.6).
      { action: "chat:read", scopeType: "ASSIGNED" },
      { action: "chat:send", scopeType: "ASSIGNED" },
      { action: "chat:announce", scopeType: "ASSIGNED" },
      { action: "chat:moderate", scopeType: "ASSIGNED" },
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
    ],
  },
  {
    code: "ASSISTANT_TEACHER", name: "Trợ giảng",
    perms: [
      { action: "attendance:view", scopeType: "ASSIGNED" },
      // US-05 chat (08/08) — trợ giảng là participant nhóm lớp được gán, cùng bộ với
      // TEACHER (assignedClassIds đã gồm Class.assistantId — lib/auth/actor.ts).
      { action: "chat:read", scopeType: "ASSIGNED" },
      { action: "chat:send", scopeType: "ASSIGNED" },
      { action: "chat:announce", scopeType: "ASSIGNED" },
      { action: "chat:moderate", scopeType: "ASSIGNED" },
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
    ],
  },
  {
    // Mapping ACCOUNTANT (v1) đã duyệt — Kiệt 06/07/2026, xem mapping-proposal.md §1.
    // BGĐ + Kế toán tổng hợp (câu 30) khớp nhau: "kế toán từng cơ sở chỉ được xem cơ
    // sở đó" → chỉ nhận subset trực tiếp gắn với nghiệp vụ "thu tiền, hóa đơn, công
    // nợ" (mô tả chức danh gốc, câu 10). Payroll/vouchers/products/inventory GIỮ Ở
    // HO_ACCOUNTANT — đây là chức năng quản lý tập trung, không phải thu tiền quầy.
    code: "CENTER_ACCOUNTANT", name: "Kế toán cơ sở",
    perms: [
      { action: "payments:manage", scopeType: "GLOBAL" },
      { action: "payments:view", scopeType: "GLOBAL" },
      { action: "payments:record", scopeType: "GLOBAL" },
      { action: "payments:confirm", scopeType: "GLOBAL" },
      // #15 (câu 32) — break-glass xem đầy đủ CCCD PH + địa chỉ (chỉ cơ sở mình).
      { action: "payments:view-pii", scopeType: "GLOBAL" },
      { action: "students:view-all", scopeType: "GLOBAL" },
      { action: "classes:view-all", scopeType: "GLOBAL" },
      { action: "enrollments:view-all", scopeType: "GLOBAL" },
      { action: "orders:view", scopeType: "GLOBAL" },
      { action: "orders:view-pii", scopeType: "GLOBAL" },
      // --- Đào tạo nội bộ (EL-02 §3) --- tất cả GLOBAL: không ô nào của ma trận
      // mang scope khác, và cách ly cơ sở của module này đến từ dữ liệu lượt giao chứ
      // không từ scopeType (xem ghi chú R1 đầu file).
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:lesson:learn", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-own", scopeType: "GLOBAL" },
    ],
  },
  {
    code: "AUDITOR", name: "Kiểm toán đào tạo (chỉ đọc)",
    // EL-02 — vai MỚI duy nhất của module (QĐ-7: không tạo 6 vai, chỉ tạo 1).
    // ĐÚNG 5 quyền, TẤT CẢ LÀ ĐỌC. Ba điều phải giữ nguyên khi sửa:
    //  1. KHÔNG có `elearning:lesson:learn` — có nó thì người mang vai này (BGĐ) bị cỗ
    //     máy giao bài nhắm vào, đúng thứ vai kiểm toán không được dính.
    //  2. KHÔNG có quyền ghi nào. Thêm một quyền ghi là vai kiểm toán thành vai vận hành.
    //  3. KHÔNG có `elearning:audit:view` — key đó cố ý không tồn tại: `AuditLog` không
    //     nằm trong SCOPED_MODELS nên một key GLOBAL là mở nhật ký TOÀN HỆ, kể cả module
    //     ngoài e-learning. R8 chỉ SUPER_ADMIN trong toàn cửa sổ GƐ0→GƐ5.
    // Cấp vai này cho AI là quyết định có tên người + chữ ký duyệt (DoD (c)), không
    // cấp theo chức danh — nó thấy tiến độ học của toàn hệ thống.
    perms: [
      { action: "elearning:portal:access", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-team", scopeType: "GLOBAL" },
      { action: "elearning:progress:view-all", scopeType: "GLOBAL" },
      { action: "elearning:video-analytics:view", scopeType: "GLOBAL" },
      { action: "elearning:report:export", scopeType: "GLOBAL" },
    ],
  },
  {
    code: "PARENT", name: "Phụ huynh", isSystem: true,
    perms: [
      { action: "parent-feedback:view", scopeType: "CHILDREN" },
      // US-05 chat (08/08) — PH đọc/gửi trong hội thoại CỦA MÌNH (scope OWN: target
      // mang createdById = userId khi call-site đã xác nhận participant hiệu lực).
      // Nguồn phạm vi thật là ConversationParticipant (DB lúc request), không phải
      // token — permissions.md "Vai & nguồn scope". KHÔNG announce/moderate/admin.
      { action: "chat:read", scopeType: "OWN" },
      { action: "chat:send", scopeType: "OWN" },
    ],
  },
];

/**
 * Seed `RoleDef` + `RolePermission`.
 *
 * ⚠️ **TOÀN BỘ nằm trong MỘT `$transaction` — KHÔNG được tách ra.**
 *
 * `deleteMany` rồi `createMany` khi để rời nhau tạo một khoảng mà `RolePermission`
 * của role đang seed là **RỖNG**. Khi `RBAC_V2_ENABLED` còn OFF thì vô hại — runtime
 * đọc ma trận tĩnh v1 (`lib/auth/permissions.ts`), không đọc bảng này. Nhưng cờ **đã
 * BẬT trên Production** ⇒ trong khoảng đó `can()` v2 trả `false` cho **mọi action của
 * mọi người đang giữ role đó** (trừ `SUPER_ADMIN`, thoát sớm ở `lib/auth/can.ts:39`)
 * = **mất quyền toàn hệ thống giữa lúc seed**.
 *
 * Chi tiết: `docs/taicautruc/05-premortem.md` **KB-06**.
 *
 * `timeout` nâng lên 30s (mặc định Prisma là 5s): 14 role × 3 lệnh = 42 lượt
 * round-trip, chạy từ CI vào Supabase qua session pooler thì 5s không đủ.
 * `maxWait` 10s cho lúc pool đang bận.
 */
export async function seedRoles(db: PrismaClient): Promise<void> {
  await db.$transaction(
    async (tx) => {
      for (const r of ROLE_SEED) {
        const role = await tx.roleDef.upsert({
          where: { code: r.code },
          update: { name: r.name, isSystem: r.isSystem ?? false, isActive: true },
          create: { code: r.code, name: r.name, isSystem: r.isSystem ?? false },
        });
        await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
        if (r.perms.length > 0) {
          await tx.rolePermission.createMany({
            data: r.perms.map((p) => ({
              roleId: role.id,
              action: p.action,
              scopeType: p.scopeType,
            })),
            skipDuplicates: true,
          });
        }
      }
    },
    { timeout: 30_000, maxWait: 10_000 },
  );
}

// Chạy trực tiếp: `tsx prisma/seed-roles.ts`
if (process.argv[1]?.includes("seed-roles")) {
  const db = new PrismaClient();
  seedRoles(db)
    .then(() => console.log(`✅ Seeded ${ROLE_SEED.length} RoleDef`))
    .catch((e) => {
      console.error("❌ seedRoles:", e);
      process.exitCode = 1;
    })
    .finally(() => void db.$disconnect());
}
