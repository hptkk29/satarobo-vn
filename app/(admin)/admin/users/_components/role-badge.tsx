import type { Role } from "@prisma/client";

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  MANAGER: "Quản lý",
  HR: "Nhân sự (HR)",
  SALES: "Sales",
  TEACHER: "Giáo viên",
  MARKETING: "Marketing",
  ACCOUNTANT: "Kế toán",
};

const ROLE_COLORS: Record<Role, string> = {
  SUPER_ADMIN: "bg-red-100 text-red-700",
  MANAGER: "bg-purple-100 text-purple-700",
  HR: "bg-pink-100 text-pink-700",
  SALES: "bg-blue-100 text-blue-700",
  TEACHER: "bg-green-100 text-green-700",
  MARKETING: "bg-orange-100 text-orange-700",
  ACCOUNTANT: "bg-yellow-100 text-yellow-700",
};

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${ROLE_COLORS[role]}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

export const ROLE_OPTIONS: Array<{ value: Role; label: string }> = (
  Object.entries(ROLE_LABELS) as [Role, string][]
).map(([value, label]) => ({ value, label }));
