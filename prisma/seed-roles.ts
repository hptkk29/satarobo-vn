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
    code: "HO_ACCOUNTANT", name: "Kế toán Hội sở",
    perms: [
      { action: "payments:manage", scopeType: "GLOBAL" },
      { action: "orders:manage", scopeType: "GLOBAL" },
      { action: "payroll:view", scopeType: "GLOBAL" },
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
    code: "HO_MARKETING", name: "Marketing Hội sở",
    perms: [
      { action: "leads:view-all", scopeType: "GLOBAL" },
      { action: "blog:edit", scopeType: "GLOBAL" },
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
    code: "CENTER_SALES_CSM", name: "Tư vấn & CSKH cơ sở",
    perms: [
      { action: "leads:view-own", scopeType: "OWN" },
      { action: "students:create", scopeType: "CENTER" },
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
    code: "CENTER_ACCOUNTANT", name: "Kế toán cơ sở",
    perms: [{ action: "payments:manage", scopeType: "CENTER" }],
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
