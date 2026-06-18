# LUỒNG LMS HIỆN TẠI — SATA ROBO (as-implemented)

**Dự án:** Sata Robo VN — CRM tuyển sinh + LMS + quản lý lớp học + portal phụ huynh/học viên
**Phạm vi tài liệu:** Mô tả **luồng LMS đang chạy trong code** (branch `full-R7`), không phải đặc tả mong muốn. Khi xung đột với SRS v3.1 → tài liệu này phản ánh **hiện trạng code**, SRS phản ánh yêu cầu.
**Trạng thái code:** R7-00 → R7-17 đã implement đầy đủ. Migration R7 **CHƯA apply lên Supabase dev/prod** (chờ chốt ERD). Nhiều tính năng mới đứng sau **feature flag default OFF** (bật dần khi sẵn sàng).
**Cập nhật:** 2026-06-18.

> ⚠️ **Đọc kèm:** [`SataRobo_LMS_Requirements_v3.1_CHOT-CUOI.md`](SataRobo_LMS_Requirements_v3.1_CHOT-CUOI.md) (yêu cầu gốc) và `Document/0-yeucau/3-ke-hoach-trien-khai/phases/R7/` (ticket R7-00…17). Mọi đường dẫn file dưới đây là tương đối từ gốc repo.

---

## 0. Sơ đồ vòng đời tổng

```text
Lead  ──►  Chăm sóc (SLA 24h)  ──►  Lớp trải nghiệm N buổi (TrialClassV2)
  │                                          │
  │                                   Học thử + điểm danh
  │                                          │
  ▼                                          ▼
Ghi nhận thanh toán ◄────────────── Chờ quyết định
  │
  ▼  (guard PAYMENT_REQUIRED)
CONVERT V2  ──►  Tạo Parent (dedupe) ──► Tạo Student (mã HV) ──► Tạo Enrollment + snapshot giá + consent ảnh
                                                                          │
                                                                          ▼
                                            Xếp lớp chính thức (Enrollment.classId)
                                                                          │
                                  ClassProgramSnapshot / ClassSessionPlan (pin khung CT)
                                                                          │
                                                       Sinh lịch buổi (ClassSession)
                                                                          │
        ┌──────────────────── GV dạy mỗi buổi (Session Lifecycle V2) ───────────────────┐
        │  Điểm danh (6 nhãn)  ·  "Hoàn tất buổi" → event session.taught                │
        │      └─► auto-giao bài tập (HomeworkAssignment)  └─► thông báo GV/PH           │
        └────────────────────────────────────────────────────────────────────────────────┘
                                                                          │
            Vắng → MakeupNeed (học bù liên cơ sở)        Bài tập / Bài thi (import Word)
                                                                          │
                                          Học bạ (ReportCard: DRAFT→PUBLISHED + snapshot)
                                                                          │
                          Đánh giá GV (HV làm) + Khảo sát trung tâm (PH làm) — EvalForm/Round
                                                                          │
                Portal PH/HV: tiến độ · bài giảng · bài tập/thi · hình ảnh · học bạ · học phí
                                                                          │
                       Báo cáo (lead / trải nghiệm / đào tạo / trung tâm) + Thông báo (17 trigger)
```

**Nguyên tắc kiến trúc xuyên suốt (đã enforce trong code):**
- Server action mở đầu `auth()` + kiểm tra quyền; đọc nghiệp vụ qua `scopedDb(actor)` (cách ly cơ sở) — trừ một số model còn EXEMPT (xem §11).
- **Tiền / enrollment** đi trong **transaction**; **side-effect** (thông báo, đồng bộ) đi qua **DomainEvent outbox**, handler **idempotent** theo `dedupeKey`.
- Mutation nhạy cảm ghi **AuditLog**.
- Schema **2-phase additive** — R7 **không drop** cột/bảng cũ.

---

## 1. Lớp trải nghiệm (TrialClassV2)

