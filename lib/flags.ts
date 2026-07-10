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

/**
 * R7-05/R7-06 — Convert v2 (per-child, guard payment CONFIRMED, multi-student, dedupe).
 * Quyết định R7: v2 là entry point DUY NHẤT → mặc định ON. Đặt
 * `CONVERT_V2_ENABLED=false` chỉ để tắt khẩn cấp (không còn flow gộp lead cũ trên UI).
 */
export function isConvertV2Enabled(): boolean {
  return process.env.CONVERT_V2_ENABLED !== "false"; // mặc định ON
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

/**
 * Portal v2 — giao diện Cổng phụ huynh mới (merge SataUI). Bật dần, chạy SONG SONG
 * portal hiện tại; OFF → giữ portal cũ. Gỡ portal cũ sau khi v2 ổn (2-phase).
 */
export function isPortalV2Enabled(): boolean {
  return process.env.PORTAL_V2_ENABLED === "true"; // mặc định OFF
}

/**
 * L5 — Site giáo viên riêng `giaovien.satarobo.vn` (ĐẢO Doc 15 §0 theo phiếu BGĐ
 * câu 7, ký 04/07/2026). 2-phase:
 *  - OFF (mặc định): hành vi hiện tại Y NGUYÊN — GV vẫn làm việc trên admin,
 *    layout `app/(teacher)` đá về /dashboard, host giaovien (khi đã wiring
 *    proxy) bounce về admin. KHÔNG đá GV khỏi admin khi site chưa đủ tính năng.
 *  - ON: GV trên host giaovien vào site GV (decideRoute rewrite /teacher/*);
 *    role khác vào giaovien bị đá về khu của họ. Bật sau khi L6 đủ tính năng.
 */
export function isTeacherSiteEnabled(): boolean {
  // 🚀 FLIP 10/07/2026 (Kiệt duyệt sau merge batch 1-4 — site GV 13 route data thật):
  // mặc định ON. Hệ quả: giaovien.satarobo.vn phục vụ site GV; GV THUẦN đăng nhập
  // admin.satarobo.vn bị chuyển sang site GV (GV kiêm nhiệm vẫn ở admin) — xem
  // decideRoute (lib/auth/route-policy.ts). ROLLBACK NHANH: đặt env
  // TEACHER_SITE_ENABLED="false" trên Vercel + redeploy (không cần revert code).
  return process.env.TEACHER_SITE_ENABLED !== "false";
}
