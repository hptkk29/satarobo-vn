# LMS R7 — FE ⇄ BE ⇄ DB ⇄ Event ⇄ Flag ⇄ Test Audit

> Ngày: 2026-06-17 · Branch: `full-R7` · Phương pháp: 5 agent đọc song song toàn repo (convert/trial/enrollment · payment/portal · session/homework/class · media/eval/scorm/notif · audit/rbac/migration), đối chiếu với trạng thái đã verify ở `r7b-implementation-status`.

## 0. Kết luận điều hành (đọc trước)

Hệ thống R7 **đã wired FE↔BE↔DB↔Event ở phần lớn module** — KHÔNG cần rewrite. Một số giả định trong yêu cầu audit **không khớp hiện trạng**, cần đính chính trước khi fix:

| Giả định trong prompt | Hiện trạng thực tế |
|---|---|
| Có model `PaymentPlan` / `PaymentInstallment` | ❌ Không có. Nguồn sự thật là `Order` + `OrderInstallment` (trả góp 2 đợt) **+** `Payment` (2 tầng: `saleStatus`/`accountantStatus`) **+** `Receipt`. |
| Enrollment cần state machine mới (`PENDING_PAYMENT/ACTIVE/SUSPENDED/...`) | ✅ Đã có state machine: `PENDING→CONFIRMED→STUDYING→PAUSED→COMPLETED/WITHDREW/TRANSFERRED` (+ legacy `ACTIVE/CANCELLED`). Đổi tên enum = phá 100+ file + migration đã apply ⇒ **map khái niệm, KHÔNG rename**. |
| Payment thiếu audit | ✅ `recordPayment/confirmPayment/rejectPayment/adjustPayment/refundPayment` (lib/finance/payment.ts) đều `writeAudit` + idempotent. |
| FE update status trực tiếp (anti-pattern) | ✅ Không tìm thấy PATCH status trần. Enrollment/payment đều đi qua named server action. |
| Convert/Session/Homework chưa chạy | ✅ Đã wired đầy đủ, gated sau flag (`CONVERT_V2`, `SESSION_LIFECYCLE_V2`). |

**Gap thật, đã xác nhận** (chi tiết §2): (P0) Portal `hoc-phi` còn đọc `Order` cũ, `getParentConfirmedPayments` mồ côi; (P0) `payment.rejected` không phát event; (P0) `deleteTrialAction` hard-delete không audit; (P1) `scheduleMakeup` race chưa đủ mạnh (READ COMMITTED + re-count KHÔNG chống được phantom); (P1) thiếu `changeStudentCode` (convert-C10); (P1) `SESSION_LIFECYCLE_V2` chỉ gate ở UI; (P2) 3 notif thiếu source hook (`account.activated`/`comment`/`trial.schedule_changed`); (P2/P3) eval-C1 + portal-media-C3 + makeup-C8 cần browser/race test; SCORM cần e2e R2 thật.

---

## 1. Bảng audit FE–BE–DB–Event–Flag–Test

