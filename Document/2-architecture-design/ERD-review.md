# ERD / Database Design Review — Sata Robo VN

> Rà soát thiết kế database (`prisma/schema.prisma` — 150 bảng · 105 enum · 1792 cột · 127 migration) đối chiếu với bộ nguyên tắc thiết kế PostgreSQL/Supabase.
> Snapshot: 2026-06-17. Bằng chứng trích dẫn `file:line` để truy nguyên.
>
> Tài liệu liên quan: [ERD-database-attributes.md](./ERD-database-attributes.md) (ERD đầy đủ cột/khóa) · [ERD-fix-plan.md](./ERD-fix-plan.md) (kế hoạch sửa).

## Mức độ ưu tiên

| Ký hiệu | Nghĩa |
|---|---|
| 🔴 Critical | Rủi ro mất dữ liệu / bảo mật / pháp lý — sửa sớm |
| 🟠 High | Nợ kỹ thuật rõ ràng, ảnh hưởng đúng đắn/hiệu năng theo thời gian |
| 🟡 Medium | Lệch chuẩn, nên sửa khi có dịp |
| ✅ OK | Làm đúng, ghi nhận |

## Bảng điểm tổng quan

| Nhóm | Tiêu chí | Điểm | Verdict |
|---|---|---|---|
| Cấu trúc | Chuẩn hóa 3NF/1NF | 8/10 | ✅ Native array, junction tường minh |
| Cấu trúc | Naming convention | 5/10 | 🟡 PascalCase số ít, trùng keyword SQL, 0 `@@map` |
| Cấu trúc | PK & ID strategy | 6/10 | 🟡 `cuid()` toàn bộ, 0 `uuid` |
| Cấu trúc | Kiểu dữ liệu | 4/10 | 🔴 0 `timestamptz`, `Float` tiền kho, 0 `BigInt` |
| Cấu trúc | Constraints (CHECK/NOT NULL) | 5/10 | 🟠 0 `CHECK` |
| Cấu trúc | Index | 8/10 | ✅ 342 `@@index` (0 partial) |
| Toàn vẹn | Referential integrity / onDelete | 5/10 | 🔴 Tài chính dùng `Cascade` |
| Runtime | Concurrency & consistency | 4/10 | 🔴 TOCTOU oversell, 0 isolation/lock |
| Runtime | Scalability (phình bảng) | 4/10 | 🔴 0 partition/retention, `Attendance` thiếu time-index |
| Runtime | Read/write & cache | 5/10 | 🟠 0 materialized view, 0 read-cache |
| Vòng đời | Migration zero-downtime | 7/10 | 🟠 2 `ALTER COLUMN TYPE` lock hot table |
| Vòng đời | Lifecycle & tuân thủ NĐ13 | 3/10 | 🔴 0 retention/erasure/portability |
| Vòng đời | Backup & DR | 3/10 | 🔴 Doc-only, chưa test restore |
| Nghiệp vụ | State machine & temporal | 6/10 | 🟠 Enrollment/Session không guard; effective-dating ✅ |
| Nghiệp vụ | Multi-tenancy | 6/10 | 🟠 `scopedDb` + dual-write dở |
| Vận hành | Observability | 5/10 | 🟠 0 COMMENT/pg_stat_statements/slow-log |
| Vận hành | Supabase RLS / API boundary | 2/10 | 🔴 0 RLS, 0 policy |
| Vận hành | i18n & collation | 5/10 | 🟠 Sort tiếng Việt sai |
| Vận hành | Testing / seed reference | 8/10 | ✅ Seed có version, idempotent |

**Tổng quan: ~5.5/10** — Cấu trúc nghiệp vụ trưởng thành & phủ rộng, nhưng dính nhiều lỗi tầng *vận hành/runtime/tuân thủ* mà schema tĩnh không lộ. Mang dấu vết hệ thống đang migrate (A0→R5).

---

# 🔴 CRITICAL

## C1. Supabase RLS — 0 bảng bật, 0 policy
**Bằng chứng:** `grep "ROW LEVEL SECURITY"` & `"CREATE POLICY"` trên toàn bộ 127 migration → **0 hit**.
**Rủi ro:** Mọi bảng schema `public` (gồm `Payment`, `Student` — dữ liệu trẻ em, `Employee.salary`) bị PostgREST tự expose. Nếu anon/service key lộ → đọc/ghi tự do. Prisma đi qua role đặc quyền nên RLS không cản Prisma — nhưng đó chính là lý do phải bật RLS làm **lớp phòng thủ chiều sâu**.
**Ghi chú:** App hiện không dùng `@supabase/supabase-js` (Prisma-only) nên chưa khai thác được qua client, nhưng bề mặt tấn công vẫn mở.

