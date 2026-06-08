# Doc 3 — Database Design

> **Ai đọc:** Backend Dev, DBA.
> **Nguồn sự thật:** `prisma/schema.prisma` (138 models, 68 enums, 47 migrations). Doc này là bản đồ — khi xung đột, schema thắng.
> 🔄 **ĐỒNG BỘ DOC 15 (2026-06-06):** phần Identity/Org trong doc này mô tả **HIỆN TRẠNG** (Role enum, `User.centerId`). Thiết kế ĐÍCH đã chốt ở Doc 15 §2 + §11 — xem **mục 9** cuối file. Khi A0 chạy, schema mới thắng mô tả as-is.
> **Cập nhật:** 2026-06-06.

---

## 1. Tổng quan

- **DB:** PostgreSQL (Supabase) · **ORM:** Prisma 5 (`prisma-client-js`).
- **Connection:** `DATABASE_URL` = transaction pooler `:6543` (runtime), `DIRECT_URL` = session pooler `:5432` (migrate). Username dạng `postgres.<project-ref>`. ⚠️ Direct host `db.<ref>.supabase.co` chỉ có IPv6 — luôn dùng pooler (xem `.claude/rules/prisma-db.md`).
- **Quy mô:** 138 models · 68 enums · 47 migrations (từ `20260509_init` → `20260528_add_class_group`).

## 2. ERD mức domain (29 domain)

```mermaid
erDiagram
    Center ||--o{ Room : has
    Center ||--o{ Class : has
    Center ||--o{ Lead : has
    Center ||--o{ Holiday : has
    Center ||--o{ Order : has
    Center ||--o{ StockBalance : has

    Lead ||--o{ TrialClass : schedules
    Lead ||--o{ LeadActivity : timeline
    Lead ||--o{ Note : has
    Lead ||--o{ LeadTask : followup
    User ||--o{ Lead : "assignedTo"
    TrialClass ||--|| TrialFeedback : has

    Course ||--o{ Curriculum : versions
    Curriculum ||--o{ Lesson : contains
    Course ||--o{ Class : instances
    Course }o--o{ Course : "prerequisite (CoursePrerequisite)"
    CoursePackage ||--o{ OrderItem : sold

    ClassGroup ||--o{ Class : groups
    ClassGroup ||--o{ Student : "cohort members"
    Class ||--o{ ClassSession : sessions
    Class ||--o{ Enrollment : enrolls
    Class ||--o{ Exam : has
    Class ||--o{ Assignment : has
    Lesson ||--o{ ClassSession : maps
    User ||--o{ Class : "teacher/assistant"
    Room ||--o{ Class : hosts

    Student ||--o{ Enrollment : has
    Student ||--o{ Attendance : has
    Student ||--o{ ExamAttempt : takes
    Student ||--o{ AssignmentSubmission : submits
    Student ||--o{ SataCoinTransaction : ledger
    Student ||--o{ StudentRiskAlert : flagged
    Student ||--o{ ParentRequest : requests
    User ||--o{ Student : "parentUser (PARENT)"
    ClassSession ||--o{ Attendance : records

    Question ||--o{ Choice : options
    Exam ||--o{ ExamQuestion : contains
    ExamQuestion }o--|| Question : uses
    ExamAttempt ||--o{ ExamAnswer : answers
    Assignment ||--o{ AssignmentSubmission : receives
    AssignmentSubmission ||--o{ SubmissionRubricScore : rubric

    Order ||--o{ OrderItem : items
    Order ||--o{ OrderInstallment : "max 2 đợt"
    Order ||--o{ OrderStatusHistory : history
    PaymentMethod ||--o{ Order : pays
    Voucher ||--o{ VoucherRedemption : redeemed
    VoucherRedemption ||--|| Order : applies
    OrderItem }o--|| Enrollment : "type=COURSE_ENROLLMENT"
    OrderItem }o--|| Product : "type=PRODUCT"

    Employee ||--o{ Honor : honored
    User ||--|| Employee : "1-1 optional"
    User ||--o{ UserPermissionGrant : grants
    User ||--|| TeacherProfile : "role TEACHER"

    InventoryItem ||--o{ StockBalance : "per center"
    InventoryItem ||--o{ StockMovement : ledger
    InventoryAudit ||--o{ InventoryAuditItem : lines

    EmailTemplate ||--o{ EmailLog : sent
```