| Khía cạnh | Hiện trạng |
|---|---|
| Model | `TrialClassV2` (status `OPEN/RUNNING/COMPLETED/CANCELLED`), `TrialEnrollment` (`ACTIVE/COMPLETED/WITHDRAWN`, partial-unique chặn double-assign), `TrialClassSession`, `TrialAttendance` (PRESENT/ABSENT), `TrialProgramConfig` (cấu hình N buổi) |
| Entry point | `app/(admin)/admin/trial-classes/_actions.ts` (tạo lớp + auto-sinh buổi), `enrollLeadChildAction`, `app/(admin)/admin/trials/actions.ts:updateTrialAction` |
| Service | `lib/trial/service.ts` — `createTrialClass` (tx + `buildTrialSessionDates` skip Holiday), `enrollLeadChild` (check capacity + emit event), `markAttendance`, `cancelTrialClass` (withdraw all active) |
| Event | `trial.assigned` (ghi danh), `trial.schedule_changed` (đổi lịch) |
| Audit | tạo/sửa lớp, override capacity, đổi lịch |
| Flag | — (logic core, không cờ) |

---

## 2. Convert V2 (Lead → Parent → Student → Enrollment)

**Entry:** `app/(admin)/admin/leads/[id]/convert/actions.ts:submitConvertV2` → service `lib/crm/convert-lead-v2.ts:convertLeadV2`.
**Flag:** `CONVERT_V2_ENABLED` (default **OFF**).

Trình tự (1 transaction):
1. **Guard PAYMENT_REQUIRED** — `evaluatePaymentGuard()`: chỉ cho convert khi có ≥1 `Payment(saleStatus=RECORDED)` trên order của lead, **hoặc** tổng `finalPrice = 0` (học bổng toàn phần, ghi lý do `scholarshipFull`).
2. **Idempotency** — `IdempotencyKey(scope="convert")`: submit lại trả về `{studentIds, enrollmentIds}` đã cache, không tạo trùng.
3. **Dedupe Parent** — `findParentMatch()`: email khớp → tái dùng; email+phone khớp **hai user khác nhau** → tạo `ConvertConflict(OPEN)` **chặn** convert (giải quyết ở `/convert-conflicts`).
4. **Multi-student** — mỗi con: dedupe `(parent, name, dob)` → tái dùng/tạo `Student`; sinh mã HV qua `genStudentCodeV2(centerCode, tx)`; tạo `Enrollment(status=ACTIVE)`; nếu `consentMedia=true` → tạo `StudentConsent(CLASS_MEDIA)` + audit `CONSENT_GRANTED_AT_CONVERT`.
5. **Snapshot giá** (xem §3) ghi lên Enrollment.
6. **Audit** Lead `REGISTERED → ENROLLED`.
7. **Post-commit events:** `lead.converted`, `consent.granted`.

---

## 3. Ưu đãi khóa + snapshot giá

- **Model `CourseDiscount`** — type `AMOUNT` (VND) / `PERCENT` (%) / `SCHOLARSHIP` (% có điều kiện) / `PROGRAM` (combo); `active`, `validFrom/validTo`.
- **Pure helper** `lib/finance/pricing.ts:computeEnrollmentPrice(listPrice, discount)` → `{ listPrice, discountType, discountAmount, finalPrice }` (clamp %, `finalPrice = max(0, listPrice − discountAmount)`).
- **Snapshot tại convert** ghi cứng lên `Enrollment`: `listPrice / discountType / discountAmount / finalPrice` (cột `tuition` legacy = finalPrice). → Giá không đổi khi bảng giá thay đổi về sau.

---

## 4. Payment 2 tầng + Receipt + công nợ

