# ERD / Database Fix Plan — Sata Robo VN

> Kế hoạch sửa toàn bộ lỗi nêu trong [ERD-review.md](./ERD-review.md). Chi tiết file/vùng bị ảnh hưởng khi fix: [ERD-impact-map.md](./ERD-impact-map.md). Mỗi mục: **mã lỗi · việc · cách làm · file/migration · cách verify**.
> Nguyên tắc: **additive trước, drop sau** (2-phase); mỗi fix là 1 migration/PR rời + `pnpm typecheck && lint && build` + test xanh. KHÔNG big-bang.
> Tuân thủ rule repo: migration đặt tên rõ nghĩa, restart dev sau migrate, CHECK/RLS/trigger viết SQL thô trong migration Prisma.

## Lộ trình theo đợt

| Đợt | Mục tiêu | Lỗi xử lý |
|---|---|---|
| **P0 — An toàn tức thời** | Chặn mất dữ liệu & lỗ hổng | C3, C4, C5, C1 |
| **P1 — Đúng đắn dữ liệu** | Kiểu & ràng buộc | C2, H5, H6, H7, H4, H8, H9 |
| **P2 — Tuân thủ & DR** | Pháp lý & khôi phục | C6, C7 |
| **P3 — Hiệu năng & quy mô** | Phình bảng & cache | H1, H2, H3, H10 |
| **P4 — Vệ sinh & vận hành** | Chuẩn hóa & quan sát | M1–M8 |

---

# P0 — An toàn tức thời

## FIX-C4 · TOCTOU oversell (sĩ số lớp + âm kho) 🔴
**Cách:** Đưa check vào trong transaction + backstop ở DB.
1. **Code** — bọc check-and-write trong cùng `$transaction`, dùng guarded `updateMany`/count bên trong tx:
   - [`enrollments/_actions.ts:383,469,588`](../../app/(admin)/admin/enrollments/_actions.ts): chuyển `count` + `create` vào `db.$transaction(async (tx) => { const n = await tx.enrollment.count({where:{classId}}); if (n >= max) throw ...; await tx.enrollment.create(...) }, { isolationLevel: 'Serializable' })`.
   - [`inventory/movements/_actions.ts:144`](../../app/(admin)/admin/inventory/movements/_actions.ts): decrement có điều kiện `updateMany({ where: { id, quantity: { gte: qty } }, data: { quantity: { decrement: qty } } })` → nếu `count===0` ⇒ throw "không đủ tồn".
2. **DB backstop (migration SQL thô):**
   ```sql
   ALTER TABLE "StockBalance" ADD CONSTRAINT stockbalance_qty_nonneg CHECK ("quantity" >= 0);
   -- sĩ số: partial unique không đủ; dựa vào guard tx + count. Cân nhắc trigger nếu cần tuyệt đối.
   ```
**Verify:** test concurrency (2 promise song song tạo enrollment lớp đầy / xuất quá tồn) → đúng 1 thành công. `tests/e2e` thêm spec race.

