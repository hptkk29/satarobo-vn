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
