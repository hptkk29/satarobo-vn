# 02 — Luồng Backend (hiện trạng)

> `lib/*` (modular monolith) + `app/api/*`. Logic nghiệp vụ tách khỏi UI; side-effect không-atomic đi qua DomainEvent.

## 1. RBAC / Phân quyền (`lib/auth/`)
**2 hệ song song (shadow):**
- **v1 (đang LIVE):** `permissions.ts` — matrix tĩnh `can(role, action)` → bool. 8 role, ~70 action.
- **v2 (đang SHADOW, flag OFF):** `actor.ts` (`resolveActor` cache/request, `buildActor` thuần) + `can.ts` (ALLOW-wins, bỏ DENY) + scope GLOBAL/CENTER/CLASS/OWN/CHILDREN/ASSIGNED, đọc role động từ `UserOrgRole`/`RolePermission`.

**Luồng gate:**
```
auth() → sessionUser → resolveActor(userId)
       → evaluatePermission (check-permission.ts)
          ├ v1 = canMatrix(user, action)
          └ v2 = can(actor, action, target)   [shadow-compare log lệch]
       → FLAG RBAC_V2_ENABLED ? v2 : v1
       → assertPermission() throw | ok      (đặt đầu Server Action)
```
File: `check-permission.ts` (entry), `permission-eval.ts` (lõi `decidePermission`), `shadow-compare.ts` (A/B log), `action-registry.ts`, `route-policy.ts` (`decideRoute` host×role), `rbac-service.ts` (CRUD role + assign — chỉ SUPER_ADMIN, audit+reason bắt buộc).
> ⚠️ Flag mặc định **false** → gate thực tế = v1. Xem [06](06-audit-lo-hong.md) C2.

## 2. Cách ly cơ sở (`lib/db-scope.ts`)
- `scopedDb(actor)` = Prisma Client extension, tự inject `centerId IN [visibleCenterIds]` cho **SCOPED_MODELS**.
- Bypass: `actor.isSuperAdmin || actor.isHoLevel` → thấy "ALL".
- `findMany/findFirst/count/aggregate/groupBy` → injectScope (where AND); `findUnique` → lọc hậu kỳ `passesScope` (IDOR → null nếu sai center).
- `bypass=true` → `logScopeBypass` ghi `RbacAuditLog`.
- ⚠️ **Giới hạn:** nested `include` model scoped KHÔNG auto-scope → phải tự `where`.
> ⚠️ Hiện mới áp ở 2 file (crm/messenger). Xem [06](06-audit-lo-hong.md) C1.

## 3. OrgUnit (`lib/org/`)
- `org-service.ts` (CRUD + validate: code unique, centerId valid, no cycle) · `org-tree.ts` thuần (`getSubtreeCenterIds`, `getDescendants`, `getAncestors`, `isAncestor`) · `assignment-service.ts` (EmployeeOrgAssignment: PRIMARY/SECONDARY, allocationPercent, effective window — **KHÔNG sinh quyền**).
- Cây: ROOT → **HO, CS1, CS2 ngang hàng**. HO không phải cha CENTER (`getSubtreeCenterIds(HO)` = []); quyền cross-center của HO do Actor xử lý (isHoLevel → ALL).

## 4. DomainEvent / Outbox (`lib/events/`)
```
publishEvent(type, payload, {tx?, dedupeKey?})  → DomainEvent PENDING (idempotent producer)
[cron /api/cron/dispatch-events mỗi 1']
ensureHandlersRegistered()  → on(type, handler)
dispatchPendingEvents(batch=50):
  claim PENDING→PROCESSING (chống xử lý đôi)
  getHandlers(type) → Promise.allSettled
  allPass→DONE | fail & attempts<max→PENDING(retry) | fail&max→FAILED
reapStuckEvents(timeout 5') → PROCESSING treo → PENDING
```
- Handler đăng ký: **`lead.converted`** → `onLeadConverted` (gửi email xác nhận đăng ký qua EmailQueue). File `lib/crm/_handlers/lead-converted.ts` + `register.ts`.
- Quy tắc: tiền/invoice/enrollment → **transaction**; thông báo/stats/sync ngoài → **DomainEvent** (handler idempotent).

