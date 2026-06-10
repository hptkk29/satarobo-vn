# 01 — Database + ERD (hiện trạng)

> Nguồn: `prisma/schema.prisma` — **119 model · 54 enum**. PostgreSQL/Supabase + Prisma 5.

## Nhóm model theo domain

### A. Tổ chức / RBAC / Nhân sự
`Center` · `OrgUnit` (cây, `parentId` self-ref + `centerId`) · `RoleDef` · `RolePermission` (`roleId`, `action`, `scopeType`) · `UserOrgRole` (user×orgUnit×role, có `effectiveFrom/To/status`) · `User` (`centerId`, `employeeId`) · `Employee` (`centerId`, `managerId`) · `EmployeeOrgAssignment` (kiêm nhiệm — KHÔNG sinh quyền) · `TeacherProfile` · `TeacherCourse` · `TeacherReview` · `UserPermissionGrant` (ALLOW/DENY per-user) · `RbacAuditLog`.

### B. CRM / Lead / Messenger
`Lead` (`centerId`, `courseId`, `assignedToId`, funnel fields: `qualifiedAt/handedAt/receivedConfirmedAt/assignedAt/firstContactAt`, `commissionSource`) · `LeadActivity` · `LeadTask` · `LeadDuplicate` · `LeadTransfer` · `LeadAssignmentConfig` · `LeadAssignmentHistory` · `Note` · `MessengerConversation` (`centerId`, `leadId`) · `MessengerMessage` · `FacebookPageMapping` · `LeadAuditLog`.

### C. Tài chính
`Order` (`studentId`, `leadId`, `centerId`, `code`, `status`, `totalAmount`) · `OrderItem` (polymorphic: enrollment/package/exam/product) · `OrderInstallment` (2 đợt) · `OrderStatusHistory` · `PaymentMethod` · `Voucher` + `VoucherRedemption` · `CommissionStatement` + `CommissionLine` · `MarketingCostPeriod` · `Counter` (sinh mã INV/mã HV).

### D. Học viên / SIS
`Student` (`parentUserId`→User, `centerId`, `preferredCenterId`, `classGroupId`, `name`, `studentCode`, `parentPhone`) · `StudentReserve` · `StudentTransferRequest` · `StudentCenterHistory` · `StudentRiskAlert` · `StudentCareTask`.

### E. LMS / Giáo dục
`Course` · `CoursePrerequisite` · `CoursePackage` · `Curriculum` (`courseId`, `version`, `status`) · `Lesson` (`curriculumId`, `order`) · `ClassGroup` · `Class` (`courseId`, `centerId`, `teacherId`, `assistantId`, `roomId`, `classGroupId`) · `ClassSession` (`classId`, `lessonId`, `date`) · `Enrollment` (`studentId`, `classId`, `courseId`, `status`) · `Attendance` (`sessionId`, `studentId`, `status`, `makeupStatus`) · `MakeupNeed` (`studentId`, `classId`, `centerId`, `missedSessionId`, `status`) · `StudentSessionFeedback` · `StudentSkillAssessment` · `CourseCompletion` · `Exam`/`ExamQuestion`/`ExamAttempt`/`ExamAnswer` · `Question`/`Choice` · `Assignment` (`classId`, `lessonId`, `kind`, `dueAt`) · `AssignmentSubmission` (`status`, `score`, `submittedAt`) · `SubmissionRubricScore` · `ProgressReportLog`.

### F. HR / Chấm công
`ShiftRegistration` (`userId`, `centerId`, `shifts`) · `EmployeeCheckin` (`userId`, `centerId`, `type`, `latitude`, `longitude`, `distanceMeters`, `withinGeofence`, `qrToken`) · `TimesheetAdjustmentRequest` · `TimesheetEditLog` · `CenterDayChecklist` · `RoleAuditLog`.

### G. Audit & Event
`AuditLog` (hợp nhất A0-06: actor/module/entityType/entityId/action/oldValues/newValues/reason/orgUnitId) · các bảng cũ `UserAuditLog`/`LeadAuditLog`/`StudentAuditLog`/`ClassAuditLog`/`EnrollmentAuditLog`/`PermissionGrantAuditLog` · `DomainEvent` (outbox: status PENDING/PROCESSING/DONE/FAILED, `dedupeKey`, `attempts`).

