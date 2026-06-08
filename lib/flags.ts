// lib/flags.ts — feature flags (env-driven).

/**
 * RBAC v2 (can() đọc quyền động từ DB). Mặc định OFF → fallback matrix tĩnh
 * (permissions.ts). Bật dần: dev → staging → 1 tuần shadow → production.
 */
export function isRbacV2Enabled(): boolean {
  return process.env.RBAC_V2_ENABLED === "true";
}