## 5. Cron jobs (`app/api/cron/*` + `vercel.json`) — auth `verifyCronAuth(CRON_SECRET)`
| Route | Lịch | Chức năng |
|---|---|---|
| `/dispatch-events` | mỗi 1' | Xử lý DomainEvent PENDING + reaper |
| `/email-queue` | mỗi 5' | Gửi email từ EmailQueue (PENDING→SENT/FAILED) |
| `/sla-check` | mỗi 15' | 5 rule SLA lead → StaffNotification (dedupeKey) |
| `/class-reminder` | 01:00 | Nhắc lịch học 12–48h tới |
| `/renewal-reminder` | 02:00 | Nhắc gia hạn 13–15 ngày |
| `/marketing-alerts` | 02:00 | Alert chốt chi phí + báo cáo trễ |
| `/debt-reminder` | 03:00 | Nhắc nợ **trả góp** (đợt 2 ≤14d) Zalo + fallback email |
| `/order-debt-reminder` | 04:00 | Nhắc nợ **đơn lẻ** quá hạn qua Resend (chống spam 1/ngày) |
| `/zalo-token-refresh` | mỗi 6h | Gia hạn Zalo access/refresh token |

## 6. Services nghiệp vụ
**CRM (`lib/crm/`):** `lead-qualify.ts` (L1→L2, dedup phone 90d, normalizePhone) · `handover.ts` (HO→CS bàn giao, confirmReceived, assignSale, firstContact + audit) · `convert-lead.ts` (`convertLeadToEnrollment` transaction + `findConvertDuplicates`) · `sla.ts` (5 rule, `evaluateSla` thuần + cron) · `commission.ts` (4 tầng QC 1%/Sale Admin 1%/Sale 4%/QL TT 2%, renewal=0, clawback) · `cost-allocation.ts` (CPL/CPA) · `marketing-metrics/report/alerts.ts` · `ads-insights.ts` (Meta) · `messenger-service.ts` + `meta-webhook.ts` (verify X-Hub-Signature, parse, ingest idempotent mid) · `webhook-replay.ts`.

**Finance (`lib/finance/`):** `invoice-code.ts` (`nextInvoiceCode` qua Counter, INV-CS-YYYY-#### atomic) · `debt.ts` (`computeDebt`, `confirmOrderPayment` idempotent, `getOverdueOrders`, `remindOverdueSingleOrders`).

**LMS (`lib/lms/`):** `scheduling.ts` (`detectScheduleConflict` phòng/GV, `hasCapacity` — thuần) · `attendance-record.ts` (`recordAttendance` → ABSENT tạo MakeupNeed + audit) · `attendance-rate.ts` · `media-consent.ts` (`hasMediaConsent`, `tagStudentToMedia` cần consent, `isMediaVisibleForStudent`) · `media-key.ts` (object key không lộ tên HS, TTL 900s) · `makeup.ts` + `makeup-service.ts` (lifecycle PENDING→SCHEDULED→COMPLETED) · `assignment.ts` (6 loại + submit LATE) · `checklist.ts` (7 bước GV) · `session-gen.ts` (`generateSessionDates` né Holiday).

**Portal (`lib/portal/`):** `session.ts` (cookie ký HMAC + `requireActiveStudent` + `assertOwnsStudent`) · `active-site-token.ts` (sign/verify thuần) · `learning.ts` · `billing.ts` · `notifications.ts` (scope ALL_PARENTS/CENTER/CLASS/STUDENT) · `request-labels.ts`.

**Attendance/HR (`lib/attendance/` + `lib/work-schedule.ts`):** `qr.ts` (QR cố định/cơ sở, `verifyQrToken`) · `qr-token.ts` + `geofence.ts` (Haversine + `withinGeofence` — thuần) · `work-schedule.ts` (tính công theo ca + geofenceFlag) · `shift-excel.ts` (export).

**Audit (`lib/audit/`):** `audit-log.ts` `writeAudit` (immutable, auto changedFields, mask PII theo `canViewParentContact`, `visibleOrgUnitIds`) · `log.ts` (bảng chuyên dụng cũ).

**Email/Zalo:** `lib/email/{queue,triggers,resend,render,send}.ts` (enqueue tức thì → cron 5' gửi) · `lib/zalo/{service,provider,token}.ts` (ZNS + fallback email, cache token + refresh).

## 7. Webhook ingress
- **Lead:** `app/api/public/webhook/{facebook,zalo,google-form}` — verify secret/X-Hub-Signature (timing-safe khi có secret) → `processLeadWebhook` → `ingestLead` + `WebhookDelivery` log.
- **Messenger:** `app/api/webhooks/meta/messenger` — GET verify hub.challenge; POST verify chữ ký → `handleMessengerWebhook` (parse → ingest idempotent mid, luôn 200 cho payload hợp lệ chống retry storm).
> ⚠️ Thiếu secret → hiện fail-OPEN. Xem [06](06-audit-lo-hong.md) C3.

## 8. Tích hợp ngoài
External call (Resend / Zalo / Meta / GA4 / MISA) — Zalo + Meta đã có; MISA/AMIS có `IntegrationConfig`/`IntegrationLog` (khung, chưa wire). Quy tắc target: external chỉ qua `modules/integration`.
