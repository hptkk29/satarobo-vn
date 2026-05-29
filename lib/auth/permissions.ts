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
// ALL 8 ROLES (Phase T0.1 — rename MANAGER->CENTER_MANAGER, SALES->SALES_CSM,
// thêm PARENT):
// SUPER_ADMIN, CENTER_MANAGER, HR, SALES_CSM, TEACHER, MARKETING, ACCOUNTANT, PARENT
//
// PARENT = phụ huynh (portal hocvien.satarobo.vn). KHÔNG có quyền admin nào —
// không xuất hiện trong bất kỳ array PERMISSIONS nào → can(PARENT, adminAction)
// luôn false. Quyền portal (xem data con) check riêng qua activeSite, không qua
// matrix này.
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

  // --- Trial classes (Phase T1.4) ---
  | "trials:view"
  | "trials:manage"
  | "trials:feedback"

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
  | "products:manage"

  // --- Phase 5.13 — Email System ---
  | "emails:view"
  | "emails:manage";

// =============================================================================
// MATRIX — Mỗi action liệt kê rõ những role được phép.
// =============================================================================

export const PERMISSIONS: Record<Action, Role[]> = {
  // --- Employees ---
  "employees:view-all": ["SUPER_ADMIN", "CENTER_MANAGER", "HR"],
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
  "honors:settings": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Jobs ---
  "jobs:view": ["SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "MARKETING"],
  "jobs:create": ["SUPER_ADMIN", "CENTER_MANAGER", "HR"],
  "jobs:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "HR"],
  "jobs:delete": ["SUPER_ADMIN", "HR"],

  // --- Leads ---
  "leads:view-all": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],
  "leads:view-own": ["SALES_CSM"],
  "leads:create": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "MARKETING"],
  "leads:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "MARKETING"],
  "leads:assign": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "leads:delete": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "leads:export": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],

  // --- Trial classes (Phase T1.4) ---
  "trials:view": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "TEACHER"],
  "trials:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],
  "trials:feedback": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],

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
  "hr_attendance:checkin": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "hr_attendance:view": ["SUPER_ADMIN", "CENTER_MANAGER", "HR"],

  // --- Blog / News ---
  "blog:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "blog:create": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],
  "blog:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],
  "blog:delete": ["SUPER_ADMIN"],
  "news:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "TEACHER", "MARKETING", "ACCOUNTANT",
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
  "students:view-own-class": ["TEACHER"],
  "students:create": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],
  "students:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "ACCOUNTANT"],
  "students:delete": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "students:import": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Classes ---
  "classes:view-all": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "ACCOUNTANT", "HR", "MARKETING"],
  "classes:view-own": ["TEACHER"],
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
  "enrollments:view-own": ["TEACHER"],
  "enrollments:create": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],
  "enrollments:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM"],
  "enrollments:transfer": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "enrollments:cancel": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Sessions + Attendance ---
  "sessions:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER", "SALES_CSM"],
  "sessions:create": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "sessions:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "attendance:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER", "SALES_CSM"],
  "attendance:mark": ["TEACHER", "SUPER_ADMIN", "CENTER_MANAGER"],
  "attendance:edit": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Courses + Packages ---
  "courses:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "courses:create": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "courses:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],
  "courses:delete": ["SUPER_ADMIN"],
  "course-packages:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "MARKETING",
  ],
  "course-packages:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],

  // --- Curriculum + Lessons ---
  "curriculum:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "curriculum:create": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "curriculum:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "curriculum:delete": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Questions / Exams / Assignments ---
  "questions:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "questions:author": ["TEACHER", "SUPER_ADMIN", "CENTER_MANAGER"],
  "questions:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"], // teacher edit own questions enforced separately
  "questions:delete": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "exams:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "exams:create": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "exams:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "exams:grade": ["TEACHER", "SUPER_ADMIN", "CENTER_MANAGER"],
  "exams:delete": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "assignments:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "assignments:create": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "assignments:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "assignments:grade": ["TEACHER", "SUPER_ADMIN", "CENTER_MANAGER"],
  "assignments:delete": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Documents ---
  "documents:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "documents:upload": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "documents:delete": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Centers / Rooms / Holidays ---
  "centers:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "centers:edit": ["SUPER_ADMIN"],
  "rooms:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER", "SALES_CSM"],
  "rooms:edit": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "holidays:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "HR", "SALES_CSM", "TEACHER", "MARKETING", "ACCOUNTANT",
  ],
  "holidays:edit": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Inventory ---
  "inventory:view": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER", "ACCOUNTANT"],
  "inventory:edit": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "inventory:movement": ["SUPER_ADMIN", "CENTER_MANAGER", "TEACHER"],
  "inventory:audit": ["SUPER_ADMIN", "CENTER_MANAGER", "ACCOUNTANT"],

  // --- ZMRoboKit ---
  "kits:view": [
    "SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "MARKETING",
  ],
  "kits:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],

  // --- Site content / CMS ---
  "site-content:view": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],
  "site-content:edit": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],

  // --- Audit logs ---
  "audit-logs:view": ["SUPER_ADMIN", "CENTER_MANAGER"],

  // --- Settings / system ---
  "settings:view": ["SUPER_ADMIN", "CENTER_MANAGER"],
  "settings:edit": ["SUPER_ADMIN"],
  "users:manage": ["SUPER_ADMIN"], // create/disable User accounts
  "roles:assign": ["SUPER_ADMIN"],

  // --- Phase 5.6 — Financial ---
  "payments:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "ACCOUNTANT"],
  "orders:view": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "ACCOUNTANT"],
  "orders:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "ACCOUNTANT"],

  // --- Phase 5.7 — Vouchers ---
  "vouchers:view": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "MARKETING", "ACCOUNTANT"],
  "vouchers:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING", "ACCOUNTANT"],

  // --- Phase 5.10 — Products ---
  "products:view": ["SUPER_ADMIN", "CENTER_MANAGER", "SALES_CSM", "MARKETING", "ACCOUNTANT"],
  "products:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "ACCOUNTANT"],

  // --- Phase 5.13 — Email System ---
  "emails:view": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING", "ACCOUNTANT"],
  "emails:manage": ["SUPER_ADMIN", "CENTER_MANAGER", "MARKETING"],
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
  return arr.filter(Boolean) as Role[];
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
