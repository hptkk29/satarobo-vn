/**
 * A0-00 — Seed & reset helpers cho test (Postgres LOCAL).
 *
 * AN TOÀN: mọi hàm ghi/xóa đều qua `assertTestDb()` — chặn chạy nhầm trên
 * Supabase prod/dev. resetDb() CHỈ chạy khi DATABASE_URL trỏ localhost.
 *
 * Phụ thuộc model:
 * - resetDb / seedUser: dùng được NGAY (model User hiện có).
 * - seedOrg / seedRoles: CHỜ A0-01 (OrgUnit) / A0-02 (RoleDef, UserOrgRole) —
 *   ném lỗi rõ ràng cho tới khi bảng tồn tại, để spec phụ thuộc tự fail/skip.
 */
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "../../../lib/db";
import { seedOrgUnits } from "../../../prisma/seed-orgunit";
import { seedRoles as seedRoleDefs } from "../../../prisma/seed-roles";
import { TEST_PASSWORD } from "./fixtures";

/** Chặn thao tác phá hủy nếu DATABASE_URL không trỏ DB test local. */
export function assertTestDb(): void {
  const url = process.env.DATABASE_URL ?? "";
  const isLocal = /(@|\/\/)(localhost|127\.0\.0\.1)[:/]/.test(url);
  const looksTest = /satarobo_test|ci_test/.test(url);
  if (!isLocal && !looksTest) {
    const host = (() => {
      try {
        return new URL(url).host;
      } catch {
        return "<unparseable>";
      }
    })();
    throw new Error(
      `[A0 test] Từ chối thao tác DB: DATABASE_URL không trỏ DB test local (host=${host}). ` +
        `Nạp .env.test (localhost) trước khi chạy. Xem .claude/rules/prisma-db.md.`,
    );
  }
}

/**
 * Xóa sạch toàn bộ bảng public (trừ `_prisma_migrations`) — RESTART IDENTITY CASCADE.
 * Tên bảng lấy từ pg catalog (không phải input người dùng) → an toàn dùng executeRawUnsafe.
 */
export async function resetDb(): Promise<void> {
  assertTestDb();
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

export type SeedUserInput = {
  email: string;
  /** Mặc định TEST_PASSWORD. */
  password?: string;
  name?: string;
  /** Vai trò chính. */
  role: Role;
  /** Union vai trò (mặc định [role]). */
  roles?: Role[];
  centerId?: string | null;
  isActive?: boolean;
};

/**
 * Tạo user test với password đã hash. Idempotent theo email (upsert).
 * Trả về { id, email } để loginAs dùng lại.
 *
 * NOTE (A0-02): gán user × orgUnit × role qua `UserOrgRole` sẽ thêm sau khi
 * bảng tồn tại; hiện chỉ set `role`/`roles[]`/`centerId` theo model User hiện hành.
 */
export async function seedUser(
  input: SeedUserInput,
): Promise<{ id: string; email: string }> {
  assertTestDb();
  const password = await bcrypt.hash(input.password ?? TEST_PASSWORD, 10);
  const roles = input.roles && input.roles.length > 0 ? input.roles : [input.role];
  const user = await db.user.upsert({
    where: { email: input.email },
    update: {
      role: input.role,
      roles,
      centerId: input.centerId ?? null,
      isActive: input.isActive ?? true,
      deletedAt: null,
      password,
    },
    create: {
      email: input.email,
      name: input.name ?? input.email,
      role: input.role,
      roles,
      centerId: input.centerId ?? null,
      isActive: input.isActive ?? true,
      password,
    },
    select: { id: true, email: true },
  });
  return user;
}

/** Đóng kết nối Prisma (gọi ở cuối spec/global-teardown nếu cần). */
export async function disconnectDb(): Promise<void> {
  await db.$disconnect();
}

/**
 * Seed cây OrgUnit: ROOT(SATAROBO) + các code yêu cầu (HO/CS1/CS2), idempotent.
 * `seedOrg(["HO","CS1","CS2"])` → 4 OrgUnit (gồm ROOT). (A0-01)
 */
export async function seedOrg(codes: string[]): Promise<void> {
  assertTestDb();
  await seedOrgUnits(db, codes);
}

/** Seed 14 RoleDef + RolePermission mẫu (Doc 15 §2.3), idempotent + nguyên tử. (A0-02) */
export async function seedRoles(): Promise<void> {
  assertTestDb();
  await seedRoleDefs(db);
}