## C2. `timestamptz` — 0/345 cột timestamp có timezone
**Bằng chứng:** `@db.Timestamptz` = **0**; 345 field `DateTime` → Prisma map mặc định `timestamp(3)` **KHÔNG tz**.
**Rủi ro:** "Lỗi kinh điển" — sai giờ khi server/lib đổi timezone. Ảnh hưởng chấm công, lịch học, hạn thanh toán, OTP `expiresAt`. Hiện chưa lệch vì mọi thứ cùng giờ VN, nhưng là quả bom hẹn giờ.

## C3. Xóa dây chuyền dữ liệu tài chính (`onDelete: Cascade`)
**Bằng chứng:** Chỉ 3 `Restrict` toàn schema. Tiền lại Cascade:
- `Payment.order → Cascade` ([`schema.prisma:4405`](../../prisma/schema.prisma#L4405))
- `Receipt.payment → Cascade` ([`:4443`](../../prisma/schema.prisma#L4443)) · `Receipt.enrollment → Cascade` ([`:4441`](../../prisma/schema.prisma#L4441))
- `OrderItem.order → Cascade` ([`:2934`](../../prisma/schema.prisma#L2934))

**Rủi ro:** `Order` **không** soft-delete → xóa 1 Order là bay sạch Payment + Receipt + lịch sử. Dữ liệu tài chính phải `Restrict`/`NoAction`.

## C4. TOCTOU — bán vượt sĩ số / âm kho
**Bằng chứng:** Check điều kiện **ngoài** transaction, không backstop DB:
- Sĩ số lớp: đọc `_count.enrollments >= maxStudents` [`enrollments/_actions.ts:383`](../../app/(admin)/admin/enrollments/_actions.ts#L383) → `create` `:403`. Cũng lặp ở `changeEnrollmentStatus:469`, `transferEnrollment:588`.
- Xuất kho: đọc `balance.quantity < qty` ngoài tx [`inventory/movements/_actions.ts:144`](../../app/(admin)/admin/inventory/movements/_actions.ts#L144) → `decrement` (không `WHERE quantity >= n`, không `CHECK`).

**Rủi ro:** 2 request đồng thời → lớp vượt sĩ số / tồn kho âm. Không có unique/exclusion/CHECK nào chặn.

## C5. Trùng mã đơn hàng (race read-then-write)
**Bằng chứng:** [`lib/orders/code.ts:10`](../../lib/orders/code.ts#L10) `findFirst orderBy code desc` + `parseInt+1`, gọi **ngoài** `$transaction` ([`orders/_actions.ts:283`](../../app/(admin)/admin/orders/_actions.ts#L283)), không retry. Chính comment trong file thừa nhận. (Các mã khác qua `Counter` upsert-atomic — an toàn; riêng order code lọt lưới.)

## C6. Vòng đời dữ liệu & tuân thủ NĐ13 — 0 cơ chế
**Bằng chứng:** 9 cron (`vercel.json`) đều reminder/dispatch/sync, **0 job retention/ẩn danh**. `grep deleteMany|anonymize|purge|expire|retention` trên `app/api/cron` → 0.
- OTP/PII tích vô hạn: `OtpDeliveryLog.target` lưu email/SĐT thô mãi mãi (dù `expiresAt` có index [`schema:3773`](../../prisma/schema.prisma#L3773), không ai xóa row hết hạn).
- Lead LOST, log, messenger không có đường hết hạn.
- **Erasure/portability:** `deleteStudent` chỉ soft-delete admin-initiated ([`students/_actions.ts:206`](../../app/(admin)/admin/students/_actions.ts#L206)); **không** có luồng phụ huynh yêu cầu xóa/xuất dữ liệu.

**Rủi ro pháp lý cao:** học viên là trẻ 6–14 tuổi → NĐ13/2023 Điều 9 (quyền xóa) & Điều 16 (xóa khi hết mục đích) bị hở.

## C7. Backup / PITR / DR — chỉ có trong tài liệu
**Bằng chứng:** CLAUDE.md + [`04-infrastructure.md:128`](../2-architecture-design/04-infrastructure.md) nói "RPO 24h/RTO 4–8h, PITR tùy tier" nhưng **0** script backup, **0** cron, **0** log test-restore, **0** IaC bật PITR. PITR ghi rõ "tùy tier" → có thể chưa bật.
**Nguyên tắc:** backup chưa test = chưa có backup.

---

# 🟠 HIGH

## H1. `Attendance` — bom hẹn giờ hiệu năng
Bảng tăng nhanh nhất (HS × buổi; ~500 HS × 40 buổi/năm/cơ sở ⇒ >1M dòng trong vài năm) nhưng **thiếu index thời gian** (`createdAt`), lại bị 6+ module đọc live: [`lib/risk/service.ts:94`](../../lib/risk/service.ts#L94), [`lib/students/progress.ts:104`](../../lib/students/progress.ts#L104), `renewal.ts:173`, `lifecycle.ts:154`, `lms/pre-session.ts:63`.

## H2. 0 partition · 0 retention · 0 materialized view
`grep PARTITION|MATERIALIZED VIEW|CREATE VIEW` trên migrations → 0. Các bảng append-heavy phình vô hạn: `DomainEvent` (mỗi mutation +1 row, DONE không prune), `AuditLog` + **11 bảng `*AuditLog` legacy** cùng tồn tại (double-write), `MessengerMessage` (CRM Messenger-first), `Notification`/`StaffNotification`, `WebhookDelivery` (lưu full payload Json).

## H3. Dashboard/report chạy live trên OLTP, 0 cache
`unstable_cache` = 0; Redis chỉ dùng rate-limit; dashboard không `revalidate`. Mỗi request recompute: [`manager-dashboard.tsx:63`](../../app/(admin)/admin/dashboard/_components/manager-dashboard.tsx#L63) 5× `lead.count` + `lead.groupBy` + `student.count`; sales/marketing tương tự. Chỉ `CommissionStatement` & `AdsInsightDaily` là read-model có sẵn (✅).

## H4. State machine hở — nhảy trạng thái phi lý
- **Enrollment** không có transition map: `CANCELLED→ACTIVE`, `COMPLETED→PENDING` đều qua ([`enrollments/_actions.ts:430`](../../app/(admin)/admin/enrollments/_actions.ts#L430), chỉ chặn no-op + `from=TRANSFERRED`).
- **ClassSession** không guard: `startSession` không check status hiện tại → mở lại buổi đã COMPLETED ([`sessions/[id]/_actions.ts:226`](../../app/(admin)/admin/sessions/[id]/_actions.ts#L226)).
- (Order ✅ có `TRANSITIONS` map [`lib/orders/status.ts:4`](../../lib/orders/status.ts#L4); Lead permissive có chủ đích.)

## H5. Tiền dùng `Float` (sai số làm tròn)
VND để `Int` là OK (không có hào), nhưng kho dùng `Float`:
`totalQcCost Float` ([`schema:596`](../../prisma/schema.prisma#L596)), `pricePerUnit Float?` ([`:2408`](../../prisma/schema.prisma#L2408)), `unitPrice Float?` ([`:2484`](../../prisma/schema.prisma#L2484)), `totalCost Float?` ([`:2485`](../../prisma/schema.prisma#L2485)).

## H6. Tràn `Int` cho tổng tiền
`BigInt` = 0. `Int` max ≈ **2,147,483,647 VND (~2.1 tỷ)**. Cột tổng/combo/doanh thu năm (`totalAmount` [`:2871`](../../prisma/schema.prisma#L2871), gói combo, thống kê) dễ vượt → cần `BigInt`.

## H7. 0 CHECK constraint
Luật nghiệp vụ chỉ nằm ở comment chứ DB không ép: `discountPercent // 1-100` ([`:3042`](../../prisma/schema.prisma#L3042)), `finalPrice // clamp ≥ 0` ([`:1301`](../../prisma/schema.prisma#L1301)), `quantity ≥ 0`. Prisma không hỗ trợ CHECK ở schema → thêm SQL thô trong migration.

## H8. Idempotency chưa phủ payment-confirm
`IdempotencyKey` chỉ wired vào [`convert-lead-v2.ts:56`](../../lib/crm/convert-lead-v2.ts#L56). Xác nhận thanh toán chỉ dựa state-guard `updateMany WHERE status=PENDING` — functionally idempotent nhưng thiếu idempotency-key cấp request (Doc 15 OI-21).

## H9. 0 optimistic-lock / isolation / row-lock
`$transaction` 111 chỗ nhưng **0 `isolationLevel`** (mặc định READ COMMITTED), 0 `version` token concurrency (chỉ `Curriculum.version` là semantic [`:1970`](../../prisma/schema.prisma#L1970)), 0 `FOR UPDATE`. Hai admin sửa cùng Order/Payment → lost-update không được bảo vệ.

## H10. Audit log phân mảnh (nghịch blueprint)
11 bảng `*AuditLog` riêng (`Lead/Student/Order/Voucher/Product/Class/Role/User/PaymentMethod/Enrollment/Rbac`) song song với `AuditLog` hợp nhất. Doc 15 chốt "AuditLog hợp nhất 1 bảng + mask PII". Khó query lịch sử xuyên thực thể, khó mask/watermark tập trung, khó tái dựng trạng thái tại thời điểm T.

---

# 🟡 MEDIUM

## M1. Naming convention
0 `@@map`/`@map` → bảng `PascalCase` số ít. Trùng keyword SQL: `User`, `Order`, `Account`, `Document`, `Note`, `Question`, `Choice`, `Survey`, `Promotion`, `Counter`, `News`, `Lesson`, `Room`, `Holiday`. Prisma tự bọc `"..."` nên app chạy ổn; chỉ đau khi viết SQL thô / RLS / PostgREST. Impact thấp do Prisma-only — nhưng cộng hưởng với gap RLS.

## M2. `cuid()` thay `uuid`
144 `cuid()`, 0 `uuid`, 0 `@db.Uuid`. Ưu: không lộ số lượng. Nhược: không join thẳng `auth.users` (uuid) nếu sau này dùng Supabase Auth; khác chuẩn khuyến nghị.

## M3. Migration lock hot table
2 migration `ALTER COLUMN ... TYPE` (= ACCESS EXCLUSIVE + full rewrite) trên bảng nóng: `User.role` ([`20260528000000_rename_roles_add_parent`](../../prisma/migrations)) và `Lead.status` ([`20260528040000_extend_lead_status`](../../prisma/migrations)). Không zero-downtime nếu chạy trên bảng lớn.

## M4. Quy ước timestamp/soft-delete/audit không đều
`createdAt` 127/150, `updatedAt` 88/150 (thiếu ở `Receipt`, `VoucherRedemption`). Soft-delete chỉ ~6/150 bảng. `createdBy` 26 / `updatedBy` 7 — rải rác.

## M5. Sort tiếng Việt sai (collation)
`orderBy: { name: "asc" }` ([`students/page.tsx:178`](../../app/(admin)/admin/students/page.tsx#L178)) trên collation mặc định → Đ/Ă/Ơ sắp sai thứ tự. 0 `COLLATE`/`unaccent`. Chỉ 1 chỗ sort VN-aware in-memory ([`action-labels.ts:103`](../../lib/auth/action-labels.ts#L103)).

## M6. Observability mỏng
0 `COMMENT ON`, 0 `pg_stat_statements`, 0 slow-query log ([`lib/db.ts:45`](../../lib/db.ts#L45) chỉ log error/warn). Sentry wired nhưng Prisma-integration bị comment ([`sentry.server.config.ts:20`](../../sentry.server.config.ts#L20)). ERD docs untracked, không có CI sync.

## M7. 0 partial index
Bảng soft-delete không có partial index `WHERE deletedAt IS NULL`.

## M8. Enum native nhiều (105) & có giá trị deprecated
Danh mục biến động (LeadStatus đã thêm/deprecate `DEMO_SCHEDULED`) để native enum → sửa khó. Cân nhắc lookup table cho loại hay đổi.

---

# ✅ Làm đúng (ghi nhận)

- **3NF/1NF**: dùng `text[]` native (không CSV-in-text), junction tường minh (`TeacherCourse`, `RolePermission`, `ExamQuestion`, `MediaStudentTag`).
- **Effective-dating xuất sắc**: snapshot giá 4 thành phần `Enrollment` ([`:1296`](../../prisma/schema.prisma#L1296)), `OrderItem` snapshot, `CommissionRateConfig`/`UserOrgRole`/`CourseDiscount` có `effectiveFrom/To`.
- **Transaction phủ tốt** mọi mutation tiền ([`lib/finance/payment.ts`](../../lib/finance/payment.ts)).
- **Counter codegen atomic** (upsert-increment) cho student/employee/class/lead/invoice code.
- **Consent media enforce thật** ([`lib/lms/media-consent.ts`](../../lib/lms/media-consent.ts)); `studentId` không lộ trên URL portal.
- **Sentry PII-safe** (`sendDefaultPii:false`, strip cookies/auth).
- **Type tốt**: `text` thay `varchar` (chỉ 2 VarChar), `Json`→`jsonb`.
- **Index FK dày** (342 `@@index`), tên index/constraint có nghĩa.
- **Pooling chuẩn** (`directUrl` + `pgbouncer=true`).
- **Seed reference data** có version, idempotent (`upsert`).
- **Order state machine** có transition map; **migration** phần lớn an toàn (expand-contract ở Honor 2-phase).

---

# Audit cấp cột (per-column optimization)

> Quét bằng [`scripts/analyze-columns.cjs`](../../scripts/analyze-columns.cjs) trên 150 bảng / 1792 cột. Đã **tách "lỗi thật" khỏi "cố ý hợp lý"** để không over-fix.

## Số liệu

| Mùi | Số lượng | Verdict |
|---|---|---|
| God-table (>30 cột) | 5 | 🟠 |
| Nullable ≥70% (bảng ≥8 cột) | 4 | 🟡 một phần do progressive-capture |
| Float cho tiền | 4 (thật) | 🔴 |
| Int cho cột tổng/tiền | 11 bảng | 🟠 BigInt cho aggregate |
| FK ngầm / orphan (`*Id` không `@relation`) | 188 cột | 🟠 ~18 nên là FK thật |
| String nên là enum | ~6 (thật) | 🟡 |
| Thiếu `updatedAt` | 44 (≈6 thật) | 🟡 log thì đúng |
| Boolean flag ≥4 | 3 | ✅ chấp nhận |
| Json ≥2 cột | 12 | ✅ trừ CoursePackage |

## PC1. God-table 🟠
- **`CoursePackage`** — 39 cột + **8 cột Json** (`features, highlights, curriculum, outcomesJson, methodsJson, conditionsJson, faqsJson, galleryImageUrlsJson`). Content CMS nhồi vào 1 bảng OLTP; `gallery/faqs/curriculum` nên là **bảng con/relation**.
- **`Lead`** — 42 cột, 83% nullable; trộn liên hệ + phễu + attribution marketing + convert + commission → tách `LeadAttribution` vệ tinh.
- Khác: `Student` 36 (83% null), `Employee` 35, `Class` 31.

## PC2. Float cho tiền (4 cột thật) 🔴
`MarketingCostPeriod.totalQcCost` ([`schema:596`](../../prisma/schema.prisma#L596)), `InventoryItem.pricePerUnit` ([`:2408`](../../prisma/schema.prisma#L2408)), `StockMovement.unitPrice` ([`:2484`](../../prisma/schema.prisma#L2484)), `StockMovement.totalCost` ([`:2485`](../../prisma/schema.prisma#L2485)).
> ⚠️ Giữ nguyên `Exam.totalPoints`, `ExamAttempt.totalScore`, `Assignment.totalPoints` — là **điểm số**, không phải tiền.

## PC3. FK ngầm — 188 cột `*Id` không `@relation` 🟠 (phát hiện lớn)
Gần một nửa "quan hệ" không được DB ràng buộc. Chia 2:
- **Giữ (cố ý):** snapshot audit (`AuditLog.actorId/entityId`), `orgUnitId` (dual-write A0 sẽ thành FK), `*ById` actor (audit survive deletion).
- **Nên là FK thật (~18 cột nghiệp vụ sống):** `Notification.classId/studentId`, `SurveyResponse.studentId/classId/teacherId`, `MakeupNeed.missedSessionId/makeupSessionId/missedLessonId`, `ParentFeedback.studentId/parentUserId`, `StudentTransferRequest.fromClassId/toClassId`, `MessengerConversation.leadId`, `ConvertConflict.leadId/parentAId/parentBId`. Để scalar → dễ orphan (trỏ row đã xóa), join thủ công.

## PC4. String nên là enum (~6 thật) 🟡
- `LeadChild.gender` để **String** trong khi `Student.gender` = enum `Gender` → **không nhất quán**.
- `Course.level`, `CoursePackage.level` → enum `SkillLevel`.
- `News.category`, `Testimonial.role` → enum.
> ⚠️ Giữ: `EnrollmentAuditLog.fromStatus/toStatus`, `RoleAuditLog.fromRole/toRole`, `Enrollment.discountType` (**snapshot string bất biến** có chủ đích); `Account.type/token_type` (chuẩn NextAuth); `*.mimeType` (tập mở).

## PC5. Bảng mutable thiếu `updatedAt` (≈6 thật) 🟡
`Attendance` (status đổi khi điểm danh), `LeadTask` (status), `ClassSessionMedia` (moderation), `CommissionRateConfig`, `TeacherReview`, `SurveyResponse`.
> ⚠️ 44 bảng thiếu nhưng đa số là **log/history bất biến** (`AuditLog`, `*AuditLog`, `LeadActivity`, `OrderStatusHistory`, `ProductMovement`, `EmployeeCheckin`…) → **không cần** updatedAt, đừng thêm.

## ✅ Chấp nhận được — KHÔNG over-fix
- **Boolean flag** (`CenterDayChecklist` 11, `ClassSession` 9, `PaymentMethod` 6): checklist/capability độc lập, không phải state machine → boolean đúng.
- **Json audit/log** (`oldValues/newValues/metadata`, `request/responsePayload`): chuẩn.
- **Nullable cao `Lead`/`Student`**: progressive capture hợp lý; chỉ ép NOT NULL field bắt buộc lúc tạo.
- **Int cho VND**: đúng (không có hào); chỉ `BigInt` cho cột tổng/aggregate.

---

# Nguyên tắc đào sâu hơn (deeper audit lenses)

Các ống kính bổ sung để tiếp tục moi lỗi (kèm cách check):

| # | Lens | Cách check | Dự đoán |
|---|---|---|---|
| 1 | Bất biến nghiệp vụ (cross-field) | CHECK/test cho `finalPrice = listPrice − discount`, `Σpayments ≤ order.total`, `quantity ≥ 0` | 🔴 Thiếu (0 CHECK) |
| 2 | FK ngầm / orphan | Cột `xxxId` không `@relation` (audit "no FK" defensive) → ID mồ côi | 🟠 Có chủ đích ở audit |
| 3 | Nullable tràn lan | Đếm cột `?` ở bảng lõi (`Student` gần như mọi cột nullable) → DB không ép required | 🟠 Cần đo |
| 4 | Enum chết / drift | Giá trị deprecated còn trong data? (`DEMO_SCHEDULED`) | ⚠️ Có |
| 5 | Index thừa/thiếu | `pg_stat_user_indexes` idx_scan=0; composite sai thứ tự cột | Cần runtime |
| 6 | Tái dựng trạng thái tại thời điểm T | Audit đủ trả lời "đơn lúc 10:00 ngày X ở trạng thái nào"? | 🟠 Audit phân mảnh |
| 7 | N+1 query | Vòng lặp gọi Prisma trong `.map`/loop thay vì `include`/`in` | Cần soi code |
| 8 | PII rò vào log/audit Json | `AuditLog.diff`/`DomainEvent.payload`/Sentry chứa SĐT/sức khỏe? | 🔴 Cần kiểm |
| 9 | Money overflow | `Int` cho cột tổng/doanh thu năm | 🟠 (H6) |
| 10 | Boolean flag bùng nổ | Nhiều `isX`/`hasY` thay 1 `status` | Cần đo |

---

# Phụ lục — số liệu quét

| Chỉ số | Giá trị |
|---|---|
| Bảng / Enum / Cột | 150 / 105 / 1792 |
| Migration | 127 |
| `@@index` / `@@unique` / partial index | 342 / 35 / 0 |
| `onDelete`: Cascade / SetNull / Restrict | 81 / 41 / 3 |
| `$transaction` call sites / có isolationLevel | 111 / 0 |
| `@db.Timestamptz` / DateTime fields | 0 / 345 |
| `@db.Decimal` / Float fields / BigInt | 0 / 18 / 0 |
| `cuid()` / `uuid()` | 144 / 0 |
| RLS enable / CREATE POLICY / CHECK / COMMENT ON | 0 / 0 / 0 / 0 |
| `@@map` / `@map` | 0 / 0 |
| Soft-delete (deletedAt) bảng | ~6 |
| Retention/anonymization cron | 0 |
| Materialized view / partition | 0 / 0 |
| God-table (>30 cột) | 5 |
| FK ngầm / orphan (`*Id` không `@relation`) | 188 |
| Float cho tiền (thật) | 4 |
| String nên là enum (thật) | ~6 |
| Bảng mutable thiếu `updatedAt` (thật) | ~6 |
