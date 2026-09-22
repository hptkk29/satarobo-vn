// Registry quyền — module Hệ thống: cấu hình, role, tài khoản, cơ sở, audit log,
// báo cáo. Nhóm quyền quản trị thuần hệ thống (settings/roles/users) → scopable: false.
// Key GIỮ NGUYÊN format v1 `resource:verb` (TS-01).
import type { ModuleDecl } from "./types";

export const systemModule: ModuleDecl = {
  module: "system",
  permissions: [
    // --- Settings (cấu hình toàn cục — không gắn đơn vị) ---
    { key: "settings:view", action: "view", scopable: false },
    { key: "settings:edit", action: "edit", scopable: false },

    // --- Roles ---
    {
      key: "roles:assign",
      action: "assign",
      // Gán vai theo user × orgUnit → vẫn cần scope.
      description: "Gán vai trò cho tài khoản (UserOrgRole).",
    },
    {
      key: "roles:manage",
      action: "manage",
      // Định nghĩa RoleDef/RolePermission là cấu hình toàn cục.
      scopable: false,
      description: "CRUD RoleDef + gán RolePermission (chỉ SUPER_ADMIN).",
    },

    // --- User groups (US-03 — nhóm người dùng nhận grant ad-hoc) ---
    {
      key: "user-groups:manage",
      action: "manage",
      // Nhóm + grant nhóm là cấu hình quyền toàn cục (như roles:manage).
      scopable: false,
      description: "CRUD UserGroup + thành viên + grant ALLOW/DENY cho nhóm (chỉ SUPER_ADMIN).",
    },

    // --- Users ---
    {
      key: "users:manage",
      action: "manage",
      scopable: false,
      description: "CRUD tài khoản User (khác hồ sơ Employee).",
    },

    // --- Centers (danh mục cơ sở) ---
    { key: "centers:view", action: "view" },
    { key: "centers:edit", action: "edit" },

    // --- Audit logs ---
    { key: "audit-logs:view", action: "view" },
    {
      key: "audit-logs:view-pii",
      action: "view-pii",
      description: "Break-glass xem PII đầy đủ trong audit viewer (reason + log riêng).",
    },
  ],
};
