# Biến môi trường, cờ tính năng, cron & email — hiện trạng

Phạm vi: đọc mã nguồn nhánh `hptkk29/runhop20_08`. **Không đọc được giá trị thật trên Vercel** —
mọi kết luận dưới đây là từ mã nguồn và `.env.example`. Chính `.env.example:39` ghi rõ các giá trị
trong đó là ảnh chụp của **localhost**, không phải prod.

Quy ước: `DA CO` = có trong mã · `CO GIOI HAN` = có nhưng điều kiện/thiếu · `KHONG CO` = không tìm thấy.

---

## 1. Bảng biến môi trường

Tổng: ~95 biến đọc bằng `process.env.*`. Chia theo nhóm. Cột **Xoay vòng** ghi cách đổi giá trị và
hệ quả; "chưa có quy trình" nghĩa là **không tìm thấy** script/workflow/tài liệu xoay khoá trong repo.

### 1.1 Hạ tầng lõi

| Tên biến | File sử dụng | Phạm vi | Nguồn | Xoay vòng | Rủi ro nếu lộ |
|---|---|---|---|---|---|
| `DATABASE_URL` | `lib/db.ts:11`, `lib/db.ts:14`, `lib/db.ts:29` + ~50 script | server | Vercel env / GitHub secret / `.env` | Đổi mật khẩu Supabase → cập nhật cả Vercel lẫn secret CI. Chưa có script | **RẤT CAO** — toàn bộ DB (học viên, phụ huynh, tiền) |
| `DIRECT_URL` | `scripts/_script-db.ts:25` | server | như trên | như trên | **RẤT CAO** — dùng cho migrate, bỏ qua pooler |
| `NEXTAUTH_SECRET` | `lib/security/signing-key.ts:12` | server | Vercel env | Đổi = **mọi phiên chết + mọi token tự ký chết**. Chưa có quy trình | **RẤT CAO** — 1 khoá gác nhiều cửa: JWT phiên, QR điểm danh, vé SCORM, cookie portal, hash OTP |
| `AUTH_SECRET` | `lib/security/signing-key.ts:12` (fallback) | server | **KHÔNG được đặt** | — | Xem cảnh báo §1.8 |
| `AUTH_TRUST_HOST` | **KHÔNG CÓ CODE NÀO ĐỌC** (`lib/auth.ts:85` hardcode `trustHost: true`) | — | `.env.example:31` | — | Không |
| `NEXTAUTH_URL` | chỉ trong comment `lib/auth.ts:82`; next-auth đọc nội bộ | server | Vercel env | — | Thấp (URL) |
| `AUTH_COOKIE_DOMAIN` | `lib/auth.ts:46`, `app/(admin)/admin/_actions/active-role.ts:20`, `app/(teacher)/teacher/layout.tsx:25` | server | Vercel env | Đổi = đổi tên cookie ⇒ **mọi user re-login 1 lần** (`.env.example:61`) | Thấp — nhưng phải là biến Non-sensitive |
| `CRON_SECRET` | `lib/cron/auth.ts:9`, `app/api/cron/email-queue/route.ts:13`, `app/api/cron/student-birthday/route.ts:31` | server | Vercel env (Vercel tự bơm header) | Đổi trên Vercel + đổi `TEST_CRON_SECRET` cho `cron-pump-test.yml` | **CAO** — chạy được mọi cron (gửi mail hàng loạt, quét dữ liệu) |
| `NODE_ENV` | 17 chỗ; đáng chú ý `lib/lead/webhook.ts:47`, `lib/lead/webhook.ts:94`, `proxy.ts:121` | server | runtime | — | Không — nhưng **quyết định fail-open/fail-closed**, xem §1.8 |
| `NEXT_RUNTIME` | `instrumentation.ts:6`, `:10`, `:22` | server | runtime | — | Không |
| `VERCEL_ENV` / `VERCEL_TARGET_ENV` | `lib/auth.ts:41`, `app/robots.ts:4` | server | Vercel tự bơm | — | Không |
| `LOGIN_RATELIMIT_DISABLED` | `lib/auth.ts:127` | server | Vercel env | Break-glass, phải gỡ ngay sau sự cố | **CAO khi bật** — mở đường brute-force đăng nhập |
| `RETENTION_DAYS` | `lib/compliance/retention.ts:11` | server | Vercel env | — | Thấp |

### 1.2 Storage (Cloudflare R2)

| Tên biến | File sử dụng | Phạm vi | Nguồn | Xoay vòng | Rủi ro nếu lộ |
|---|---|---|---|---|---|
| `R2_ACCOUNT_ID` | `lib/storage/r2-client.ts:16-20` | server | Cloudflare | — | Thấp (định danh) |
| `R2_ACCESS_KEY_ID` | `lib/storage/r2-client.ts:16-20` | server | Cloudflare API token | Tạo token mới → đổi 2 biến → redeploy. Chưa có script | **CAO** |
| `R2_SECRET_ACCESS_KEY` | `lib/storage/r2-client.ts:16-20` | server | Cloudflare | như trên | **RẤT CAO** — đọc/ghi/xoá **cả 2 bucket**, gồm ảnh lớp có trẻ em |
| `R2_BUCKET_NAME` | `lib/storage/r2-client.ts:16-20` | server | Cloudflare | — | Thấp |
| `R2_PUBLIC_URL` | `lib/storage/r2-client.ts:16-20` | server | `cdn.satarobo.vn` | — | Thấp — nhưng bucket này **công khai vô danh** (`.env.example:91-93`) |
| `R2_CHAT_BUCKET_NAME` | `lib/storage/chat-storage.ts:49` | server | Cloudflare | — | Thấp — thiếu/trùng `R2_BUCKET_NAME` thì **fail-closed 503** (`chat-storage.ts:49-65`) |
| `R2_BUCKET`, `R2_PUBLIC_DOMAIN` | **chỉ** `scripts/upload-course-images.ts:33,36` | script | — | — | Thấp — không phải biến runtime, **không có trong `.env.example`** |

