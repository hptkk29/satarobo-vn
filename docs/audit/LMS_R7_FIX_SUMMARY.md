# LMS R7 Fix Summary

> Ngày: 2026-06-17 · Branch: `full-R7` · Kèm theo: [`LMS_R7_FE_BE_DB_EVENT_AUDIT.md`](./LMS_R7_FE_BE_DB_EVENT_AUDIT.md)

## 1. Scope

Audit toàn luồng LMS R7 (Lead→Trial→Convert→Enrollment→Payment→Class→Session→Homework→Portal→Eval→SCORM→Notification) bằng 5 agent đọc song song, đối chiếu hiện trạng đã verify. **Kết luận: hệ thống đã wired phần lớn — KHÔNG rewrite.** Đợt này fix các gap **P0 đã xác nhận**; P1–P3 được lập kế hoạch (mục 10/11).

## 2. Gap Found (tóm tắt — chi tiết ở audit doc §2)

- **P0-1** Portal `hoc-phi` đọc `Order` cũ; reader Payment-based mồ côi (`getParentConfirmedPayments`).
- **P0-2** `rejectPayment` không phát DomainEvent ⇒ PH không được báo khoản bị từ chối.
- **P0-3** `deleteTrialAction` hard-delete, không guard nghiệp vụ, không audit.
- **P1** `scheduleMakeup` race (READ COMMITTED + count→insert không atomic); thiếu `changeStudentCode`; `SESSION_LIFECYCLE_V2` chỉ gate UI; `enrollStudent` không audit.
- **P2** 3 notif thiếu source hook; browser e2e (portal-media-C3, eval-C1); installment reminder cron.
- **P3** SCORM e2e R2 thật; RBAC_V2; hợp nhất audit legacy; scope ReportCard/EvalRound.

> Đính chính giả định prompt: **không có** `PaymentPlan`/`PaymentInstallment` (nguồn thật = `Order`/`OrderInstallment` + `Payment` 2 tầng + `Receipt`); enrollment state machine **đã có** (`PENDING→CONFIRMED→STUDYING→PAUSED→…`) — map khái niệm chứ không rename; payment BE **đã** audit + idempotent đầy đủ.

## 3. Fix Implemented (đợt này — P0)

| # | Fix | File |
|---|---|---|
| P0-1 | Thêm `getParentBilling(parentUserId)` (Enrollment.finalPrice − Σ Payment CONFIRMED + Receipt + totals) | `lib/portal/billing.ts` |
| P0-1 | Portal "Học phí" chuyển sang reader Payment-based: tổng quan (tổng/đã trả/còn nợ) + theo ghi danh + biên lai. **Bỏ đọc `Order` cũ.** | `app/(portal)/portal/hoc-phi/page.tsx` |
| P0-2 | Phát `payment.rejected` trong transaction `rejectPayment` (dedupeKey idempotent) | `lib/finance/payment.ts` |
| P0-2 | Handler `onPaymentRejected` → Notification PH (audience STUDENT) + đăng ký | `lib/_handlers/r7-notifications.ts` |
| P0-3 | `deleteTrialAction`: guard chặn xoá khi ATTENDED/ENROLLED/đã có feedback + `writeAudit(DELETE)` trong transaction | `app/(admin)/admin/trials/actions.ts` |
| **P1-1** | `scheduleMakeup`: `pg_advisory_xact_lock(hashtext(makeupSessionId))` đầu transaction → serial-hoá count→update, chống phantom overfill (READ COMMITTED không đủ) | `lib/makeup/service.ts` |
| **P1-2** | Service `changeStudentCode` (chỉ SUPER_ADMIN + reason bắt buộc + audit `CHANGE_CODE` + chống clash unique) + action quyền `students:change-code` (SUPER_ADMIN) | `lib/students/change-code.ts`, `lib/auth/permissions.ts` |
| **P1-3** | `completeSessionAction` gác `isSessionLifecycleV2Enabled()` **server-side** (chặn POST trực tiếp khi flag OFF, không chỉ ẩn UI) | `app/(admin)/admin/classes/[id]/session/_actions.ts` |
| **P1-4** | `enrollStudent`: bọc create trong transaction + `writeAudit(CREATE, module=enrollment)` (orgUnitId = class.centerId) | `app/(admin)/admin/enrollments/_actions.ts` |
| **P2-1** | `trial.schedule_changed` — emit khi `updateTrialAction` đổi `scheduledAt` + handler báo Sale phụ trách | `app/(admin)/admin/trials/actions.ts`, `lib/_handlers/trial-schedule-notif.ts` |
| **P2-2** | `account.activated` — emit ở `activateAccount` (OTP+mật khẩu→ACTIVE) + handler chào mừng PH | `app/(auth)/kich-hoat/_actions.ts`, `lib/_handlers/account-notif.ts` |
| **P2-3** | `comment.added` — emit ở `saveSessionFeedback` (StudentSessionFeedback per-HV) + handler báo PH | `app/(admin)/admin/sessions/[id]/_actions.ts`, `lib/_handlers/comment-notif.ts` |
| **P2-4** | `remindOverdueInstallments()` (OrderInstallment đến hạn → email + set `lastReminderAt`, anti-spam 1/ngày) + wire cron | `lib/finance/debt.ts`, `app/api/cron/debt-reminder/route.ts` |
| **P2** | Wire 3 handler mới vào `ensureHandlersRegistered()` | `lib/events/register.ts` |
| **P3-1** | Hợp nhất audit (2-phase ADDITIVE, dual-write): enrollment status/transfer/delete + student reserve/resume/withdraw/reactivate/soft-delete nay GHI THÊM vào `AuditLog` hợp nhất (giữ nguyên `EnrollmentAuditLog`/`StudentAuditLog` legacy) | `app/(admin)/admin/enrollments/_actions.ts`, `app/(admin)/admin/students/_actions.ts` |

