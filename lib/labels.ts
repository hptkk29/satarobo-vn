import type { Role } from "@prisma/client";

// =============================================================================
// LABELS tiếng Việt — single source of truth cho hiển thị
// =============================================================================

// Phase T0.1 — nhãn role tiếng Việt (8 roles).
export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  CENTER_MANAGER: "Quản lý cơ sở",
  HR: "Nhân sự (HR)",
  SALES_CSM: "Tư vấn & Chăm sóc",
  TEACHER: "Giáo viên",
  MARKETING: "Marketing",
  ACCOUNTANT: "Kế toán",
  PARENT: "Phụ huynh",
};

export function roleLabel(role: Role | string | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABELS[role as Role] ?? String(role);
}

// Màu badge role — single source (gộp từ users/role-badge.tsx).
export const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-700",
  CENTER_MANAGER: "bg-purple-100 text-purple-700",
  HR: "bg-pink-100 text-pink-700",
  SALES_CSM: "bg-blue-100 text-blue-700",
  TEACHER: "bg-green-100 text-green-700",
  MARKETING: "bg-orange-100 text-orange-700",
  ACCOUNTANT: "bg-yellow-100 text-yellow-700",
  PARENT: "bg-teal-100 text-teal-700",
};

export function roleColor(role: Role | string | null | undefined): string {
  return ROLE_COLORS[role as Role] ?? "bg-gray-100 text-gray-700";
}

// Role gán được cho nhân viên (loại PARENT — phụ huynh không phải nhân sự).
export const ASSIGNABLE_ROLES: Role[] = [
  "SUPER_ADMIN",
  "CENTER_MANAGER",
  "HR",
  "SALES_CSM",
  "TEACHER",
  "MARKETING",
  "ACCOUNTANT",
];

/** Option {value,label} cho dropdown chọn role. Mặc định = toàn bộ role gán được. */
export function getRoleOptions(
  roles: Role[] = ASSIGNABLE_ROLES,
): Array<{ value: Role; label: string }> {
  return roles.map((value) => ({ value, label: ROLE_LABELS[value] }));
}