## 3. Nhóm model theo domain (đầy đủ)

| # | Domain | Models |
|---|---|---|
| 1 | Auth & quyền | `User`, `Account`, `VerificationToken`, `UserPermissionGrant`, `UserAuditLog`, `PermissionGrantAuditLog` |
| 2 | Tổ chức | `Center` (geofence lat/lng/radius), `Room`, `Holiday` |
| 3 | CRM / Lead | `Lead`, `Note`, `LeadActivity`, `LeadTask`, `LeadDuplicate`, `LeadAssignmentConfig`, `LeadTransfer`, `LeadAssignmentHistory`, `LeadAuditLog`, `TrialClass`, `TrialFeedback` |
| 4 | Khóa học & giáo trình | `Course`, `CoursePrerequisite`, `CoursePackage`, `Curriculum`, `Lesson` |
| 5 | Học viên & lớp | `Student`, `Class`, `ClassGroup` (cohort, codegen `CS<n>.LOP.<YY>.<seq>`), `Enrollment`, `EnrollmentAuditLog` |
| 6 | Giáo viên | `TeacherProfile`, `TeacherCourse`, `TeacherReview` |
| 7 | Nhân sự | `Employee` (self-relation managerId, isCEO), `RoleAuditLog` |
| 8 | Vinh danh | `Honor`, `SitePageContent`, `TimelineItem` |
| 9 | Content/Marketing | `PageContent`, `News`, `MarketingConfig`, `ZMRoboKit` |
| 10 | Tuyển dụng | `JobPosting`, `JobApplication` |
| 11–15 | LMS | `Question`+`Choice` · `Exam`+`ExamQuestion`+`ExamAttempt`+`ExamAnswer` · `Document` · `Assignment`+`AssignmentDocument`+`AssignmentSubmission`+`SubmissionRubricScore` · `ClassSession`(checklist ck*)+`Attendance`+`StudentSessionFeedback`+`StudentSkillAssessment`+`ProgressReportLog` |
| 16 | Kho linh kiện | `InventoryItem`, `StockBalance` (unique itemId+centerId), `StockMovement` (ledger, transferPairId), `InventoryAudit`, `InventoryAuditItem` |
| 17 | Đơn hàng | `PaymentMethod`, `Order` (code `ORD-YYMMDD-XXXXX`), `OrderItem` (polymorphic), `OrderStatusHistory`, `OrderInstallment` (tối đa 2 đợt), `PaymentMethodAuditLog` |
| 18 | Voucher | `Voucher`, `VoucherRedemption` (orderId unique), `VoucherAuditLog` |
| 19 | Sản phẩm | `Product` (SKU), `ProductMovement` (snapshot stock before/after), `ProductAuditLog` |
| 20 | Email | `EmailTemplate` (trigger-based), `EmailLog`, `EmailQueue` (attempts/maxAttempts) |
| 21 | Thông báo | `Notification` (audience ALL/CENTER/CLASS/STUDENT), `StaffNotification` (dedupeKey), `ParentRequest`, `ParentFeedback` |
| 22 | Media | `ClassSessionMedia` (PENDING→APPROVED), `MediaStudentTag` |
| 23 | Chấm công NV | `ShiftRegistration`, `EmployeeCheckin` (GPS + geofence + qrToken), `TimesheetAdjustmentRequest`, `TimesheetEditLog`, `CenterDayChecklist` (unique centerId+date) |
| 24 | OTP | `OtpRequest` (codeHash HMAC-SHA256), `OtpDeliveryLog` |
| 25 | Vòng đời học viên | `MakeupNeed`, `StudentRiskAlert`, `StudentCareTask`, `StudentReserve`, `CourseCompletion` (certificateCode unique), `StudentTransferRequest`, `StudentCenterHistory` |
| 26 | Khảo sát | `Survey`, `SurveyQuestion`, `SurveyResponse` (NPS 0-10) |
| 27 | SataCoin | `SataCoinTransaction` (ledger bất biến, reversal 1-1), `SataCoinRule` |
| 28 | Integration | `ZaloMessageLog`, `IntegrationConfig`, `IntegrationLog` (MISA) |
| 29 | Tiện ích | `Counter` (sequence codegen, key vd `HV:CS1:26`), `WebhookDelivery` (idempotency) |