## 4. DB/Migration

**Không thêm migration** — toàn bộ fix là code-level trên schema sẵn có (Payment/Receipt/Enrollment/DomainEvent/AuditLog/TrialClass). Test DB local: 133 migration, 0 pending.

## 5. API/Service Changes

- `lib/portal/billing.ts`: **mới** `getParentBilling` + type `EnrollmentBillingRow`/`ParentBilling`. `getParentConfirmedPayments` nay được dùng (hết mồ côi). `getParentOrders` giữ làm helper public (không còn gọi từ trang học phí).
- `lib/finance/payment.ts`: `rejectPayment` thêm `publishEvent("payment.rejected", …, {tx, dedupeKey})`.
- `lib/_handlers/r7-notifications.ts`: thêm `onPaymentRejected` + `on("payment.rejected", …)`.

## 6. FE Changes

- `app/(portal)/portal/hoc-phi/page.tsx`: render lại theo `ParentBilling` (3 card tổng quan, danh sách ghi danh với nhãn trạng thái enrollment, danh sách biên lai). Banner còn-nợ dựa trên `totals.outstanding`.

## 7. Portal Changes

Trang học phí phụ huynh **không còn đọc Order**; nguồn sự thật = Payment 2 tầng + Receipt + công nợ theo ghi danh. Cổng sở hữu = `studentId` thuộc `parentUserId` (PARENT không center-role nên dùng db trần — đúng thiết kế).

## 8. Event/Dispatcher Changes

Thêm event type `payment.rejected` (idempotent dedupeKey `payment.rejected:{paymentId}`) — nâng coverage notification. Dispatcher/outbox không đổi.

## 9. Tests

- **Mới** `tests/e2e/r7/portal-billing.spec.ts` (4 test): totals CONFIRMED-only (PENDING bị loại), finalPrice null bị loại, cách ly sở hữu, đóng thừa clamp ≥ 0. **PASS.**
- **Mở fixme:** `makeup-C8` (race chỗ cuối → đúng 1 thắng + DB nhất quán) và `convert-C10` (CENTER_MANAGER chặn / SUPER_ADMIN OK + audit + reason) nay là test thật. **PASS.**
- Regression: full R7 suite **98 passed / 2 skipped** (chỉ còn portal-media-C3 + eval-C1 = cần browser context, P2). Unit **577 pass**. `pnpm typecheck` + `pnpm lint` + `pnpm build` GREEN.

## 10. Remaining Risks