### H. Email / Notify / OTP
`EmailTemplate` · `EmailLog` · `EmailQueue` (`toEmail`, `contextType/contextId`, `status`) · `Notification` (phụ huynh) · `StaffNotification` (nhân viên) · `OtpRequest` + `OtpDeliveryLog`.

### I. Marketing / Content / Tuyển dụng
`News` · `Honor` · `TimelineItem` · `SitePageContent` · `JobPosting` + `JobApplication` · `MarketingConfig` · `AdsInsightDaily` · `MarketingReport`.

### J. Kho / Sản phẩm / Robot
`ZMRoboKit` · `Product` + `ProductMovement` · `InventoryItem` · `StockBalance` (`centerId`) · `StockMovement` (`centerId`) · `InventoryAudit` + `InventoryAuditItem`.

### K. Học thử / Phản hồi / Yêu cầu PH
`TrialClass` + `TrialFeedback` · `StudentConsent` (`studentId`, `type=CLASS_MEDIA`, `status=GRANTED/REVOKED`) · `ParentRequest` (`studentId`, `type`, `status`, `response`) · `ParentFeedback` · `Room` · `Holiday` · `ClassSessionMedia` (`classId`, `status`, tags) + `MediaStudentTag`.

### L. Khảo sát / Tích hợp / Khác
`Survey`/`SurveyQuestion`/`SurveyResponse` · `SataCoinTransaction` + `SataCoinRule` · `WebhookDelivery` · `IntegrationConfig`/`IntegrationLog` · `ZaloMessageLog` · `Account`/`VerificationToken` (NextAuth).

## Quan hệ then chốt (cho ERD)

```
User ──parentUserId──< Student ──< Enrollment >── Class >── Course
 │                        │            │            │
 │                        │            │            └─ Curriculum ──< Lesson
 │                        │            └─ Order ──< OrderItem
 │                        ├─< Attendance >── ClassSession ──lessonId── Lesson
 │                        ├─< MakeupNeed                    (Class ──< ClassSession)
 │                        ├─< StudentConsent
 │                        ├─< ParentRequest
 │                        └─< ClassSessionMedia (via MediaStudentTag)
 │
 ├──< UserOrgRole >── RoleDef ──< RolePermission(action, scopeType)
 ├──< Employee ──< EmployeeOrgAssignment >── OrgUnit
 └──assignedToId──< Lead ──< MessengerConversation ──< MessengerMessage
                     │
                     └── Order (lead→convert→order)

OrgUnit (ROOT → HO | CS1 | CS2 ngang hàng) ──centerId── Center
Center ──< Class, Room, Holiday, Order, Employee, EmployeeCheckin, ...
```

**Luồng chốt lead (R2-02):** `Lead(ENROLLED)` → `User(PARENT, PENDING_ACTIVATION)` → `Student` → `Enrollment` → `Order(code INV-…)` — tất cả trong **1 transaction**.

## Model có `centerId` (cách ly cơ sở — scopedDb)
`Center` · `User` · `Lead` · `MessengerConversation` · `FacebookPageMapping` · `Class` · `Room` · `Holiday` · `Student` · `Employee` · `StockBalance` · `StockMovement` · `InventoryAudit` · `EmployeeCheckin` · `ShiftRegistration` · `TimesheetAdjustmentRequest` · `MakeupNeed` · `StudentRiskAlert` · `StudentCareTask` · `Order` · `LeadAssignmentConfig` · `SataCoinTransaction` · `SataCoinRule` · `Notification` · `Survey` · `SurveyResponse` · `MarketingCostPeriod` · `ClassGroup` · `CenterDayChecklist`.

> **SCOPED_MODELS** (auto-scope qua `scopedDb`, ~27): Lead, Order, Student, Class, TrialClass, Room, Holiday, InventoryAudit, StockBalance, StockMovement, Employee, EmployeeCheckin, CenterDayChecklist, MakeupNeed, Notification, ShiftRegistration, SataCoinTransaction, StudentCareTask, StudentCenterHistory, StudentRiskAlert, Survey, SurveyResponse, TimesheetAdjustmentRequest, MessengerConversation.
> **SCOPE_EXEMPT** (có centerId nhưng KHÔNG scope): OrgUnit, User, LeadAssignmentConfig, SataCoinRule, FacebookPageMapping.

