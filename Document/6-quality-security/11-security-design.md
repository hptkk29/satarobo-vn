# Doc 11 — Security Design

> **Ai đọc:** Toàn team.
> 🔄 **ĐỒNG BỘ DOC 15 (2026-06-06):** doc mô tả security HIỆN TRẠNG (RBAC enum 8 role, grant ALLOW/DENY). Mô hình ĐÍCH từ A0 ở **mục 10** cuối file — khi xung đột, Doc 15 §2/§8/§11 thắng. Lưu ý: phần "DENY > ALLOW" trong mục 2 là hiện trạng 5.3 — **target KHÔNG dùng DENY override**.
> **Cập nhật:** 2026-06-06 · Sinh từ quét `lib/auth*`, `proxy.ts`, validators, Sentry config.

---

## 1. Authentication (AuthN)

| Hạng mục | Triển khai |
|---|---|
| Framework | Auth.js v5 (NextAuth beta.31), `trustHost: true` (multi-domain) |
| Provider | **Credentials only** (email + password) — không OAuth user-facing |
| Password | bcryptjs hash; policy min 8 / max 72 ký tự (bcrypt limit) |
| Session | **JWT cookie** (httpOnly, SameSite=Lax mặc định Auth.js) — không localStorage |
| Session shape | `{ id, role, roles[], centerId, grants[], tokenVersion }` |
| Token invalidation | `User.tokenVersion` — bump khi đổi mật khẩu/khóa user/đổi quyền → token cũ vô hiệu |
| Liveness | Admin layout check DB mỗi request: `tokenVersion`, `isActive`, `deletedAt` → `/login?reason=session-invalidated` |
| Kích hoạt PARENT | OTP flow: `OtpRequest.codeHash` = HMAC-SHA256 (không lưu plain), expiresAt, maxAttempts; `OtpDeliveryLog` |
| Legacy shim | MANAGER→CENTER_MANAGER, SALES→SALES_CSM map trong jwt/session callback |

## 2. Authorization (AuthZ) — 3 tầng

### Tầng 1: Host × Role (middleware — `lib/auth/route-policy.ts`)

| Host | Staff | PARENT | Anonymous |
|---|---|---|---|
| public | ✅ | ✅ | ✅ |
| admin.* | ✅ | redirect portal | `/login` |
| hocvien.* | redirect admin | ✅ | `/login` |

Unit-tested 15+ case (`route-policy.test.ts`). Sửa rule: **chỉ sửa `decideRoute()`** + test.

### Tầng 2: RBAC matrix (`lib/auth/permissions.ts`)

- **8 roles** × **140+ actions** (`<resource>:<verb>`, enum `ALL_ACTIONS` = single source of truth).
- **Multi-role:** `User.roles[]` — quyền = UNION.
- **Per-user grants** (Sprint 5.3): `UserPermissionGrant` ALLOW/DENY. Resolution: `SUPER_ADMIN bypass > DENY > ALLOW > role matrix`.
- Enforcement: `assertCan()` **đầu mọi Server Action/API**; `can()` cho ẩn/hiện UI + per-page gate.

### Tầng 3: Field-level & ownership

| Cơ chế | Quy tắc |
|---|---|
| `getEmployeeFieldVisibility(role)` | basic: all · contact: SA/CM/HR · salary: SA/HR/ACCOUNTANT · personal: SA/HR |
| `canViewParentContact(user)` | SA/CM/ACCOUNTANT/SALES_CSM — **TEACHER bị chặn** (chống lộ SĐT cả lớp) |
| `assertOwnsStudent(studentId)` | Portal: parent chỉ thao tác trên con mình (mọi action + API transcript) |
| Center scope | `User.centerId` giới hạn dữ liệu theo cơ sở (query filter) |

## 3. Input validation & sanitization

