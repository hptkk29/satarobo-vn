type Role = "SUPER_ADMIN" | "MANAGER" | "SALES" | "TEACHER" | "MARKETING" | "ACCOUNTANT";
type Resource = "lead" | "student" | "class" | "teacher" | "content" | "marketing" | "settings";
type Action = "read" | "create" | "update" | "delete" | "full";

type User = {
  role: string;
  centerId?: string | null;
};

// Permission matrix from CLAUDE.md section 9
const PERMISSIONS: Record<Role, Partial<Record<Resource, Action[]>>> = {
  SUPER_ADMIN: {
    lead: ["full"],
    student: ["full"],
    class: ["full"],
    teacher: ["full"],
    content: ["full"],
    marketing: ["full"],
    settings: ["full"],
  },
  MANAGER: {
    lead: ["read", "create", "update", "delete"],
    student: ["read", "create", "update", "delete"],
    class: ["read", "create", "update", "delete"],
    teacher: ["read"],
    content: ["read"],
    marketing: ["read"],
  },
  SALES: {
    lead: ["read", "update"],
    student: ["create"],
    class: ["read"],
  },
  TEACHER: {
    student: ["read"],
    class: ["read"],
  },
  MARKETING: {
    lead: ["read"],
    content: ["full"],
    marketing: ["full"],
  },
  ACCOUNTANT: {
    lead: ["read"],
    student: ["read", "update"],
    class: ["read"],
    teacher: ["read"],
  },
};

export function hasPermission(user: User, action: Action, resource: Resource): boolean {
  const role = user.role as Role;
  const allowed = PERMISSIONS[role]?.[resource];
  if (!allowed) return false;
  if (allowed.includes("full")) return true;
  return allowed.includes(action);
}

export function requireRole(user: User, ...roles: Role[]): boolean {
  return roles.includes(user.role as Role);
}

export function isSuperAdmin(user: User): boolean {
  return user.role === "SUPER_ADMIN";
}
