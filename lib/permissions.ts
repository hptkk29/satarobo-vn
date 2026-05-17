// =============================================================================
// MIGRATION SHIM — lib/permissions.ts (DEPRECATED, will be deleted in Phase 5.3)
// =============================================================================
//
// Toàn bộ file này tồn tại để KHÔNG BREAK 15 callsite cũ đang import
// `hasPermission` / `isSuperAdmin` / `requireRole` từ '@/lib/permissions'.
//
// Mỗi gọi tới hasPermission(user, action, resource) được map sang can(role, "resource:action")
// của file mới `@/lib/auth/permissions`.
//
// MIGRATION PATH (anh làm dần — 1 callsite/lần):
// 1. Mở file cần migrate (xem MIGRATION_GUIDE.md để có danh sách 15 file)
// 2. Đổi import:
//    - `import { hasPermission } from '@/lib/permissions'`
//    + `import { can } from '@/lib/auth/permissions'`
// 3. Đổi call site:
//    - `hasPermission(user, "update", "lead")` → `can(user.role, "leads:edit")`
//    - `hasPermission(user, "read", "student")` → `can(user.role, "students:view-all")`
//    - `isSuperAdmin(user)` → `isSuperAdmin(user.role)` (file mới đổi signature)
// 4. Test page/action.
// 5. Khi tất cả 15 callsite đã migrate → xoá file shim này.
//
// =============================================================================

import { can as canNew, isSuperAdmin as isSuperAdminNew } from "@/lib/auth/permissions";
import type { Action } from "@/lib/auth/permissions";

// --- Legacy types (giữ để code cũ compile) ---
type LegacyRole =
  | "SUPER_ADMIN"
  | "MANAGER"
  | "SALES"
  | "TEACHER"
  | "MARKETING"
  | "ACCOUNTANT";
// Note: HR role MISSING ở legacy type — đây là bug cũ. File mới đã fix.

type LegacyResource =
  | "lead"
  | "student"
  | "class"
  | "teacher"
  | "content"
  | "marketing"
  | "settings";
type LegacyAction = "read" | "create" | "update" | "delete" | "full";

type LegacyUser = {
  role: string;
  centerId?: string | null;
};

// --- Mapping table: legacy (action, resource) → new Action string ---
// Note: "full" maps to most permissive variant. Some legacy combos không có
// trực tiếp ở matrix mới — map sang gần nhất + log warning để track.
const LEGACY_MAP: Record<string, Action | null> = {
  // lead
  "read:lead": "leads:view-all",
  "create:lead": "leads:create",
  "update:lead": "leads:edit",
  "delete:lead": "leads:delete",
  "full:lead": "leads:edit", // closest match — SUPER_ADMIN passes either way

  // student
  "read:student": "students:view-all",
  "create:student": "students:create",
  "update:student": "students:edit",
  "delete:student": "students:delete",
  "full:student": "students:edit",

  // class
  "read:class": "classes:view-all",
  "create:class": "classes:create",
  "update:class": "classes:edit",
  "delete:class": "classes:delete",
  "full:class": "classes:edit",

  // teacher → legacy resource meant "view teachers" → map sang employees view
  "read:teacher": "employees:view-all",
  "create:teacher": "employees:create",
  "update:teacher": "employees:edit",
  "delete:teacher": "employees:delete",
  "full:teacher": "employees:edit",

  // content → site-content
  "read:content": "site-content:view",
  "create:content": "site-content:edit",
  "update:content": "site-content:edit",
  "delete:content": "site-content:edit",
  "full:content": "site-content:edit",

  // marketing
  "read:marketing": "leads:view-all",
  "create:marketing": "leads:create",
  "update:marketing": "leads:edit",
  "delete:marketing": "leads:delete",
  "full:marketing": "leads:edit",

  // settings
  "read:settings": "settings:view",
  "create:settings": "settings:edit",
  "update:settings": "settings:edit",
  "delete:settings": "settings:edit",
  "full:settings": "settings:edit",
};

/**
 * Legacy hasPermission — bridges old signature to new can().
 * @deprecated Use `can(role, action)` from `@/lib/auth/permissions` instead.
 */
export function hasPermission(
  user: LegacyUser,
  action: LegacyAction,
  resource: LegacyResource,
): boolean {
  const key = `${action}:${resource}`;
  const newAction = LEGACY_MAP[key];

  if (!newAction) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[permissions shim] No mapping for legacy ${key} — denying. ` +
          `Add to LEGACY_MAP or migrate to can() directly.`,
      );
    }
    return false;
  }

  return canNew(user.role, newAction);
}

/**
 * @deprecated Use `isRole(role, "SUPER_ADMIN", "MANAGER")` from `@/lib/auth/permissions`.
 */
export function requireRole(user: LegacyUser, ...roles: LegacyRole[]): boolean {
  return roles.includes(user.role as LegacyRole);
}

/**
 * @deprecated Use `isSuperAdmin(role)` from `@/lib/auth/permissions` (note: takes role string, not user object).
 */
export function isSuperAdmin(user: LegacyUser): boolean {
  return isSuperAdminNew(user.role);
}