## 4. Enums quan trọng (rút gọn — đủ 68 enum trong schema)

| Enum | Giá trị | Dùng cho |
|---|---|---|
| `Role` | SUPER_ADMIN, CENTER_MANAGER, HR, SALES_CSM, TEACHER, MARKETING, ACCOUNTANT, **PARENT** | User |
| `LeadStatus` | NEW → ASSIGNED → CONTACTED / NO_ANSWER → CONSULTING → TRIAL_SCHEDULED → TRIAL_ATTENDED → AWAITING_DECISION → ENROLLED · NURTURING / LOST / DUPLICATE / DEMO_SCHEDULED | Pipeline CRM |
| `EnrollmentStatus` | PENDING → CONFIRMED → STUDYING → PAUSED / COMPLETED / WITHDREW / TRANSFERRED (+legacy ACTIVE, CANCELLED) | Ghi danh |
| `ClassStatus` | PLANNED → RECRUITING → PENDING_APPROVAL → ACTIVE → COMPLETED / CANCELLED | Lớp |
| `OrderStatus` | DRAFT → PENDING_PAYMENT → CONFIRMED → COMPLETED / CANCELLED / REFUNDED | Đơn hàng |
| `AttendanceStatus` / `MakeupStatus` | PRESENT, ABSENT, LATE, EXCUSED / NONE, NEEDS_MAKEUP, MADE_UP | Điểm danh |
| `RiskAlertType` | CONSECUTIVE_ABSENCE, HIGH_ABSENCE, MISSED_SUBMISSIONS, NEEDS_SUPPORT, NEARING_END_NO_RENEWAL, OVERDUE_PAYMENT | Cảnh báo rủi ro |
| `GrantType` | ALLOW, DENY | Per-user permission |

## 5. Chiến lược index

Pattern nhất quán theo query path thực tế:

1. **FK + filter kép:** `(status, centerId)`, `(classId, status)`, `(studentId, status)` — list page admin.
2. **Timeline:** `(xxxId, createdAt)` cho mọi bảng audit/log/activity.
3. **Unique nghiệp vụ:** `studentCode`, `classCode`, `examCode`, `certificateCode`, `Order.code`, `Voucher.code`, `(itemId, centerId)` StockBalance, `(centerId, date)` CenterDayChecklist, `dedupeKey` StaffNotification, `(source, externalId)` WebhookDelivery.
4. **Soft delete:** `(deletedAt)` trên User/Lead/Student/Class/ClassGroup — **mọi query phải filter `deletedAt: null`**.
5. **Dedup lead:** `Lead(phone)` + `LeadDuplicate(duplicatePhone)`.

## 6. Migration plan & quy tắc

- `pnpm db:migrate` (prisma migrate dev) — tên rõ nghĩa; **KHÔNG edit migration đã apply**; sau migrate **restart dev server** (Prisma Client cache).
- **2-phase migration** khi đổi nguồn data: Phase A add column mới + helper đọc (vd `getHonorView`), giữ cột cũ nullable → Phase B drop sau 2–3 ngày ổn định prod. (Honor old columns `fullName/jobTitle/avatarUrl/yearsAtCompany` đang chờ Phase B.)
- CI chạy `prisma migrate deploy` vào Postgres 16 service container.
- ❌ Cấm: `$queryRawUnsafe`, `prisma migrate reset` trên prod (hook block).

## 7. Seed data

