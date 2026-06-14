import type { Role } from "@prisma/client";
import { ROLE_LABELS, roleColor, getRoleOptions } from "@/lib/labels";

export function RoleBadge({ role }: { role: Role }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${roleColor(role)}`}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

// Single source: gồm mọi role (kể cả PARENT) cho bộ lọc/hiển thị users.
export const ROLE_OPTIONS: Array<{ value: Role; label: string }> = getRoleOptions(
  Object.keys(ROLE_LABELS) as Role[],
);