### 1.3 Email

| Tên biến | File sử dụng | Phạm vi | Nguồn | Xoay vòng | Rủi ro nếu lộ |
|---|---|---|---|---|---|
| `RESEND_API_KEY` | `lib/email/resend.ts:8` | server | Resend dashboard | Tạo key mới ở Resend + đổi env. Chưa có script | **CAO** — gửi mail mạo danh `@satarobo.vn` |
| `RESEND_FROM_EMAIL` | `lib/email/resend.ts:18` (fallback `onboarding@resend.dev`) | server | Vercel env | — | Thấp |
| `RESEND_REPLY_TO` | `lib/email/resend.ts:22` | server | Vercel env | — | Thấp |
| `CONSULT_NOTIFICATION_TO` | `lib/email/consult-notification.ts:22`, `:30` | server | Vercel env | — | Thấp |
| `EMAIL_FROM` | **KHÔNG CÓ CODE NÀO ĐỌC** (`.env.example:87`) | — | — | — | Không |

### 1.4 Zalo ZNS

| Tên biến | File sử dụng | Phạm vi | Nguồn | Xoay vòng | Rủi ro nếu lộ |
|---|---|---|---|---|---|
| `ZALO_OA_ACCESS_TOKEN` | `lib/zalo/provider.ts:43`, `lib/zalo/token.ts:226` | server | Zalo OA | Tự xoay qua cron `zalo-token-refresh` (6h/lần) | **CAO** — gửi ZNS mạo danh OA |
| `ZALO_OA_REFRESH_TOKEN` | `lib/zalo/token.ts:220`, `:236` | server | Zalo OA (chỉ là **hạt giống**; nguồn thật là DB `IntegrationConfig`) | **Xoay mỗi lần refresh**. Nhân bản sang môi trường 2 = hai bên giết token nhau, OA chết phải OAuth lại tay | **RẤT CAO** |
| `ZALO_APP_ID`, `ZALO_APP_SECRET` | `lib/zalo/provider.ts:44`, `lib/zalo/token.ts:69-70`, `app/api/cron/zalo-token-refresh/route.ts:17` | server | Zalo Developer | — | **CAO** |
| `ZALO_LIVE` | `lib/zalo/provider.ts:97`, `:106`, `app/(admin)/admin/tich-hop/_actions.ts:67` | server | Vercel env — **chỉ là dự phòng** | — | Thấp |
| `ZALO_ZNS_TEMPLATE_ATTENDANCE` | `lib/notify/attendance.ts:20` | server | Zalo (mã mẫu đã duyệt) | — | Thấp |
| `ZALO_ZNS_TEMPLATE_DEBT` | `app/api/cron/debt-reminder/route.ts:11` | server | như trên | — | Thấp |
| `ZALO_ZNS_TEMPLATE_ACCOUNT` | `lib/parents/provision.ts:33`, `lib/email/staff-account.ts:33`, `app/(admin)/admin/students/tai-khoan/_actions.ts:25` | server | như trên | — | Thấp |
| `ZALO_ZNS_TEMPLATE_PAYMENT` | `lib/notify/order.ts:29` | server | như trên | — | Thấp |
| `ZALO_OA_ID`, `ZALO_OA_TOKEN` | **KHÔNG CÓ CODE NÀO ĐỌC** (`.env.example:115`, `:141`) | — | — | — | Không |

> ⚠️ **Công tắc live thật KHÔNG nằm ở env.** `lib/zalo/provider.ts:103-105` đọc
> `SystemSetting("zalo.znsLive")` trước; env `ZALO_LIVE` chỉ là dự phòng. Ai kiểm tra bằng cách
> đọc env sẽ kết luận sai. Chưa bật live ⇒ trả `SIMULATED-<phone>`, không gọi API thật
> (`provider.ts:108-112`).

### 1.5 Thanh toán & kế toán

| Tên biến | File sử dụng | Phạm vi | Nguồn | Xoay vòng | Rủi ro nếu lộ |
|---|---|---|---|---|---|
| `SEPAY_WEBHOOK_API_KEY` | `lib/payments/sepay.ts:204` | server | SePay | Đổi ở SePay + Vercel. Chưa có script | **RẤT CAO** — giả mạo báo có tiền ⇒ đơn tự xác nhận |
| `PAYOS_CLIENT_ID` / `PAYOS_API_KEY` / `PAYOS_CHECKSUM_KEY` | `lib/payments/payos.ts:29`, `:35`, `:39` | server | payOS | — | **RẤT CAO** — `CHECKSUM_KEY` là khoá xác minh webhook |
| `PAYOS_LIVE` | `lib/payments/payos.ts` | server | Vercel env | — | Thấp |
| `MISA_API_URL` / `MISA_CLIENT_ID` / `MISA_CLIENT_SECRET` / `MISA_LIVE` | `lib/misa/service.ts:14`, `:19` | server | MISA | — | **CAO** |
| `MISA_WEBFORM_ID` / `_COMPANYCODE` / `_KEY` / `_REDIRECT` | `lib/lead/intake/misa-mirror.ts:52-54`, `:81` | server | MISA | — | Trung bình |

### 1.6 Meta / tracking / webhook lead

