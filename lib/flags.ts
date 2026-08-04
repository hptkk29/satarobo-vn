// lib/flags.ts — feature flags (env-driven).

/**
 * RBAC v2 (can() đọc quyền động từ DB). Mặc định OFF → fallback matrix tĩnh
 * (permissions.ts). Bật dần: dev → staging → 1 tuần shadow → production.
 */
export function isRbacV2Enabled(): boolean {
  return process.env.RBAC_V2_ENABLED === "true";
}

/**
 * AUTH-SĐT P4 — cờ break-glass khi ZBS/ZNS sự cố hàng loạt: OTP tới SĐT BỎ QUA
 * kênh Zalo, đi thẳng email dự phòng (chỉ user có email đã verify). Bật bằng env
 * `AUTH_ZNS_DEGRADED="true"` + redeploy; mặc định OFF. Phụ huynh không có email
 * sẽ KHÔNG nhận được mã khi cờ bật — cân nhắc trước khi kéo.
 */
export function isZnsDegraded(): boolean {
  return process.env.AUTH_ZNS_DEGRADED === "true";
}

/** A0-05 — login chung satarobo.vn/login + redirect theo role. OFF → giữ login theo host. */
export function isCommonLoginEnabled(): boolean {
  return process.env.COMMON_LOGIN_ENABLED !== "false"; // mặc định ON (hành vi đã triển khai)
}

/**
 * F4 (Q41) — WIRE THẬT của cổng login chung: public host `satarobo.vn/login` SERVE
 * form login (thay vì 308 permanent sang admin/login như hiện tại). Mặc định OFF →
 * giữ nguyên hành vi hiện tại (308) → an toàn merge trong tuần flip / UAT.
 *
 * ⚠️ CHỈ bật env `COMMON_LOGIN_AT_ROOT="true"` SAU khi F2 (`AUTH_COOKIE_DOMAIN`) đã
 * bật — không có SSO cookie xuyên subdomain thì login ở public host xong redirect
 * sang admin/teacher/portal = mất session (cookie host-only). Xem Q41/F4.
 */
export function isCommonLoginAtRootEnabled(): boolean {
  return process.env.COMMON_LOGIN_AT_ROOT === "true";
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

/**
 * AUTH-SĐT P5 — công tắc ngắt **đường TỰ ĐỘNG cấp tài khoản phụ huynh theo SĐT**
 * (`ensureParentAccountForOrder`): xác nhận đơn sang CONFIRMED và webhook SePay.
 * Mặc định ON; ngắt bằng env `AUTH_PHONE_PROVISIONING="false"` + redeploy.
 *
 * ⚠️ CỜ NÀY CHỈ CHẮN ĐƯỜNG TỰ ĐỘNG, KHÔNG chắn các form nhân viên tự bấm
 * (`/admin/students` cấp tài khoản, convert lead). Cố ý: sau P5 thì SĐT LÀ khoá
 * đăng nhập của phụ huynh — bắt các form đó "quay về email" là dựng lại đúng cái
 * bế tắc P5 sinh ra để phá, và tạo nhánh code không ai chạy nên không ai test.
 * Doc phase từng hứa "3 luồng quay lại nhánh email cũ"; hứa vậy là sai hướng, đã
 * sửa lại doc theo đúng cái cờ này làm.
 *
 * VÌ SAO CẦN: đường tự động chạy KHÔNG có người duyệt và `.catch()` nuốt lỗi, nên
 * hỏng thì hỏng im lặng và mỗi đơn đẻ một tài khoản. Đúng kịch bản đã xảy ra trên
 * prod từ 31/07: `provision.ts` (batch E4) lên trước P5, tạo tài khoản khoá SĐT
 * trong khi `/kich-hoat` còn đòi email ⇒ tài khoản không kích hoạt được, mà SĐT
 * thì đã bị chiếm chỗ (`User.phone @unique`).
 */
export function isAuthPhoneProvisioningEnabled(): boolean {
  return process.env.AUTH_PHONE_PROVISIONING !== "false";
}

/**
 * 03/08 — CỜ CUTOVER SỔ THU MỚI (`PaymentRequest` ← `PaymentAllocation` ←
 * `BankTransaction`). Mặc định **TẮT**.
 *
 * Sổ mới đang chạy SONG SONG với sổ cũ (`Payment` Ledger-A + `OrderInstallment`
 * Ledger-B): tiền về qua payOS ghi CẢ HAI bên — sổ mới (`PaymentAllocation`) và một
 * dòng `Payment` marker `[auto:payos:<txn>]` cho sổ cũ — vì **công nợ hiển thị vẫn
 * lấy từ sổ cũ** cho tới khi lật cờ này.
 * Cờ này là chỗ lật nguồn đọc sang sổ mới — và chỉ được lật khi
 * `scripts/shadow-compare-debt.ts` báo **0 đơn lệch**. Quy trình:
 *   1. `pnpm payments:backfill --apply`      → dựng phiếu thu cho đơn cũ
 *   2. `pnpm payments:shadow-compare`        → còn lệch thì xử lý theo cột lý do
 *   3. sạch → set env `PAYMENT_LEDGER_V2="true"` + redeploy
 * Rollback = xoá env (hoặc set khác `"true"`) + redeploy; sổ cũ chưa bị gỡ nên
 * không mất dữ liệu.
 *
 * ⚠️ Cờ mới khai — CHƯA nối vào màn nào. Bật lúc này KHÔNG đổi hành vi. Đây là chủ ý
 * (khai cờ trước, nối sau) để đường lùi tồn tại trong code từ đầu, không phải chỉ
 * trên giấy — đúng bài học của `AUTH_PHONE_PROVISIONING`.
 */
export function isPaymentLedgerV2Enabled(): boolean {
  return process.env.PAYMENT_LEDGER_V2 === "true"; // mặc định OFF
}