| Thành phần | Hiện trạng |
|---|---|
| `Payment` | **2 tầng**: `saleStatus` (`RECORDED → COLLECT_CONFIRMED`) và `accountantStatus` (`PENDING → CONFIRMED → REJECTED/REFUNDED/ADJUSTED`). Điều chỉnh qua `adjustmentOfId` (bút toán âm). `centerId` scoped. |
| `Receipt` | Sinh khi `accountantStatus=CONFIRMED`; code `RCP-{CENTER}-{YY}-{SEQ}`; `VOID` khi payment bị reject sau khi đã có receipt. |
| `OrderInstallment` | 2 đợt/Order: `soDot`, `amount`, `status PAID/PENDING`, `dueDate`, `reminderDays`, `lastReminderAt`; Σ = Order.totalAmount. |
| Công nợ | `lib/finance/debt.ts` — `computeEnrollmentDebt = finalPrice − Σ Payment(CONFIRMED)`; `overdueBucket` (none/1-7/8-30/>30); cron `remindOverdueInstallments` + `remindOverdueSingleOrders` (mặc định 14 ngày trước hạn từ SystemSetting, anti-spam 1 lần/ngày qua `lastReminderAt`) — wired `/api/cron/debt-reminder`. |
| Event | `payment.confirmed`, `payment.rejected` (handler thông báo PH). |
| Audit | mỗi lần `accountantStatus` chuyển (confirm/reject/adjust). |

---

## 5. State machine Enrollment

**Enum `EnrollmentStatus`:** `ACTIVE`/`CANCELLED` (legacy) · `PENDING → CONFIRMED → STUDYING → PAUSED ⇄ STUDYING → COMPLETED` · `WITHDREW` · `TRANSFERRED`.
**Active statuses** (tính sĩ số/báo cáo): `[ACTIVE, CONFIRMED, STUDYING, PAUSED]` (`lib/enrollment-status.ts`).
**Model:** unique `(studentId, classId)`; snapshot giá (§3); transfer qua `transferredToId` + `transferReason`.
**Entry:** `enrollStudent` (tx + `writeAudit CREATE module=enrollment`), `changeEnrollmentStatus`, `transferEnrollment`, `deleteEnrollmentAction` — tất cả dual-write **AuditLog** hợp nhất (legacy `EnrollmentAuditLog` vẫn giữ, phase B drop sau).

---

## 6. Xếp lớp + sinh lịch buổi

- **`ClassProgramSnapshot` / `ClassSessionPlan`** — pin khung chương trình vào lớp khi tạo lớp (`seq`, `lessonId` nguồn, `customTitle`, `order`); sửa plan **không** đụng `Lesson` gốc.
- **Sinh lịch:** pure `lib/lms/session-gen.ts:generateSessionDates(start, count, weekdays, holidays)` → advance tuần, skip Holiday. Tạo các `ClassSession`.
- **Gán học viên:** ngầm qua `Enrollment.classId` chọn ở form convert → event `enrollment.assigned` (handler thông báo "con đã được xếp lớp").

---

## 7. Buổi học: lifecycle + điểm danh

- **Model `ClassSession`** — `status SCHEDULED/IN_PROGRESS/COMPLETED/CANCELLED`; cột thực tế `actualTeacherId/actualRoomId/actualStartAt/actualEndAt`, `completedById`, `classComment`.
- **6 nhãn điểm danh** (`AttendanceStatus`): `PRESENT/ABSENT/LATE/EXCUSED/ABSENT_EXCUSED/ABSENT_UNEXCUSED` (+ `NEEDS_MAKEUP`). `Attendance` unique `(sessionId, enrollmentId)`.
- **"Hoàn tất buổi":** `lib/lms/session-lifecycle.ts:completeSession` — gate trạng thái (CANCELLED chặn, COMPLETED idempotent), kiểm tra đã lưu điểm danh (trừ `confirmNoAttendance`), ghi actuals, audit `COMPLETE_SESSION`, emit **`session.taught`** (`assignMode NOW/DEFER/CUSTOM_DUE`).
- **Entry:** `app/(admin)/admin/sessions/[id]/_actions.ts:completeSessionAction` — **gate server-side `isSessionLifecycleV2Enabled()`**.
- **Flag:** `SESSION_LIFECYCLE_V2` (default **OFF**; OFF = hệ checklist 9-bước cũ).