## FIX-C5 · Trùng mã đơn hàng 🔴
**Cách:** Bỏ read-then-write, dùng `Counter` atomic (đã có hạ tầng) hoặc Postgres sequence.
- Sửa [`lib/orders/code.ts`](../../lib/orders/code.ts) gọi `nextSeq('ORDER', tx)` (pattern [`lib/codegen.ts:26`](../../lib/codegen.ts#L26)) **bên trong** `$transaction` của `orders/_actions.ts:286`.
- Thêm `@@unique` mã đơn để backstop: `@@unique([code])` trên `Order` (nếu chưa) + retry on unique-violation.
**Verify:** tạo 50 đơn song song → 0 trùng mã.

## FIX-C3 · onDelete tài chính → Restrict + soft-delete Order 🔴
**Cách (2-phase):**
1. Đổi `onDelete` trên quan hệ tài chính sang `Restrict`:
   - `Payment.order`, `Receipt.payment`, `Receipt.enrollment`, `OrderItem.order`, `OrderInstallment.order`, `OrderStatusHistory.order`.
   - Giữ `SetNull` cho liên kết mềm (`Payment.enrollment`, `Payment.adjustmentOf`).
2. Thêm `deletedAt DateTime?` cho `Order`, `Payment`, `Receipt`, `Enrollment`; chuyển mọi "xóa" tài chính sang soft-delete; thêm filter `deletedAt: null` ở read.
**Migration:** Prisma sửa `@relation(..., onDelete: Restrict)` → `db:migrate`.
**Verify:** thử xóa Order còn Payment → DB chặn (Restrict). Soft-delete giữ vết.

## FIX-C1 · Bật RLS toàn bộ `public` 🔴
**Cách:** Migration SQL thô bật RLS cho mọi bảng (bật mà chưa policy = chặn hết = an toàn). Vì backend Prisma đi role đặc quyền nên không vỡ app; RLS là phòng thủ chiều sâu cho bề mặt PostgREST.
```sql
-- migration: enable_rls_all_public
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public'
           AND tablename NOT LIKE '_prisma%' LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', r.tablename);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY;', r.tablename); -- tùy chọn
  END LOOP;
END $$;
```
> ⚠️ KHÔNG `FORCE` nếu Prisma role không phải owner-bypass mong muốn — test kỹ. Mặc định `ENABLE` đã đủ chặn anon. Cân nhắc revoke quyền anon/authenticated trên schema `public` ở Supabase dashboard.
**Verify:** Supabase SQL editor với anon role `SELECT * FROM "Student"` → bị chặn. App (Prisma) vẫn chạy bình thường.

---

# P1 — Đúng đắn dữ liệu

## FIX-C2 · `timestamptz` cho toàn bộ DateTime 🔴
**Cách (additive, an toàn):**
1. Thêm `@db.Timestamptz(6)` cho mọi field `DateTime` trong `schema.prisma` (createdAt/updatedAt/...). Có thể script sed cẩn thận hoặc sửa theo cụm.
2. Migration `ALTER COLUMN ... TYPE timestamptz USING "col" AT TIME ZONE 'Asia/Ho_Chi_Minh'` — vì data cũ được nhập theo giờ VN, convert đúng offset.
```sql
ALTER TABLE "EmployeeCheckin" ALTER COLUMN "checkedAt" TYPE timestamptz USING "checkedAt" AT TIME ZONE 'Asia/Ho_Chi_Minh';
-- lặp cho từng cột timestamp (sinh script từ information_schema).
```
> ⚠️ `ALTER COLUMN TYPE` khóa bảng + rewrite → chạy ngoài giờ cao điểm, theo bảng. Bảng lớn (`Attendance`) làm cuối/giờ thấp điểm.
**Verify:** `SELECT data_type FROM information_schema.columns WHERE data_type='timestamp without time zone'` → 0 dòng. Smoke test lịch/chấm công.

## FIX-H5 · Bỏ `Float` tiền kho → `Int` (VND) hoặc `Decimal(14,2)` 🟠
**Cách:** Đổi `totalQcCost`, `pricePerUnit`, `unitPrice`, `totalCost` sang `Int` (VND nguyên) hoặc `Decimal @db.Decimal(14,2)` nếu cần đơn giá lẻ. Migration `ALTER COLUMN TYPE numeric(14,2)`.
**Verify:** không còn `Float` ở field tiền (`grep`).

## FIX-H6 · `BigInt` cho cột tổng tiền 🟠
**Cách:** Đổi `Int → BigInt` cho `totalAmount`, `subtotal`, `discountApplied`, doanh thu/aggregate, gói combo. Cập nhật Zod/serialize (BigInt → string ở API/JSON).
**Verify:** test giá trị > 2.1 tỷ không tràn.

## FIX-H7 · Thêm CHECK constraints 🟠
**Migration SQL thô:**
```sql
ALTER TABLE "Voucher" ADD CONSTRAINT voucher_percent_range CHECK ("discountPercent" IS NULL OR ("discountPercent" BETWEEN 1 AND 100));
ALTER TABLE "Enrollment" ADD CONSTRAINT enrollment_finalprice_nonneg CHECK ("finalPrice" IS NULL OR "finalPrice" >= 0);
ALTER TABLE "Order" ADD CONSTRAINT order_total_nonneg CHECK ("totalAmount" >= 0);
ALTER TABLE "StockBalance" ADD CONSTRAINT stockbalance_qty_nonneg CHECK ("quantity" >= 0);
ALTER TABLE "Payment" ADD CONSTRAINT payment_amount_pos CHECK ("amount" <> 0);
```
**Verify:** insert vi phạm → DB từ chối.

## FIX-H4 · Guard state machine (Enrollment + ClassSession) 🟠
**Cách:** Tạo transition map như Order ([`lib/orders/status.ts`](../../lib/orders/status.ts)):
- `lib/enrollment/status.ts`: `ENROLLMENT_TRANSITIONS` + `canTransition()`; gọi trong [`enrollments/_actions.ts:430`](../../app/(admin)/admin/enrollments/_actions.ts#L430).
- `lib/sessions/status.ts`: chặn `startSession` nếu status ≠ SCHEDULED; `completeSession` chỉ khi IN_PROGRESS. Sửa [`sessions/[id]/_actions.ts:226,251`](../../app/(admin)/admin/sessions/[id]/_actions.ts#L226).
**Verify:** test `CANCELLED→ACTIVE` bị chặn; re-start buổi COMPLETED bị chặn.

## FIX-H8 · Idempotency-key cho payment-confirm 🟠
**Cách:** Yêu cầu `Idempotency-Key` header / client token ở confirm payment; ghi `IdempotencyKey` trong tx (như [`convert-lead-v2.ts:209`](../../lib/crm/convert-lead-v2.ts#L209)) trước khi xử lý. Trùng key → trả kết quả cũ.
**Verify:** gửi confirm 2 lần cùng key → 1 lần ghi nhận.

## FIX-H9 · Optimistic lock cho edit đa người 🟠
**Cách:** Thêm `updatedAt`-compare (hoặc `version Int`) ở update Order/Payment amounts: `updateMany({ where: { id, updatedAt: clientSeenUpdatedAt }, data })` → 0 rows ⇒ "đã có người sửa, tải lại". Cân nhắc `isolationLevel: 'Serializable'` cho flow tiền nhạy cảm.
**Verify:** 2 tab sửa cùng record → tab sau bị chặn.

---

# P2 — Tuân thủ & DR

## FIX-C6 · Vòng đời dữ liệu & NĐ13 🔴
**Cách:**
1. **Cron retention** (`app/api/cron/data-retention`): xóa/ẩn danh theo policy — OTP/`OtpDeliveryLog` hết hạn > 30 ngày; lead LOST > N tháng ẩn danh SĐT/email; log/webhook > 12 tháng archive.
2. **Erasure** (quyền được lãng quên): server action cho phép ẩn danh học viên/phụ huynh theo yêu cầu (thay PII bằng tomb `"[đã xóa]"`, giữ khóa thống kê).
3. **Portability**: endpoint xuất dữ liệu cá nhân của 1 học viên (JSON) cho phụ huynh.
4. **Bảng policy**: ghi `RetentionPolicy`/config thời hạn theo loại dữ liệu.
**Verify:** chạy cron trên data test → OTP cũ biến mất; export trả đúng dữ liệu 1 HS; erasure xóa PII giữ aggregate.

## FIX-C7 · Backup / PITR / DR thật 🔴
**Cách:**
1. Bật **PITR** trên Supabase (nâng tier nếu cần) — xác nhận RPO ≤ 24h.
2. Viết **runbook restore** + lịch **test-restore hàng tháng** vào staging; log kết quả.
3. (Tùy chọn) cron `pg_dump` logic backup ra R2 cho cold storage.
**Verify:** thực hiện 1 lần restore staging từ snapshot, ghi RTO thực tế vào [`13_operations_monitoring.md`](../13_operations_monitoring.md).

---

# P3 — Hiệu năng & quy mô

## FIX-H1 · Index thời gian cho `Attendance` (+ bảng nóng) 🟠
**Cách:** Thêm `@@index([createdAt])` / `@@index([classSessionId, createdAt])` cho `Attendance`; rà các bảng đọc theo thời gian thiếu index. Partial index cho soft-delete (`WHERE "deletedAt" IS NULL`) — SQL thô.
**Verify:** `EXPLAIN ANALYZE` query range theo ngày → index scan.

## FIX-H2 · Retention + partition + read-model 🟠
**Cách:**
- **Retention** (gộp với FIX-C6): prune `DomainEvent` DONE > 30 ngày, `WebhookDelivery`/`IntegrationLog` > 90 ngày.
- **Partition** (khi >5M dòng): `Attendance`/`AuditLog`/`DomainEvent` range-partition theo tháng (SQL thô, Prisma không model — cô lập trong migration).
- **Hợp nhất audit** (FIX-H10): bỏ 11 bảng `*AuditLog` legacy, chỉ giữ `AuditLog`.
**Verify:** prune chạy, kích thước bảng giảm; query audit 1 bảng.

## FIX-H3 · Cache / read-model cho dashboard 🟠
**Cách:**
- Bọc query dashboard nặng bằng `unstable_cache` (revalidate 60–300s) hoặc tag-based revalidation.
- Pre-aggregate: bảng/cron rollup chỉ số dashboard (như `AdsInsightDaily`) thay vì `groupBy` live mỗi request.
**Verify:** dashboard không recompute mỗi request; thời gian tải giảm.

## FIX-H10 · Hợp nhất AuditLog 🟠
**Cách (2-phase):** Phase A — chuyển mọi ghi audit về `AuditLog` (entityType+entityId+diff Json + actorName snapshot + orgUnitId); double-write tạm. Phase B — sau ổn định, drop 11 bảng legacy + đọc qua 1 helper `writeAudit()`.
**Verify:** lịch sử 1 entity query từ `AuditLog` đủ; mask PII tập trung.

---

# P4 — Vệ sinh & vận hành

| Fix | Lỗi | Việc |
|---|---|---|
| FIX-M1 | Naming | (tùy chọn, rủi ro cao) thêm `@@map` snake_case + `@map` cho cột — chỉ làm nếu sẽ dùng SQL thô/RLS nhiều; nếu Prisma-only thì để nguyên, ưu tiên thấp |
| FIX-M2 | ID | Giữ `cuid()` (chấp nhận); nếu tích hợp Supabase Auth sau → thêm cột `authUserId @db.Uuid` map riêng |
| FIX-M3 | Migration lock | Quy trình: `ALTER COLUMN TYPE` trên bảng lớn → expand-contract (cột mới → backfill → swap) |
| FIX-M4 | Timestamp/audit đều | Thêm `updatedAt` cho `Receipt`, `VoucherRedemption`; chuẩn hóa `createdBy/updatedBy` cho bảng nghiệp vụ lõi |
| FIX-M5 | Collation VN | Tạo collation `vi-x-icu` hoặc dùng `unaccent`/`Intl.Collator`; áp cho cột tên khi `orderBy` |
| FIX-M6 | Observability | Bật `pg_stat_statements` (Supabase extension); bật `$on('query')` slow-log ở [`lib/db.ts`](../../lib/db.ts); bật lại Sentry-Prisma integration; thêm CI regen ERD |
| FIX-M7 | Partial index | `CREATE INDEX ... WHERE "deletedAt" IS NULL` cho bảng soft-delete |
| FIX-M8 | Enum drift | Map dứt điểm `DEMO_SCHEDULED`→`TRIAL_SCHEDULED`; cân nhắc lookup table cho enum hay đổi |

---

# P5 — Tối ưu cấp cột (per-column)

> Nguồn: [ERD-review.md § Audit cấp cột](./ERD-review.md). **Chỉ sửa cái "lỗi thật"**, giữ nguyên cái cố ý hợp lý (boolean checklist, Json audit, nullable progressive-capture).

## FIX-COL1 · Tách god-table `CoursePackage` & `Lead` 🟠
**`CoursePackage` (39 cột, 8 Json):**
- Đưa content lặp/danh sách ra bảng con: `CoursePackageFaq` (question, answer, order), `CoursePackageGallery` (imageUrl, order), `CoursePackageOutcome`/`Method` (hoặc giữ Json nếu chỉ render tĩnh, không query).
- Giữ Json cho block render-once thuần text; chỉ tách cái cần query/sửa từng phần (gallery, faq).
**`Lead` (42 cột):** tách nhóm attribution marketing ít dùng → `LeadAttribution` (leadId FK, utm*, adId, campaign, eventId…). Giữ lõi liên hệ/phễu ở `Lead`.
**BE:** đổi read/write qua relation mới; `include` khi cần. **FE:** form CMS gói khóa học sửa theo block con; trang public đọc relation.
**Verify:** typecheck; trang gói khóa học + landing render đúng.

## FIX-COL2 · Float → tiền (4 cột) 🔴
Trùng FIX-H5. Đổi `MarketingCostPeriod.totalQcCost`, `InventoryItem.pricePerUnit`, `StockMovement.unitPrice/totalCost` → `Int`(VND) hoặc `Decimal @db.Decimal(14,2)`.
> KHÔNG đổi `Exam.totalPoints`, `ExamAttempt.totalScore`, `Assignment.totalPoints` (điểm số).
**BE/FE:** xem bẫy serialization Decimal (mục BE/FE). **Verify:** không còn Float ở 4 cột.

## FIX-COL3 · Thêm FK thật cho ~18 cột `*Id` nghiệp vụ 🟠
**Cách (2-phase, an toàn):** khai báo `@relation` + giữ cột nullable; backfill kiểm tra orphan; rồi (tùy chọn) `onDelete: SetNull`/`Restrict`.
Danh sách (lọc khỏi 188, chỉ cột nghiệp vụ sống):

| Bảng | Cột → trỏ |
|---|---|
| `Notification` | `classId→Class`, `studentId→Student` |
| `SurveyResponse` | `studentId→Student`, `classId→Class`, `teacherId→User` |
| `MakeupNeed` | `missedSessionId→ClassSession`, `makeupSessionId→ClassSession`, `missedLessonId→Lesson` |
| `ParentFeedback` | `studentId→Student`, `parentUserId→User` |
| `StudentTransferRequest` | `fromClassId→Class`, `toClassId→Class` |
| `MessengerConversation` | `leadId→Lead` |
| `ConvertConflict` | `leadId→Lead`, `parentAId→User`, `parentBId→User` |

> **Giữ scalar (cố ý):** mọi `*ById` actor + `orgUnitId` (dual-write A0) + snapshot trong `AuditLog`/`*AuditLog` (audit survive deletion).
**Trước khi thêm FK:** chạy query tìm orphan `WHERE xId NOT IN (SELECT id FROM target)` → dọn data rác, nếu không migration FK sẽ fail.
**BE/FE:** không đổi UX; chỉ thêm toàn vẹn DB + cho phép `include`. **Verify:** migration apply không lỗi orphan.

## FIX-COL4 · String → enum (~6 cột) 🟡
- `LeadChild.gender` → enum `Gender` (đồng bộ `Student.gender`).
- `Course.level`, `CoursePackage.level` → enum `SkillLevel` (đã có) / tạo `CourseLevel`.
- `News.category` → enum; `Testimonial.role` → enum.
> Giữ string: `*AuditLog.fromStatus/toStatus`, `Enrollment.discountType` (snapshot bất biến), `Account.type` (NextAuth), `*.mimeType`.
**BE:** Zod đổi sang `z.nativeEnum`; migration map giá trị cũ. **FE:** dropdown đổi sang enum values; bỏ free-text input.
**Verify:** giá trị hợp lệ; data cũ map đủ.

## FIX-COL5 · Thêm `updatedAt` cho bảng mutable (≈6) 🟡
`Attendance`, `LeadTask`, `ClassSessionMedia`, `CommissionRateConfig`, `TeacherReview`, `SurveyResponse` → thêm `updatedAt DateTime @updatedAt`.
> KHÔNG thêm vào log/history bất biến (`AuditLog`, `*AuditLog`, `LeadActivity`, `OrderStatusHistory`, `ProductMovement`, `EmployeeCheckin`…).
**BE/FE:** không đổi (Prisma tự set). **Verify:** update record → `updatedAt` đổi.

> Ghi chú: BigInt cho cột tổng tiền (11 bảng) đã nằm ở **FIX-H6** (P1) — không lặp ở đây.

---

# Vùng code phải sửa (remediation từng file)

> Biến blast-radius ([ERD-impact-map.md](./ERD-impact-map.md)) thành checklist **executable file-by-file**. Mỗi dòng = 1 file + việc cụ thể. ✅ = không cần code (DB-only). Path trong `code span`.
> Quy trình mỗi fix: migration additive → `prisma generate` → `pnpm typecheck` (TS tự chỉ điểm vỡ) → tick lần lượt → test → drop cũ.

## C1 — RLS
- [ ] `prisma/migrations/<ts>_enable_rls/migration.sql` — `ALTER TABLE ... ENABLE/FORCE ROW LEVEL SECURITY` + (tùy chọn) role non-owner. ✅ **0 file app** (đã confirm không dùng supabase-js).

## C2 — timestamptz
- [ ] `prisma/schema.prisma` — thêm `@db.Timestamptz(6)` mọi `DateTime` (trừ `@db.Date` dob, `String "HH:mm"`).
- [ ] migration `ALTER COLUMN ... TYPE timestamptz USING ... AT TIME ZONE 'Asia/Ho_Chi_Minh'` theo từng cột.
- [ ] Rà display (transparent, verify): ~29 input `type=date/datetime-local` — không sửa logic, chỉ smoke-test lịch/chấm công/OTP sau migrate.

## COL5 — updatedAt ✅ DB-only
- [ ] `prisma/schema.prisma` — thêm `updatedAt DateTime @updatedAt` cho `Attendance`, `LeadTask`, `ClassSessionMedia`, `CommissionRateConfig`, `TeacherReview`, `SurveyResponse` + migration backfill default.

## COL3 — FK thật (DB-only + gom include tùy chọn)
- [ ] **Trước migration:** query dọn orphan từng cột (`WHERE xId NOT IN (SELECT id FROM target)`).
- [ ] `prisma/schema.prisma` — thêm `@relation` cho 18 cột (Notification/SurveyResponse/MakeupNeed/ParentFeedback/StudentTransferRequest/MessengerConversation/ConvertConflict).
- [ ] (Tùy chọn) gom manual-join thành `include`: `lib/makeup/service.ts:14-66`, `lib/lms/{makeup-service,attendance-record}.ts`, `lib/transfer/service.ts`, `lib/portal/notifications.ts`, `lib/crm/{convert-lead-v2,dedupe}.ts`.

## C3 — onDelete Restrict + soft-delete (đòn bẩy: scopedDb)
- [ ] `prisma/schema.prisma` — `onDelete: Restrict` cho `Payment.order`, `Receipt.payment`, `Receipt.enrollment`, `OrderItem.order`, `OrderInstallment.order`, `OrderStatusHistory.order`; thêm `deletedAt` cho `Order/Payment/Receipt/Enrollment` (+ `updatedAt` cho Receipt).
- [ ] **`lib/db-scope.ts`** — chèn filter `deletedAt: null` cho 4 model **tập trung 1 chỗ** (+ cập nhật `lib/db-scope.test.ts`).
- [ ] Read-site dùng `db` trần (không qua scopedDb) phải thêm tay: `lib/transfer/service.ts:26,187,194`, `lib/students/{reserve-service:104,renewal:129}.ts`, `lib/lms/pre-session.ts:58`, `lib/progress.ts:181,318`, `lib/transcript/service.ts:71`, `lib/finance/debt.ts:116`, `lib/portal/{learning:24,notifications:43,billing}.ts`, `lib/crm/_handlers/lead-converted.ts:16`, `lib/_handlers/r7-notifications.ts:18`, portal `bai-thi/bai-tap/khao-sat/hinh-anh`, cron `renewal-reminder:30`/`class-reminder:56`.
- [ ] Delete flow: `app/(admin)/admin/enrollments/_actions.ts` `deleteEnrollment:240` (hard→soft) + `deleteEnrollmentAction:294` (giữ guard, đổi `delete`→set `deletedAt`).
- [ ] `scripts/cleanup-zztest.ts:127` — review soft-delete semantics.

## C4 — TOCTOU (tx + CHECK)
- [ ] `app/(admin)/admin/enrollments/_actions.ts` — `enrollStudent:383→402`, `changeEnrollmentStatus:469→498`, `transferEnrollment:588→617`: đưa `count` + `create/update` vào **cùng `$transaction`** (Serializable), re-check trong tx.
- [ ] `app/(admin)/admin/inventory/movements/_actions.ts` — `recordIssue:144`, `recordTransfer:228`, `recordAdjustment`: đưa balance read vào tx + decrement guarded `updateMany({where:{id, quantity:{gte:qty}}})`.
- [ ] migration CHECK: `StockBalance.quantity >= 0`.
- [ ] FE: `app/(admin)/admin/enrollments/_components/{enroll-form,change-status-dialog,transfer-dialog}.tsx`, `inventory/items/_components/movement-actions.tsx` — bắt lỗi `CLASS_FULL`/`STOCK_INSUFFICIENT` → toast + refetch.
- [ ] Test: `tests/e2e/r6/race-guard.spec.ts`, `r6/class-transfer.spec.ts` (mở rộng race 2 promise).

## C5 — trùng mã đơn
- [ ] `lib/orders/code.ts` — bỏ read-then-write, dùng `nextSeq('ORDER', tx)` (mẫu `lib/codegen.ts:26`).
- [ ] `app/(admin)/admin/orders/_actions.ts:283` + `app/(admin)/admin/leads/actions.ts:621` — gọi trong `$transaction`.
- [ ] `prisma/schema.prisma` — `@@unique([code])` trên Order + retry on unique-violation.
- [ ] **MỚI** `lib/orders/code.test.ts` — test 50 đơn song song, 0 trùng.

## H4 — state machine guard
- [ ] **MỚI** `lib/enrollments/status.ts` (mẫu `lib/orders/status.ts`) + dùng trong `enrollments/_actions.ts:430,557`.
- [ ] **MỚI** `lib/sessions/status.ts` + `app/(admin)/admin/sessions/[id]/_actions.ts` `startSession:221` (chặn nếu ≠ SCHEDULED), `completeSession:233` (chỉ IN_PROGRESS).
- [ ] FE: `sessions/[id]/_components/session-checklist.tsx`, `enrollments/_components/{change-status-dialog,transfer-dialog}.tsx` — ẩn/disable action không hợp lệ theo status.
- [ ] **MỚI** test `lib/enrollments/status.test.ts`, `lib/sessions/status.test.ts`.

## H8 / H9 — idempotency + optimistic lock
- [ ] `lib/finance/payment.ts` — `recordPayment:36` thêm idempotency-key param + ghi `IdempotencyKey` trong tx; `reject:173`/`adjust:232`/`refund:295` thêm `updatedAt`-compare (read→`updateMany where updatedAt=seen`).
- [ ] `app/(admin)/admin/orders/_actions.ts` — `changeOrderStatusAction:487`, `updateOrderNoteAction:588` optimistic lock.
- [ ] FE: `payments/_components/payments-client.tsx:221,337` — tạo `uuid` key mỗi submit; `order-detail-client.tsx` — gửi `updatedAt`, xử lý `STALE_WRITE` (modal "tải lại").
- [ ] Test: `lib/finance/payment.test.ts` (idempotency + lock).

## H5 — Float → tiền (4 cột)
- [ ] `prisma/schema.prisma:596,2408,2484,2485` — Float→`Int`/`Decimal(14,2)`.
- [ ] `lib/validators/inventory.ts:89,143` — đổi `nullableFloat`→int/decimal coerce.
- [ ] `app/(admin)/admin/inventory/movements/_actions.ts:80-93` — `totalCost = unitPrice*qty`: nếu Decimal dùng `.mul()`.
- [ ] FE: `inventory/dashboard/page.tsx:88,231`, `inventory/movements/page.tsx:303-306` — `.toNumber()` trước format (nếu Decimal).
- [ ] `app/api/admin/import/inventory-items/route.ts:80,165` — coerce kiểu mới.

## H6 — BigInt tổng tiền (nặng nhất — bẫy serialization)
- [ ] `prisma/schema.prisma` — Int→BigInt: `Order.subtotal/discountAmount/shippingFee/totalAmount`, `OrderItem.unitPrice/totalPrice`, `Payment.amount`, `Enrollment.tuition/listPrice/discountAmount/finalPrice`, `Voucher.discountAmount`, `CommissionLine.amount`, `SataCoinTransaction.amount`, **+`OrderInstallment.amount`** (quyết định #4).
- [ ] **`lib/finance/pricing.ts`** — toán `Math.max/min/round`, `-` → chuyển sang BigInt-safe (bỏ `Math.*`, tự clamp); đây là điểm gốc, sửa trước.
- [ ] **`lib/finance/debt.ts`** — `reduce(s+p.amount)`, compare → BigInt.
- [ ] **`lib/utils.ts:8 formatVnd`** — signature nhận `bigint|number|Decimal`, convert nội bộ.
- [ ] `lib/validators/{order:11,42,43, voucher:19}.ts` — `z.coerce.bigint()` hoặc convert-at-edge.
- [ ] BE ghi: `orders/_actions.ts:145-188` (toán subtotal/total — đổi sang BigInt), `payments/_actions.ts:160,248`, `satacoin/_actions.ts`+`lib/satacoin/service.ts:39-117` (negation/compare), `lib/crm/{convert-lead-v2:75-169,commission:42-85}.ts` (bỏ `Math.round`), `lib/crm/cost-allocation.ts`, `lib/orders/installments.ts`.
- [ ] BE đọc/aggregate: `lib/crm/funnel-query.ts:18`, `lib/vouchers/compute.ts:184-206`, dashboard `accountant/manager/sales-dashboard.tsx`, `cong-no/page.tsx`, `crm/commission/page.tsx`.
- [ ] **FE state**: `orders/_components/order-create-form.tsx` (useState<number>→bigint/string + toán live), `order-detail-client.tsx`, `order-payment-section.tsx:19,113,134` (`dot1+dot2`), `payments-client.tsx:206,224,332,360`, `satacoin-admin.tsx`.
- [ ] **Biên RSC→Client**: thêm DTO convert BigInt→string ở mọi action/RSC trả tiền xuống Client Component.
- [ ] API/CSV: `api/cron/debt-reminder/route.ts:35-88` (JSON.stringify bigint), `lib/crm/commission-export.ts:31-39`.
- [ ] Test: sửa literal `4_000_000`→`4_000_000n` ở `r6/tuition-installments`, `r2/finance-debt`, `r1/cost-allocation`, unit `pricing/debt/commission.test.ts`.

## COL1 — tách god-table
**CoursePackage:**
- [ ] `prisma/schema.prisma` — tạo bảng con `CoursePackageFaq`/`Gallery` (+ curriculum/outcome nếu cần query), bỏ Json tương ứng.
- [ ] `app/(admin)/admin/course-packages/_actions.ts:37-275` — Zod + create/update viết child qua nested-create trong `$transaction`.
- [ ] `_components/{package-form,json-array-editor,faq-editor}.tsx` — bind sang relation; `new/page.tsx`,`[id]/edit/page.tsx` — `include` child.
- [ ] `app/(public)/khoa-hoc/[slug]/page.tsx:95-115,323` — đọc từ relation thay Json.

**Lead → LeadAttribution:**
- [ ] `prisma/schema.prisma` — tạo `LeadAttribution` (utm*/fbclid/gclid/fbp/fbc/eventId/landingPage/referrer/ipAddress/userAgent).
- [ ] Write: `lib/lead/{webhook,ingest}.ts`, `api/leads/route.ts`, `api/public/webhook/google-form/route.ts`, `lib/lead-handover/service.ts` — nested-create attribution.
- [ ] Admin: `leads/actions.ts`, `_components/{lead-form,leads-table,leads-kanban}.tsx`, `lib/validators/lead.ts`, export `api/admin/leads/export/route.ts` + `marketing/page.tsx` (`include: attribution`).

## COL4 — String → enum
- [ ] `LeadChild.gender`→`Gender`: `prisma/schema.prisma` + **migration remap** `"Nam"→MALE` v.v.; `lib/validators/lead.ts:86` (`GenderEnum`); FE `leads/_components/lead-children.tsx:54,139-150,383`; đọc `leads/actions.ts:1221,1232`,`leads/[id]/page.tsx:242`; **boundary** `lib/crm/convert-lead{,-v2}.ts` map khi tạo Student.
- [ ] `Course.level`/`CoursePackage.level`→enum (định nghĩa tập giá trị + remap): `courses/[id]/_actions.ts:33-71`+`course-basics-form.tsx`; `course-packages/_actions.ts:31`+`package-form.tsx`; public pages.
- [ ] `News.category`→enum (⚠️ là **route slug** `(public)/tin-tuc/category/[slug]`): `news/_actions.ts:22`+`news-form.tsx`+ public tin-tuc.
- [ ] ~~`Testimonial.role`~~ — **BỎ** (quyết định #1, là prose tự do).

## M5 — collation VN
- [ ] migration: tạo collation `vi-x-icu` hoặc `COLLATE` trên cột `name`/`fullName` (Prisma không có option locale).
- [ ] Áp orderBy người/HV/lead: `students/page.tsx:201`, `students/_actions.ts:847`, `crm/page.tsx:66`, `cham-cong/lich-ca-nhan-vien/page.tsx:83`, `trials/page.tsx:60,76`, `nhan-su/{[id]/edit:57,new:36}`, `users/{[id]/edit:54,new:68}` (cân nhắc mở rộng Course/Class/Product).

## H10 — hợp nhất AuditLog
- [ ] `lib/audit/log.ts` — thay body `logUserAudit:31`…`logRbacAudit:300` bằng `writeAudit` (giữ signature → call-site không đổi).
- [ ] Ghi `.create` trực tiếp: `students/_actions.ts:427,558,646`, `enrollments/_actions.ts:503,640,654`, `leads/actions.ts:604`, `nhan-su/actions.ts:396`.
- [ ] **Viết lại reader** `app/(admin)/admin/audit-log/_actions.ts` (đọc 5 bảng legacy L126-493 → 1 bảng `AuditLog`) + UI `_components/{audit-log-client,table,detail-modal,filters,export-button}.tsx`.
- [ ] Inline history: `enrollments/[id]/edit/page.tsx:138`, `nhan-su/[id]/edit/page.tsx:83`.
- [ ] Test `a0/{scoped-db,rbac}.spec.ts` (đọc rbacAuditLog). Phase B: drop 11 bảng legacy.

## C6 — retention/erasure/portability (nhiều file MỚI)
- [ ] **MỚI** `app/api/cron/data-retention/route.ts` + entry `vercel.json` (mẫu `audit-log/_actions.ts:540 cleanupOldAuditLogs`).
- [ ] **MỚI** `lib/compliance/erasure.ts` + sửa `students/_actions.ts:206 deleteStudent` (hard-erasure + scrub PII); purge `lib/otp/{service,provider}.ts`.
- [ ] **MỚI** trang portal `app/(portal)/portal/du-lieu/` (page + action export JSON portability).

---

# Ảnh hưởng BE / FE đi kèm mỗi fix

> Lưu ý: stack này là Next.js App Router — **Server Action / lib / RSC = "BE"**, **Client Component (form, table, useTransition) = "FE"**. Một thay đổi DB thường dội lên cả hai. Cột "BE" gồm cả Prisma/Zod/validator/error-mapping; cột "FE" gồm form, bảng, toast, UX trạng thái.

## ⚠️ Bẫy XUYÊN SUỐT — đọc trước khi làm P1

**1. Serialization `BigInt` & `Decimal` (FIX-H6, H5) — bẫy lớn nhất.**
`BigInt` và `Prisma.Decimal` **KHÔNG serialize sang JSON / không truyền được RSC→Client Component** (React báo lỗi "Only plain objects can be passed to Client Components" / `Do not know how to serialize a BigInt`). Bắt buộc **chuyển kiểu ở biên BE→FE**:
- BE: tạo lớp DTO/mapper convert `BigInt → string` (an toàn, không mất chính xác) hoặc `Number` (chỉ khi chắc < 2^53) trước khi `return` từ Server Action / trước khi pass xuống Client Component.
- FE: nhận `string` → `Number(x)` / thư viện money trước khi `toLocaleString('vi-VN')`. Rà mọi nơi format tiền.
- Zod: field tiền đổi sang `z.coerce.bigint()` / `z.number().int()` cho khớp.
→ Đây là lý do H5/H6 phải đi kèm sửa FE, không chỉ migration.

**2. Hợp đồng lỗi (mọi fix thêm error mới).** Theo target API contract (CLAUDE.md): Server Action trả `{ ok:false, error:{ code, message(VI), field?, requestId } }`. Các fix C3/C4/C5/H4/H7/H8/H9 đều **sinh lỗi mới** → FE phải map `error.code` → `toast.error(message)` + xử lý UX tương ứng (disable nút, reload, badge).

## Bảng mapping theo fix

| Fix | BE (Server Action / lib / Prisma / Zod) | FE (Client Component / UX) |
|---|---|---|
| **C4** TOCTOU oversell | Bọc count+create trong `$transaction` Serializable; guarded `updateMany`; throw mã lỗi `CLASS_FULL` / `STOCK_INSUFFICIENT` | Submit form ghi danh/xuất kho phải bắt lỗi mới → toast "Lớp đã đầy / Không đủ tồn"; **refetch sĩ số/tồn** sau lỗi; cân nhắc disable nút khi `_count >= max` (hint, không thay backstop) |
| **C5** Trùng mã đơn | Counter atomic trong tx + retry unique-violation | Không đổi (mã sinh server-side). Chỉ đảm bảo FE không tự đoán mã |
| **C3** onDelete Restrict + soft-delete | `onDelete: Restrict`; thêm `deletedAt`; mọi read filter `deletedAt:null`; xóa → set `deletedAt`; lỗi `HAS_DEPENDENTS` | Nút xóa Order/Payment giờ có thể bị từ chối → toast "Còn ràng buộc, không thể xóa"; danh sách ẩn item soft-deleted; (tùy chọn) tab "Thùng rác" + nút khôi phục |
| **C1** RLS | Migration SQL thô; (tùy chọn) revoke anon ở Supabase | **Không đổi** (Prisma-only) |
| **C2** timestamptz | Thêm `@db.Timestamptz`; migration convert `AT TIME ZONE 'Asia/Ho_Chi_Minh'` | Hiển thị: chuẩn hóa qua `Asia/Ho_Chi_Minh` (date-fns-tz / `Intl` `timeZone`) ở chỗ format ngày-giờ; rà input `datetime-local` (gửi/nhận tz) — lịch, chấm công, hạn TT |
| **H5** Float→Int/Decimal tiền kho | Đổi kiểu; Zod `z.number().int()`/coerce decimal | **Serialization (bẫy #1)** nếu dùng Decimal; format tiền kho ở bảng/inventory |
| **H6** BigInt tổng tiền | Đổi `Int→BigInt`; **DTO convert BigInt→string** ở mọi action trả tiền | **Serialization (bẫy #1)**: `Number()`/money lib trước khi hiển thị; rà toàn bộ ô tổng tiền, doanh thu, dashboard |
| **H7** CHECK constraints | Migration CHECK; map lỗi DB (`23514`) → message VI; Zod mirror (percent 1-100, ≥0) | Form mirror validate (HTML `min/max`, Zod client) để chặn sớm; toast khi DB từ chối |
| **H4** State machine guard | `*_TRANSITIONS` map + `canTransition()`; throw `INVALID_TRANSITION` | **Chỉ render action hợp lệ** theo trạng thái hiện tại (ẩn/disable nút "Mở lại buổi đã xong", "Kích hoạt enrollment đã hủy"); toast khi vi phạm |
| **H8** Idempotency payment-confirm | Đọc/ghi `IdempotencyKey` trong tx; trùng key → trả kết quả cũ | FE **tạo key** (uuid) mỗi lần bấm xác nhận, gửi kèm; double-click/retry an toàn; disable nút khi đang submit |
| **H9** Optimistic lock | `updateMany({where:{id, updatedAt: seen}})`; 0 row → `STALE_WRITE` | Form sửa Order/Payment **mang theo `updatedAt` đã thấy**; lỗi → modal "Người khác vừa sửa, tải lại"; reload data |
| **C6** Retention/erasure/portability | Cron retention; action ẩn danh; endpoint export JSON | **FE mới ở portal**: nút "Xuất dữ liệu của con tôi", "Yêu cầu xóa"; admin: nút "Ẩn danh" + xác nhận 2 bước |
| **C7** Backup/PITR | Cấu hình hạ tầng + runbook | Không đổi |
| **H1** Index Attendance | `@@index` + partial index | Không đổi (nhanh hơn) |
| **H2** Retention/partition | Cron prune + partition SQL | Không đổi |
| **H3** Cache/read-model | `unstable_cache`/revalidate; bảng rollup | (Tùy chọn) badge "cập nhật mỗi N phút"; nút refresh dashboard |
| **H10** Hợp nhất AuditLog | Gộp ghi về `AuditLog`; helper `writeAudit()` | **Component lịch sử/audit đọc 1 bảng** — sửa view "Lịch sử thay đổi" ở mọi trang detail |
| **M1** Naming `@@map` | (Nếu làm) regenerate Prisma Client | Không đổi (Prisma trừu tượng) — nhưng raw SQL/report query phải đổi |
| **M4** updatedAt/audit cột | Thêm `updatedAt`, `createdBy/updatedBy` | Hiển thị "cập nhật lúc / bởi" ở detail (tùy chọn) |
| **M5** Collation VN | `orderBy` dùng collation `vi`/`unaccent` | **Bỏ sort in-memory** nếu có; danh sách tên sắp đúng tự động |
| **M6** Observability | slow-log, pg_stat_statements, Sentry-Prisma | Không đổi |
| **M8** Enum drift | Migration map giá trị | FE bỏ nhánh xử lý giá trị deprecated (vd `DEMO_SCHEDULED`) trong badge/filter |
| **COL1** Tách CoursePackage/Lead | Bảng con (Faq/Gallery…) + relation; read qua `include` | Form CMS sửa theo block con; landing đọc relation |
| **COL2** Float→tiền | Đổi kiểu; (Decimal → bẫy serialization) | Format tiền kho/inventory |
| **COL3** FK thật ~18 cột | Dọn orphan → thêm `@relation` (2-phase) | Không đổi UX |
| **COL4** String→enum | Zod `z.nativeEnum`; migration map | Dropdown đổi sang enum; bỏ free-text |
| **COL5** updatedAt mutable | Thêm `@updatedAt` | Không đổi |

## Nguyên tắc đi kèm khi sửa (mọi fix)

1. **Zod validator là source-of-truth** — đổi schema DB thì đổi `lib/validators/<resource>.ts` cho khớp (kiểu, min/max, required) → type FE tự suy qua `z.infer`.
2. **Mỗi error code mới** → thêm vào bảng map message VI dùng chung, FE chỉ đọc `error.code`.
3. **Type FE bám Prisma type** — sau migrate phải `prisma generate` + `pnpm typecheck`; TS sẽ chỉ ra chỗ FE/BE vỡ (đặc biệt BigInt/Decimal, field mới).
4. **Test 2 tầng**: unit (BE logic/transition/tx) + e2e (FE flow: ghi danh lớp đầy, sửa đụng độ, xóa bị chặn).
5. **Thứ tự an toàn**: migration (additive) → BE (action + Zod + mapper) → FE (form/table/UX) → test → mới drop cũ (2-phase).

---

# Checklist tổng (theo dõi tiến độ)

- [ ] P0 FIX-C4 TOCTOU enrollment + stock (tx + CHECK)
- [ ] P0 FIX-C5 trùng mã đơn (Counter atomic + unique)
- [ ] P0 FIX-C3 onDelete tài chính → Restrict + soft-delete
- [ ] P0 FIX-C1 bật RLS toàn bộ public
- [ ] P1 FIX-C2 timestamptz toàn bộ
- [ ] P1 FIX-H5 bỏ Float tiền kho
- [ ] P1 FIX-H6 BigInt tổng tiền
- [ ] P1 FIX-H7 CHECK constraints
- [ ] P1 FIX-H4 guard state machine Enrollment/Session
- [ ] P1 FIX-H8 idempotency payment-confirm
- [ ] P1 FIX-H9 optimistic lock edit tiền
- [ ] P2 FIX-C6 retention + erasure + portability (NĐ13)
- [ ] P2 FIX-C7 PITR + test restore
- [ ] P3 FIX-H1 index Attendance
- [ ] P3 FIX-H2 retention + partition
- [ ] P3 FIX-H3 cache/read-model dashboard
- [ ] P3 FIX-H10 hợp nhất AuditLog
- [ ] P4 FIX-M1..M8 vệ sinh & vận hành
- [ ] P5 FIX-COL1 tách god-table CoursePackage/Lead
- [ ] P5 FIX-COL2 Float→tiền (4 cột)
- [ ] P5 FIX-COL3 FK thật ~18 cột *Id nghiệp vụ
- [ ] P5 FIX-COL4 String→enum (~6 cột)
- [ ] P5 FIX-COL5 updatedAt bảng mutable (~6)

> Mỗi mục = 1 PR + migration đặt tên rõ + test. Verify chuẩn repo: `pnpm typecheck && pnpm lint && pnpm build` + test e2e/unit liên quan xanh trước khi báo PASS.