| Tên biến | File sử dụng | Phạm vi | Nguồn | Xoay vòng | Rủi ro nếu lộ |
|---|---|---|---|---|---|
| `META_CAPI_TOKEN` | `lib/tracking.ts:44` | server | Meta Business | — | **CAO** — bơm sự kiện giả vào tài khoản QC |
| `META_APP_SECRET` | `lib/lead/webhook.ts:90`, `app/api/webhooks/meta/messenger/route.ts:41` | server | Meta | — | **CAO** — ký `X-Hub-Signature-256` |
| `META_PAGE_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` | `lib/crm/ads-insights.ts:84-85` | server | Meta | — | **CAO** — đọc chi tiêu QC, trả lời Messenger |
| `GA4_API_SECRET` | `lib/tracking.ts:92` | server | GA4 | — | Trung bình |
| `WEBHOOK_FACEBOOK_SECRET` · `WEBHOOK_ZALO_SECRET` · `WEBHOOK_GOOGLE_FORM_SECRET` · `WEBHOOK_QUATANG_SECRET` | **đọc gián tiếp**: khai ở `lib/lead/webhook.ts:19-24`, đọc ở `lib/lead/webhook.ts:41` (`process.env[envKey]`) | server | tự sinh | — | **CAO** — bơm lead giả |
| `WEBHOOK_FACEBOOK_VERIFY_TOKEN` | `app/api/public/webhook/facebook/route.ts:24`, `app/api/webhooks/meta/messenger/route.ts:17` | server | Meta | — | Trung bình |
| `META_APP_ID`, `META_PAGE_ID` | `META_APP_ID` **KHÔNG CÓ CODE NÀO ĐỌC** (`.env.example:77`) | — | — | — | Không |

> Vì 4 secret webhook đọc qua **map động** `process.env[envKey]`, `grep process.env.WEBHOOK_` sẽ
> **không ra**. Đừng kết luận "không dùng".

### 1.7 Supabase Realtime · Redis · Sentry