| Module | FE Page/Component | API/Action | BE Service | DB Model/Migration | Event | Flag | Test | Gap | Fix (ưu tiên) |
|---|---|---|---|---|---|---|---|---|---|
| **Lead/Trial** | leads/[id] trial widget; trials list; trials/actions | `trials/actions.ts` (update/delete); `lib/trial/service.ts` | `createTrialClass, enrollLeadChild, cancelTrialClass, markAttendance, completeTrialSession` | `TrialClassV2/TrialClassSession/TrialEnrollment/TrialAttendance` (4631+); `LeadChild.trialStatus` | `trial.assigned`✅, `lead.trialAttended`✅ | — | trial service unit; `makeup-cross-center` (cross) | `markAttendance` & `deleteTrialAction` KHÔNG audit; `deleteTrial` HARD delete; thiếu `trial.schedule_changed` event | P0 audit+guard delete; P2 emit schedule_changed |
| **Convert v2** | leads/[id]/convert (convert-form) | `submitConvertV2` | `convertLeadV2` (atomic, dedupe, idempotencyKey, payment guard) | `Student/Enrollment/User/ParentStudent/StudentConsent/ConvertConflict/IdempotencyKey` | `lead.converted`✅, `consent.granted`(no handler) | `CONVERT_V2_ENABLED`(OFF) | `convert-v2.spec` (C10 .fixme) | thiếu `changeStudentCode`; `submitConvertV2` bỏ qua `checkPrerequisites`; `consent.granted` không handler | P1 `changeStudentCode`; P2 prereq |
| **Enrollment** | enrollments + change-status-dialog + transfer-dialog | `enrollStudent, changeEnrollmentStatus, transferEnrollment, deleteEnrollmentAction` | (logic inline trong `_actions.ts`; helper `lib/enrollment-status.ts`) | `Enrollment` (1288) + `EnrollmentAuditLog` | — (chưa có `enrollment.statusChanged`) | — | change-status cơ bản | `enrollStudent` không audit; audit dùng `EnrollmentAuditLog` legacy (chưa vào `writeAudit` hợp nhất); chưa tách service layer | P1 thêm audit enrollStudent; P3 hợp nhất audit + tách service |
| **Payment 2 tầng** | payments page (admin) | `recordPaymentAction/confirm/reject/adjust/refund` | `lib/finance/payment.ts` (+ `receipt.ts`, `debt.ts`) | `Payment(4581)/Receipt(4616)/Order/OrderInstallment` | `payment.confirmed`✅; **`payment.rejected`❌** | — | `payment.test`, `debt.test` (unit) | **payment.rejected/adjusted/refunded không phát event**; OrderInstallment reminder chưa có cron set `lastReminderAt` | **P0** emit payment.rejected; P2 installment reminder |
| **Portal Billing** | **`portal/hoc-phi/page.tsx`** | (read) `getParentOrders` ⟵ **Order cũ** | `getParentConfirmedPayments`(mồ côi), `computeEnrollmentDebt`, `getDebtRows`(admin) | `Payment/Receipt/Enrollment` | — | — | `portal-media.spec` AC1 (debt) | **Portal đọc Order, không đọc Payment 2 tầng; reader mới mồ côi; không center-scope (đúng — PARENT ownership-gate)** | **P0** chuyển hoc-phi sang Payment-based reader |
| **Official Class** | classes + create form | `classes/_actions.ts createClass` | `createSessionPlansForClass`, `lib/classes/adjust.ts` | `Class(1210)/ClassSession/ClassSessionPlan` | `class.session_changed`✅ | — | `class-snapshot`, `curriculum-sessions` | createClass pin curriculum✅; `createSessionPlansForClass` nuốt lỗi (best-effort) | P1 log/alert khi plan fail |
| **Session** | classes/[id]/session | `completeSessionAction` | `lib/lms/session-lifecycle.ts completeSession` | `ClassSession(1371)` + actuals | `session.taught`✅ (dedupeKey) | `SESSION_LIFECYCLE_V2`(OFF) **chỉ UI** | `session-lifecycle.spec` | flag chỉ gate UI, action không re-check; chưa có `reopenSession` riêng | P1 gate server-side |
| **Attendance/Makeup** | attendance UI; makeup | `lib/lms/attendance-record.ts`, `lib/makeup/service.ts` | `recordAttendance`(audit✅, sinh MakeupNeed), `createMakeupNeed/suggest/scheduleMakeup/completeMakeup` | `Attendance(1489)/MakeupNeed(3923)` | `makeup.requested`✅, `makeup.confirmed`✅ | setting `makeup.crossCenterEnabled` | `makeup-cross-center` (C8 .fixme) | **`scheduleMakeup` race: READ COMMITTED + count→insert KHÔNG atomic ⇒ phantom overfill** | **P1** serializable/advisory-lock + bật C8 |
| **Homework** | (portal hiển thị) | (event-driven) | `lib/lms/assignment.ts assignHomeworkForSession` | `HomeworkAssignment(3635)` unique(session,exam,student) | qua `session.taught` (handler idempotent skipDuplicates)✅ | — | `homework-auto-assign.spec` | OK; reopen session không xoá HW (ghi nhận) | — |
| **Portal Media** | `portal/hinh-anh` | (read) | `media-consent.ts hasMediaConsent`, `signed-url.ts resolveMediaUrl` | `ClassSessionMedia/StudentConsent` | — | `MEDIA_SIGNED_URL`(OFF) | `portal-media.spec` (C3 .fixme) | consent✅ + C6.2 (tag OR isClassWide)✅; C3 (Sale không phụ trách) test .fixme cần browser | P2 browser test |
| **Evaluation V2** | admin/evaluations + portal/danh-gia-gv,khao-sat | eval `_actions` | `lib/eval/rounds.ts`, `eval-logic` | `EvalForm/EvalQuestion/EvaluationRound/EvalResponse/EvalAnswer (4844+)` | `eval.opened`✅ | `EVAL_V2_ENABLED`(OFF) menu+API+page | `eval-logic.test`; `evaluation-survey` (C1 .fixme) | C1 render 4 loại + emoji star cần browser | P2 browser test |
| **SCORM** | admin/scorm + play/[id] | presign/confirm routes + `_actions` | `lib/scorm/{manifest,ingest,access,ticket}` + handler `scorm-ingest` | `ScormPackage/ScormAccessLog (4310)`; mig `20260616080000` | `scorm.uploaded`✅ | `SCORM_ENABLED`(OFF) | manifest/ingest/access unit (pure) | chưa e2e R2-unzip + browser blur/watermark | P3 staging e2e (cần R2 creds) |
| **Notification** | (badge portal/admin) | — | handlers `lib/_handlers/*-notif.ts` | `Notification/StaffNotification` + `DomainEvent(413)` dedupeKey | 8–13/17 (xem §3) | `DISPATCHER_ENABLED`(ON) | `notifications.spec` (4) | thiếu `payment.rejected`, `account.activated`, `comment`, `trial.schedule_changed` source hook | P0 payment.rejected; P2 còn lại |
| **Event infra** | — | cron `/api/cron/dispatch-events` | `lib/events/{publish,dispatcher,registry,register}` | `DomainEvent` outbox + reaper | 14 type đăng ký, tất cả idempotent dedupeKey | `DISPATCHER_ENABLED`(ON) | `domain-event.spec`, `registry.test` | `consent.granted` phát nhưng chưa có handler (silent) | P3 |
| **Audit/RBAC/Scope** | audit viewer | — | `lib/audit/audit-log.ts writeAudit`; `lib/auth/{permissions,can,actor}`; `lib/db-scope.ts` | `AuditLog(384)` hợp nhất; legacy `*AuditLog` còn dùng | — | `RBAC_V2_ENABLED`(OFF) | scope introspection guard | audit phân mảnh (writeAudit + 6 legacy log*); ReportCard/EvalRound SCOPE_EXEMPT (tech-debt) | P3 hợp nhất audit + scope models |

