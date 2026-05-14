import type { Role } from "@prisma/client";

// Permission matrix theo 7 roles (Phase 4.7+).
// Mỗi action liệt kê rõ những role nào được phép.

export type Action =
  | "employees:view-all"
  | "employees:view-public"
  | "employees:create"
  | "employees:edit"
  | "employees:delete"
  | "employees:view-salary"
  | "employees:view-personal"
  | "honors:view"
  | "honors:create"
  | "honors:edit"
  | "honors:delete"
  | "honors:settings"
  | "jobs:view"
  | "jobs:create"
  | "jobs:edit"
  | "jobs:delete"
  | "leads:view-all"
  | "leads:view-own"
  | "leads:edit"
  | "blog:view"
  | "blog:create"
  | "blog:edit"
  | "blog:delete"
  | "payroll:view"
  | "payroll:edit";

const PERMISSIONS: Record<Action, Role[]> = {
  // EMPLOYEES
  "employees:view-all": ["SUPER_ADMIN", "MANAGER", "HR"],
  "employees:view-public": [
    "SUPER_ADMIN",
    "MANAGER",
    "HR",
    "SALES",
    "TEACHER",
    "MARKETING",
    "ACCOUNTANT",
  ],
  "employees:create": ["SUPER_ADMIN", "HR"],
  "employees:edit": ["SUPER_ADMIN", "HR", "MANAGER"],
  "employees:delete": ["SUPER_ADMIN"],
  "employees:view-salary": ["SUPER_ADMIN", "HR", "ACCOUNTANT"],
  "employees:view-personal": ["SUPER_ADMIN", "HR"],

  // HONORS
  "honors:view": [
    "SUPER_ADMIN",
    "MANAGER",
    "HR",
    "SALES",
    "TEACHER",
    "MARKETING",
    "ACCOUNTANT",
  ],
  "honors:create": ["SUPER_ADMIN", "MANAGER", "HR", "MARKETING"],
  "honors:edit": ["SUPER_ADMIN", "MANAGER", "HR", "MARKETING"],
  "honors:delete": ["SUPER_ADMIN"],
  "honors:settings": ["SUPER_ADMIN", "MANAGER"],

  // JOBS
  "jobs:view": ["SUPER_ADMIN", "MANAGER", "HR", "SALES", "MARKETING"],
  "jobs:create": ["SUPER_ADMIN", "MANAGER", "HR"],
  "jobs:edit": ["SUPER_ADMIN", "MANAGER", "HR"],
  "jobs:delete": ["SUPER_ADMIN", "HR"],

  // LEADS
  "leads:view-all": ["SUPER_ADMIN", "MANAGER", "MARKETING"],
  "leads:view-own": ["SALES"],
  "leads:edit": ["SUPER_ADMIN", "MANAGER", "SALES", "MARKETING"],

  // BLOG
  "blog:view": [
    "SUPER_ADMIN",
    "MANAGER",
    "HR",
    "SALES",
    "TEACHER",
    "MARKETING",
    "ACCOUNTANT",
  ],
  "blog:create": ["SUPER_ADMIN", "MANAGER", "MARKETING"],
  "blog:edit": ["SUPER_ADMIN", "MANAGER", "MARKETING"],
  "blog:delete": ["SUPER_ADMIN"],

  // PAYROLL (cho Phase 4.8 sau)
  "payroll:view": ["SUPER_ADMIN", "ACCOUNTANT", "HR"],
  "payroll:edit": ["SUPER_ADMIN", "ACCOUNTANT"],
};

// Check role có quyền cho action không.
export function can(role: Role | string | undefined | null, action: Action): boolean {
  if (!role) return false;
  return PERMISSIONS[action]?.includes(role as Role) ?? false;
}

// Throw nếu không có quyền — dùng trong Server Actions / API routes.
export function assertCan(
  role: Role | string | undefined | null,
  action: Action,
): void {
  if (!can(role, action)) {
    throw new Error(`Forbidden: role ${role ?? "anonymous"} không có quyền ${action}`);
  }
}

// Field visibility cho Employee theo role.
export function getEmployeeFieldVisibility(role: Role | string | null | undefined): {
  basic: boolean; // name, jobTitle, department, avatar, bio, joinedAt
  contact: boolean; // phone, email
  salary: boolean; // salaryRank, salaryLevel
  personal: boolean; // dateOfBirth, gender, contractType, managerId
} {
  if (!role) return { basic: false, contact: false, salary: false, personal: false };
  return {
    basic: true,
    contact: (["SUPER_ADMIN", "MANAGER", "HR"] as Role[]).includes(role as Role),
    salary: (["SUPER_ADMIN", "HR", "ACCOUNTANT"] as Role[]).includes(role as Role),
    personal: (["SUPER_ADMIN", "HR"] as Role[]).includes(role as Role),
  };
}