| Tên biến | File sử dụng | Phạm vi | Nguồn | Xoay vòng | Rủi ro nếu lộ |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/chat/supabase-client.ts:65`, `lib/chat/broadcast.ts:271` | **client** + server | Supabase | — | Không (URL) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/chat/supabase-client.ts:66` | **client** | Supabase | — | Không **chừng nào RLS còn bật** |
| `SUPABASE_JWT_SECRET` | `lib/chat/realtime-token.ts:86` | **server only** | Supabase | — | **RẤT CAO** — ký JWT HS256 cho mọi client |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/chat/broadcast.ts:272` | **server only** | Supabase | — | **RẤT CAO** — bypass toàn bộ RLS |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | `lib/rate-limit.ts:50`, `:52` | server | Upstash | — | Trung bình |
| `KV_REST_API_URL` / `_TOKEN` | `lib/rate-limit.ts:50`, `:52` (fallback) | server | Vercel KV tự bơm | — | Trung bình |
| `SENTRY_DSN` | `sentry.server.config.ts:6`, `sentry.edge.config.ts:7` | server | Sentry | — | Thấp |
| `NEXT_PUBLIC_SENTRY_DSN` | `instrumentation-client.ts:8` | **client** | Sentry | — | Thấp (DSN thiết kế để công khai) |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | `next.config.ts:134-136` | build-time | Sentry | — | **CAO** cho `AUTH_TOKEN` |

### 1.8 Biến chỉ test/CI/seed (không chạy production)

`TEST_DATABASE_URL` · `CHAT_DB_TEST_ALLOW_REMOTE` · `ADMIN_EMAIL`/`ADMIN_PW` · `PARENT_EMAIL`/`PARENT_PW` ·
`TEACHER_EMAIL`/`TEACHER_PW` · `CS1_EMAIL`/`CS1_PW` · `BASE_URL` · `ADMIN_BASE_URL` · `ACCEPT_*` ·
`*_SKIP_WEBSERVER` · `TEACHER_E2E_PORT` · `ELEARNING_E2E_PORT` · `TEACHER_THEME` · `PORTAL_THEME` ·
`VIEWPORT` · `CI` · `ZZ_TTL_X` · `ZZ_SKIP_LO1` · `ZZ_SKIP_LO4` ·
`SEED_SCALE`/`SEED_PASSWORD`/`SEED_MODULES`/`SEED_ALLOW_REMOTE` (`prisma/seed-lms/_config.ts:59,62,68`) ·
`MIGRATE_CONFIRM` (`scripts/migrate-chat-cu-sang-moi.ts:176`) · `SHADOW_WINDOW_DAYS` (`scripts/shadow-report.ts:21`) ·
`OTP_TEST_FIXED_CODE` (`lib/otp/service.ts:49`, `:62` — chỉ khi `NODE_ENV !== "production"`).

### 1.9 Cảnh báo về biến

1. **`AUTH_SECRET` là mìn.** `.env.example:25-28` cảnh báo: `next-auth` đọc `AUTH_SECRET ?? NEXTAUTH_SECRET`
   — **AUTH_SECRET thắng**, chỉ cần tồn tại với giá trị khác là **mọi phiên chết ngay, không một dòng
   cảnh báo** (sự cố 22/07→04/08/2026). Nhưng `lib/security/signing-key.ts:12` lại đọc theo thứ tự
   **ngược** (`NEXTAUTH_SECRET ?? AUTH_SECRET`). Hai thành phần ưu tiên khác nhau trên cùng cặp biến.
2. **6 biến khai trong `.env.example` nhưng KHÔNG CÓ CODE NÀO ĐỌC** — đặt giá trị vào là vô nghĩa:
   `META_APP_ID` (:77) · `EMAIL_FROM` (:87) · `ZALO_OA_ID` (:115) · `ZALO_OA_TOKEN` (:141) ·
   `AUTH_TRUST_HOST` (:31) · `META_PAGE_ID` (:79).
3. **10 biến CÓ trong code nhưng KHÔNG có trong `.env.example`** — người dựng môi trường mới sẽ bỏ sót:
   `TEACHER_SITE_ENABLED` · `ELEARNING_ENABLED` · `CLASS_GROUP_ENABLED` · `CENTER_CHECKLIST_ENABLED` ·
   `PAYMENT_LEDGER_V2` · `LOGIN_RATELIMIT_DISABLED` · `OTP_TEST_FIXED_CODE` · `R2_BUCKET` ·
   `R2_PUBLIC_DOMAIN` · `AUTH_SECRET` (cố ý không khai).
4. **`NODE_ENV` quyết định an ninh, không chỉ log.** `lib/lead/webhook.ts:44-56` và `:92-104` chỉ
   fail-closed khi `NODE_ENV === "production"`. Môi trường nào không đặt đúng ⇒ thiếu secret webhook =
   **cho qua**, chỉ `console.warn`.
5. **`.gitignore:37` chặn `.env*`, chỉ `!.env.example` được commit** — đúng luật CLAUDE.md §8.

---

## 2. Có bí mật nào bị đóng gói xuống client không?

**KHÔNG.** Xác nhận bằng cách soi toàn bộ `NEXT_PUBLIC_*` — đúng **8 biến**, không biến nào là secret:

| Biến | File | Bản chất | Có phải secret? |
|---|---|---|---|
| `NEXT_PUBLIC_APP_URL` | `app/layout.tsx:17`, `lib/payments/payos.ts:265` | URL gốc | Không |
| `NEXT_PUBLIC_GA4_ID` | `components/public/ga4.tsx:14`, `lib/tracking.ts:91` | ID đo lường công khai | Không |
| `NEXT_PUBLIC_META_PIXEL_ID` | `components/public/meta-pixel.tsx:14`, `lib/tracking.ts:43` | Pixel ID công khai | Không |
| `NEXT_PUBLIC_SENTRY_DSN` | `instrumentation-client.ts:8` | DSN — Sentry thiết kế để lộ | Không |
| `NEXT_PUBLIC_SUPABASE_URL` | `lib/chat/supabase-client.ts:65` | URL | Không |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `lib/chat/supabase-client.ts:66` | anon key — chặn bằng RLS | Không |
| `NEXT_PUBLIC_COMMON_LOGIN` | `lib/auth/logout-client.ts:32` | cờ bật/tắt | Không |
| `NEXT_PUBLIC_LOGIN_URL` | `lib/auth/logout-client.ts:21` | URL override | Không |

**Ba lớp bảo vệ đang thật sự chạy:**

1. **Tách biến có chủ đích.** Cặp secret của Supabase để server-only và có ghi chú cấm:
   `.env.example:229-231` — *"2 biến dưới là SERVER ONLY, TUYỆT ĐỐI không NEXT_PUBLIC_"*. Thực tế
   `SUPABASE_JWT_SECRET` chỉ đọc ở `lib/chat/realtime-token.ts:86`, `SUPABASE_SERVICE_ROLE_KEY` chỉ ở
   `lib/chat/broadcast.ts:272`. Tương tự `META_CAPI_TOKEN` / `GA4_API_SECRET` nằm cạnh ID công khai
   nhưng **không** mang tiền tố `NEXT_PUBLIC_` (`lib/tracking.ts:43-44`, `:91-92`).
2. **`import "server-only"`** ở `broadcast.ts` / `realtime-token.ts` / `chat-storage.ts` — bắt lỗi import
   từ Client Component.
3. **Canary quét bundle client — ĐANG CHẠY TRONG CI.** `scripts/canary-client-bundle-keys.mjs` giải mã
   mọi JWT trong `.next/static` và soi trường `role`; `anon` hợp lệ, `service_role` là sự cố. Nó cũng
   bắt khoá đời mới `sb_secret_<≥20 ký tự>`. Được gọi tại **`.github/workflows/ci.yml:96`**.
   > Đính chính một nhận định phổ biến: canary này **không phải** "đã viết nhưng chưa nối" — đã nối vào CI.
   > Comment ở đầu file (`:3-5`) mô tả tình trạng *ngày 09/08/2026*, không còn đúng với `ci.yml` hiện tại.

**Màn `/admin/settings` có in biến môi trường ra màn hình** (`app/(admin)/admin/settings/page.tsx:102-104`)
nhưng chỉ hiện `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_META_PIXEL_ID`, `NEXT_PUBLIC_GA4_ID` + `NODE_ENV`,
và bọc trong `{superAdmin && ...}`. Không rò secret.

**Điểm cần canh (chưa phải lỗ hổng):** `NEXT_PUBLIC_SUPABASE_ANON_KEY` chỉ an toàn khi RLS còn bật trên
các bảng realtime. `lib/chat/supabase-client.ts:50` có cảnh báo đừng khôi phục hàm `setRealtimeAuth(jwt)`.

---

## 3. Cờ tính năng (`lib/flags.ts`)

18 cờ. Cột "Mặc định trong mã" là hành vi khi **không đặt env**.

| Hàm | Env | Mặc định trong mã | Kiểu đọc | Hậu quả khi BẬT / TẮT |
|---|---|---|---|---|
| `isRbacV2Enabled` `:7-9` | `RBAC_V2_ENABLED` | **OFF** | `=== "true"` | ON: quyền đo bằng `can()` v2 động từ DB. OFF: ma trận tĩnh v1 (`lib/auth/permissions.ts`). **CLAUDE.md khẳng định prod đang ON — không kiểm chứng được từ repo** |
| `isScopeShadowEnabled` `:21-23` | `SCOPE_SHADOW_ENABLED` | **OFF** | `=== "true"` | ON: ghi `ScopeShadowDiff`, **không đổi quyền**, chỉ thêm tải ghi DB. ⚠️ Hàm này **không có consumer**; env lại được đọc **trực tiếp** ở `instrumentation.ts:22` ⇒ hàm chết, biến sống |
| `isZnsDegraded` `:31-33` | `AUTH_ZNS_DEGRADED` | **OFF** | `=== "true"` | ON: OTP tới SĐT bỏ Zalo, đi thẳng email. **Phụ huynh không có email sẽ KHÔNG nhận được mã** |
| `isCommonLoginEnabled` `:36-38` | `COMMON_LOGIN_ENABLED` | **ON** | `!== "false"` | ⚠️ **KHÔNG có consumer nào ngoài flags.ts + test** |
| `isCommonLoginAtRootEnabled` `:49-51` | `COMMON_LOGIN_AT_ROOT` | **OFF** | `=== "true"` | ON: `satarobo.vn/login` serve form thật thay vì 308. **Chỉ bật SAU khi `AUTH_COOKIE_DOMAIN` đã bật**, không thì mất session |
| `isDispatcherEnabled` `:54-56` | `DISPATCHER_ENABLED` | **ON** | `!== "false"` | OFF: `DomainEvent` **vẫn tích PENDING**, không mất, nhưng không ai xử lý |
| `isConvertV2Enabled` `:63-65` | `CONVERT_V2_ENABLED` | **ON** | `!== "false"` | v2 là entry point duy nhất; `false` chỉ để tắt khẩn cấp |
| `isSessionLifecycleV2Enabled` `:72-74` | `SESSION_LIFECYCLE_V2` | **OFF** | `=== "true"` | ON: "Hoàn tất buổi" state machine + event `session.taught`. OFF: checklist 9 mục cũ |
| `isMediaSignedUrlEnabled` `:80-82` | `MEDIA_SIGNED_URL` | **OFF** | `=== "true"` | ⚠️ OFF nghĩa là **ảnh lớp vẫn là URL công khai trên `cdn.satarobo.vn`**, ai có link đều tải được |
| `isEvalV2Enabled` `:88-90` | `EVAL_V2_ENABLED` | **OFF** | `=== "true"` | Gate menu đánh giá GV + khảo sát trung tâm |
| `isScormEnabled` `:96-98` | `SCORM_ENABLED` | **OFF** | `=== "true"` | Gate menu + route `/admin/scorm` + api asset. `.env.example:43` ghi local đang bật |
| `isPortalV2Enabled` `:104-106` | `PORTAL_V2_ENABLED` | **OFF** | `=== "true"` | Portal phụ huynh v2 chạy song song portal cũ |
| `isTeacherSiteEnabled` `:117-124` | `TEACHER_SITE_ENABLED` | **ON** (flip 10/07/2026) | `!== "false"` | ON: `giaovien.satarobo.vn` phục vụ site GV; **GV thuần đăng nhập admin bị đẩy sang site GV**. Rollback = đặt `"false"` + redeploy |
| `isAuthPhoneProvisioningEnabled` `:144-146` | `AUTH_PHONE_PROVISIONING` | **ON** | `!== "false"` | OFF: ngắt **đường tự động** cấp tài khoản PH theo SĐT. ⚠️ **KHÔNG chắn form nhân viên tự bấm** — cố ý |
| `isPaymentLedgerV2Enabled` `:168-170` | `PAYMENT_LEDGER_V2` | **OFF** | `=== "true"` | ⚠️ `flags.ts:164` tự ghi: *"Cờ mới khai — CHƯA nối vào màn nào. Bật lúc này KHÔNG đổi hành vi"* |
| `isClassGroupEnabled` `:186-188` | `CLASS_GROUP_ENABLED` | **OFF** | `=== "true"` | **Cờ GỠ, ngược chiều mọi cờ khác**: OFF = ẩn Nhóm lớp (hành vi mong muốn từ 20/08). Không đụng schema |
| `isCenterChecklistEnabled` `:201-203` | `CENTER_CHECKLIST_ENABLED` | **OFF** | `=== "true"` | **Cờ GỠ**: OFF = ẩn Checklist cơ sở. Bảng `CenterDayChecklist` giữ nguyên dữ liệu |
| `isElearningEnabled` `:220-222` | `ELEARNING_ENABLED` | **OFF** | `=== "true"` | OFF: host `e-learning.satarobo.vn` bounce về khu người dùng, **0 byte HTML e-learning** được phục vụ |

**Quy tắc đọc chuỗi** (`flags.ts:212-215`): với kiểu `=== "true"` thì `unset` · `"1"` · `"TRUE"` · `"yes"`
đều ra **false**; chỉ đúng chuỗi `"true"` mới bật.

**Giá trị thực tế trên prod: KHÔNG ĐỌC ĐƯỢC TỪ REPO.** `.env.example:42-51` chỉ là ảnh chụp localhost:
`PORTAL_V2=true` · `SCORM=true` · `EVAL_V2=false` · `SESSION_LIFECYCLE_V2=false` · `MEDIA_SIGNED_URL=false` ·
`RBAC_V2=false` · `SCOPE_SHADOW=false` · `CONVERT_V2=true` · `COMMON_LOGIN=true` · `DISPATCHER=true`.
Nguồn duy nhất trong repo nói về prod là comment `.github/workflows/seed-prod-roles.yml:13`
(`RBAC_V2_ENABLED="true"`, xác minh 29/07/2026) — đó là **tài liệu, không phải cấu hình chạy**.

**Ba cờ không có consumer** (đừng suy tính năng từ danh sách cờ): `isCommonLoginEnabled`,
`isScopeShadowEnabled`, `isPaymentLedgerV2Enabled`. `isMediaSignedUrlEnabled` chỉ 1 file dùng.

---

## 4. Checklist trước go-live

### 4.1 Bí mật & cấu hình

- [ ] `AUTH_SECRET` **KHÔNG tồn tại** ở bất kỳ môi trường nào (Vercel: Production/Preview/Development).
      Có mặt = mọi phiên chết ngay, không cảnh báo (`.env.example:25-28`).
- [ ] `NEXTAUTH_SECRET` ≥ 32 ký tự (`lib/security/signing-key.ts:13` throw nếu ngắn hơn) và **giống nhau**
      giữa các deployment cùng môi trường.
- [ ] `AUTH_COOKIE_DOMAIN` đặt là biến **Non-sensitive** trên Vercel (middleware/edge cần đọc).
- [ ] `CRON_SECRET` có mặt. **Thiếu = mọi cron bị từ chối 401 im lặng** (`lib/cron/auth.ts:10-13`).
- [ ] `UPSTASH_REDIS_REST_URL`/`_TOKEN` (hoặc `KV_*`) có mặt. Thiếu ⇒ rate-limit rơi về Map trong bộ nhớ
      **per-instance**, tức chống brute-force đăng nhập chỉ còn trang trí (`lib/rate-limit.ts:143-146`).
- [ ] `LOGIN_RATELIMIT_DISABLED` **không** được đặt.
- [ ] `NODE_ENV=production` trên mọi môi trường thật — quyết định fail-closed của webhook lead.
- [ ] `SEPAY_WEBHOOK_API_KEY` có mặt (thiếu = từ chối tất cả, an toàn nhưng mất doanh thu tự động).
- [ ] `PAYOS_CHECKSUM_KEY` có mặt. **Thiếu = chấp nhận payload webhook không chữ ký** (`lib/payments/payos.ts:165-168`).
- [ ] `R2_CHAT_BUCKET_NAME` khác `R2_BUCKET_NAME` (guard `lib/storage/chat-storage.ts:57-64` sẽ throw nếu trùng,
      nhưng kiểm trước để không 503 giữa giờ dạy).
- [ ] `ZALO_OA_REFRESH_TOKEN` **chỉ có ở đúng 1 môi trường**. Nhân bản = hai môi trường giết token nhau.
- [ ] Không có secret nào mang tiền tố `NEXT_PUBLIC_` (xem §2).

### 4.2 Cờ tính năng

- [ ] Chốt bằng văn bản giá trị mong muốn của **18 cờ** cho môi trường prod, đặc biệt `RBAC_V2_ENABLED`.
- [ ] Nhớ 10 biến **không có trong `.env.example`** (§1.9 mục 3) — dựng môi trường mới bằng cách chép
      `.env.example` sẽ **thiếu** chúng.
- [ ] Nếu bật `COMMON_LOGIN_AT_ROOT` thì `AUTH_COOKIE_DOMAIN` phải bật **trước**.

### 4.3 Cổng kiểm tra

- [ ] `pnpm typecheck && pnpm lint && pnpm build` PASS (CLAUDE.md §9).
- [ ] Canary bundle client xanh: `node scripts/canary-client-bundle-keys.mjs` (`.github/workflows/ci.yml:96`).
- [ ] Sau khi thêm permission key mới: chạy `.github/workflows/seed-prod-roles.yml` — nếu prod chạy RBAC v2,
      key chưa seed = tính năng trắng trơn, **không báo lỗi**.
- [ ] Migration prod: chỉ qua `deploy.yml` (merge `test` → `main`), không chạy tay.

### 4.4 Sau khi deploy

- [ ] Gọi thử 1 cron với `Authorization: Bearer <CRON_SECRET>` — 200 chứ không 401.
- [ ] Kiểm `DomainEvent` không tích PENDING (dấu hiệu `DISPATCHER_ENABLED=false` hoặc cron chết).
- [ ] Kiểm `EmailQueue` có bản ghi chuyển `PENDING → SENT`.
- [ ] Kiểm ZNS: `SystemSetting("zalo.znsLive")` — **không** kiểm bằng env `ZALO_LIVE`.
- [ ] Đọc log Sentry 15 phút đầu (`SENTRY_DSN` server + edge).

---

## 5. Công việc định kỳ (cron)

Nguồn: `vercel.json` (23 mục) và `app/api/cron/` (23 thư mục) — **khớp 1-1, không có cron mồ côi và
không có endpoint cron nào chưa đăng ký**. Region `hnd1` (`vercel.json:1`).

**Lịch trong `vercel.json` là giờ UTC.** Việt Nam = UTC+7.

| Job | Lịch (UTC) | ≈ giờ VN | Endpoint | Xác thực | Idempotent |
|---|---|---|---|---|---|
| dispatch-events | `* * * * *` | mỗi phút | `/api/cron/dispatch-events` | `verifyCronAuth` | **CÓ** — `reapStuckEvents` + trạng thái PENDING/PROCESSING + `attempts` |
| email-queue | `*/5 * * * *` | mỗi 5' | `/api/cron/email-queue` | `CRON_SECRET` **HOẶC** phiên admin có `emails:view` (`route.ts:12-20`) | **CÓ** — hàng đợi có trạng thái; `limit` bị kẹp 1..100 (`route.ts:29-30`) |
| sla-check | `*/15 * * * *` | mỗi 15' | `/api/cron/sla-check` | `withCron` | CÓ dấu hiệu chống lặp — chưa đọc tận cùng |
| chat-zns-notify | `*/30 * * * *` | mỗi 30' | `/api/cron/chat-zns-notify` | `withCron` | CHƯA KIỂM CHỨNG. Kill-switch ở `SystemSetting("chat.znsNotifyEnabled")`, **không ở cron** |
| parent-request-reminder | `0 * * * *` | mỗi giờ | `/api/cron/parent-request-reminder` | `verifyCronAuth` | CHƯA KIỂM CHỨNG |
| lead-intake-health | `35 * * * *` | mỗi giờ, phút 35 | `/api/cron/lead-intake-health` | `withCron` | CHƯA KIỂM CHỨNG (chỉ đo, không ghi nghiệp vụ) |
| zalo-token-refresh | `0 */6 * * *` | 6h/lần | `/api/cron/zalo-token-refresh` | `verifyCronAuth` | **CÓ** — `refreshLocked` + kiểm còn hạn trước khi gọi mạng (`lib/zalo/token.ts:212-214`) |
| substitute-teacher-notify | `0 0 * * *` | 07:00 | `/api/cron/substitute-teacher-notify` | `verifyCronAuth` | CHƯA KIỂM CHỨNG |
| class-reminder | `0 1 * * *` | 08:00 | `/api/cron/class-reminder` | `verifyCronAuth` | **CÓ** — `wasReminderSent(...)` (`route.ts:92-97`) |
| student-birthday | `0 1 * * *` | 08:00 | `/api/cron/student-birthday` | `CRON_SECRET` **HOẶC** phiên admin có `students:edit` (`route.ts:30-38`) | CHƯA KIỂM CHỨNG |
| renewal-reminder | `0 2 * * *` | 09:00 | `/api/cron/renewal-reminder` | `verifyCronAuth` | CÓ dấu hiệu chống lặp |
| marketing-alerts | `0 2 * * *` | 09:00 | `/api/cron/marketing-alerts` | `withCron` | CHƯA KIỂM CHỨNG |
| debt-reminder | `0 3 * * *` | 10:00 | `/api/cron/debt-reminder` | `verifyCronAuth` | CÓ dấu hiệu chống lặp |
| order-debt-reminder | `0 4 * * *` | 11:00 | `/api/cron/order-debt-reminder` | `verifyCronAuth` | CHƯA KIỂM CHỨNG |
| assignment-due-soon | `0 5 * * *` | 12:00 | `/api/cron/assignment-due-soon` | `verifyCronAuth` | CÓ dấu hiệu chống lặp |
| reserve-expiry | `0 6 * * *` | 13:00 | `/api/cron/reserve-expiry` | `verifyCronAuth` | CÓ dấu hiệu chống lặp |
| retention-scan | `0 7 * * 1` | 14:00 **thứ Hai** | `/api/cron/retention-scan` | `verifyCronAuth` | CHƯA KIỂM CHỨNG |
| otp-cleanup | `0 8 * * *` | 15:00 | `/api/cron/otp-cleanup` | `verifyCronAuth` | Xoá bản ghi hết hạn — bản chất idempotent |
| session-close-reminder | `0 13 * * *` | 20:00 | `/api/cron/session-close-reminder` | `verifyCronAuth` | CHƯA KIỂM CHỨNG |
| payment-reconcile | `0 15 * * *` | 22:00 | `/api/cron/payment-reconcile` | `withCron` | **CHỈ ĐỌC + thông báo**, không ghi tiền |
| class-schedule-sync | `10 17 * * *` | 00:10 | `/api/cron/class-schedule-sync` | `verifyCronAuth` | CHƯA KIỂM CHỨNG |
| chat-membership-reconcile | `0 19 * * *` | 02:00 | `/api/cron/chat-membership-reconcile` | `withCron` | CHƯA KIỂM CHỨNG |
| orgunit-drift | `0 20 * * *` | 03:00 | `/api/cron/orgunit-drift` | `withCron` | **CHỈ ĐỌC**, không tự sửa dữ liệu |

**Hai lớp xác thực, cùng một secret:**
- `verifyCronAuth(req)` (`lib/cron/auth.ts:8-16`): so `Authorization` với `Bearer ${CRON_SECRET}` bằng
  `safeEqual` (timing-safe). **Thiếu `CRON_SECRET` ⇒ từ chối TẤT CẢ** (`:10-13`).
- `withCron(name, handler)` (`lib/cron/handler.ts:8-29`): gọi cùng `verifyCronAuth`, thêm try/catch trả JSON
  có cấu trúc + `Cache-Control: no-store`. Dùng ở 7 route.

**Môi trường `test` không có Vercel Cron** — `.github/workflows/cron-pump-test.yml` bơm `dispatch-events`
+ `email-queue` mỗi 5 phút bằng `TEST_CRON_SECRET`. Đỏ 401 = lệch secret.

**Bẫy lịch sử đã vá, đừng làm sống lại:** `proxy.ts:122-131` ghi lại sự cố mọi cron chết im vì Vercel Cron
gọi vào URL `.vercel.app`, bị 308 sang host thật và **header `Authorization` rụng khi đổi host** ⇒ handler
không bao giờ chạy, `DomainEvent` tích 285 dòng PENDING với `attempts=0`, không log gì. Vá bằng
`isInfraPath()` cho `/api/*` đi thẳng ở nhánh canonical (`proxy.ts:132`).

---

## 6. Email & thông báo

### 6.1 Đường email: hàng đợi → worker → nhà cung cấp

```
Nghiệp vụ  ──enqueueEmail()──►  EmailQueue (status=PENDING)
                                      │
              cron */5' ─────────────► processEmailQueue(limit)
                                      │  renderTemplate() ← EmailTemplate.code
                                      ▼
                                  sendEmail()  ──►  Resend API
                                      │
                        OK → SENT   │   Lỗi → attempts++ (giữ PENDING, retry)
                                    │            vượt maxAttempts → FAILED
