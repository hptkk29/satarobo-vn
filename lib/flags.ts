// lib/flags.ts — feature flags (env-driven).

/**
 * RBAC v2 (can() đọc quyền động từ DB). Mặc định OFF → fallback matrix tĩnh
 * (permissions.ts). Bật dần: dev → staging → 1 tuần shadow → production.
 */
export function isRbacV2Enabled(): boolean {
  return process.env.RBAC_V2_ENABLED === "true";
}

/**
 * Nền Hệ thống P3 · US-12 — chạy SHADOW cho resolver dataScope đo bằng `orgUnitId`.
 *
 * Bật KHÔNG đổi hành vi quyền một chút nào: shadow chỉ so và ghi log (`ScopeShadowDiff`).
 * Cái nó đổi là TẢI — thêm vài lượt ghi DB thưa. Mặc định OFF để môi trường nào chưa áp
 * migration P3 cũng không sinh lỗi.
 *
 * Đây KHÔNG phải cờ cutover. Cờ cutover là `ORG_SCOPE_CUTOVER_ENABLED` (US-13) và chỉ
 * được bật sau khi `congCutoverDat()` báo ĐẠT.
 */
export function isScopeShadowEnabled(): boolean {
  return process.env.SCOPE_SHADOW_ENABLED === "true";
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

/**
 * 20/08/2026 — TẮT tính năng NHÓM LỚP theo yêu cầu chủ dự án ("ẩn nhóm lớp,
 * disable tính năng nhóm lớp ở sidebar luôn").
 *
 * Mặc định **OFF** — ngược chiều mọi cờ khác trong file này, vì đây là cờ GỠ chứ
 * không phải cờ mở: hành vi mong muốn là ẩn, còn env chỉ để bật lại nếu cần.
 *
 * Cờ này che: mục sidebar "Nhóm lớp", ô "Nhóm lớp cố định" trong form lớp, và
 * mọi route `/admin/class-groups/*` (layout tự đá về /admin/classes).
 *
 * KHÔNG đụng schema: `Class.classGroupId` và bảng `ClassGroup` giữ nguyên dữ liệu.
 * Lớp nào đang gắn nhóm vẫn gắn — chỉ là không ai sửa được qua giao diện nữa.
 * Bật lại: đặt env `CLASS_GROUP_ENABLED="true"` + redeploy, không cần revert code.
 */
export function isClassGroupEnabled(): boolean {
  return process.env.CLASS_GROUP_ENABLED === "true"; // mặc định OFF (đã gỡ)
}

/**
 * 20/08/2026 — TẮT tính năng CHECKLIST CƠ SỞ (mở/đóng cơ sở hằng ngày) theo yêu
 * cầu chủ dự án ("ẩn checklist cơ sở, disable chức năng này, xoá luôn ở dashboard").
 *
 * Mặc định **OFF** (cờ GỠ — xem `isClassGroupEnabled`). Che: route
 * `/admin/cham-cong/checklist-co-so/*`, lối vào từ trang Chấm công, và nhóm việc
 * "Checklist cơ sở hôm qua" trên dashboard quản lý (`lib/pending-tasks.ts`).
 *
 * KHÔNG đụng schema: bảng `CenterDayChecklist` và dữ liệu đã ghi giữ nguyên.
 * Bật lại: env `CENTER_CHECKLIST_ENABLED="true"` + redeploy.
 */
export function isCenterChecklistEnabled(): boolean {
  return process.env.CENTER_CHECKLIST_ENABLED === "true"; // mặc định OFF (đã gỡ)
}

/**
 * G-D (21/08/2026) — KHOÁ endpoint nhận phiếu nhập khách (`/api/public/lead-intake/sale-form`).
 *
 * VÌ SAO CẦN: `isInfraPath` cho `/api/*` đi thẳng ở MỌI host, nên bất kỳ ai trên
 * Internet cũng `curl` được vào endpoint này và **tạo Lead thật**. Phòng thủ hiện
 * có (honeypot, giới hạn theo IP, trần dung lượng) chỉ chống **spam**, không chống
 * **truy cập trái phép** — trái CLAUDE.md #5 ("API route VẪN phải auth() + assertCan").
 *
 * ⚠️ MẶC ĐỊNH **OFF**, và đó là chủ đích: biểu mẫu tĩnh `sale.satarobo.vn/nhap-lieu.html`
 * mà marketing/sale-admin đang dùng hằng ngày gửi bài **ẩn danh**. Bật cờ này là
 * phiếu của họ bị từ chối ngay lập tức. Hai thứ đó không cùng sống được.
 *
 * ĐIỀU KIỆN BẬT (đủ cả 3):
 *   1. Trang nhập khách có đăng nhập đã lên prod và mở được.
 *   2. Marketing / sale-admin đã được thông báo và biết đường vào mới.
 *   3. Đã rà mọi nơi còn trỏ tới biểu mẫu cũ (QR, quảng cáo, chữ ký email).
 *
 * Rollback = đổi env về rỗng + redeploy, không revert code.
 */
export function isLeadIntakeAuthRequired(): boolean {
  return process.env.LEAD_INTAKE_REQUIRE_AUTH === "true"; // mặc định OFF
}

/**
 * Đợt B (21/08/2026) — site Sale riêng `sale.satarobo.vn` (route group thứ 6
 * `app/(sale)/`). Chốt Q11: Sale Hub là **site riêng**, còn biểu mẫu nhập khách
 * hiện ở host này sẽ dời sang `satarobo.vn/nhap-khach-hang`.
 *
 * Khuôn `=== "true"` (mặc định OFF) — cố ý ngược khuôn `isTeacherSiteEnabled()`
 * vốn mặc định ON vì đã qua kỳ flip 10/07/2026.
 *
 * OFF: host `sale` hành xử **y hệt hôm nay** — phục vụ 2 trang HTML tĩnh công
 * khai, bỏ qua đăng nhập. 0 byte giao diện site Sale được phục vụ.
 *
 * ⚠️ ĐIỀU KIỆN BẬT — bật sớm là **cắt đường nhập liệu của marketing**:
 *   1. Biểu mẫu nhập khách đã dời sang `satarobo.vn/nhap-khach-hang` và chạy thật.
 *   2. Marketing / sale-admin đã được thông báo.
 *   3. Đã rà mọi nơi còn trỏ `sale.satarobo.vn` (QR, quảng cáo, chữ ký email).
 *
 * ⚠️ KHÔNG bật `AUTH_COOKIE_DOMAIN` kèm theo: `.env.example` ghi rõ thứ tự bắt
 * buộc là **tách sale khỏi zone trước**, vì bật khi host này còn phục vụ trang
 * tĩnh công khai = lộ cookie phiên sang host công khai. Site Sale dùng cổng đăng
 * nhập riêng trên chính host của nó — chạy được, chỉ tốn một lần đăng nhập.
 *
 * Rollback = đổi env + redeploy, không revert code.
 */
export function isSaleSiteEnabled(): boolean {
  return process.env.SALE_SITE_ENABLED === "true"; // mặc định OFF
}

/**
 * Đợt E (22/08/2026) — chính sách CHIA SẺ LEAD trong cơ sở (`Lead.isSharedWithTeam`).
 *
 * Chủ dự án chốt Q8 (21/08): **lead độc quyền tuyệt đối**, bỏ tính năng dùng chung.
 *
 * ⚠️ Đây là ĐẢO quyết định BGĐ câu 10 ký 10/07/2026, và tính năng ĐANG CHẠY PROD.
 * Mặc định **OFF** = chính sách mới có hiệu lực. Gỡ theo 2 pha: ngừng tôn trọng cờ
 * ở tầng đọc + ẩn nút; **GIỮ cột `Lead.isSharedWithTeam` và toàn bộ dữ liệu**.
 *
 * Bật lại = env `LEAD_SHARING_ENABLED="true"` + redeploy. Không revert code, không
 * mất dữ liệu — đây là quyết định CHÍNH SÁCH, mà chính sách thì đổi được.
 */
export function isLeadSharingEnabled(): boolean {
  return process.env.LEAD_SHARING_ENABLED === "true"; // mặc định OFF (đã gỡ)
}
