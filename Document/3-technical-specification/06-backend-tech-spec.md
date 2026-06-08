# Doc 6 — Backend Tech Spec

> **Ai đọc:** Backend Dev.
> 🔄 **ĐỒNG BỘ DOC 15 (2026-06-06):** doc này mô tả backend **HIỆN TRẠNG**. Từ A0, lớp auth/scope đổi theo Doc 15 — xem **mục 0 (TARGET)** ngay dưới. Khi xung đột, Doc 15 thắng.
> **Cập nhật:** 2026-06-06.

---

## 0. 🔄 TARGET Auth/Scope từ A0 (đồng bộ Doc 15 §2/§4/§11)

Pipeline mới cho MỌI request nghiệp vụ:

```
Request → Auth (JWT {userId, sessionVersion})
        → ActorResolver: load TẤT CẢ UserOrgRole ĐANG HIỆU LỰC (effectiveFrom ≤ now ≤ effectiveTo, status active)
        → can(actor, action, target): role + permission + scopeType + OrgUnit
        → scopedDb(actor): enforce center/org isolation
        → Service (modules/*) → DB
```

Quy tắc bắt buộc:
1. **ALLOW thắng nếu ≥1 role cho phép** đúng scope — KHÔNG DENY override giai đoạn này.
2. **HO role = cross-center theo chức năng được cấp** (HO_ACCOUNTANT/HO_HR/HO_MARKETING xem+sửa toàn hệ thống theo module; **HO_SALE xem lead scope A&B — lead mình tạo/giao + lead kênh HO/ads/Messenger — KHÔNG sửa**).
3. `scopedDb`: **CS1 không xem CS2, CS2 không xem CS1**; HO role thấy tất cả cơ sở theo chức năng role.
4. **KHÔNG hardcode** HO + CS2, KHÔNG hardcode danh sách center — mọi logic đi qua OrgUnit tree (CS3/CS4... thêm vào không sửa code permission).
5. `EmployeeOrgAssignment` (nhân sự/kiêm nhiệm) **không sinh quyền** — quyền chỉ từ `UserOrgRole`.

---

## 1. Mô hình backend

Backend nằm **trong cùng monolith Next.js**, gồm 3 lớp entry:

| Entry | Khi nào dùng | Vị trí |
|---|---|---|
| **RSC data fetch** | Mọi READ cho page | `app/**/page.tsx` async + `db.*.findMany()` |
| **Server Actions** | Mọi MUTATION từ UI (admin/portal) | `app/**/actions.ts` (`'use server'`) |
| **API Route Handlers** | Webhook, cron, upload, import file, export PDF/Excel, public lead | `app/api/**/route.ts` |

Quy tắc chọn: UI nội bộ → Server Action; cần URL gọi từ ngoài (webhook/cron/fetch FormData/binary response) → API route.

## 2. Cấu trúc module `lib/` (business logic)

```
lib/
├── db.ts                 # Prisma singleton
├── auth.ts               # Auth.js config (credentials, JWT, callbacks)
├── auth/
│   ├── permissions.ts    # can()/assertCan()/hasStaffRole()/field visibility — 8 role × 140+ action
│   └── route-policy.ts   # decideRoute() host×role (pure, unit-tested)
├── audit/log.ts          # getAuditActor, detectChangedFields, getRequestMetadata
├── rate-limit.ts         # Upstash → memory fallback
├── storage/              # r2-client (lazy), upload-config (category rules)
├── email/                # resend client, send (never-throw), render {{var}}, queue, triggers, reminder-helpers
├── pdf/                  # certificate.tsx, transcript.tsx, progress-report.tsx
├── validators/           # 23 file Zod — SOURCE OF TRUTH cho types (z.infer)
├── lead/                 # assign-strategy (round-robin/close-rate), import, dedup
├── classes/schedule.ts   # sinh buổi học theo lịch + giáo trình, né Holiday
├── students/             # absence, progress, renewal
├── attendance/           # adjust, shift-excel
├── survey/nps.ts         # tính NPS
├── shifts.ts, work-schedule.ts   # ca làm việc, chấm công
├── cron/, notify/        # cron helpers, Zalo adapter + QR
└── seo/, utils.ts
```

## 3. Server Action pattern (BẮT BUỘC — copy từ `.claude/rules/admin-site.md`)

```typescript
'use server'
export async function createThingAction(input: unknown) {
  const session = await auth()
  if (!session?.user) return { ok: false, error: 'Chưa đăng nhập' }
  try { assertCan(session.user, 'thing:create') }
  catch { return { ok: false, error: 'Không có quyền' } }

  const parsed = thingSchema.safeParse(input)        // Zod — input luôn `unknown`
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message }

  await db.thing.create({ data: { ...parsed.data, createdById: session.user.id } })
  revalidatePath('/admin/things')                     // + public mirror nếu có
  return { ok: true }
}
```

Bất biến:
1. `auth()` + `assertCan()` **ngay đầu mọi action** (layout gate là chưa đủ).
2. Input type `unknown` → Zod parse. Empty string → `null` qua `.transform()`.
3. Trả `{ ok, error }` — không throw ra client.
4. File `'use server'` **chỉ export async functions** (export const → lỗi E352 runtime, build vẫn pass).
5. Mutations quan trọng → ghi audit log (`lib/audit/log.ts`) với old/new values.
6. Portal actions: thêm ownership check `assertOwnsStudent(studentId)` (parent chỉ thao tác trên con mình).

### Inventory server actions hiện có (~20 module)

`leads` (status, reassign), `trials`, `notifications`, `honors`, `nhan-su`, `media` (upload + duyệt), `cham-cong` (QR + geofence), `jobs`, `site-content`, `parent-requests`, `settings` (đổi mật khẩu), `users` (+permissions, reset-password), portal: `ho-so`, `bai-thi` (start/submit attempt), `bai-tap` (submit), `yeu-cau`, `danh-gia`, `actions` (setActiveSite)…

