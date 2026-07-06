// prisma/seed-roles.ts — A0-02: seed danh mục RoleDef + RolePermission mẫu (Doc 15 §2.3).
// 11 role; KHÔNG có HO_MANAGER. SUPER_ADMIN/PARENT = isSystem (không xóa/đổi code).
// Idempotent: upsert RoleDef theo code + reset permission của role mỗi lần chạy.
import { PrismaClient, type ScopeType } from "@prisma/client";

type Perm = { action: string; scopeType: ScopeType };
type RoleSeed = { code: string; name: string; isSystem?: boolean; perms: Perm[] };

// Action phải nằm trong ACTION_REGISTRY (lib/auth/action-registry.ts).
export const ROLE_SEED: RoleSeed[] = [
  {
    code: "SUPER_ADMIN", name: "Quản trị tối cao", isSystem: true,
    perms: [
      { action: "roles:manage", scopeType: "GLOBAL" },
      { action: "roles:assign", scopeType: "GLOBAL" },
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
    code: "HO_HR", name: "Nhân sự Hội sở",
    perms: [
      { action: "employees:view-all", scopeType: "GLOBAL" },
      { action: "employees:edit", scopeType: "GLOBAL" },
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
    // Role MỚI — Kiệt duyệt 06/07/2026 (mapping-proposal.md §2). Map TRAINING (v1,
    // 33 action LMS) — role thật đang dùng bởi Phan Thành Toại (Lead Đào tạo).
    // Toàn bộ GLOBAL: nội dung/giáo trình dùng chung cả 2 cơ sở, không tách theo
    // trung tâm (Phòng Đào tạo, câu 74a: "quản lý đào tạo chỉ quản lý nội dung").
    code: "HO_TRAINING", name: "Đào tạo (nội dung LMS)",
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
    ],
  },
  {
    // HO_SALE: xem lead toàn hệ thống nhưng KHÔNG sửa (Doc 15 §2).
    code: "HO_SALE", name: "Sale Hội sở (chỉ xem)",
    perms: [{ action: "leads:view-all", scopeType: "GLOBAL" }],
  },
  {
    code: "CENTER_MANAGER", name: "Quản lý cơ sở",
    perms: [
      { action: "students:view-all", scopeType: "CENTER" },
      { action: "classes:view-all", scopeType: "CENTER" },
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
      { action: "leads:view-own", scopeType: "OWN" },
      { action: "leads:create", scopeType: "OWN" },
      { action: "leads:edit", scopeType: "OWN" },
      { action: "students:create", scopeType: "CENTER" },
      { action: "students:view-all", scopeType: "CENTER" },
      { action: "students:edit", scopeType: "CENTER" },
      { action: "classes:view-all", scopeType: "CENTER" },
      { action: "enrollments:view-all", scopeType: "CENTER" },
      { action: "enrollments:create", scopeType: "CENTER" },
      { action: "enrollments:edit", scopeType: "CENTER" },
      { action: "employees:view-public", scopeType: "CENTER" },
      { action: "honors:view", scopeType: "CENTER" },
      { action: "trials:view", scopeType: "CENTER" },
      { action: "trials:manage", scopeType: "CENTER" },
      { action: "parent-requests:manage", scopeType: "CENTER" },
      { action: "hr_attendance:checkin", scopeType: "OWN" },
      { action: "blog:view", scopeType: "CENTER" },
      { action: "course-packages:view", scopeType: "CENTER" },
      { action: "centers:view", scopeType: "CENTER" },
      { action: "holidays:view", scopeType: "CENTER" },
      { action: "kits:view", scopeType: "CENTER" },
      { action: "payments:record", scopeType: "CENTER" },
      { action: "orders:view", scopeType: "CENTER" },
      { action: "vouchers:view", scopeType: "CENTER" },
      { action: "products:view", scopeType: "CENTER" },
    ],
  },
  {
    code: "TEACHER", name: "Giáo viên",
    perms: [
      { action: "attendance:mark", scopeType: "CLASS" },
      { action: "students:view-own-class", scopeType: "CLASS" },
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
      { action: "payments:manage", scopeType: "CENTER" },
      { action: "payments:record", scopeType: "CENTER" },
      { action: "payments:confirm", scopeType: "CENTER" },
      { action: "students:view-all", scopeType: "CENTER" },
      { action: "classes:view-all", scopeType: "CENTER" },
      { action: "enrollments:view-all", scopeType: "CENTER" },
      { action: "orders:view", scopeType: "CENTER" },
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