---

## 8. Học bù liên cơ sở (MakeupNeed)

- **Pure** `lib/lms/makeup.ts` — `canMakeupForLesson` (chỉ bù khi lesson ≤ tiến độ lớp), `canTransitionMakeup`.
- **Service** `lib/lms/makeup-service.ts` — `requestMakeup` (idempotent), `scheduleMakeup` (PENDING→SCHEDULED), `completeMakeup`. `scheduleMakeup` lấy **`pg_advisory_xact_lock(hashtext(makeupSessionId))`** đầu tx để chống race đếm sĩ số (READ COMMITTED không phantom-safe).
- **Liên cơ sở:** đề xuất buổi bù ở **mọi cơ sở** có buổi phù hợp, ưu tiên cơ sở con đang học.
- **Event:** `makeup.requested` (→ thông báo staff), `makeup.confirmed` (→ thông báo HV).

---

## 9. Khung chương trình + Bài tập/Bài thi

**Curriculum / Lesson** — `lib/lms/curriculum.ts`: `planResize`/`resizeCurriculum` (tăng = append, giảm = soft-archive theo order DESC), `setLessonStatus`. `Lesson.status`: `INCOMPLETE/COMPLETE/IN_USE/NEEDS_UPDATE/LOCKED`; `version` optimistic-lock. `LessonChangeRequest` (đề xuất sửa) **schema-only**, UI pending.

**Bài tập / Bài thi** — `lib/lms/assignment.ts`: `submitAssignment` (đánh dấu LATE nếu quá hạn), `assignHomeworkForSession`. Enum: `Assignment.kind CLASSWORK/HOMEWORK`, `status DRAFT/PUBLISHED/CLOSED`; `AssignmentSubmission.status NOT_SUBMITTED/SUBMITTED/LATE/GRADED`; `Exam.status`, `ExamAttempt.status IN_PROGRESS/SUBMITTED/GRADED/REVIEWED`.
**Import Word** — `lib/exams/docx-import.ts` (dùng **jszip**): `parseDocx` (đọc `word/document.xml` + media), parse block QUESTION_CODE, `validateQuestions`, map SINGLE/MULTI/TRUE_FALSE → Prisma type. UI `/admin/exams/import-word`.

**Auto-giao bài** — handler `session.taught` → `assignHomeworkForSession` tạo `HomeworkAssignment` (`assignMode NOW/DEFER/CUSTOM_DUE`, `dueAt` nullable) + notif/HV (dedupe `homework.assigned:{sessionId}:{studentId}`). Cờ hiển thị điểm cho PH: `homework.showScoreToParent` (default OFF).

---

## 10. Học bạ (ReportCard) + Đánh giá/Khảo sát

**ReportCard** — `lib/lms/report-card.ts` (DB) + `report-card-core.ts` (pure, client-safe).
State machine: `DRAFT → PENDING_REVIEW → PUBLISHED` (và `RECALLED → PENDING_REVIEW`). PUBLISHED → **đóng băng `publishedSnapshot` (JSON)** + emit `reportcard.published`. Scope **thủ công** qua `checkEnrollmentScope` (chưa qua db-scope auto — §11). Portal đọc `getPublishedReportCards` (snapshot, không recompute live). Trang: `/admin/report-cards`, portal `/portal/hoc-ba`.