## Enum quan trọng (54 tổng)
- **RBAC:** `Role`(SUPER_ADMIN, CENTER_MANAGER, HR, SALES_CSM, TEACHER, MARKETING, ACCOUNTANT, PARENT) · `ScopeType`(GLOBAL, CENTER, CLASS, OWN, CHILDREN, ASSIGNED) · `OrgUnitType`(ROOT, HO, CENTER, CAMPUS, PARTNER, FRANCHISE) · `AssignStatus`(ACTIVE, SUSPENDED, EXPIRED) · `GrantType`(ALLOW, DENY).
- **Lead:** `LeadStatus`(NEW, ASSIGNED, CONTACTED, NO_ANSWER, CONSULTING, TRIAL_SCHEDULED, TRIAL_ATTENDED, AWAITING_DECISION, ENROLLED, NURTURING, LOST, DUPLICATE, DEMO_SCHEDULED) · `CommissionSource`(MARKETING_ADMIN, SALE_SELF, REFERRAL) · `CommissionStatus`(DRAFT, APPROVED, REOPENED) · `LeadAssignMode`(ROUND_ROBIN, CLOSE_RATE, MANUAL).
- **Finance:** `OrderType`(COURSE, PACKAGE, EXAM, PRODUCT, COMBO) · `OrderStatus`(DRAFT, PENDING_PAYMENT, CONFIRMED, COMPLETED, CANCELLED, REFUNDED) · `InstallmentStatus`(PENDING, PAID) · `CostPeriodStatus`(DRAFT, CONFIRMED, REOPENED).
- **LMS:** `EnrollmentStatus`(ACTIVE, CANCELLED, PENDING, CONFIRMED, STUDYING, PAUSED, COMPLETED, WITHDREW, TRANSFERRED) · `ClassStatus`(PLANNED, RECRUITING, PENDING_APPROVAL, ACTIVE, COMPLETED, CANCELLED) · `CurriculumStatus`(DRAFT, ACTIVE, ARCHIVED) · `AttendanceStatus`(PRESENT, ABSENT, LATE, EXCUSED) · `MakeupStatus`(NONE, NEEDS_MAKEUP, MADE_UP) · `MakeupNeedStatus`(PENDING, SCHEDULED, COMPLETED, CANCELLED) · `AssignmentKind`(CLASSWORK, HOMEWORK) · `SubmissionStatus`(NOT_SUBMITTED, SUBMITTED, LATE, GRADED).
- **HR:** `WorkShift`(CA_SANG, CA_CHIEU, CA_TOI) · `ShiftRegStatus`(REGISTERED, LEAVE_REQUESTED, APPROVED) · `CheckinType`(CHECK_IN, CHECK_OUT) · `AdjustStatus`(PENDING, APPROVED, REJECTED).
- **Học viên / PH:** `StudentStatus`(ACTIVE, PAUSED, GRADUATED, INACTIVE) · `AccountStatus`(PENDING_ACTIVATION, ACTIVE, DISABLED) · `ConsentType`(CLASS_MEDIA) · `ConsentStatus`(GRANTED, REVOKED) · `MediaStatus`(PENDING, APPROVED, REJECTED) · `ParentRequestType`(ABSENCE, MAKEUP, TRANSFER_CLASS, TRANSFER_CENTER, RESERVE, OTHER) · `ParentRequestStatus`(PENDING, APPROVED, REJECTED, CANCELLED).
- **Hệ thống:** `WebhookStatus`(RECEIVED, PROCESSED, FAILED, DUPLICATE) · `EmailQueueStatus`(PENDING, SENT, FAILED) · `OtpChannel`(EMAIL, SMS) · `OtpPurpose`(ACTIVATION, RESET, CHANGE_CONTACT) · `ReportPeriodType`(WEEK, MONTH).

## Lưu ý migration
- Migration đã apply → KHÔNG sửa. `pnpm db:migrate --name <tên>` cho thay đổi mới.
- Multi-phase (2-phase) khi đổi nguồn data: add cột mới + populate + đọc qua helper → drop cột cũ sau khi ổn định.
- Supabase: dùng pooler (IPv4) — DATABASE_URL (transaction pooler :6543), DIRECT_URL (session pooler :5432).
