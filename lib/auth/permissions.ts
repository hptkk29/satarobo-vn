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
// ALL 7 ROLES:
// SUPER_ADMIN, MANAGER, HR, SALES, TEACHER, MARKETING, ACCOUNTANT
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
  | "leads:delete"
  | "leads:export"

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
  | "students:delete"
  | "students:import"

  // --- Classes (NEW) ---
  | "classes:view-all"
  | "classes:view-own"
  | "classes:create"
  | "classes:edit"
  | "classes:delete"

  // --- Enrollments (NEW) ---
  | "enrollments:view-all"
  | "enrollments:view-own"
  | "enrollments:create"
  | "enrollments:edit"
  | "enrollments:transfer"
  | "enrollments:cancel"

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

  // --- Documents (NEW) ---
  | "documents:view"
  | "documents:upload"
  | "documents:delete"

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

  // --- Settings / system (NEW) ---
  | "settings:view"
  | "settings:edit"
  | "users:manage" // CRUD User accounts (different from Employee records)
  | "roles:assign"

  // --- Phase 5.6 — Financial (Payment + Order) ---
  | "payments:manage"
  | "orders:view"
  | "orders:manage"

  // --- Phase 5.7 — Vouchers ---
  | "vouchers:view"
  | "vouchers:manage"

  // --- Phase 5.10 — Products (sales/rental catalog) ---
  | "products:view"
  | "products:manage";

// =============================================================================
// MATRIX — Mỗi action liệt kê rõ những role được phép.
// =============================================================================

