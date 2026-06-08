/**
 * A0-00 — Hằng số & fixture dùng chung cho test harness (Vitest + Playwright a0).
 *
 * KHÔNG chứa secret thật. Mọi user test dùng chung 1 password test cố định.
 */
import type { Role } from "@prisma/client";

/** Password mặc định cho mọi user seed trong test (đã hash khi ghi DB). */
export const TEST_PASSWORD = "Test@12345";

/**
 * Mã OrgUnit chuẩn của hệ thống (Doc 15 OI-1): ROOT → HO/CS1/CS2 độc lập ngang hàng.
 * Dùng cho seedOrg(["HO","CS1","CS2"]) → cùng ROOT = 4 OrgUnit.
 */
export const ORG_CODES = {
  ROOT: "SATAROBO",
  HO: "HO",
  CS1: "CS1",
  CS2: "CS2",
} as const;

export type OrgCode = (typeof ORG_CODES)[keyof typeof ORG_CODES];

/**
 * 8 role nền hiện có trong enum Prisma `Role` (hiện trạng RBAC tĩnh).
 * Đây là tập role THẬT seed được ngay bây giờ.
 */
export const BASE_ROLE_CODES: Role[] = [
  "SUPER_ADMIN",
  "CENTER_MANAGER",
  "HR",
  "SALES_CSM",
  "TEACHER",
  "MARKETING",
  "ACCOUNTANT",
  "PARENT",
];

/**
 * TARGET (A0-02 RBAC động) — danh mục RoleDef đầy đủ (gồm biến thể HO_* cross-center).
 * seedRoles() sẽ tạo đúng tập này khi bảng `RoleDef` tồn tại (Doc 15 §2).
 * ⚠️ Con số "11 role" trong AC2 của A0-00 sẽ được CHỐT ở A0-02 — danh sách dưới
 * là dự kiến, A0-02 phải đối chiếu Doc 15 §2 trước khi khóa.
 */
export const TARGET_ROLE_CODES = [
  "SUPER_ADMIN",
  "CENTER_MANAGER",
  "HR",
  "SALES_CSM",
  "TEACHER",
  "MARKETING",
  "ACCOUNTANT",
  "PARENT",
  "HO_ACCOUNTANT",
  "HO_HR",
  "HO_MARKETING",
  "HO_SALE",
] as const;

/** Email test theo role → tạo nhanh user duy nhất, dễ debug. */
export function testEmail(role: string, suffix = ""): string {
  const slug = role.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return `a0-${slug}${suffix ? `-${suffix}` : ""}@test.satarobo.local`;
}