| Vector | Biện pháp |
|---|---|
| Mọi input mutation | Zod parse (`unknown` → schema, 23 validators), `""`→`null` |
| SQL injection | Prisma parameterized; ❌ cấm `$queryRawUnsafe` |
| XSS markdown (blog/news) | `react-markdown` + `rehype-sanitize` whitelist (sau `rehype-raw`) |
| `dangerouslySetInnerHTML` | CHỈ JSON-LD scripts (data tự sinh server) |
| Open redirect | `sanitizeCallbackUrl()` — chỉ nhận path nội bộ `/...`, chặn `//`, `http(s)://`, `\` |
| Upload | Whitelist MIME + extension + size per category; presigned URL chỉ sign Content-Type, expires 300s; tên file sanitize + UUID |
| Import Excel | Parse có schema validate từng row, trả `errors[]` không crash |

## 4. Chống abuse (public endpoints)

| Cơ chế | Chi tiết |
|---|---|
| Rate limit | `/api/leads`: 5 req/phút/IP — Upstash Redis (INCR+EXPIRE NX atomic), fallback in-memory; 429 + `Retry-After` |
| Honeypot | Field `website` phải rỗng |
| Time-on-page | < 3s → reject (bot) |
| Dedup | Phone trùng 90 ngày → không tạo lead mới |
| Webhook | Verify token/secret per nguồn (`WEBHOOK_*` — **bắt buộc set trước go-live**, rỗng = stub); idempotent theo `(source, externalId)` |
| Cron | Bearer `CRON_SECRET` |
| OTP | maxAttempts + expiry + hash HMAC |

## 5. CSRF / CORS / Headers

- **CSRF:** Auth.js built-in CSRF token cho auth routes; Server Actions có origin-check built-in của Next.js; cookie SameSite=Lax.
- **CORS:** không mở cross-origin API (same-origin theo host) — webhook là server-to-server POST không cần CORS.
- **SEO defense:** admin host → `X-Robots-Tag: noindex, nofollow, noarchive`; robots.txt disallow `/admin`, `/api`, `/login`.
- **⚠️ Gap:** chưa có CSP / HSTS / X-Frame-Options tùy chỉnh trong `next.config.ts` (Vercel mặc định có HSTS ở edge) — xem §9.

## 6. Secrets & data protection

| Quy tắc | Enforcement |
|---|---|
| Không commit `.env*` (trừ `.env.example`) | **Git hook block** |
| Không commit `*.bak/.backup/.key/.pem` | `.gitignore` |
| Không hardcode credentials | luôn `process.env.X`; secrets sống ở Vercel env |
| Không paste secret vào chat/doc | mask `abc1...xyz9` |
| Sentry không nhận PII | `sendDefaultPii: false` + `beforeSend` strip cookies/auth headers |
| PII phụ huynh/học viên | field-level visibility + audit log truy cập sửa đổi |
| Soft delete | `deletedAt` — dữ liệu không mất, audit được |

## 7. Audit log (Sprint 5.4)

- 8 bảng: User, PermissionGrant, Lead, Class, Student, PaymentMethod, Voucher, Product (+ RoleAuditLog, EnrollmentAuditLog, OrderStatusHistory, TimesheetEditLog).
- Ghi: actor (id + name snapshot), `oldValues/newValues` JSON, `changedFields[]`, metadata `{ip, userAgent}`, `reason?`.
- Viewer `/admin/audit-log` — SUPER_ADMIN, CENTER_MANAGER.

## 8. OWASP Top 10 checklist (trạng thái hiện tại)

| # | Rủi ro | Trạng thái |
|---|---|---|
| A01 Broken Access Control | ✅ 3 tầng (host/RBAC+grants/field+ownership) + liveness |
| A02 Cryptographic Failures | ✅ bcrypt, HMAC OTP, HTTPS Vercel; JWT secret 32B |
| A03 Injection | ✅ Prisma + Zod; cấm raw unsafe |
| A04 Insecure Design | ✅ route-policy unit-tested, ledger bất biến, 2-phase migration |
| A05 Security Misconfiguration | ⚠️ thiếu CSP custom; webhook secret stub ở dev |
| A06 Vulnerable Components | ⚠️ thủ công — nên bật Dependabot/`pnpm audit` trong CI |
| A07 Auth Failures | ✅ tokenVersion, OTP maxAttempts; ⚠️ password chỉ min-8, chưa 2FA, chưa idle timeout |
| A08 Software/Data Integrity | ✅ CI typecheck/lint/build/test; lockfile frozen |
| A09 Logging & Monitoring | ✅ audit 8 domain + Sentry + EmailLog/WebhookDelivery |
| A10 SSRF | ✅ không fetch URL user-supplied (image remote patterns whitelist) |

## 9. Khuyến nghị (backlog bảo mật)

1. **Trước go-live webhook:** set `WEBHOOK_FACEBOOK_SECRET` (verify `X-Hub-Signature-256`), `WEBHOOK_ZALO_SECRET`, `WEBHOOK_GOOGLE_FORM_SECRET`.
2. Thêm `headers()` trong `next.config.ts`: CSP (nới cho GA4/Meta/YouTube), `X-Frame-Options: DENY`, `Referrer-Policy`.
3. Rate limit thêm cho `/login` (chống brute-force) và `/api/admin/import/*`.
4. Password policy mạnh hơn cho staff (độ dài 12+ hoặc zxcvbn) + cân nhắc 2FA cho SUPER_ADMIN/CENTER_MANAGER.
5. `pnpm audit` + Dependabot vào CI.
6. Session idle timeout (maxAge) tường minh cho admin.

## 10. 🔄 TARGET Security Model từ A0 (đồng bộ Doc 15 §2/§8/§11)

### 10.1 Dynamic RBAC (thay enum + matrix hardcode)

- `RoleDef/RolePermission/UserOrgRole` trong DB — **chỉ SUPER_ADMIN** tạo/sửa/xóa role/permission; mọi thay đổi **AuditLog + reason bắt buộc**.
- Multi-role/multi-org: user có nhiều `UserOrgRole` (effectiveFrom/effectiveTo/status).
- **Conflict: ALLOW thắng nếu ≥1 role cho phép — KHÔNG DENY override phase này** (grant DENY 5.3 hiện hữu phải rà soát trước khi cắt sang can() v2).
- **HO role cross-center theo chức năng**: HO_ACCOUNTANT/HO_HR/HO_MARKETING xem+sửa toàn hệ thống theo module; **HO_MARKETING PII tùy permission admin cấp** (PII = SĐT, email, tên PH, tên HS, lịch sử tư vấn); **HO_SALE xem lead scope A&B (mình tạo/giao + kênh HO/ads/Messenger), không sửa**. Không có HO_MANAGER.
- Center isolation enforced bằng `scopedDb`: CS1 ⛔ CS2 (test bắt buộc).
- `EmployeeOrgAssignment` không sinh quyền — chỉ `UserOrgRole`.

### 10.2 Policies vận hành đã chốt (Doc 15 §8/§13)

| Policy | Giá trị chốt |
|---|---|
| Export expiry | File thường **7 ngày** · PII/tài chính/audit **1–3 ngày** (mặc định 3) |
| Export nhạy cảm | Watermark/metadata: exportedBy, userId, exportedAt, orgUnit/scope, reason + audit lại hành động export |
| Session | Staff **24h** · Parent **30 ngày** + OTP/xác thực lại cho thao tác nhạy cảm |
| Media | Private bucket · signed URL **15 phút** · video max 200MB · MIME/size whitelist · object key không chứa tên HS |
| Backup/DR | Supabase backup · **RPO 24h · RTO 4–8h** · restore test monthly |
| Data classification | Public / Internal / Confidential / Restricted — Restricted không export nếu role không đủ quyền |
| AuditLog | Không sửa/xóa qua UI · mask PII khi hiển thị theo quyền · Center chỉ xem audit scope mình |