**Đánh giá / Khảo sát** — `lib/eval/forms.ts` + `lib/eval/rounds.ts`. Form builder **4 loại câu hỏi** `STAR_RATING/RADIO/CHECKBOX/TEXTBOX`. Scope form: `TEACHER_EVAL` (**HV** đánh giá GV) / `CENTER_SURVEY` (**PH** khảo sát trung tâm). `EvalForm.status DRAFT/ACTIVE/ARCHIVED`; `EvaluationRound.status DRAFT/OPEN/CLOSED` → mở vòng emit **`eval.opened`**. `replaceQuestions` chặn khi đã có response. **Flag `EVAL_V2_ENABLED`** (default OFF) gate menu admin + portal. Trang portal: `/portal/danh-gia-gv` (HV), `/portal/danh-gia` (PH).

---

## 11. Portal phụ huynh/học viên

**Trang** (`app/(portal)/portal/`): `page.tsx` (dashboard) · `ho-so-con` (tiến độ) · `bai-giang` · `bai-tap` (+`[assignmentId]`) · `bai-thi` (+`[examId]`) · `hinh-anh` · `hoc-ba` · `hoc-phi` · `danh-gia` + `danh-gia-gv`.

**Service `lib/portal/learning.ts`** — `getStudentClasses`, `getStudentProgressSummaries`, `getStudentAttendanceSummaries` (5 chỉ số), `getStudentSessions/Lessons/Assignments/Exams` (exam check `isOpen`), kết quả bài tập/thi. `ACTIVE_ENROLLMENT = [CONFIRMED, STUDYING, ACTIVE]`.

**Học phí `lib/portal/billing.ts`** — `getParentBilling` = `Enrollment.finalPrice − Σ Payment(CONFIRMED)` + Receipts + totals. **PH chỉ thấy payment `accountantStatus=CONFIRMED`** (không thấy bản ghi sale đang chờ). *(P0 đã chuyển `hoc-phi` khỏi luồng Order legacy sang reader này.)*

**Media buổi học** — `lib/lms/media-consent.ts`: `StudentConsent(type=CLASS_MEDIA, status GRANTED/REVOKED)`; `isMediaVisibleForStudent` = media `APPROVED` + có tag + consent GRANTED. Key R2 `buildMediaObjectKey` **không chứa tên HV / studentId** (C6.5). **Flag `MEDIA_SIGNED_URL`** (default OFF) → bật presigned GET TTL 900s; OFF = fileUrl public.

---

## 12. SCORM (R7-11/12)

- **Pure core** `lib/scorm/`: `manifest.ts` (parse `SCORM_12/SCORM_2004` → launchUrl), `ingest.ts` (`validateZipEntries`: ≤2000 file, chống path-traversal, whitelist ext, ≤200MB; `normalizeRootPrefix`/`resolveLaunchPath`), `access.ts` (`canOpenScorm` = GV phụ trách **hoặc** `training:manage`), `ticket.ts` (**HMAC** `<payload>.<hmac>` TTL 600s, timing-safe verify).
- **Model:** `ScormPackage(status TESTING/PUBLISHED/ARCHIVED)`, `ScormAccessLog` (userId/ip/userAgent). Partial-unique 1 active/lesson.
- **Luồng:** API `presign` (upload thẳng R2) → `confirm` → event **`scorm.uploaded`** → handler `onScormUploadedIngest` (unzip + validate + parse manifest). Player `/admin/scorm/play/[id]` + asset resolver (ticket HMAC, IDOR→403) + blur khi nghi quay màn + watermark động.
- **Flag `SCORM_ENABLED`** (default OFF) gate menu + routes + API.
- **Giới hạn:** unzip R2 thật + blur/watermark browser cần **R2 creds + staging**; local chỉ phủ pure logic.

---

## 13. Thông báo + Báo cáo + Event