---

## 2. Gap đã xác nhận theo độ ưu tiên

### P0 — trước go-live
1. **Portal học phí đọc Order cũ** — `app/(portal)/portal/hoc-phi/page.tsx:25` gọi `getParentOrders` (Order). Reader Payment-based `getParentConfirmedPayments` (lib/portal/billing.ts:95) tồn tại nhưng **không ai gọi**. → Chuyển portal sang nguồn `Enrollment.finalPrice − Σ Payment(CONFIRMED)` + danh sách `Receipt`. (Tiêu chí hoàn thành #1.)
2. **`payment.rejected` không phát event** — `rejectPayment` (payment.ts:173) chỉ update + void receipt, không `publishEvent` ⇒ phụ huynh/sale không được thông báo khi bị từ chối. → emit + handler notif.
3. **`deleteTrialAction` HARD delete, không audit** — `app/(admin)/admin/trials/actions.ts:105`. → thêm `writeAudit` + chặn hard-delete khi đã phát sinh nghiệp vụ (TrialEnrollment/Attendance).

### P1 — luồng học thật
4. **`scheduleMakeup` race chưa đủ** — re-count trong `$transaction` ở READ COMMITTED **không** chống phantom (2 request cùng đếm `N-1`, cùng insert → `N+1`). → SERIALIZABLE hoặc advisory-lock theo `makeupSessionId`; bật test `makeup-C8`.
5. **Thiếu `changeStudentCode`** (convert-C10) — chỉ SUPER_ADMIN, audit + reason bắt buộc.
6. **`SESSION_LIFECYCLE_V2` chỉ gate UI** — thêm guard server-side trong `completeSessionAction`.
7. **`enrollStudent` không audit**; thống nhất audit enrollment qua `writeAudit`.

### P2 — Portal/UX
8. 3 notif thiếu source hook: `account.activated`, `comment`, `trial.schedule_changed`.
9. Browser e2e: `portal-media-C3`, `evaluation-C1`.
10. OrderInstallment reminder cron (set `lastReminderAt`).

### P3 — sau ổn định
11. SCORM e2e với R2 thật (cần creds, staging).
12. RBAC_V2 dynamic; hợp nhất audit legacy → `writeAudit`; đưa ReportCard/EvalRound vào SCOPED_MODELS; giảm db-import-allowlist.

---

## 3. Notification R7-17 — coverage

**Đã có handler + emit (idempotent dedupeKey):** `payment.confirmed`, `enrollment.assigned`, `session.taught` (+ homework “Bài tập mới”), `trial.assigned`, `makeup.requested`, `makeup.confirmed`, `eval.opened`, `reportcard.published`, `class.session_changed`. ⚠️ **`lead.trialAttended` chỉ có HANDLER, không có emit** — đường thật phát `lead.awaitingDecision`; dòng này sai từ R7-17 tới 03/09/2026, xem `lib/events/khop-phat-nghe.test.ts`. Cron đọc-trực-tiếp (không event): `assignment-due-soon`, `debt-reminder`.

**Thiếu (ban đầu) → ĐÃ FIX:** `payment.rejected` (P0), `account.activated` (emit ở `activateAccount`), `comment.added` (emit ở `saveSessionFeedback` cho StudentSessionFeedback per-HV), `trial.schedule_changed` (emit ở `updateTrialAction`). **Coverage hiện: 17/17 trigger.** Cron nhắc trả góp (`remindOverdueInstallments`) cũng đã wire.

---

## 4. Mapping khái niệm prompt → schema thực tế (để fix đúng tên)

| Khái niệm prompt | Model/field thật |
|---|---|
| PaymentPlan | `Order` (+`OrderInstallment` cho trả góp) hoặc `Enrollment.finalPrice` (snapshot) |
| PaymentInstallment | `OrderInstallment` (PENDING/PAID) **hoặc** từng `Payment` (R7-04) |
| Enrollment `PENDING_PAYMENT` | `Enrollment.status = PENDING` (chưa confirm payment) |
| Enrollment `ACTIVE` | `STUDYING` (đang học) / `CONFIRMED` (đã xác nhận, chưa khai giảng) |
| Enrollment `SUSPENDED` | `PAUSED` |
| Enrollment `WITHDRAWN` | `WITHDREW` |
| `paymentStatus` riêng | suy từ `computeEnrollmentDebt(finalPrice, confirmedPayments)` |
| RefundRequest | `Payment(accountantStatus=REFUNDED, adjustmentOfId)` (bút toán âm) |
| ConversionAttempt | `convertLeadV2` + `IdempotencyKey` + `ConvertConflict` |

---

## 5. Test hiện trạng (4 .fixme + 1 .skip)

| File | Marker | Gap thật |
|---|---|---|
| `makeup-cross-center.spec.ts:320` | .fixme C8 | race chỗ cuối (cần lock — P1) |
| `convert-v2.spec.ts:321` | .fixme C10 | `changeStudentCode` (P1) |
| `portal-media.spec.ts:217` | .fixme C3 | Sale không phụ trách bị chặn (browser — P2) |
| `evaluation-survey.spec.ts:248` | .fixme C1 | render 4 loại câu (browser — P2) |
| `exam-import-word.spec.ts:68` | .skip | `jszip` chưa cài (env) |

Baseline đã verify (2026-06-16): unit 577, e2e a0 66 / r1 35 / r2 11 / r3 11 / r4 2 / r5 1 / r7 92 (4 skip), build OK. Migration R7 **chưa apply lên Supabase dev/prod** (ops TBD).

---

## 6. Lệnh chạy lại test

```bash
# Postgres local (scoop) 127.0.0.1:5432 satarobo_test, apply migrations:
$env:DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/satarobo_test'; pnpm prisma migrate reset --force --skip-seed
R7_SKIP_WEBSERVER=1 pnpm test:e2e:r7   # service-level, không cần webserver
pnpm test:unit
pnpm typecheck && pnpm lint && pnpm build
```