```

| Mắt xích | File:dòng | Ghi chú |
|---|---|---|
| Đẩy vào hàng đợi | `lib/email/queue.ts:29-46` `enqueueEmail()` | **Chỉ tạo bản ghi PENDING, KHÔNG gửi**. An toàn gọi trong/ngoài transaction |
| Worker | `lib/email/queue.ts:59` `processEmailQueue(limit = 25)` | Lấy PENDING đến hạn, render + gửi |
| Endpoint chạy worker | `app/api/cron/email-queue/route.ts:22-33` | `CRON_SECRET` **hoặc** phiên admin `emails:view`; `limit` kẹp 1..100 |
| Render template | `lib/email/render.ts` (qua `EmailTemplate.code`) | Fallback inline `subject`/`bodyText`/`bodyHtml` với `{{var}}` |
| Gửi | `lib/email/send.ts` → `lib/email/resend.ts` | |
| Client Resend | `lib/email/resend.ts:7-15` | ⚠️ **Thiếu `RESEND_API_KEY` = no-op, chỉ `console.warn`** — hỏng không có triệu chứng |

Biến liên quan: `RESEND_API_KEY` · `RESEND_FROM_EMAIL` (fallback `Sata Robo <onboarding@resend.dev>`) ·
`RESEND_REPLY_TO` · `CONSULT_NOTIFICATION_TO`. `EMAIL_FROM` khai trong `.env.example:87` nhưng
**không có code nào đọc**.

Các file phát email khác: `lib/email/trigger.ts` · `triggers.ts` · `reminder-helpers.ts` ·
`progress-report.ts` · `staff-account.ts` · `consult-notification.ts` · `template-codes.ts` · `sample-vars.ts`.

**Kẹp trần `limit`** (`route.ts:24-30`) là bản vá 10/08 sau sự cố: trước đó `?limit=100000` vét sạch hàng đợi
trong một nhịp, mà route này nhận **cả phiên admin**, nên bấm nhầm là cả đống thư cũ bay ra khách cùng lúc.

### 6.2 Đường Zalo ZNS

```
Nghiệp vụ ──► znsProvider.send()  ──► getSetting("zalo.znsLive")
                                            │
              live = false ────────────────► trả "SIMULATED-<phone>", KHÔNG gọi API
              live = true  ────────────────► getValidZaloAccessToken() ──► POST ZNS
                                                    │ lỗi auth → forceRefreshZaloToken() → thử lại 1 lần
