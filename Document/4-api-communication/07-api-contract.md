# Doc 7 — API Contract

> **Ai đọc:** Cả team — "bản hợp đồng" giữa FE và BE.
> **Lưu ý kiến trúc:** Phần lớn FE↔BE đi qua **Server Actions** (type-safe end-to-end, không cần contract HTTP). Doc này cover (a) HTTP API routes thật và (b) quy ước chung của Server Actions.
> 🔄 **ĐỒNG BỘ DOC 15 (2026-06-06):** từ A0 áp dụng **chuẩn response/error mới + API Identity/Org** — xem **mục 9** cuối file. API hiện hữu giữ shape cũ tới khi chạm vào (boy-scout). Khi xung đột, Doc 15 §13.5 thắng.
> **Cập nhật:** 2026-06-06.

---

## 1. Quy ước chung

| Hạng mục | Quy ước |
|---|---|
| Base URL | `https://satarobo.vn` (public) · API admin/portal gọi same-origin theo host |
| Versioning | Không dùng `/api/v1` — monolith + Server Actions nên version theo deploy. Webhook giữ backward-compat theo `source` |
| Auth | Session cookie JWT (Auth.js v5) — không Bearer token cho user. Cron: `Authorization: Bearer {CRON_SECRET}`. Webhook: verify token/secret per nguồn |
| Content-Type | `application/json` trừ upload (`multipart/form-data`) và export (binary PDF/XLSX/CSV) |
| Error shape (JSON API) | `{ ok: false, error: string }` + HTTP status đúng nghĩa |
| Error codes | 400 validate · 401 chưa đăng nhập · 403 thiếu quyền · 404 · 413 file quá lớn · 429 rate limit (`Retry-After`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`) · 500 |
| Server Action result | `{ ok: true, ...data }` \| `{ ok: false, error }` — không throw |

## 2. Public APIs

### POST `/api/leads` — Lead capture (KHÔNG auth)

Rate limit **5 req/phút/IP**. Honeypot `website` phải rỗng; `timeOnPage ≥ 3s`.

```jsonc
// Request (leadCreateSchema — lib/validators/lead.ts)
{
  "parentName": "string (bắt buộc)",
  "phone": "0xxxxxxxxx | +84xxxxxxxxx (regex VN)",
  "email": "string? (email)",
  "childName": "string?",
  "childAge": "number?",
  "source": "string? (course slug / campaign)",
  "centerId": "string?",
  "utmSource": "string?", "utmMedium": "string?", "utmCampaign": "string?",
  "fbclid": "string?", "gclid": "string?",
  "website": "PHẢI RỖNG (honeypot)",
  "timeOnPage": "number (giây)"
}
// 200
{ "ok": true, "leadId": "clxxx" }
// 200 (trùng phone 90 ngày)
{ "ok": true, "leadId": "<lead cũ>", "duplicate": true }
// 429
{ "ok": false, "error": "Quá nhiều yêu cầu..." }
```

Side effects: auto-assign sale theo center config, gửi consult notification, bắn Meta CAPI + GA4 MP (fire-and-forget).

### Webhooks nguồn lead — `/api/public/webhook/{facebook|zalo|google-form}`

- `GET`: verify challenge (FB `hub.verify_token`).
- `POST`: payload nguồn → lưu `WebhookDelivery` (idempotent theo `source+externalId`) → parse thành Lead.
- Auth: `WEBHOOK_*_SECRET` / verify token (rỗng = stub mode dev).
- Response: `{ ok: true | false }`.

## 3. Admin APIs (session staff + role check)

### Upload (R2 presigned)

| Route | Method | Body | Response |
|---|---|---|---|
| `/api/admin/upload-url` | POST | `{ category: "image"\|"document"\|"video"\|"audio"\|"archive", fileName, mimeType, fileSize }` | `{ uploadUrl (PUT, expires 300s), publicUrl, key }` |
| `/api/admin/upload` | POST | `multipart { file, category }` (proxy fallback) | `{ publicUrl, key }` |
| `/api/admin/upload-delete` | POST | `{ keys: string[] }` | `{ deleted: number }` |

Roles: SUPER_ADMIN, CENTER_MANAGER, MARKETING, TEACHER. Validate mime/extension/size theo `lib/storage/upload-config.ts` (400/413).

### Import Excel — `POST /api/admin/import/{resource}`

`resource ∈ students, classes, centers, employees, holidays, rooms, questions, leads, inventory-items`.
Body: `multipart` file Excel (template `templates/mau-*.xlsx`).
Response: `{ imported: number, errors: [{ row, message }] }`. Roles theo resource (vd students: SUPER_ADMIN/CENTER_MANAGER/HR/SALES_CSM).

### Reports (binary)

| Route | Method | Query | Response |
|---|---|---|---|
| `/api/admin/reports/certificate` | GET | `completionId` | `application/pdf` |
| `/api/admin/reports/transcript` | GET | `studentId` | `application/pdf` |
| `/api/admin/reports/student-progress` | GET | `studentId, classId` | PDF/JSON |
| `/api/admin/leads/export` | GET | filters | CSV/XLSX (quyền `leads:export`) |
| `/api/admin/cham-cong/shift-export` | GET | date range | XLSX |

### Khác

| Route | Method | Mô tả |
|---|---|---|
| `/api/admin/notifications/bell` | GET | `{ notifications: [], unreadCount }` — chuông staff |
| `/api/admin/cham-cong/qr-token` | GET | `{ token, expiresAt }` — QR chấm công (token ngắn hạn) |

## 4. Portal APIs (session PARENT + ownership check)

| Route | Method | Mô tả |
|---|---|---|
| `/api/portal/upload-url` | POST | Presigned URL nộp bài (giống admin, scope parent) |
| `/api/portal/transcript` | GET `?studentId=` | PDF bảng điểm — chỉ con của parent đang đăng nhập |

## 5. Cron APIs (Bearer `CRON_SECRET`)

| Route | Schedule | Response |
|---|---|---|
| `/api/cron/email-queue` | */5 phút | `{ sent, failed, remaining }` |
| `/api/cron/class-reminder` | 01:00 | `{ sent }` |
| `/api/cron/renewal-reminder` | 02:00 | `{ sent }` |
| `/api/cron/debt-reminder` | 03:00 | `{ sent }` |

## 6. Auth API

`/api/auth/[...nextauth]` (GET/POST) — Auth.js handler: signin (credentials email+password), signout, session, csrf. FE dùng `signIn()`/`signOut()` từ `next-auth/react`, không gọi tay.

## 7. Server Actions contract (kênh mutation chính)

Mỗi resource admin có `app/(admin)/admin/<resource>/actions.ts`. Contract thống nhất:

```typescript
type ActionResult<T = void> = { ok: true } & T | { ok: false; error: string }
// Input: unknown → Zod schema từ lib/validators/<resource>.ts (source of truth types)
```

| Module | Actions chính | Permission |
|---|---|---|
| leads | `updateLeadStatus`, `reassignLead`, … | `leads:edit`, `leads:assign` |
| trials | `updateTrialAction` (sync lead status) | `trials:manage` |
| honors | `createHonorAction`, `updateHonorAction` | `honors:create/edit` |
| nhan-su | `createEmployeeAction`, … | `employees:create/edit` |
| users | create/update/permissions/reset-password | `users:manage`, `roles:assign` |
| media | `uploadClassMedia` (GV→PENDING), duyệt | `media:upload/approve` |
| cham-cong | `recordCheckin` (QR + geofence 100m) | `hr_attendance:checkin` |
| notifications | `createNotification` (audience 4 mức) | `notifications:manage` |
| parent-requests | `handleParentRequest` (duyệt/từ chối) | `parent-requests:manage` |
| site-content | `saveSiteContentAction` (+revalidate public path) | `site-content:edit` |
| **Portal** | `setActiveSite`, `startAttempt`, `submitAnswer`, `submitAttempt`, `submitAssignment`, `createParentRequest`, `cancelParentRequest`, `createParentFeedback`, `updateParentName`, `changeParentPassword` | ownership: `assertOwnsStudent` |

## 8. Quy tắc khi thêm endpoint mới

1. Ưu tiên Server Action nếu chỉ UI nội bộ gọi.
2. API route mới: đặt đúng namespace (`/api/admin/*`, `/api/portal/*`, `/api/public/*`, `/api/cron/*`) — namespace quyết định lớp auth.
3. Zod schema vào `lib/validators/` — không inline schema trong route.
4. Cập nhật doc này + Doc 11 (Security) nếu mở endpoint public.

## 9. 🔄 TARGET từ A0 (đồng bộ Doc 15 §13.5 + §11)

### 9.1 Chuẩn response mới (áp dụng cho API/action mới từ A0)

```jsonc
// Success
{ "ok": true, "data": {}, "meta": {} }
// Error
{ "ok": false, "error": {
    "code": "PERMISSION_DENIED",   // tiếng Anh — nhóm: AUTH_REQUIRED, PERMISSION_DENIED, VALIDATION_ERROR,
                                   // NOT_FOUND, CONFLICT, RATE_LIMITED, EXTERNAL_PROVIDER_FAILED, BUSINESS_RULE_VIOLATION
    "message": "Bạn không có quyền thực hiện thao tác này.",  // tiếng Việt
    "field": "fieldName",          // optional (validation)
    "requestId": "req_xxx"         // BẮT BUỘC
}}
```

Lỗi thiếu quyền **luôn** dùng `PERMISSION_DENIED`.

### 9.2 API Identity/Org mới (A0 — qua Server Actions/admin UI, contract logic)

| Resource | Operations | Quyền |
|---|---|---|
| **OrgUnit** | list tree · create/update (validate unique code, no cycle) · soft-delete | SUPER_ADMIN |
| **RoleDef/RolePermission** | CRUD role + gán permission per role | **CHỈ SUPER_ADMIN** + audit + reason bắt buộc |
| **UserOrgRole** | gán/thu hồi user × orgUnit × role (kèm `effectiveFrom/effectiveTo/status`) | SUPER_ADMIN (`roles:assign`) |
| **EmployeeOrgAssignment** | CRUD assignment (assignmentType 5 loại, allocationPercent, effectivity) — **không sinh quyền** | HO_HR / SUPER_ADMIN |

### 9.3 Idempotency (OI-21)

- **Bắt buộc ngay:** process webhook (key = `provider + externalEventId`) + confirm payment (idempotency key per request).
- **Mở rộng sau:** convert lead, create invoice, send activation email.
- API quan trọng phải khai báo idempotency strategy trong spec PR.