**14 handler đăng ký** (`lib/events/register.ts` → `ensureHandlersRegistered`), phủ **17/17 trigger thông báo** SRS, gồm: `lead.converted`, `payment.confirmed/rejected`, `class.session_changed`, `lead.trialAttended`, `enrollment.assigned`, `session.taught` (×2: notif GV + auto-giao bài), `reportcard.published`, `trial.assigned`, `makeup.requested/confirmed`, `eval.opened`, `scorm.uploaded`, `trial.schedule_changed`, `account.activated`, `comment.added`. Publish qua `publishEvent(type, payload, {tx?, dedupeKey?})` — idempotent.
Model thông báo: `Notification` (audience STUDENT/CLASS/center/global) + `StaffNotification` (inbox staff).

**4 module báo cáo** (pure formula + Vitest) + trang `/admin/bao-cao/*`:
`lib/reports/lead.ts` (phễu lead) · `trial.ts` (lớp trải nghiệm) · `dao-tao.ts` (đào tạo/khung CT) · `trung-tam.ts` (doanh thu/sĩ số/điểm danh theo cơ sở).

**Satacoin** — model `CoinRuleConfig` (`behaviorKey` unique, `points`, `dailyCap`, `totalCap`, `source`, `active`) **schema-only**, trạng thái PENDING ngoài go-live; chưa nối portal.

---

## 14. Feature flags (lib/flags.ts)

| Flag | Default | Tác dụng |
|---|---|---|
| `CONVERT_V2_ENABLED` | OFF | Convert v2 (payment guard + multi-student + dedupe) |
| `SESSION_LIFECYCLE_V2` | OFF | State machine buổi học ("Hoàn tất buổi") |
| `MEDIA_SIGNED_URL` | OFF | Signed URL ảnh buổi (presigned GET TTL 900s) |
| `EVAL_V2_ENABLED` | OFF | Đánh giá GV + khảo sát trung tâm |
| `SCORM_ENABLED` | OFF | Player SCORM + ingest |
| `RBAC_V2_ENABLED` | OFF | RBAC động đọc role từ DB |
| `COMMON_LOGIN_ENABLED` | ON | Login chung satarobo.vn/login |
| `DISPATCHER_ENABLED` | ON | Cron dispatch DomainEvent outbox |
| `homework.showScoreToParent` (SystemSetting) | OFF | Hiện điểm bài tập cho PH |

---

## 15. Trạng thái & việc còn tồn đọng

**Đã DONE (verify trực tiếp trong code):** toàn bộ R7-00…R7-17. Regression: unit 577 pass · e2e r7 **109 pass / 2 skip** · typecheck/lint/build xanh. Migration mới nhất: `20260616070000_add_coin_rule_config`, `20260616080000_add_scorm` (133 migration tổng).

**Còn tồn đọng (KHÔNG phải code-only — cần điều kiện ngoài):**

| # | Việc | Loại | Lý do chưa làm |
|---|---|---|---|
| 1 | **Apply migration R7 lên Supabase dev/prod** | Ops/DB | HELD — đang sửa ERD, guardrail "không đổi schema/DB". **Blocker để R7 lên thật.** |
| 2 | 2 e2e browser: `portal-media-C3`, `eval-C1` (`test.fixme`) | Test | Cần real browser + auth session (auth stub Playwright trả null). |
| 3 | SCORM R2 e2e (unzip thật + blur/watermark) | Test/Ops | Cần R2 creds + staging. |
| 4 | `ReportCard` → `SCOPED_MODELS` | Tech-debt | NO-OP có chủ đích — `centerId` nullable, auto-scope ẩn row null; cần backfill + non-null (ERD constraint chặn). Hiện manual scope-check + grandfather allowlist. |
| 5 | Flip `RBAC_V2_ENABLED` | Ops | Cần shadow-rollout. |
| 6 | `exam-import-word C2b` | Test | Conditional skip nếu thiếu `jszip` (không phải lỗi). |

> **Kết luận:** về **code luồng LMS — không còn task tồn đọng**. Bước thực tế kế tiếp duy nhất là **#1 (apply migration R7 lên Supabase)** sau khi ERD chốt; #2–#6 là test browser / ops / tech-debt làm khi có creds/staging.
