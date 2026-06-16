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

/**
 * R7-07 — Session lifecycle v2 ("Hoàn tất buổi": state machine SCHEDULED→COMPLETED +
 * dữ liệu thực tế GV/giờ/phòng + event session.taught). OFF → giữ checklist 9 mục cũ
 * (2-phase, song song). Bật dần như các flag khác.
 */
export function isSessionLifecycleV2Enabled(): boolean {
  return process.env.SESSION_LIFECYCLE_V2 === "true"; // mặc định OFF
}

/**
 * R7-09 — Signed URL R2 cho ảnh lớp (portal + admin render qua presigned GET, TTL ngắn).
 * OFF → dùng fileUrl công khai như cũ. Bật dần để siết quyền truy cập ảnh.
 */
export function isMediaSignedUrlEnabled(): boolean {
  return process.env.MEDIA_SIGNED_URL === "true"; // mặc định OFF
}

/**
 * R7-16 — Đánh giá GV (học viên) + Khảo sát trung tâm (PH) qua form builder Eval*.
 * Gate menu portal/admin + luồng nộp. OFF → ẩn menu, không đụng Survey NPS cũ.
 */
export function isEvalV2Enabled(): boolean {
  return process.env.EVAL_V2_ENABLED === "true"; // mặc định OFF
}

/**
 * R7-11/R7-12 — SCORM (upload/giải nén/publish + player blur/watermark). Gate
 * menu + route admin/scorm + api asset. OFF → ẩn hoàn toàn, không ảnh hưởng hệ khác.
 */
export function isScormEnabled(): boolean {
  return process.env.SCORM_ENABLED === "true"; // mặc định OFF
}