- ✅ ~~Makeup race (P1)~~ — đã fix bằng advisory-lock; `makeup-C8` PASS.
- ✅ ~~changeStudentCode (P1)~~ — đã có service; `convert-C10` PASS. (Chưa có UI admin gọi service — thêm khi cần.)
- ✅ ~~SESSION_LIFECYCLE_V2 gate server-side (P1)~~ — đã gác trong `completeSessionAction`.
- ✅ ~~enrollStudent audit (P1)~~ — đã `writeAudit(CREATE)` atomic với create.
- ✅ ~~P2 notif (account.activated/comment/trial.schedule_changed)~~ — đã có source hook thật + handler + đăng ký. **17/17 trigger phủ.**
- ✅ ~~Installment reminder cron (P2)~~ — `remindOverdueInstallments` + wire cron.
- ✅ ~~Hợp nhất audit legacy (P3)~~ — dual-write `writeAudit` Phase A xong (enrollment + student). Phase B (drop bảng legacy + chuyển viewer sang AuditLog) làm sau khi ổn định.
- **P1 + P2 + P3-audit hết.** Còn lại (cố ý CHƯA làm vì rủi ro/ops/cần creds — phân tích bên dưới).

### Các mục P3 còn lại — phân tích & lý do hoãn
- **ReportCard → SCOPED_MODELS: ĐÃ REVIEW KỸ (2026-06-17) → KẾT LUẬN KHÔNG flip (cố ý).** Lý do:
  1. **Đã có scope thủ công chắc chắn:** `saveReportCardAction` + `transitionReportCardAction` đều gọi `checkEnrollmentScope({ actor, centerId: enr.centerId, classId, capabilities })` trước mọi đọc/ghi; mọi `reportCard.findUnique(by enrollmentId)` đứng sau cổng này. KHÔNG có `reportCard.findMany` phía admin (list suy từ enrollment đã-scoped). Portal `getPublishedReportCards` gate theo `studentId` (ownership). ⇒ cách ly cơ sở **đã được đảm bảo**.
  2. **Auto-scope sẽ rủi ro + thừa:** `injectScope` lọc `centerId IN [...]` ⇒ **ẩn nhầm row có `centerId=null`** (đúng lý do model này được EXEMPT). Khắc phục an toàn cần `ReportCard.centerId` NON-NULL hoặc backfill — **đều là đổi DB/ERD mà ràng buộc hiện tại CẤM**.
  3. ⇒ Flip bây giờ = thêm rủi ro data-hiding, **không** thêm bảo vệ. Giữ EXEMPT + manual scope. Khi ERD xong và `centerId` non-null/backfill: mới thực hiện 5 bước (backfill → admin actions bare-db→scopedDb → SCOPED_MODELS → gỡ allowlist → shadow-test).
- **EvaluationRound → SCOPED_MODELS:** GIỮ EXEMPT. TEACHER_EVAL round có `centerId=null` theo thiết kế (cross-center) — scope sẽ lọc mất. Đúng là phải exempt.
- **RBAC_V2 dynamic:** code (`lib/auth/can.ts`/`actor.ts`) + shadow-diff (`RbacShadowDiff`) đã sẵn. Bật là quyết định OPS theo lộ trình dev→staging→1 tuần shadow (0 diff)→prod. KHÔNG đổi default flag trong code đợt này.
- **SCORM e2e R2 thật:** BLOCKED — cần R2 creds + staging (unzip thật + browser blur/watermark). Logic thuần đã có unit test.
- **Browser e2e (portal-media-C3, eval-C1):** cần Playwright UI + auth thật; test bundle hiện stub `auth()`=null. Cần harness UI riêng.
- **Notif thiếu hook (P2):** `account.activated`, `comment`, `trial.schedule_changed`.
- **Browser e2e (P2):** portal-media-C3, eval-C1 cần Playwright UI context.
- **SCORM (P3):** chưa e2e R2 unzip + blur/watermark thật (cần creds, staging).
- **Ops:** migration R7 **chưa apply** lên Supabase dev/prod.

## 11. Flag Rollout Plan

Không bật đồng loạt. Trình tự:

1. **Dev:** `CONVERT_V2_ENABLED=ON`, `SESSION_LIFECYCLE_V2=ON`; `MEDIA_SIGNED_URL/EVAL_V2/SCORM=OFF`. Chạy `pnpm test:e2e:r7` + smoke portal `hoc-phi`.
2. **Staging:** như dev + demo D1–D10 với 2 cơ sở; theo dõi `DomainEvent` outbox (payment.confirmed/rejected → Notification).
3. **Shadow prod:** bật cho role admin/internal trước; quan sát payment, enrollment, portal billing.
4. **Prod:** `CONVERT_V2` → `SESSION_LIFECYCLE_V2`; sau ổn định mới xét `MEDIA_SIGNED_URL`; `EVAL_V2`/`SCORM` bật sau khi có e2e riêng.

Tiền đề: **apply migration R7 lên Supabase dev/staging trước** mọi bước bật flag.
