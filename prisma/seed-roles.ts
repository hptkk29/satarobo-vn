// prisma/seed-roles.ts — A0-02: seed danh mục RoleDef + RolePermission mẫu (Doc 15 §2.3).
// 11 role; KHÔNG có HO_MANAGER. SUPER_ADMIN/PARENT = isSystem (không xóa/đổi code).
// Idempotent: upsert RoleDef theo code + reset permission của role mỗi lần chạy.
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
      // #17 (câu 55): học bạ. SUPER_ADMIN đã bypass toàn bộ quyền trong can() v2
      // (lib/auth/can.ts) → 2 dòng này KHÔNG đổi hành vi, thêm cho khớp v1 + rõ ý.
      { action: "report-cards:manage", scopeType: "GLOBAL" },
      { action: "report-cards:review", scopeType: "GLOBAL" },
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
      { action: "orders:manage", scopeType: "GLOBAL" },
      { action: "payroll:view", scopeType: "GLOBAL" },
      { action: "payroll:edit", scopeType: "GLOBAL" },
      { action: "payments:record", scopeType: "GLOBAL" },
      { action: "payments:confirm", scopeType: "GLOBAL" },
      // #15 (câu 32) — break-glass xem đầy đủ CCCD PH + địa chỉ ở màn thanh toán.
      { action: "payments:view-pii", scopeType: "GLOBAL" },
      { action: "orders:view", scopeType: "GLOBAL" },
      { action: "vouchers:view", scopeType: "GLOBAL" },
      { action: "vouchers:manage", scopeType: "GLOBAL" },
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
      { action: "centers:view", scopeType: "GLOBAL" },
      { action: "holidays:view", scopeType: "GLOBAL" },
      { action: "employees:view-public", scopeType: "GLOBAL" },
      { action: "employees:view-salary", scopeType: "GLOBAL" },
      { action: "honors:view", scopeType: "GLOBAL" },
      { action: "hr_attendance:checkin", scopeType: "GLOBAL" },
      { action: "blog:view", scopeType: "GLOBAL" },
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
      { action: "hr_attendance:checkin", scopeType: "CENTER" },
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
    ],
  },
  {
    // Mapping MARKETING (v1) đã duyệt — Kiệt 06/07/2026, xem mapping-proposal.md §5.
    // BGĐ chỉ ghi "Ok" (không tách cơ sở) → toàn bộ 35 action GLOBAL, không split.
    // ⚠️ Escalate riêng (OI-4, KHÔNG xử lý ở seed này): leads:view-all cho role này
    // kèm PII (SĐT/tên) chưa có field-level tách riêng — xem mapping-proposal.md.
    code: "HO_MARKETING", name: "Marketing Hội sở",
    perms: [
      { action: "leads:view-all", scopeType: "GLOBAL" },
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
      { action: "courses:edit", scopeType: "GLOBAL" },
      { action: "course-packages:view", scopeType: "GLOBAL" },
      { action: "centers:view", scopeType: "GLOBAL" },
      { action: "holidays:view", scopeType: "GLOBAL" },
      { action: "kits:view", scopeType: "GLOBAL" },
      { action: "kits:edit", scopeType: "GLOBAL" },
      { action: "site-content:view", scopeType: "GLOBAL" },
      { action: "site-content:edit", scopeType: "GLOBAL" },
      { action: "vouchers:view", scopeType: "GLOBAL" },
      { action: "vouchers:manage", scopeType: "GLOBAL" },
      { action: "products:view", scopeType: "GLOBAL" },
      { action: "emails:view", scopeType: "GLOBAL" },
      { action: "emails:manage", scopeType: "GLOBAL" },
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
    perms: [
      { action: "training:manage", scopeType: "GLOBAL" },
      { action: "trials:config", scopeType: "GLOBAL" },
      { action: "lesson-change:approve", scopeType: "GLOBAL" },
      { action: "students:view-all", scopeType: "GLOBAL" },
      { action: "classes:view-all", scopeType: "GLOBAL" },
      { action: "evaluations:manage", scopeType: "GLOBAL" },
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
      // #17 (câu 55, Toại 06/07): Đào tạo (Phan Thành Toại) duyệt/phát hành/thu hồi +
      // sửa lại học bạ đã thu hồi — cross-center (nội dung dùng chung, actor HO-level).
      { action: "report-cards:manage", scopeType: "GLOBAL" },
      { action: "report-cards:review", scopeType: "GLOBAL" },
    ],
  },
  {
    // HO_SALE: xem lead toàn hệ thống nhưng KHÔNG sửa (Doc 15 §2).
    code: "HO_SALE", name: "Sale Hội sở (chỉ xem)",
    perms: [{ action: "leads:view-all", scopeType: "GLOBAL" }],
  },
  {
    // #09 — Kiệt duyệt 09/07/2026 (de-xuat-scope-v2-center-manager-teacher.md §3).
    // Trước đó role này chỉ có 6 perm (stub) trong khi v1 cho 111 → flip là mất
    // quyền quản lý cơ sở. Scope theo R1 (xem đầu file): GLOBAL cho action bị gọi
    // trần, cách ly cơ sở do scopedDb.
    // SIẾT có chủ đích (bỏ khỏi v1): nội dung marketing (blog/news/site-content/
    // honors/emails) → HO_MARKETING · chương trình (courses:create/edit,
    // course-packages:edit, lesson-change:approve, trials:config) → TRAINING ·
    // tiền & kho quản lý tập trung (payments:manage, orders:manage,
    // installments:approve, vouchers:manage, products:manage, inventory:edit/audit,
    // kits:edit) → HO_ACCOUNTANT · employees:edit + jobs:create/edit → CENTER_HR ·
    // holidays:edit → SUPER_ADMIN · students:delete + enrollments:delete →
    // SUPER_ADMIN (QL dùng enrollments:cancel; CLAUDE.md cấm hard-delete).
    code: "CENTER_MANAGER", name: "Quản lý cơ sở",
    perms: [
      // ── Lead ──
      { action: "leads:view-all", scopeType: "GLOBAL" },
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
      { action: "exams:view", scopeType: "GLOBAL" },
      { action: "exams:grade", scopeType: "GLOBAL" },
      { action: "assignments:view", scopeType: "GLOBAL" },
      { action: "assignments:grade", scopeType: "GLOBAL" },
      { action: "teaching-materials:view-own-class", scopeType: "GLOBAL" },
      { action: "completions:manage", scopeType: "GLOBAL" },
      { action: "satacoin:manage", scopeType: "GLOBAL" },
      { action: "notifications:manage", scopeType: "GLOBAL" },
      // ── Nhân sự · chấm công ──
      { action: "employees:view-all", scopeType: "GLOBAL" },
      { action: "hr_attendance:view", scopeType: "CENTER" },
      { action: "hr_attendance:adjust", scopeType: "CENTER" },
      { action: "hr_attendance:checkin", scopeType: "OWN" },
      // ── Thu tiền tại quầy · xuất kit (user chốt 09/07 câu 4: "có, có") ──
      { action: "payments:record", scopeType: "GLOBAL" },
      { action: "inventory:movement", scopeType: "GLOBAL" },
      // ── Đọc tham chiếu ──
      { action: "centers:view", scopeType: "GLOBAL" },
      { action: "holidays:view", scopeType: "GLOBAL" },
      { action: "settings:view", scopeType: "GLOBAL" },
      { action: "documents:view", scopeType: "GLOBAL" },
      { action: "curriculum:view", scopeType: "GLOBAL" },
      { action: "questions:view", scopeType: "GLOBAL" },
      { action: "courses:view", scopeType: "GLOBAL" },
      { action: "course-packages:view", scopeType: "GLOBAL" },
      { action: "kits:view", scopeType: "GLOBAL" },
      { action: "inventory:view", scopeType: "GLOBAL" },
      { action: "products:view", scopeType: "GLOBAL" },
      { action: "vouchers:view", scopeType: "GLOBAL" },
      { action: "orders:view", scopeType: "GLOBAL" },
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
      { action: "audit-logs:view", scopeType: "GLOBAL" },
      { action: "audit-logs:view-pii", scopeType: "GLOBAL" },
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
      { action: "parent-requests:manage", scopeType: "GLOBAL" },
      { action: "hr_attendance:checkin", scopeType: "OWN" },
      { action: "blog:view", scopeType: "CENTER" },
      { action: "course-packages:view", scopeType: "CENTER" },
      { action: "centers:view", scopeType: "CENTER" },
      { action: "holidays:view", scopeType: "CENTER" },
      { action: "kits:view", scopeType: "CENTER" },
      { action: "payments:record", scopeType: "GLOBAL" },
      { action: "orders:view", scopeType: "GLOBAL" },
      { action: "vouchers:view", scopeType: "GLOBAL" },
      { action: "products:view", scopeType: "GLOBAL" },
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
      { action: "hr_attendance:checkin", scopeType: "OWN" },
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
    ],
  },
  {
    code: "ASSISTANT_TEACHER", name: "Trợ giảng",
    perms: [{ action: "attendance:view", scopeType: "ASSIGNED" }],
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
      { action: "payments:record", scopeType: "GLOBAL" },
      { action: "payments:confirm", scopeType: "GLOBAL" },
      // #15 (câu 32) — break-glass xem đầy đủ CCCD PH + địa chỉ (chỉ cơ sở mình).
      { action: "payments:view-pii", scopeType: "GLOBAL" },
      { action: "students:view-all", scopeType: "GLOBAL" },
      { action: "classes:view-all", scopeType: "GLOBAL" },
      { action: "enrollments:view-all", scopeType: "GLOBAL" },
      { action: "orders:view", scopeType: "GLOBAL" },
    ],
  },
  {
    code: "PARENT", name: "Phụ huynh", isSystem: true,
    perms: [{ action: "parent-feedback:view", scopeType: "CHILDREN" }],
  },
];

export async function seedRoles(db: PrismaClient): Promise<void> {
  for (const r of ROLE_SEED) {
    const role = await db.roleDef.upsert({
      where: { code: r.code },
      update: { name: r.name, isSystem: r.isSystem ?? false, isActive: true },
      create: { code: r.code, name: r.name, isSystem: r.isSystem ?? false },
    });
    await db.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (r.perms.length > 0) {
      await db.rolePermission.createMany({
        data: r.perms.map((p) => ({ roleId: role.id, action: p.action, scopeType: p.scopeType })),
        skipDuplicates: true,
      });
    }
  }
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