| Lệnh | File | Seed gì |
|---|---|---|
| `pnpm db:seed` | `prisma/seed.ts` | Centers, Users (mỗi role), Courses, Classes, Students, Enrollments, Sessions, Attendance — idempotent upsert |
| `pnpm db:seed:courses` | `prisma/seed-courses.ts` | Sata1–8 + Combo (+ prerequisite chain) |
| `pnpm db:seed:teacher-profiles` | `prisma/seed-teacher-profiles.ts` | TeacherProfile cho User TEACHER thiếu |
| — | `prisma/seed-honors.ts` | Employees + Honor + SitePageContent |
| — | `prisma/seed-payment-methods.ts` | CASH, BANK_TRANSFER, VNPAY, TINGEE, COD |
| — | `prisma/seed-email-templates.ts` | 12+ EmailTemplate theo trigger |
| — | `prisma/seed-coursepackage-content.ts`, `scripts/seed-{news,job-postings,course-packages}.ts` | Nội dung marketing |

Lưu ý: `TimelineItem` không có unique field → seed dùng `findFirst` + create-or-update. Seed CEO: set `isCEO=true` và clear cờ record khác.

## 8. Pattern thiết kế dữ liệu nổi bật

1. **Audit trail 8 domain** — bảng `*AuditLog` riêng: oldValues/newValues JSON + changedFields[] + actor snapshot.
2. **Snapshot/denormalize** — Order lưu customer info; Honor lưu jobTitleAtTime; `*ByName` lưu kèm `*ById` (chống mất tên khi user đổi/xóa).
3. **Immutable ledger** — `SataCoinTransaction`, `StockMovement`, `ProductMovement`: không update, chỉ append (+ REVERSAL/ADJUSTMENT).
4. **Polymorphic OrderItem** — `type` + 4 FK nullable (enrollment/package/examAttempt/product).
5. **Counter codegen** — sinh mã tuần tự an toàn (`HV:CS1:26` → SV code).
6. **Json fields** — features/highlights/curriculum/metadata/payload cho nội dung linh hoạt.

## 9. 🔄 TARGET Identity/Org (đồng bộ Doc 15 §2/§11 — A0 sẽ thay phần as-is)

### 9.1 Model mới (PR-A0-01/02/08)

| Model | Spec chốt |
|---|---|
| `OrgUnit` | type: **ROOT / HO / CENTER / CAMPUS / PARTNER / FRANCHISE** · tree `parentId` · `address` (chỉ là thông tin địa điểm — **KHÔNG dùng address suy ra quan hệ quản lý**) · validate unique `code` + no parent cycle · soft delete |
| Seed | **ROOT (SataRobo) → HO · CS1 (211 Nguyễn Hữu Thọ) · CS2 (114 Hoàng Diệu) độc lập ngang hàng**. HO và CS2 **có thể cùng address nhưng khác OrgUnit** — HO không thuộc CS2. CS1/CS2 chỉ là seed ban đầu, không phải giới hạn |
| `RoleDef` + `RolePermission` | Role động trong DB (không enum); chỉ SUPER_ADMIN tạo/sửa/xóa + audit + reason. **Không có HO_MANAGER** |
| `UserOrgRole` | **Many-to-many User × OrgUnit × RoleDef** + `effectiveFrom/effectiveTo/status`. Nguồn phân quyền chính — **không dùng `user.centerId` làm source of truth** |
| `EmployeeOrgAssignment` | Tách riêng (nhân sự/kiêm nhiệm/lương): `effectiveFrom/effectiveTo/status` + `assignmentType` (PRIMARY/SECONDARY/SUPPORT/SUBSTITUTE/SHARED) + `allocationPercent`. **KHÔNG tự cấp quyền** |

### 9.2 Quy tắc dữ liệu quyền

- Permission conflict: **ALLOW thắng nếu ≥1 role cho phép** — KHÔNG dùng DENY override giai đoạn này (grant DENY hiện hữu của 5.3 phải rà soát trước khi cắt — Doc 15 NC-3).
- HO role = cross-center theo chức năng (HO_ACCOUNTANT/HO_HR/HO_MARKETING xem+sửa toàn hệ thống theo module; HO_SALE xem lead scope A&B, không sửa).
- Field chuyển dần (2-phase, drop ở Phase C): `User.role`, `User.roles[]`, `User.centerId` → `UserOrgRole`.
- Bảng mới từ nay có `orgUnitId` (Doc 15 Q6).
- Index baseline + data lifecycle (partition AuditLog, archive DomainEvent/MessengerMessage...): Doc 15 §13.2.