export const PERMISSIONS: Record<Action, Role[]> = {
  // --- Employees ---
  "employees:view-all": ["SUPER_ADMIN", "MANAGER", "HR"],
  "employees:view-public": [
    "SUPER_ADMIN", "MANAGER", "HR", "SALES", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "employees:create": ["SUPER_ADMIN", "HR"],
  "employees:edit": ["SUPER_ADMIN", "HR", "MANAGER"],
  "employees:delete": ["SUPER_ADMIN"],
  "employees:view-salary": ["SUPER_ADMIN", "HR", "ACCOUNTANT"],
  "employees:view-personal": ["SUPER_ADMIN", "HR"],

  // --- Honors ---
  "honors:view": [
    "SUPER_ADMIN", "MANAGER", "HR", "SALES", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "honors:create": ["SUPER_ADMIN", "MANAGER", "HR", "MARKETING"],
  "honors:edit": ["SUPER_ADMIN", "MANAGER", "HR", "MARKETING"],
  "honors:delete": ["SUPER_ADMIN"],
  "honors:settings": ["SUPER_ADMIN", "MANAGER"],

  // --- Jobs ---
  "jobs:view": ["SUPER_ADMIN", "MANAGER", "HR", "SALES", "MARKETING"],
  "jobs:create": ["SUPER_ADMIN", "MANAGER", "HR"],
  "jobs:edit": ["SUPER_ADMIN", "MANAGER", "HR"],
  "jobs:delete": ["SUPER_ADMIN", "HR"],

  // --- Leads ---
  "leads:view-all": ["SUPER_ADMIN", "MANAGER", "MARKETING"],
  "leads:view-own": ["SALES"],
  "leads:create": ["SUPER_ADMIN", "MANAGER", "SALES", "MARKETING"],
  "leads:edit": ["SUPER_ADMIN", "MANAGER", "SALES", "MARKETING"],
  "leads:assign": ["SUPER_ADMIN", "MANAGER"],
  "leads:delete": ["SUPER_ADMIN", "MANAGER"],
  "leads:export": ["SUPER_ADMIN", "MANAGER", "MARKETING"],

  // --- Blog / News ---
  "blog:view": [
    "SUPER_ADMIN", "MANAGER", "HR", "SALES", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "blog:create": ["SUPER_ADMIN", "MANAGER", "MARKETING"],
  "blog:edit": ["SUPER_ADMIN", "MANAGER", "MARKETING"],
  "blog:delete": ["SUPER_ADMIN"],
  "news:view": [
    "SUPER_ADMIN", "MANAGER", "HR", "SALES", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "news:create": ["SUPER_ADMIN", "MANAGER", "MARKETING"],
  "news:edit": ["SUPER_ADMIN", "MANAGER", "MARKETING"],
  "news:delete": ["SUPER_ADMIN", "MANAGER"],
  "news:publish": ["SUPER_ADMIN", "MANAGER", "MARKETING"],

  // --- Payroll ---
  "payroll:view": ["SUPER_ADMIN", "ACCOUNTANT", "HR"],
  "payroll:edit": ["SUPER_ADMIN", "ACCOUNTANT"],

  // --- Students ---
  "students:view-all": ["SUPER_ADMIN", "MANAGER", "SALES", "MARKETING", "ACCOUNTANT", "HR"],
  "students:view-own-class": ["TEACHER"],
  "students:create": ["SUPER_ADMIN", "MANAGER", "SALES"],
  "students:edit": ["SUPER_ADMIN", "MANAGER", "SALES", "ACCOUNTANT"],
  "students:delete": ["SUPER_ADMIN", "MANAGER"],
  "students:import": ["SUPER_ADMIN", "MANAGER"],

  // --- Classes ---
  "classes:view-all": ["SUPER_ADMIN", "MANAGER", "SALES", "ACCOUNTANT", "HR", "MARKETING"],
  "classes:view-own": ["TEACHER"],
  "classes:create": ["SUPER_ADMIN", "MANAGER"],
  "classes:edit": ["SUPER_ADMIN", "MANAGER"],
  "classes:delete": ["SUPER_ADMIN"],

  // --- Enrollments ---
  "enrollments:view-all": ["SUPER_ADMIN", "MANAGER", "SALES", "ACCOUNTANT"],
  "enrollments:view-own": ["TEACHER"],
  "enrollments:create": ["SUPER_ADMIN", "MANAGER", "SALES"],
  "enrollments:edit": ["SUPER_ADMIN", "MANAGER", "SALES"],
  "enrollments:transfer": ["SUPER_ADMIN", "MANAGER"],
  "enrollments:cancel": ["SUPER_ADMIN", "MANAGER"],

  // --- Sessions + Attendance ---
  "sessions:view": ["SUPER_ADMIN", "MANAGER", "TEACHER", "SALES"],
  "sessions:create": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "sessions:edit": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "attendance:view": ["SUPER_ADMIN", "MANAGER", "TEACHER", "SALES"],
  "attendance:mark": ["TEACHER", "SUPER_ADMIN", "MANAGER"],
  "attendance:edit": ["SUPER_ADMIN", "MANAGER"],

  // --- Courses + Packages ---
  "courses:view": [
    "SUPER_ADMIN", "MANAGER", "HR", "SALES", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "courses:create": ["SUPER_ADMIN", "MANAGER"],
  "courses:edit": ["SUPER_ADMIN", "MANAGER", "MARKETING"],
  "courses:delete": ["SUPER_ADMIN"],
  "course-packages:view": [
    "SUPER_ADMIN", "MANAGER", "SALES", "MARKETING",
  ],
  "course-packages:edit": ["SUPER_ADMIN", "MANAGER", "MARKETING"],

  // --- Curriculum + Lessons ---
  "curriculum:view": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "curriculum:create": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "curriculum:edit": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "curriculum:delete": ["SUPER_ADMIN", "MANAGER"],

  // --- Questions / Exams / Assignments ---
  "questions:view": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "questions:author": ["TEACHER", "SUPER_ADMIN", "MANAGER"],
  "questions:edit": ["SUPER_ADMIN", "MANAGER", "TEACHER"], // teacher edit own questions enforced separately
  "questions:delete": ["SUPER_ADMIN", "MANAGER"],
  "exams:view": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "exams:create": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "exams:edit": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "exams:grade": ["TEACHER", "SUPER_ADMIN", "MANAGER"],
  "exams:delete": ["SUPER_ADMIN", "MANAGER"],
  "assignments:view": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "assignments:create": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "assignments:edit": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "assignments:grade": ["TEACHER", "SUPER_ADMIN", "MANAGER"],
  "assignments:delete": ["SUPER_ADMIN", "MANAGER"],

  // --- Documents ---
  "documents:view": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "documents:upload": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "documents:delete": ["SUPER_ADMIN", "MANAGER"],

  // --- Centers / Rooms / Holidays ---
  "centers:view": [
    "SUPER_ADMIN", "MANAGER", "HR", "SALES", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "centers:edit": ["SUPER_ADMIN"],
  "rooms:view": ["SUPER_ADMIN", "MANAGER", "TEACHER", "SALES"],
  "rooms:edit": ["SUPER_ADMIN", "MANAGER"],
  "holidays:view": [
    "SUPER_ADMIN", "MANAGER", "HR", "SALES", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "holidays:edit": ["SUPER_ADMIN", "MANAGER"],

  // --- Inventory ---
  "inventory:view": ["SUPER_ADMIN", "MANAGER", "TEACHER", "ACCOUNTANT"],
  "inventory:edit": ["SUPER_ADMIN", "MANAGER"],
  "inventory:movement": ["SUPER_ADMIN", "MANAGER", "TEACHER"],
  "inventory:audit": ["SUPER_ADMIN", "MANAGER", "ACCOUNTANT"],

  // --- ZMRoboKit ---
  "kits:view": [
    "SUPER_ADMIN", "MANAGER", "SALES", "MARKETING",
  ],
  "kits:edit": ["SUPER_ADMIN", "MANAGER", "MARKETING"],

  // --- Site content / CMS ---
  "site-content:view": ["SUPER_ADMIN", "MANAGER", "MARKETING"],
  "site-content:edit": ["SUPER_ADMIN", "MANAGER", "MARKETING"],

  // --- Audit logs ---
  "audit-logs:view": ["SUPER_ADMIN", "MANAGER"],

  // --- Settings / system ---
  "settings:view": ["SUPER_ADMIN", "MANAGER"],
  "settings:edit": ["SUPER_ADMIN"],
  "users:manage": ["SUPER_ADMIN"], // create/disable User accounts
  "roles:assign": ["SUPER_ADMIN"],

  // --- Phase 5.6 — Financial ---
  "payments:manage": ["SUPER_ADMIN", "MANAGER", "ACCOUNTANT"],
  "orders:view": ["SUPER_ADMIN", "MANAGER", "SALES", "ACCOUNTANT"],
  "orders:manage": ["SUPER_ADMIN", "MANAGER", "ACCOUNTANT"],

  // --- Phase 5.7 — Vouchers ---
  "vouchers:view": ["SUPER_ADMIN", "MANAGER", "SALES", "MARKETING", "ACCOUNTANT"],
  "vouchers:manage": ["SUPER_ADMIN", "MANAGER", "MARKETING", "ACCOUNTANT"],

  // --- Phase 5.10 — Products ---
  "products:view": ["SUPER_ADMIN", "MANAGER", "SALES", "MARKETING", "ACCOUNTANT"],
  "products:manage": ["SUPER_ADMIN", "MANAGER", "ACCOUNTANT"],
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
  grants?: UserGrant[];
};

/**
 * Check if a user (or role string) can perform action.
 *
 * Resolution order (DENY beats ALLOW beats role):
 *   1. If user.grants has DENY for action → false
 *   2. If user.grants has ALLOW for action → true
 *   3. Fall back to PERMISSIONS matrix (role-based)
 *
 * Backward compat: pass role string (or null) → behaves like before.
 */
export function can(
  userOrRole: CanUser | Role | string | null | undefined,
  action: Action,
): boolean {
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

  // Path 2: user object with grants
  const user = userOrRole;

  // 2a. SUPER_ADMIN bypass — không thể bị DENY override (safety against
  // self-lockout). Vẫn check matrix nhưng matrix gần như luôn cấp quyền
  // cho SUPER_ADMIN.
  if (user.role === "SUPER_ADMIN") {
    return PERMISSIONS[action]?.includes("SUPER_ADMIN") ?? false;
  }

  // 2b. Per-user grants — DENY > ALLOW > role fallback
  const grant = user.grants?.find((g) => g.action === action);
  if (grant?.grant === "DENY") return false;
  if (grant?.grant === "ALLOW") return true;

  // 2c. Role matrix fallback
  if (!user.role) return false;
  return PERMISSIONS[action]?.includes(user.role as Role) ?? false;
}

// =============================================================================
// FULL ACTION LIST — single source of truth, sync với PERMISSIONS matrix
// =============================================================================

export const ALL_ACTIONS = Object.keys(PERMISSIONS) as Action[];

export function assertCan(
  role: Role | string | undefined | null,
  action: Action,
): void {
  if (!can(role, action)) {
    throw new Error(
      `Forbidden: role ${role ?? "anonymous"} không có quyền ${action}`,
    );
  }
}

// =============================================================================
// FIELD-LEVEL VISIBILITY — Employee
// =============================================================================

export function getEmployeeFieldVisibility(
  role: Role | string | null | undefined,
): {
  basic: boolean; // name, jobTitle, department, avatar, bio, joinedAt
  contact: boolean; // phone, email
  salary: boolean; // salaryRank, salaryLevel, bhxhBase
  personal: boolean; // dateOfBirth, gender, contractType, managerId, nationalId
} {
  if (!role) {
    return { basic: false, contact: false, salary: false, personal: false };
  }
  return {
    basic: true,
    contact: (["SUPER_ADMIN", "MANAGER", "HR"] as Role[]).includes(role as Role),
    salary: (["SUPER_ADMIN", "HR", "ACCOUNTANT"] as Role[]).includes(
      role as Role,
    ),
    personal: (["SUPER_ADMIN", "HR"] as Role[]).includes(role as Role),
  };
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