```

| Mắt xích | File:dòng |
|---|---|
| Provider | `lib/zalo/provider.ts:90-120` |
| Kiểm cấu hình | `lib/zalo/provider.ts:41-47` `hasCredentials()` — đủ khi có token tĩnh **hoặc** đủ bộ refresh |
| Công tắc live | `lib/zalo/provider.ts:103-105` — **`SystemSetting("zalo.znsLive")` thắng env `ZALO_LIVE`**; lỗi đọc DB ⇒ coi như không live |
| Token store | `lib/zalo/token.ts:47-57` — lưu vào **DB `IntegrationConfig`**, env chỉ là hạt giống (`:219-220`) |
| Cron xoay token | `app/api/cron/zalo-token-refresh/route.ts`, 6h/lần |
| Mã mẫu ZNS | 4 biến `ZALO_ZNS_TEMPLATE_*` (§1.4) |
| Break-glass | `lib/flags.ts:31-33` `AUTH_ZNS_DEGRADED` — OTP đi thẳng email; **PH không có email sẽ không nhận được mã** |

Nơi gửi: `lib/notify/attendance.ts` (điểm danh) · `lib/notify/order.ts` (thanh toán) ·
`app/api/cron/debt-reminder/route.ts` (công nợ) · `lib/parents/provision.ts` + `lib/email/staff-account.ts`
+ `app/(admin)/admin/students/tai-khoan/_actions.ts` (cấp tài khoản) · `app/api/cron/chat-zns-notify` (tin chat).

**Điểm mù cố hữu (CLAUDE.md §Workflow):** ZNS thật **không test được** trên môi trường `test` — creds Zalo chỉ
ở scope Production và cấm nhân bản `ZALO_OA_REFRESH_TOKEN`. Trên `test` ZNS luôn `SIMULATED`; khâu gửi tin
thật chỉ smoke được trên prod sau merge.

### 6.3 Thông báo trong ứng dụng

Model `Notification` (thuộc `SCOPED_MODELS`, `lib/db-scope.ts`), đọc qua
`/api/notifications`, `/api/notifications/summary`, `/api/admin/notifications/bell` — cả ba đều `auth()` đầu
hàm. Không dùng biến môi trường riêng.

---

## 7. Mâu thuẫn & nợ kỹ thuật đã xác nhận

| # | Vấn đề | Bằng chứng |
|---|---|---|
| 1 | **JWT mang role/scope/grant** — vi phạm luật cứng Nền Hệ thống #6 ở tầng khai báo. Prod (v2) đọc lại từ DB nên không phải nguồn quyết định, nhưng v1 (local/dev/CI) **ăn thẳng JWT** | `lib/auth.ts:203-213`; `lib/auth/permissions.ts:764`, `:793-794`; `lib/auth/actor.ts:400-449`, `:535` |
| 2 | **Bất đối xứng DENY**: v1 tôn trọng `grant=DENY`, v2 **bỏ qua im lặng** (không tồn tại `grantsDeny`) | `lib/auth/permissions.ts:793-794` vs `lib/auth/actor.ts:367-369`, `lib/auth/can.ts` |
| 3 | **Webhook lead fail-OPEN ngoài production**: thiếu secret = cho qua, chỉ `console.warn` | `lib/lead/webhook.ts:44-56`, `:92-104` |
| 4 | **payOS thiếu `PAYOS_CHECKSUM_KEY` = nhận payload không chữ ký** (chế độ mô phỏng), trái triết lý fail-closed của SePay | `lib/payments/payos.ts:165-168` vs `lib/payments/sepay.ts:205-210` |
| 5 | **Rate-limit fail-soft về Map per-instance** khi thiếu Upstash/KV — chống brute-force đăng nhập thành trang trí | `lib/rate-limit.ts:143-146` |
| 6 | **CSP đang là `Content-Security-Policy-Report-Only`** — mọi vi phạm chỉ hiện console, không chặn | `next.config.ts` (khối securityHeaders) |
| 7 | **1 credential R2 cho cả bucket công khai lẫn bucket ảnh trẻ em** | `lib/storage/r2-client.ts:16-20` dùng chung bởi `lib/storage/chat-storage.ts` |
| 8 | **`MEDIA_SIGNED_URL` mặc định OFF** ⇒ ảnh lớp mặc định vẫn là URL công khai trên CDN | `lib/flags.ts:80-82` |
| 9 | **`.env.example` lệch với code hai chiều**: 6 biến thừa, 10 biến thiếu | §1.9 |
| 10 | **Không xác minh được giá trị env prod từ repo** — mọi kết luận về prod phải kiểm bằng `vercel env pull` | — |