## 4. Middleware stack (thứ tự xử lý 1 request)

```
Request
 → proxy.ts (Edge): auth() JWT decode → decideRoute(host, path, role) → rewrite/redirect/next
 → Layout RSC (admin/portal): session + role gate + liveness DB check (tokenVersion, isActive, deletedAt)
 → Page RSC: per-page role gate nếu cần (can(role,'x:view') → redirect dashboard)
 → Server Action / API handler: auth() + assertCan() + Zod validate  ← KHÔNG BAO GIỜ BỎ
 → Business logic (lib/*) → Prisma → revalidatePath / response
```

API route auth theo loại: admin API check session + role list; cron check `Authorization: Bearer CRON_SECRET`; webhook check verify token/secret per source; public `/api/leads` không auth nhưng rate-limit + honeypot.

## 5. Business logic rules cốt lõi (chi tiết trong `docs/*.md`)

| Rule | Tóm tắt | Nguồn |
|---|---|---|
| Lead dedup | Trùng phone trong 90 ngày → không tạo mới, log `LeadDuplicate`, trả lead cũ | `lib/lead/`, T1.3 |
| Lead auto-assign | Theo `LeadAssignmentConfig` per center: ROUND_ROBIN / CLOSE_RATE / MANUAL | `lib/lead/assign-strategy.ts` |
| Sinh buổi học | Theo `scheduleDays` + giáo trình; gặp `Holiday` → dời buổi + báo GV | `lib/classes/schedule.ts` |
| Học bù | ABSENT → `makeupStatus=NEEDS_MAKEUP` → tạo `MakeupNeed` → xếp lịch → MADE_UP | `docs/makeup-flow.md` |
| Rủi ro học viên | Vắng liên tiếp / vắng nhiều / thiếu bài / sắp hết khóa chưa gia hạn / nợ → `StudentRiskAlert` → `StudentCareTask` cho CSM | `docs/student-risk-care.md` |
| Đơn hàng | DRAFT → PENDING_PAYMENT → CONFIRMED → COMPLETED; trả góp tối đa 2 đợt (`OrderInstallment`); voucher validate (loại, hạn, minOrder, quota, per-user limit) | `docs/payment-qr-installments.md` |
| Hoàn thành khóa | Enrollment COMPLETED → `CourseCompletion` + certificateCode + gợi ý khóa kế (prerequisite chain) | `docs/post-course-care-certificate.md` |
| SataCoin | Ledger append-only; cộng theo `SataCoinRule` (điểm danh, bài tốt); đảo bút toán bằng REVERSAL | `docs/satacoin-internal.md` |
| Chấm công | QR token ngắn hạn + GPS trong `allowedRadiusMeters` của Center | `app/(admin)/admin/cham-cong/actions.ts` |
| Media lớp | GV upload → PENDING; CENTER_MANAGER duyệt → APPROVED mới hiện portal | `media:approve` |
| Codegen | Mã tuần tự qua bảng `Counter` (transaction-safe), vd `HV:CS1:26` | `Counter` model |

## 6. Caching & revalidation

| Loại | Cơ chế |
|---|---|
| Public read | ISR `export const revalidate = 60` (list) / `300` (detail) |
| Sau mutation | `revalidatePath('/admin/<resource>')` + public mirror path |
| Session | JWT (không hit DB) + liveness check DB ở admin layout |
| Rate limit | Upstash Redis `INCR+EXPIRE NX`; key `<resource>:<ip>` |
| Không dùng | Redis app-cache, in-memory cache giữa request (serverless) |

## 7. Background jobs / queue

- **EmailQueue** (DB-backed): producer = triggers nghiệp vụ (order confirm, receipt, reminder…) ghi row PENDING; consumer = cron 5 phút lấy batch theo `(status, scheduledAt)`, gửi Resend, update SENT/FAILED + attempts (maxAttempts). Email send **never-throw** — lỗi chỉ ghi log.
- **Reminders** (3 cron daily): query điều kiện (lớp ngày mai / enrollment sắp hết / installment quá hạn) → enqueue email + `ZaloMessageLog` (stub).
- **Không có** job framework (BullMQ…) — mọi async đều qua DB queue + cron, phù hợp serverless.

## 8. Input validation

- 23 Zod schemas trong `lib/validators/` — mỗi resource 1 file; type suy ra `z.infer`.
- Pattern chuẩn: `nullableStr` / `nullableDate` / `nullableInt(min,max)`; `""` → `null`.
- Phone VN: `/^(0|\+84)[35789][0-9]{8}$/`. Action string enum: `ALL_ACTIONS` (single source — dùng cho cả validator permission-grant).
- Anti-bot lead: honeypot field `website` + `timeOnPage` < 3s reject.

## 9. Error handling & observability

- Server actions: `{ ok: false, error }` tiếng Việt thân thiện; không leak stack.
- API: status đúng nghĩa (400 validate, 401/403 auth, 413 file lớn, 429 rate limit + `Retry-After`, 500).
- Sentry server/edge (PII stripped); fire-and-forget calls (Meta CAPI, GA4 MP) được catch riêng, không làm fail request chính.
- Audit log mọi thay đổi nhạy cảm (user, quyền, lead, class, student, payment, voucher, product).

## 10. Don'ts backend

- ❌ `$queryRawUnsafe` · ❌ edit migration đã apply · ❌ hard delete (soft delete `deletedAt`, trừ SUPER_ADMIN) · ❌ bỏ `assertCan` vì "layout đã gate" · ❌ export non-async từ file `'use server'` · ❌ raw SQL khi Prisma làm được.
