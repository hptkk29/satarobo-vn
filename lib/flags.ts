// lib/flags.ts — feature flags (env-driven).

/**
 * RBAC v2 (can() đọc quyền động từ DB). Mặc định OFF → fallback matrix tĩnh
 * (permissions.ts). Bật dần: dev → staging → 1 tuần shadow → production.
 */
export function isRbacV2Enabled(): boolean {
  return process.env.RBAC_V2_ENABLED === "true";
}

/** A0-05 — login chung satarobo.vn/login + redirect theo role. OFF → giữ login theo host. */
export function isCommonLoginEnabled(): boolean {
  return process.env.COMMON_LOGIN_ENABLED !== "false"; // mặc định ON (hành vi đã triển khai)
}

/** A0-07 — dispatcher DomainEvent (cron). OFF → không xử lý (event vẫn tích PENDING). */
export function isDispatcherEnabled(): boolean {
  return process.env.DISPATCHER_ENABLED !== "false"; // mặc định ON
}

/** R7-05 — Convert v2 (guard payment + multi-student + dedupe). OFF → giữ flow convert cũ. */
export function isConvertV2Enabled(): boolean {
  return process.env.CONVERT_V2_ENABLED === "true"; // mặc định OFF
}
