# ERD chuẩn (PostgreSQL) — Sata Robo VN

> Sinh tự động từ `prisma/schema.prisma` bằng `scripts/gen-erd.cjs` (snapshot 2026-06-17).
> 150 bảng, 105 enum. Mỗi cụm là 1 `erDiagram` Mermaid **có đầy đủ cột + kiểu Postgres + PK/FK/UK**.
> Mở bằng VS Code (*Markdown Preview Mermaid Support*) hoặc GitHub để render.
>
> Ký hiệu khóa: **PK** primary key · **FK** foreign key · **UK** unique. Cột FK ghi chú `-> Bảng đích`; `null` = nullable; `array` = mảng Postgres.
> Cardinality: `||--o{` 1—n (con optional) · `||--o|` 1—1 · `(self)` quan hệ tự tham chiếu.
>
> ⚠️ Kiểu `timestamp` ở đây phản ánh **hiện trạng** (Prisma map `DateTime` → `timestamp(3)` KHÔNG timezone vì schema chưa dùng `@db.Timestamptz`). Đây là một lỗi thiết kế — xem [ERD-review.md](./ERD-review.md) mục [5]. Đích cần đạt là `timestamptz`.

**Mục lục cụm:**

- 1. Tổ chức · Identity · RBAC
- 2. Lead / CRM / Marketing
- 3. Học vụ — Course / Class / Enrollment
- 4. Student & Portal phụ huynh
- 5. Giáo viên & Đánh giá
- 6. Thi & Bài tập
- 7. Đơn hàng · Thanh toán · Khuyến mãi
- 8. Kho / Vật tư (Inventory)
- 9. Trial (học thử) V1 & V2
- 10. HR · Chấm công · CMS · Tuyển dụng
- 11. Hệ thống · Tích hợp · Hạ tầng

---

## 1. Tổ chức · Identity · RBAC

```mermaid
erDiagram
    Center {
        text id PK
        text code UK "null"
        text name
        text slug UK
        text address
        text ward "null"
        text district "null"
        text city
        text phone "null"
        text email "null"
        text googleMapUrl "null"
        text workingHours "null"
        text managerName "null"
        double latitude "null"
        double longitude "null"
        integer allowedRadiusMeters "null"
        text logoUrl "null"
        text bannerUrl "null"
        text description "null"
        boolean isActive
        integer displayOrder
        timestamp createdAt
        timestamp updatedAt
    }
    OrgUnit {
        text id PK
        OrgUnitType type
        text code UK
        text name
        text address "null"
        text parentId FK "-> OrgUnit null"
        text centerId UK "null"
        boolean isActive
        timestamp deletedAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    User {
        text id PK
        text name "null"
        text email UK
        timestamp emailVerified "null"
        text password "null"
        text image "null"
        Role role
        Role roles "array"
        text centerId FK "-> Center null"
        text orgUnitId "null"
        boolean isActive
        timestamp deletedAt "null"
        timestamp createdAt
        timestamp updatedAt
        integer tokenVersion
        timestamp lastLoginAt "null"
        AccountStatus accountStatus
        text employeeId FK,UK "-> Employee null"
    }
    Account {
        text id PK
        text userId FK "-> User"
        text type
        text provider UK
        text providerAccountId UK
        text refresh_token "null"
        text access_token "null"
        integer expires_at "null"
        text token_type "null"
        text scope "null"
        text id_token "null"
        text session_state "null"
    }
    VerificationToken {
        text identifier UK
        text token UK
        timestamp expires
    }
    Employee {
        text id PK
        text employeeCode UK
        text fullName
        text jobTitle
        Department department
        text departmentId FK "-> DepartmentDef null"
        text avatarUrl "null"
        text email UK "null"
        timestamp joinedAt "null"
        text bio "null"
        boolean isActive
        boolean isPublic
        integer displayOrder
        text phone "null"
        timestamp dateOfBirth "null"
        Gender gender "null"
        ContractType contractType "null"
        integer salaryRank "null"
        integer salaryLevel "null"
        timestamp endDate "null"
        double bhxhBase "null"
        text address "null"
        text emergencyContact "null"
        text notes "null"
        text nationalId "null"
        EmploymentStatus status
        text subjects "array"
        text certifications "array"
        text centerId FK "-> Center null"
        text orgUnitId "null"
        text managerId FK "-> Employee null"
        boolean isCEO
        timestamp createdAt
        timestamp updatedAt
        text createdById FK "-> User null"
    }
    DepartmentDef {
        text id PK
        text code UK
        text name
        integer displayOrder
        boolean isTeaching
        boolean isActive
        timestamp createdAt
        timestamp updatedAt
    }
    RoleDef {
        text id PK
        text code UK
        text name
        boolean isSystem
        boolean isActive
        timestamp createdAt
        timestamp updatedAt
    }
    RolePermission {
        text roleId PK,FK "-> RoleDef"
        text action PK
        ScopeType scopeType
    }
    UserOrgRole {
        text userId PK
        text orgUnitId PK
        text roleId PK,FK "-> RoleDef"
        timestamp effectiveFrom
        timestamp effectiveTo "null"
        AssignStatus status
        text grantedById
        timestamp createdAt
    }
    EmployeeOrgAssignment {
        text id PK
        text employeeId
        text orgUnitId
        text roleInOrg "null"
        AssignmentType assignmentType
        timestamp effectiveFrom
        timestamp effectiveTo "null"
        AssignStatus status
        integer allocationPercent "null"
        text createdById
        timestamp createdAt
    }
    UserPermissionGrant {
        text id PK
        text userId FK,UK "-> User"
        text action UK
        GrantType grant
        text reason "null"
        text grantedBy FK "-> User"
        timestamp createdAt
        timestamp updatedAt
    }
    RbacAuditLog {
        text id PK
        text entity
        text entityId
        text action
        text changedByUserId "null"
        text changedByName
        jsonb oldValues "null"
        jsonb newValues "null"
        text reason
        jsonb metadata "null"
        timestamp createdAt
    }
    RbacShadowDiff {
        text id PK
        text action
        text userId
        boolean v1
        boolean v2
        text targetKey "null"
        timestamp createdAt
    }
    RoleAuditLog {
        text id PK
        text employeeId FK "-> Employee"
        text fromRole
        text toRole
        text changedByUserId "null"
        text changedByName
        text reason "null"
        timestamp createdAt
    }
    UserAuditLog {
        text id PK
        text userId FK "-> User"
        text action
        text changedByUserId "null"
        text changedByName
        jsonb oldValues "null"
        jsonb newValues "null"
        text changedFields "array"
        text reason "null"
        jsonb metadata "null"
        timestamp createdAt
    }
    PermissionGrantAuditLog {
        text id PK
        text userId FK "-> User"
        text grantId "null"
        text actionKey
        text action
        text changedByUserId "null"
        text changedByName
        text oldGrant "null"
        text newGrant "null"
        text reason "null"
        jsonb metadata "null"
        timestamp createdAt
    }
    OrgUnit ||--o{ OrgUnit : "OrgUnitTree (self)"
    Employee ||--o| User : "UserEmployee"
    Center ||--o{ User : "centerId"
    User ||--o{ Account : "userId"
    DepartmentDef ||--o{ Employee : "departmentId"
    Center ||--o{ Employee : "centerId"
    Employee ||--o{ Employee : "EmployeeManager (self)"
    User ||--o{ Employee : "EmployeeCreatedBy"
    RoleDef ||--o{ RolePermission : "roleId"
    RoleDef ||--o{ UserOrgRole : "roleId"
    User ||--o{ UserPermissionGrant : "UserPermissionGrants"
    User ||--o{ UserPermissionGrant : "UserPermissionGrantor"
    Employee ||--o{ RoleAuditLog : "employeeId"
    User ||--o{ UserAuditLog : "UserAuditLogs"
    User ||--o{ PermissionGrantAuditLog : "UserGrantAudits"
```

---

## 2. Lead / CRM / Marketing

```mermaid
erDiagram
    Lead {
        text id PK
        text parentName
        text phone
        text email "null"
        text childName "null"
        integer childAge "null"
        text centerId FK "-> Center null"
        text orgUnitId "null"
        text courseId FK "-> Course null"
        text assignedToId FK "-> User null"
        LeadStatus status
        text source "null"
        text utmSource "null"
        text utmMedium "null"
        text utmCampaign "null"
        text utmContent "null"
        text utmTerm "null"
        text fbclid "null"
        text gclid "null"
        text fbp "null"
        text fbc "null"
        text eventId UK "null"
        text landingPage "null"
        text referrer "null"
        text ipAddress "null"
        text userAgent "null"
        boolean consentMarketing
        text note "null"
        text handoverNote "null"
        text convertedById "null"
        timestamp convertedAt "null"
        timestamp qualifiedAt "null"
        timestamp handedAt "null"
        timestamp receivedConfirmedAt "null"
        timestamp assignedAt "null"
        timestamp firstContactAt "null"
        CommissionSource commissionSource "null"
        text adminId "null"
        timestamp deletedAt "null"
        timestamp createdAt
        timestamp updatedAt
        timestamp lastActivityAt "null"
    }
    LeadChild {
        text id PK
        text leadId FK "-> Lead"
        text fullName
        date dob "null"
        integer ageYears "null"
        text gender "null"
        text schoolName "null"
        text gradeLevel "null"
        text interestedCourseId "null"
        text interestedCenterId "null"
        text note "null"
        LeadChildTrialStatus trialStatus
        timestamp createdAt
        timestamp updatedAt
    }
    Note {
        text id PK
        text content
        text leadId FK "-> Lead"
        text authorId FK "-> User"
        timestamp createdAt
        timestamp updatedAt
    }
    LeadActivity {
        text id PK
        text leadId FK "-> Lead"
        text actorId "null"
        text actorName
        LeadActivityType type
        text content
        jsonb metadata "null"
        timestamp createdAt
    }
    LeadTask {
        text id PK
        text leadId FK "-> Lead"
        text assignedToId "null"
        text assignedToName "null"
        text title
        text description "null"
        timestamp dueAt
        timestamp completedAt "null"
        LeadTaskStatus status
        timestamp createdAt
    }
    LeadDuplicate {
        text id PK
        text primaryLeadId FK "-> Lead"
        text duplicatePhone
        text source "null"
        timestamp matchedAt
    }
    LeadTransfer {
        text id PK
        text leadId
        text fromCenterId "null"
        text toCenterId "null"
        text fromSaleId "null"
        text toSaleId "null"
        text note
        text reason "null"
        text transferredById "null"
        text transferredByName
        timestamp createdAt
    }
    LeadAuditLog {
        text id PK
        text leadId FK "-> Lead"
        text action
        text changedByUserId "null"
        text changedByName
        jsonb oldValues "null"
        jsonb newValues "null"
        text changedFields "array"
        text reason "null"
        jsonb metadata "null"
        timestamp createdAt
    }
    LeadAssignmentConfig {
        text id PK
        text centerId UK
        LeadAssignMode mode
        timestamp createdAt
        timestamp updatedAt
    }
    LeadAssignmentHistory {
        text id PK
        text leadId FK "-> Lead"
        text fromUserId "null"
        text toUserId "null"
        text assignedById "null"
        text reason "null"
        timestamp createdAt
    }
    ConvertConflict {
        text id PK
        text leadId
        text parentAId
        text parentBId
        ConvertConflictStatus status
        text resolvedById "null"
        text note "null"
        timestamp createdAt
        timestamp updatedAt
    }
    MessengerConversation {
        text id PK
        text pageId UK
        text psid UK
        text parentName "null"
        text phone "null"
        text status
        text centerId "null"
        text orgUnitId "null"
        timestamp firstMessageAt "null"
        timestamp respondedAt "null"
        text leadId "null"
        timestamp createdAt
        timestamp updatedAt
    }
    MessengerMessage {
        text id PK
        text conversationId FK "-> MessengerConversation"
        text direction
        text text "null"
        jsonb attachments "null"
        text externalEventId UK "null"
        timestamp sentAt
        timestamp createdAt
    }
    FacebookPageMapping {
        text id PK
        text pageId UK
        text pageName "null"
        OrgUnitType scopeType
        text centerId "null"
        boolean isActive
        timestamp createdAt
    }
    MarketingReport {
        text id PK
        ReportPeriodType periodType UK
        text periodKey UK
        text submittedById UK
        jsonb snapshot
        timestamp submittedAt
    }
    MarketingCostPeriod {
        text id PK
        text period UK
        double totalQcCost
        CostPeriodStatus status
        text confirmedById "null"
        timestamp confirmedAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    AdsInsightDaily {
        text id PK
        date date UK
        text channel UK
        double spend
        integer impressions
        integer clicks
        text source
        timestamp createdAt
        timestamp updatedAt
    }
    MarketingConfig {
        text id PK
        text key UK
        jsonb value
        timestamp createdAt
        timestamp updatedAt
    }
    CommissionStatement {
        text id PK
        text period UK
        CommissionStatus status
        text approvedById "null"
        timestamp approvedAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    CommissionLine {
        text id PK
        text statementId FK "-> CommissionStatement"
        text recipientId
        text tier
        integer amount
        boolean isClawback
        text leadId "null"
    }
    CommissionRateConfig {
        text id PK
        text tier
        double rate
        timestamp effectiveFrom
        timestamp effectiveTo "null"
        text reason "null"
        text createdById "null"
        text createdByName "null"
        timestamp createdAt
    }
    Lead ||--o{ LeadChild : "leadId"
    Lead ||--o{ Note : "leadId"
    Lead ||--o{ LeadActivity : "leadId"
    Lead ||--o{ LeadTask : "leadId"
    Lead ||--o{ LeadDuplicate : "LeadDuplicates"
    Lead ||--o{ LeadAuditLog : "LeadAuditLogs"
    Lead ||--o{ LeadAssignmentHistory : "leadId"
    MessengerConversation ||--o{ MessengerMessage : "conversationId"
    CommissionStatement ||--o{ CommissionLine : "statementId"
```

<details><summary>FK liên cụm (4)</summary>

- `Lead.centerId` → `Center` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Lead.courseId` → `Course` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `Lead.AssignedLeads` → `User` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Note.authorId` → `User` *(cụm 1. Tổ chức · Identity · RBAC)*

</details>

---

## 3. Học vụ — Course / Class / Enrollment

```mermaid
erDiagram
    CourseCategoryDef {
        text id PK
        text code UK
        text name
        text slug UK "null"
        integer displayOrder
        boolean isActive
        timestamp createdAt
        timestamp updatedAt
    }
    Course {
        text id PK
        text name
        text slug UK
        CourseType type
        text description "null"
        integer price "null"
        integer duration "null"
        boolean isActive
        text ageRange "null"
        text level "null"
        text code "null"
        text shortDescription "null"
        text priceDisplay "null"
        CourseCategory category "null"
        text categoryId FK "-> CourseCategoryDef null"
        boolean isTeachable
        integer totalSessions "null"
        text durationDisplay "null"
        integer studentCount
        integer displayOrder
        boolean isPublished
        text thumbnail "null"
        timestamp createdAt
        timestamp updatedAt
    }
    CoursePrerequisite {
        text id PK
        text courseId FK,UK "-> Course"
        text requiredCourseId FK,UK "-> Course"
        timestamp createdAt
    }
    CoursePackage {
        text id PK
        text slug UK
        text code
        text name
        text shortName "null"
        text subtitle "null"
        text shortDescription "null"
        text description "null"
        text ageGroup "null"
        text level "null"
        integer lessons "null"
        text duration "null"
        integer priceOriginal "null"
        integer priceEarlyBird "null"
        integer priceMember "null"
        jsonb features "null"
        jsonb highlights "null"
        jsonb curriculum "null"
        text badge "null"
        text color "null"
        integer displayOrder
        boolean isPublished
        boolean isFeatured
        text thumbnail "null"
        text seoTitle "null"
        text seoDescription "null"
        text parentCourseSlug "null"
        text audienceTag "null"
        text audienceDescription "null"
        text mission "null"
        jsonb outcomesJson "null"
        jsonb methodsJson "null"
        jsonb conditionsJson "null"
        text noteForParents "null"
        jsonb faqsJson "null"
        text heroImageUrl "null"
        jsonb galleryImageUrlsJson "null"
        timestamp createdAt
        timestamp updatedAt
    }
    CourseDiscount {
        text id PK
        text courseId FK "-> Course"
        CourseDiscountType type
        integer value
        text note "null"
        text conditions "null"
        boolean active
        timestamp validFrom "null"
        timestamp validTo "null"
        timestamp createdAt
        timestamp updatedAt
    }
    CourseCompletion {
        text id PK
        text studentId FK,UK "-> Student"
        text courseId FK,UK "-> Course"
        text classId "null"
        timestamp completedAt
        text finalAssessment "null"
        text finalGrade "null"
        text certificateCode UK
        text nextCourseId "null"
        text createdById "null"
        timestamp createdAt
        timestamp updatedAt
    }
    ClassGroup {
        text id PK
        text code UK
        text displayCode
        text name "null"
        text centerId FK "-> Center"
        text orgUnitId "null"
        ClassGroupStatus status
        text notes "null"
        timestamp deletedAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    Class {
        text id PK
        text classCode UK "null"
        text name
        text description "null"
        text courseId FK "-> Course"
        text centerId FK "-> Center null"
        text orgUnitId "null"
        text classGroupId FK "-> ClassGroup null"
        text teacherId FK "-> User null"
        text assistantId FK "-> User null"
        text roomId FK "-> Room null"
        text schedule "null"
        timestamp startDate "null"
        timestamp endDate "null"
        integer scheduleDays "array"
        text startTime "null"
        text endTime "null"
        integer maxStudents
        integer minStudents
        ClassStatus status
        boolean isActive
        timestamp submittedForApprovalAt "null"
        timestamp approvedAt "null"
        text approvedById "null"
        text approvedByName "null"
        text notes "null"
        timestamp deletedAt "null"
        timestamp createdAt
        timestamp updatedAt
        text curriculumId "null"
        integer curriculumVersion "null"
    }
    ClassSession {
        text id PK
        text classId FK "-> Class"
        timestamp date
        text topic "null"
        text notes "null"
        text lessonId FK "-> Lesson null"
        text lessonNotes "null"
        text planId FK "-> ClassSessionPlan null"
        SessionStatus status
        timestamp startedAt "null"
        timestamp completedAt "null"
        boolean ckClean
        boolean ckEquipment
        boolean ckKit
        boolean ckAttendance
        boolean ckLessonConfirmed
        boolean ckFeedback
        boolean ckMedia
        boolean ckHomework
        boolean ckIncident
        text incidentNote "null"
        timestamp createdAt
        timestamp updatedAt
    }
    ClassSessionPlan {
        text id PK
        text classId FK "-> Class"
        integer seq
        text lessonId "null"
        text customTitle "null"
        text note "null"
        integer order
        timestamp createdAt
        timestamp updatedAt
    }
    ClassAuditLog {
        text id PK
        text classId FK "-> Class"
        text action
        text changedByUserId "null"
        text changedByName
        jsonb oldValues "null"
        jsonb newValues "null"
        text changedFields "array"
        text reason "null"
        jsonb metadata "null"
        timestamp createdAt
    }
    Enrollment {
        text id PK
        text studentId FK,UK "-> Student"
        text classId FK,UK "-> Class"
        text courseId FK "-> Course"
        EnrollmentStatus status
        integer tuition "null"
        timestamp paidAt "null"
        integer listPrice "null"
        text discountType "null"
        integer discountAmount "null"
        integer finalPrice "null"
        timestamp startDate "null"
        timestamp endDate "null"
        timestamp enrolledAt
        timestamp confirmedAt "null"
        timestamp startedAt "null"
        timestamp endedAt "null"
        text transferredToId FK "-> Enrollment null"
        text transferReason "null"
        text notes "null"
        timestamp createdAt
        timestamp updatedAt
    }
    EnrollmentAuditLog {
        text id PK
        text enrollmentId FK "-> Enrollment"
        text fromStatus
        text toStatus
        text changedByUserId "null"
        text changedByName
        text reason "null"
        jsonb extraData "null"
        timestamp createdAt
    }
    Curriculum {
        text id PK
        text courseId FK,UK "-> Course"
        integer version UK
        text name
        text description "null"
        boolean isActive
        CurriculumStatus status
        timestamp createdAt
        timestamp updatedAt
    }
    Lesson {
        text id PK
        text curriculumId FK,UK "-> Curriculum"
        integer order UK
        text title
        text description "null"
        text content "null"
        integer duration
        text objectives "array"
        text materials "array"
        text notes "null"
        text teacherGuide "null"
        text expectedOutput "null"
        text homeworkDefault "null"
        text assessmentCriteria "null"
        timestamp createdAt
        timestamp updatedAt
    }
    Room {
        text id PK
        text name
        text code UK
        text centerId FK,UK "-> Center"
        text orgUnitId "null"
        integer capacity
        text equipment "array"
        RoomStatus status
        text notes "null"
        integer displayOrder
        timestamp createdAt
        timestamp updatedAt
    }
    Holiday {
        text id PK
        text name
        date date
        date endDate "null"
        text centerId FK "-> Center null"
        text orgUnitId "null"
        HolidayType type
        text note "null"
        timestamp createdAt
        timestamp updatedAt
    }
    CourseCategoryDef ||--o{ Course : "CourseCategoryDef"
    Course ||--o{ CoursePrerequisite : "CoursePrereqOwner"
    Course ||--o{ CoursePrerequisite : "CoursePrereqRequired"
    Course ||--o{ CourseDiscount : "courseId"
    Course ||--o{ CourseCompletion : "CourseCompletions"
    Course ||--o{ Class : "courseId"
    ClassGroup ||--o{ Class : "classGroupId"
    Room ||--o{ Class : "roomId"
    Class ||--o{ ClassSession : "classId"
    Lesson ||--o{ ClassSession : "lessonId"
    ClassSessionPlan ||--o{ ClassSession : "planId"
    Class ||--o{ ClassSessionPlan : "classId"
    Class ||--o{ ClassAuditLog : "ClassAuditLogs"
    Enrollment ||--o{ Enrollment : "EnrollmentTransfer (self)"
    Class ||--o{ Enrollment : "classId"
    Course ||--o{ Enrollment : "courseId"
    Enrollment ||--o{ EnrollmentAuditLog : "enrollmentId"
    Course ||--o{ Curriculum : "courseId"
    Curriculum ||--o{ Lesson : "curriculumId"
```

<details><summary>FK liên cụm (8)</summary>

- `CourseCompletion.studentId` → `Student` *(cụm 4. Student & Portal phụ huynh)*
- `ClassGroup.centerId` → `Center` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Class.centerId` → `Center` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Class.TeacherClasses` → `User` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Class.AssistantClasses` → `User` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Enrollment.studentId` → `Student` *(cụm 4. Student & Portal phụ huynh)*
- `Room.centerId` → `Center` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Holiday.centerId` → `Center` *(cụm 1. Tổ chức · Identity · RBAC)*

</details>

---

## 4. Student & Portal phụ huynh

```mermaid
erDiagram
    Student {
        text id PK
        text name
        text studentCode UK "null"
        timestamp dateOfBirth "null"
        Gender gender "null"
        text phone "null"
        text email "null"
        text avatarUrl "null"
        integer currentGrade "null"
        text school "null"
        text parentName "null"
        text parentPhone "null"
        text parentEmail "null"
        text parentRelation "null"
        text parent2Name "null"
        text parent2Phone "null"
        text parent2Relation "null"
        text address "null"
        text ward "null"
        text district "null"
        text city "null"
        BloodType bloodType "null"
        text allergies "array"
        text healthNotes "null"
        date enrollmentDate "null"
        text preferredCenterId FK "-> Center null"
        text preferredOrgUnitId "null"
        text notes "null"
        StudentStatus status
        text centerId FK "-> Center null"
        text orgUnitId "null"
        text parentUserId FK "-> User null"
        timestamp deletedAt "null"
        timestamp createdAt
        timestamp updatedAt
        text classGroupId FK "-> ClassGroup null"
    }
    StudentConsent {
        text id PK
        text studentId UK
        ConsentType type UK
        ConsentStatus status
        timestamp grantedAt
        timestamp revokedAt "null"
        timestamp updatedAt
    }
    StudentSkillAssessment {
        text id PK
        text studentId FK "-> Student"
        RoboticsSkill skill
        SkillLevel level
        text note "null"
        text assessedById
        timestamp assessedAt
    }
    StudentSessionFeedback {
        text id PK
        text classSessionId FK,UK "-> ClassSession"
        text studentId FK,UK "-> Student"
        text comment
        integer rating "null"
        text createdById
        timestamp createdAt
        timestamp updatedAt
    }
    StudentAuditLog {
        text id PK
        text studentId FK "-> Student"
        text action
        text changedByUserId "null"
        text changedByName
        jsonb oldValues "null"
        jsonb newValues "null"
        text changedFields "array"
        text reason "null"
        jsonb metadata "null"
        timestamp createdAt
    }
    StudentCenterHistory {
        text id PK
        text studentId FK "-> Student"
        text centerId
        text orgUnitId "null"
        timestamp fromDate
        timestamp toDate "null"
        text reason "null"
        timestamp createdAt
    }
    StudentTransferRequest {
        text id PK
        text studentId FK "-> Student"
        text fromClassId "null"
        text fromCenterId "null"
        text toClassId "null"
        text toCenterId "null"
        TransferRequestStatus status
        text reason "null"
        text note "null"
        text requestedById "null"
        text decidedById "null"
        timestamp decidedAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    StudentReserve {
        text id PK
        text studentId FK "-> Student"
        text enrollmentId FK "-> Enrollment null"
        text reason
        timestamp startedAt
        timestamp expectedEndAt "null"
        timestamp endedAt "null"
        text endReason "null"
        text createdByUserId "null"
        text createdByName
        text endedByUserId "null"
        text endedByName "null"
        boolean isActive
        timestamp createdAt
        timestamp updatedAt
    }
    StudentRiskAlert {
        text id PK
        text studentId FK "-> Student"
        text centerId "null"
        text orgUnitId "null"
        RiskAlertType type
        RiskSeverity severity
        RiskStatus status
        text detail "null"
        text resolvedById "null"
        timestamp resolvedAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    StudentCareTask {
        text id PK
        text studentId FK "-> Student"
        text centerId "null"
        text orgUnitId "null"
        text assignedToId "null"
        text riskAlertId FK "-> StudentRiskAlert null"
        text title
        text description "null"
        timestamp dueAt
        CareTaskStatus status
        timestamp completedAt "null"
        text createdById "null"
        timestamp createdAt
        timestamp updatedAt
    }
    MakeupNeed {
        text id PK
        text studentId FK,UK "-> Student"
        text classId FK "-> Class"
        text centerId "null"
        text orgUnitId "null"
        text missedSessionId UK
        text missedLessonId "null"
        MakeupNeedStatus status
        text makeupSessionId "null"
        text note "null"
        text createdById "null"
        text scheduledById "null"
        timestamp completedAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    Attendance {
        text id PK
        text sessionId FK,UK "-> ClassSession"
        text studentId FK,UK "-> Student"
        AttendanceStatus status
        text note "null"
        MakeupStatus makeupStatus
        text makeupSessionId "null"
        text absenceReason "null"
        timestamp notifiedAt "null"
        timestamp createdAt
    }
    ParentRequest {
        text id PK
        text studentId FK "-> Student"
        text parentUserId "null"
        ParentRequestType type
        text content
        timestamp preferredDate "null"
        text sessionId "null"
        ParentRequestStatus status
        text response "null"
        text handledById "null"
        text handledByName "null"
        timestamp handledAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    ParentFeedback {
        text id PK
        text parentUserId "null"
        text parentName "null"
        text studentId "null"
        text studentName "null"
        integer rating
        text content
        text adminResponse "null"
        text respondedById "null"
        timestamp respondedAt "null"
        timestamp createdAt
    }
    Survey {
        text id PK
        text title
        text description "null"
        SurveyMilestone milestone
        boolean isActive
        text centerId "null"
        text orgUnitId "null"
        text createdById "null"
        timestamp createdAt
        timestamp updatedAt
    }
    SurveyQuestion {
        text id PK
        text surveyId FK "-> Survey"
        text text
        SurveyQuestionType type
        integer order
    }
    SurveyResponse {
        text id PK
        text surveyId FK "-> Survey"
        text studentId "null"
        text parentUserId "null"
        text centerId "null"
        text orgUnitId "null"
        text classId "null"
        text teacherId "null"
        text csmId "null"
        integer npsScore "null"
        text comment "null"
        jsonb answers "null"
        timestamp createdAt
    }
    ClassSessionMedia {
        text id PK
        text classId
        text fileUrl
        text fileName "null"
        text caption "null"
        MediaStatus status
        boolean isClassWide
        text uploadedById "null"
        text uploadedByName "null"
        text approvedById "null"
        text approvedByName "null"
        timestamp approvedAt "null"
        timestamp createdAt
    }
    MediaStudentTag {
        text id PK
        text mediaId FK,UK "-> ClassSessionMedia"
        text studentId UK
    }
    SataCoinTransaction {
        text id PK
        text studentId FK "-> Student"
        integer amount
        SataCoinTxType type
        text reason
        text note "null"
        text centerId "null"
        text orgUnitId "null"
        text ruleCode "null"
        text reversedTxId UK "null"
        text createdById "null"
        timestamp createdAt
    }
    SataCoinRule {
        text id PK
        text code UK
        text label
        integer amount
        boolean isActive
        text centerId "null"
        timestamp createdAt
        timestamp updatedAt
    }
    Notification {
        text id PK
        text title
        text body
        NotificationAudience audience
        text centerId "null"
        text orgUnitId "null"
        text classId "null"
        text studentId "null"
        boolean isPublished
        timestamp publishedAt "null"
        text createdById "null"
        text createdByName "null"
        text dedupeKey UK "null"
        timestamp createdAt
        timestamp updatedAt
    }
    StaffNotification {
        text id PK
        text userId UK
        text category
        text title
        text body
        text href "null"
        text dedupeKey UK
        timestamp readAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    Student ||--o{ StudentSkillAssessment : "studentId"
    Student ||--o{ StudentSessionFeedback : "studentId"
    Student ||--o{ StudentAuditLog : "StudentAuditLogs"
    Student ||--o{ StudentCenterHistory : "studentId"
    Student ||--o{ StudentTransferRequest : "studentId"
    Student ||--o{ StudentReserve : "StudentReserves"
    Student ||--o{ StudentRiskAlert : "studentId"
    Student ||--o{ StudentCareTask : "studentId"
    StudentRiskAlert ||--o{ StudentCareTask : "riskAlertId"
    Student ||--o{ MakeupNeed : "studentId"
    Student ||--o{ Attendance : "studentId"
    Student ||--o{ ParentRequest : "StudentParentRequests"
    Survey ||--o{ SurveyQuestion : "surveyId"
    Survey ||--o{ SurveyResponse : "surveyId"
    ClassSessionMedia ||--o{ MediaStudentTag : "mediaId"
    Student ||--o{ SataCoinTransaction : "studentId"
```

<details><summary>FK liên cụm (8)</summary>

- `Student.StudentPreferredCenter` → `Center` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Student.centerId` → `Center` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Student.ParentChildren` → `User` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Student.ClassGroupStudents` → `ClassGroup` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `StudentSessionFeedback.classSessionId` → `ClassSession` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `StudentReserve.EnrollmentReserves` → `Enrollment` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `MakeupNeed.classId` → `Class` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `Attendance.sessionId` → `ClassSession` *(cụm 3. Học vụ — Course / Class / Enrollment)*

</details>

---

## 5. Giáo viên & Đánh giá

```mermaid
erDiagram
    TeacherProfile {
        text id PK
        text userId FK,UK "-> User"
        TeacherRank rank
        EmploymentType employmentType
        TeacherStatus status
        text bio "null"
        timestamp createdAt
        timestamp updatedAt
    }
    TeacherCourse {
        text teacherProfileId PK,FK "-> TeacherProfile"
        text courseId PK,FK "-> Course"
    }
    TeacherReview {
        text id PK
        text teacherProfileId FK "-> TeacherProfile"
        text reviewerId FK "-> User null"
        text reviewerName
        integer score
        text note "null"
        timestamp createdAt
    }
    TeacherProfile ||--o{ TeacherCourse : "teacherProfileId"
    TeacherProfile ||--o{ TeacherReview : "teacherProfileId"
```

<details><summary>FK liên cụm (3)</summary>

- `TeacherProfile.UserTeacherProfile` → `User` *(cụm 1. Tổ chức · Identity · RBAC)*
- `TeacherCourse.courseId` → `Course` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `TeacherReview.TeacherReviewer` → `User` *(cụm 1. Tổ chức · Identity · RBAC)*

</details>

---

## 6. Thi & Bài tập

```mermaid
erDiagram
    Question {
        text id PK
        text questionCode UK "null"
        QuestionType type
        text text
        text explanation "null"
        QuestionDifficulty difficulty
        text tags "array"
        text lessonId FK "-> Lesson null"
        text assignmentId FK "-> Assignment null"
        text correctAnswer "null"
        text authorId FK "-> Employee null"
        boolean isPublic
        text notes "null"
        timestamp createdAt
        timestamp updatedAt
    }
    Choice {
        text id PK
        text questionId FK,UK "-> Question"
        integer order UK
        text text
        boolean isCorrect
    }
    Exam {
        text id PK
        text examCode UK "null"
        text title
        text description "null"
        text classId FK "-> Class null"
        text lessonId FK "-> Lesson null"
        integer durationMinutes
        double totalPoints
        double passingScore
        boolean shuffleQuestions
        boolean shuffleChoices
        timestamp openAt "null"
        timestamp closeAt "null"
        ExamStatus status
        text createdById FK "-> Employee null"
        timestamp createdAt
        timestamp updatedAt
    }
    ExamQuestion {
        text id PK
        text examId FK,UK "-> Exam"
        text questionId FK,UK "-> Question"
        integer order UK
        double points
    }
    ExamAttempt {
        text id PK
        text examId FK,UK "-> Exam"
        text studentId FK,UK "-> Student"
        timestamp startedAt
        timestamp submittedAt "null"
        timestamp gradedAt "null"
        AttemptStatus status
        double totalScore "null"
        boolean passed "null"
        text gradedById FK "-> Employee null"
        text feedback "null"
    }
    ExamAnswer {
        text id PK
        text attemptId FK,UK "-> ExamAttempt"
        text examQuestionId FK,UK "-> ExamQuestion"
        text selectedChoiceIds "array"
        text textAnswer "null"
        boolean isCorrect "null"
        double score "null"
        text graderNote "null"
        timestamp createdAt
        timestamp updatedAt
    }
    Document {
        text id PK
        text documentCode UK "null"
        text title
        text description "null"
        DocumentType type
        text fileUrl
        text fileName
        integer fileSize
        text mimeType "null"
        text lessonId FK "-> Lesson null"
        boolean isPublic
        text tags "array"
        text notes "null"
        text uploadedById FK "-> Employee null"
        timestamp createdAt
        timestamp updatedAt
    }
    Assignment {
        text id PK
        text title
        text description
        text instructions "null"
        AssignmentKind kind
        text classId FK "-> Class"
        text lessonId FK "-> Lesson null"
        double totalPoints
        timestamp assignedAt
        timestamp dueAt "null"
        boolean allowText
        boolean allowFile
        AssignmentStatus status
        text createdById FK "-> Employee null"
        timestamp createdAt
        timestamp updatedAt
    }
    AssignmentDocument {
        text id PK
        text assignmentId FK,UK "-> Assignment"
        text documentId FK,UK "-> Document"
        timestamp createdAt
    }
    AssignmentSubmission {
        text id PK
        text assignmentId FK,UK "-> Assignment"
        text studentId FK,UK "-> Student"
        text textAnswer "null"
        text fileUrl "null"
        text fileName "null"
        integer fileSize "null"
        text mimeType "null"
        timestamp submittedAt "null"
        SubmissionStatus status
        double score "null"
        text feedback "null"
        timestamp gradedAt "null"
        text gradedById FK "-> Employee null"
        timestamp createdAt
        timestamp updatedAt
    }
    SubmissionRubricScore {
        text id PK
        text submissionId FK,UK "-> AssignmentSubmission"
        RubricCriterion criterion UK
        RubricLevel level
        timestamp createdAt
    }
    ProgressReportLog {
        text id PK
        text studentId FK "-> Student"
        text classId FK "-> Class null"
        text generatedById FK "-> Employee null"
        timestamp generatedAt
        text sentToEmail "null"
        timestamp sentAt "null"
        text reportTitle
        jsonb metadata "null"
    }
    Assignment ||--o{ Question : "AssignmentQuestions"
    Question ||--o{ Choice : "questionId"
    Exam ||--o{ ExamQuestion : "examId"
    Question ||--o{ ExamQuestion : "questionId"
    Exam ||--o{ ExamAttempt : "examId"
    ExamAttempt ||--o{ ExamAnswer : "attemptId"
    ExamQuestion ||--o{ ExamAnswer : "examQuestionId"
    Assignment ||--o{ AssignmentDocument : "assignmentId"
    Document ||--o{ AssignmentDocument : "documentId"
    Assignment ||--o{ AssignmentSubmission : "assignmentId"
    AssignmentSubmission ||--o{ SubmissionRubricScore : "submissionId"
```

<details><summary>FK liên cụm (17)</summary>

- `Question.lessonId` → `Lesson` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `Question.QuestionAuthor` → `Employee` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Exam.classId` → `Class` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `Exam.lessonId` → `Lesson` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `Exam.ExamCreator` → `Employee` *(cụm 1. Tổ chức · Identity · RBAC)*
- `ExamAttempt.studentId` → `Student` *(cụm 4. Student & Portal phụ huynh)*
- `ExamAttempt.AttemptGrader` → `Employee` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Document.lessonId` → `Lesson` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `Document.DocumentUploader` → `Employee` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Assignment.classId` → `Class` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `Assignment.lessonId` → `Lesson` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `Assignment.AssignmentCreator` → `Employee` *(cụm 1. Tổ chức · Identity · RBAC)*
- `AssignmentSubmission.studentId` → `Student` *(cụm 4. Student & Portal phụ huynh)*
- `AssignmentSubmission.SubmissionGrader` → `Employee` *(cụm 1. Tổ chức · Identity · RBAC)*
- `ProgressReportLog.studentId` → `Student` *(cụm 4. Student & Portal phụ huynh)*
- `ProgressReportLog.classId` → `Class` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `ProgressReportLog.ReportGenerator` → `Employee` *(cụm 1. Tổ chức · Identity · RBAC)*

</details>

---

## 7. Đơn hàng · Thanh toán · Khuyến mãi

```mermaid
erDiagram
    PaymentMethod {
        text id PK
        text code UK
        text name
        PaymentMethodType type
        text image "null"
        text description "null"
        boolean canBuyCourse
        boolean canBuyPackage
        boolean canBuyExam
        boolean canBuyProduct
        boolean canDeposit
        text bankName "null"
        text bankBranch "null"
        text bankAccountNumber "null"
        text bankAccountName "null"
        jsonb gatewayConfig "null"
        integer displayOrder
        boolean isActive
        timestamp createdAt
        timestamp updatedAt
    }
    PaymentMethodAuditLog {
        text id PK
        text paymentMethodId FK "-> PaymentMethod"
        text action
        text changedByUserId "null"
        text changedByName
        jsonb oldValues "null"
        jsonb newValues "null"
        text changedFields "array"
        text reason "null"
        jsonb metadata "null"
        timestamp createdAt
    }
    Order {
        text id PK
        text code UK
        OrderType type
        OrderStatus status
        text customerName
        text customerPhone
        text customerEmail "null"
        text customerAddress "null"
        text customerWard "null"
        text customerCity "null"
        text studentId FK "-> Student null"
        text leadId FK "-> Lead null"
        text centerId FK "-> Center null"
        text orgUnitId "null"
        text paymentMethodId FK "-> PaymentMethod null"
        integer subtotal
        integer discountAmount
        integer shippingFee
        integer totalAmount
        text voucherCode "null"
        text bankReference "null"
        text gatewayTxnId "null"
        timestamp paidAt "null"
        text confirmedByUserId "null"
        timestamp confirmedAt "null"
        text customerNote "null"
        text internalNote "null"
        timestamp createdAt
        timestamp updatedAt
    }
    OrderItem {
        text id PK
        text orderId FK "-> Order"
        OrderItemType type
        text enrollmentId FK "-> Enrollment null"
        text packageId FK "-> CoursePackage null"
        text examAttemptId FK "-> ExamAttempt null"
        text productId FK "-> Product null"
        text itemName
        text itemDescription "null"
        integer quantity
        integer unitPrice
        integer totalPrice
        jsonb metadata "null"
        timestamp createdAt
        timestamp updatedAt
    }
    OrderInstallment {
        text id PK
        text orderId FK,UK "-> Order"
        integer soDot UK
        integer amount
        InstallmentStatus status
        timestamp dueDate "null"
        timestamp paidAt "null"
        text recordedById "null"
        integer reminderDays "null"
        timestamp lastReminderAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    OrderStatusHistory {
        text id PK
        text orderId FK "-> Order"
        OrderStatus fromStatus
        OrderStatus toStatus
        text changedByUserId "null"
        text changedByName
        text reason "null"
        jsonb metadata "null"
        timestamp createdAt
    }
    Payment {
        text id PK
        text orderId FK "-> Order"
        text enrollmentId FK "-> Enrollment null"
        integer amount
        text method
        timestamp paidDate
        text evidenceUrl "null"
        text note "null"
        PaymentSaleStatus saleStatus
        PaymentAccountantStatus accountantStatus
        text recordedById "null"
        text confirmedById "null"
        timestamp confirmedAt "null"
        text rejectReason "null"
        text adjustmentOfId FK "-> Payment null"
        text centerId "null"
        timestamp createdAt
        timestamp updatedAt
    }
    Receipt {
        text id PK
        text code UK
        text enrollmentId FK "-> Enrollment"
        text paymentId FK "-> Payment"
        text issuedById "null"
        timestamp issuedAt
        ReceiptStatus status
    }
    Voucher {
        text id PK
        text code UK
        text name
        text description "null"
        VoucherType type
        VoucherDiscountKind discountKind
        integer discountPercent "null"
        integer discountAmount "null"
        integer maxDiscount "null"
        integer minOrderValue
        integer quantity "null"
        integer usedCount
        integer usageLimitPerUser
        timestamp validFrom
        timestamp validUntil
        boolean isActive
        timestamp createdAt
        timestamp updatedAt
        text createdByUserId "null"
    }
    VoucherRedemption {
        text id PK
        text voucherId FK "-> Voucher"
        text orderId FK,UK "-> Order"
        text customerPhone
        text customerId "null"
        integer discountApplied
        timestamp redeemedAt
    }
    VoucherAuditLog {
        text id PK
        text voucherId FK "-> Voucher"
        text action
        text changedByUserId "null"
        text changedByName
        jsonb oldValues "null"
        jsonb newValues "null"
        text changedFields "array"
        text reason "null"
        jsonb metadata "null"
        timestamp createdAt
    }
    Promotion {
        text id PK
        text slug UK
        PromotionKind kind
        text title
        text highlight
        text description
        text details "array"
        text cta "null"
        text target "null"
        text condition "null"
        text note "null"
        text icon
        boolean featured
        text courseSlug "null"
        integer displayOrder
        boolean isActive
        timestamp startsAt "null"
        timestamp endsAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    PaymentMethod ||--o{ PaymentMethodAuditLog : "paymentMethodId"
    PaymentMethod ||--o{ Order : "paymentMethodId"
    Order ||--o{ OrderItem : "orderId"
    Order ||--o{ OrderInstallment : "orderId"
    Order ||--o{ OrderStatusHistory : "orderId"
    Order ||--o{ Payment : "OrderPayments"
    Payment ||--o{ Payment : "PaymentAdjustment (self)"
    Payment ||--o{ Receipt : "paymentId"
    Voucher ||--o{ VoucherRedemption : "voucherId"
    Order ||--o| VoucherRedemption : "OrderVoucherRedemption"
    Voucher ||--o{ VoucherAuditLog : "voucherId"
```

<details><summary>FK liên cụm (9)</summary>

- `Order.StudentOrders` → `Student` *(cụm 4. Student & Portal phụ huynh)*
- `Order.LeadOrders` → `Lead` *(cụm 2. Lead / CRM / Marketing)*
- `Order.centerId` → `Center` *(cụm 1. Tổ chức · Identity · RBAC)*
- `OrderItem.EnrollmentOrderItems` → `Enrollment` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `OrderItem.packageId` → `CoursePackage` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `OrderItem.ExamOrderItems` → `ExamAttempt` *(cụm 6. Thi & Bài tập)*
- `OrderItem.productId` → `Product` *(cụm 8. Kho / Vật tư (Inventory))*
- `Payment.EnrollmentPayments` → `Enrollment` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `Receipt.EnrollmentReceipts` → `Enrollment` *(cụm 3. Học vụ — Course / Class / Enrollment)*

</details>

---

## 8. Kho / Vật tư (Inventory)

```mermaid
erDiagram
    Product {
        text id PK
        text sku UK
        text name
        text description "null"
        ProductCategory category
        ProductStatus status
        integer salePrice
        integer costPrice "null"
        integer rentalPricePerMonth "null"
        integer stockOnHand
        integer minThreshold
        text imageUrls "array"
        text zmroboKitId FK "-> ZMRoboKit null"
        jsonb attributes "null"
        text notes "null"
        timestamp createdAt
        timestamp updatedAt
    }
    ProductMovement {
        text id PK
        text productId FK "-> Product"
        ProductMovementType type
        integer quantity
        text reason "null"
        text orderId "null"
        integer stockBeforeMovement
        integer stockAfterMovement
        text createdByUserId "null"
        text createdByName
        timestamp createdAt
    }
    ProductAuditLog {
        text id PK
        text productId FK "-> Product"
        text action
        jsonb oldValues "null"
        jsonb newValues "null"
        text changedFields "array"
        text changedByUserId "null"
        text changedByName
        text reason "null"
        timestamp createdAt
    }
    ZMRoboKit {
        text id PK
        text slug UK
        text brand
        text series
        text code "null"
        text title
        text subtitle
        text shortDescription
        text description
        text priceDisplay
        boolean isAvailable
        jsonb specs
        jsonb features
        jsonb highlights
        text mainImage
        text galleryImages "array"
        text sourceUrl "null"
        integer displayOrder
        boolean isPublished
        timestamp createdAt
        timestamp updatedAt
    }
    InventoryItem {
        text id PK
        text itemCode UK
        text name
        text description "null"
        InventoryCategory category
        text unit
        double pricePerUnit "null"
        text supplier "null"
        integer defaultMinThreshold
        text imageUrl "null"
        text tags "array"
        boolean isActive
        text notes "null"
        timestamp createdAt
        timestamp updatedAt
    }
    StockBalance {
        text id PK
        text itemId FK,UK "-> InventoryItem"
        text centerId FK,UK "-> Center"
        text orgUnitId "null"
        integer quantity
        integer reserved
        integer minThreshold "null"
        timestamp lastReceiptAt "null"
        timestamp lastIssueAt "null"
        timestamp updatedAt
    }
    StockMovement {
        text id PK
        text itemId FK "-> InventoryItem"
        text centerId FK "-> Center"
        text orgUnitId "null"
        StockMovementType type
        integer quantity
        text transferPairId FK "-> StockMovement null"
        text referenceType "null"
        text referenceId "null"
        text referenceNote "null"
        double unitPrice "null"
        double totalCost "null"
        text performedById FK "-> Employee null"
        timestamp performedAt
        text notes "null"
    }
    InventoryAudit {
        text id PK
        text auditCode UK "null"
        text centerId FK "-> Center"
        text orgUnitId "null"
        InventoryAuditStatus status
        integer totalItems
        integer totalAdjusted
        integer totalIncreases
        integer totalDecreases
        text performedById FK "-> Employee null"
        timestamp performedAt "null"
        text notes "null"
        timestamp createdAt
        timestamp updatedAt
    }
    InventoryAuditItem {
        text id PK
        text auditId FK,UK "-> InventoryAudit"
        text itemId FK,UK "-> InventoryItem"
        integer previousQty
        integer actualQty
        integer delta
        text reason "null"
        text movementId FK,UK "-> StockMovement null"
        timestamp createdAt
    }
    ZMRoboKit ||--o{ Product : "zmroboKitId"
    Product ||--o{ ProductMovement : "productId"
    Product ||--o{ ProductAuditLog : "productId"
    InventoryItem ||--o{ StockBalance : "itemId"
    InventoryItem ||--o{ StockMovement : "itemId"
    StockMovement ||--o{ StockMovement : "TransferPair (self)"
    InventoryAudit ||--o{ InventoryAuditItem : "auditId"
    InventoryItem ||--o{ InventoryAuditItem : "AuditedItem"
    StockMovement ||--o| InventoryAuditItem : "AuditMovement"
```

<details><summary>FK liên cụm (5)</summary>

- `StockBalance.centerId` → `Center` *(cụm 1. Tổ chức · Identity · RBAC)*
- `StockMovement.centerId` → `Center` *(cụm 1. Tổ chức · Identity · RBAC)*
- `StockMovement.MovementPerformer` → `Employee` *(cụm 1. Tổ chức · Identity · RBAC)*
- `InventoryAudit.centerId` → `Center` *(cụm 1. Tổ chức · Identity · RBAC)*
- `InventoryAudit.AuditPerformer` → `Employee` *(cụm 1. Tổ chức · Identity · RBAC)*

</details>

---

## 9. Trial (học thử) V1 & V2

```mermaid
erDiagram
    TrialClass {
        text id PK
        text leadId FK "-> Lead"
        text centerId FK "-> Center null"
        text orgUnitId "null"
        text classId FK "-> Class null"
        text roomId FK "-> Room null"
        text teacherId FK "-> User null"
        timestamp scheduledAt
        TrialClassStatus status
        timestamp attendedAt "null"
        text notes "null"
        timestamp createdAt
        timestamp updatedAt
    }
    TrialFeedback {
        text id PK
        text trialClassId FK,UK "-> TrialClass"
        boolean childEnjoyed "null"
        ChildGrasp childGrasp "null"
        text teacherSuggestion "null"
        text parentFeedback "null"
        text recommendedCourseId FK "-> Course null"
        timestamp createdAt
    }
    TrialProgramConfig {
        text id PK
        text name
        integer sessionCount
        boolean active
        text updatedById "null"
        timestamp createdAt
        timestamp updatedAt
    }
    TrialClassV2 {
        text id PK
        text code UK
        text name
        text type
        text centerId
        text roomId "null"
        date startDate
        text startTime
        text endTime
        integer capacity
        text teacherId "null"
        text assistantId "null"
        TrialClassV2Status status
        text configId FK "-> TrialProgramConfig null"
        integer sessionCount
        timestamp createdAt
        timestamp updatedAt
    }
    TrialClassSession {
        text id PK
        text trialClassId FK "-> TrialClassV2"
        integer seq
        date date
        text startTime
        text endTime
        text roomId "null"
        text teacherId "null"
        TrialSessionStatus status
        timestamp createdAt
        timestamp updatedAt
    }
    TrialEnrollment {
        text id PK
        text trialClassId FK "-> TrialClassV2"
        text leadChildId FK "-> LeadChild"
        TrialEnrollmentStatus status
        text summaryNote "null"
        text addedById "null"
        timestamp createdAt
        timestamp updatedAt
    }
    TrialAttendance {
        text id PK
        text trialSessionId FK,UK "-> TrialClassSession"
        text trialEnrollmentId FK,UK "-> TrialEnrollment"
        TrialAttendanceStatus status
        text note "null"
        timestamp createdAt
        timestamp updatedAt
    }
    TrialClass ||--o| TrialFeedback : "trialClassId"
    TrialProgramConfig ||--o{ TrialClassV2 : "configId"
    TrialClassV2 ||--o{ TrialClassSession : "trialClassId"
    TrialClassV2 ||--o{ TrialEnrollment : "trialClassId"
    TrialClassSession ||--o{ TrialAttendance : "trialSessionId"
    TrialEnrollment ||--o{ TrialAttendance : "trialEnrollmentId"
```

<details><summary>FK liên cụm (7)</summary>

- `TrialClass.leadId` → `Lead` *(cụm 2. Lead / CRM / Marketing)*
- `TrialClass.centerId` → `Center` *(cụm 1. Tổ chức · Identity · RBAC)*
- `TrialClass.classId` → `Class` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `TrialClass.roomId` → `Room` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `TrialClass.TrialTeacher` → `User` *(cụm 1. Tổ chức · Identity · RBAC)*
- `TrialFeedback.TrialRecommendedCourse` → `Course` *(cụm 3. Học vụ — Course / Class / Enrollment)*
- `TrialEnrollment.leadChildId` → `LeadChild` *(cụm 2. Lead / CRM / Marketing)*

</details>

---

## 10. HR · Chấm công · CMS · Tuyển dụng

```mermaid
erDiagram
    WorkShiftConfig {
        text id PK
        text centerId UK "null"
        text code UK
        text name
        text startTime
        text endTime
        integer toleranceMinutes
        boolean isActive
        timestamp createdAt
        timestamp updatedAt
    }
    ShiftRegistration {
        text id PK
        text userId FK,UK "-> User"
        text centerId "null"
        text orgUnitId "null"
        date date UK
        WorkShift shifts "array"
        ShiftRegStatus status
        text note "null"
        timestamp createdAt
        timestamp updatedAt
    }
    TimesheetAdjustmentRequest {
        text id PK
        text userId
        text centerId "null"
        text orgUnitId "null"
        date date
        text reason
        text requested "null"
        AdjustStatus status
        text reviewedById "null"
        text reviewedByName "null"
        timestamp reviewedAt "null"
        text reviewNote "null"
        timestamp createdAt
        timestamp updatedAt
    }
    TimesheetEditLog {
        text id PK
        text userId
        date date
        text field
        text fromValue "null"
        text toValue "null"
        text reason "null"
        text editedById "null"
        text editedByName "null"
        text requestId "null"
        timestamp createdAt
    }
    CenterDayChecklist {
        text id PK
        text centerId UK
        text orgUnitId "null"
        date date UK
        boolean openPower
        boolean openDevices
        boolean openRoomsReady
        boolean openCleanCommon
        boolean openSecurity
        boolean closePower
        boolean closeDevices
        boolean closeLock
        boolean closeKpiBoard
        boolean closeSafety
        boolean closeHandover
        text note "null"
        text byUserId "null"
        timestamp updatedAt
    }
    EmployeeCheckin {
        text id PK
        text userId UK
        text userName "null"
        text centerId "null"
        text orgUnitId "null"
        CheckinType type UK
        timestamp checkedAt
        double latitude "null"
        double longitude "null"
        integer distanceMeters "null"
        boolean withinGeofence
        text qrToken UK "null"
        timestamp createdAt
    }
    JobPosting {
        text id PK
        text title
        text slug UK
        text department "null"
        text location "null"
        text type "null"
        text description
        text workingHours "null"
        ExperienceLevel experienceLevel "null"
        text responsibilities "array"
        text requirements "array"
        text benefits "array"
        text salary "null"
        integer salaryMin "null"
        integer salaryMax "null"
        text salaryNote "null"
        integer openings
        JobStatus status
        text authorId FK "-> User null"
        text contactEmail "null"
        text contactPhone "null"
        timestamp closesAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    JobApplication {
        text id PK
        text jobId FK "-> JobPosting"
        text name
        text email
        text phone
        text cvUrl "null"
        text coverLetter "null"
        ApplicationStatus status
        timestamp createdAt
        timestamp updatedAt
    }
    Honor {
        text id PK
        text slug UK
        text employeeId FK "-> Employee null"
        text jobTitleAtTime "null"
        integer yearsAtTime "null"
        text fullName "null"
        text jobTitle "null"
        text avatarUrl "null"
        integer yearsAtCompany "null"
        HonorCategory category
        text awardName
        timestamp awardedAt
        text awardQuarter "null"
        text story
        varchar shortBio "null"
        varchar pullQuote "null"
        text achievements "null"
        boolean isFeatured
        boolean isPublished
        integer displayOrder
        timestamp createdAt
        timestamp updatedAt
        text createdById FK "-> User null"
    }
    News {
        text id PK
        text slug UK
        text title
        text excerpt
        text content
        text coverImage "null"
        text category "null"
        text tags "array"
        boolean isPublished
        boolean isFeatured
        timestamp publishedAt "null"
        integer displayOrder
        text seoTitle "null"
        text seoDescription "null"
        timestamp createdAt
        timestamp updatedAt
    }
    TimelineItem {
        text id PK
        timestamp occurredAt
        text title
        text description
        text coverImageUrl "null"
        text relatedHonorIds "null"
        boolean isPublished
        integer displayOrder
        timestamp createdAt
        timestamp updatedAt
    }
    PageContent {
        text id PK
        text slug UK
        text title
        jsonb content
        boolean isPublished
        timestamp createdAt
        timestamp updatedAt
    }
    SitePageContent {
        text id PK
        text pageKey UK
        text contentKey UK
        text contentValue
        timestamp updatedAt
        text updatedById FK "-> User null"
    }
    Testimonial {
        text id PK
        text name
        text role
        text location
        integer rating
        text avatar
        text avatarColor
        text content
        text videoId "null"
        text courseSlug "null"
        integer displayOrder
        boolean isPublished
        timestamp createdAt
        timestamp updatedAt
    }
    JobPosting ||--o{ JobApplication : "jobId"
```

<details><summary>FK liên cụm (5)</summary>

- `ShiftRegistration.userId` → `User` *(cụm 1. Tổ chức · Identity · RBAC)*
- `JobPosting.authorId` → `User` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Honor.employeeId` → `Employee` *(cụm 1. Tổ chức · Identity · RBAC)*
- `Honor.HonorCreatedBy` → `User` *(cụm 1. Tổ chức · Identity · RBAC)*
- `SitePageContent.PageContentUpdatedBy` → `User` *(cụm 1. Tổ chức · Identity · RBAC)*

</details>

---

## 11. Hệ thống · Tích hợp · Hạ tầng

```mermaid
erDiagram
    EmailTemplate {
        text id PK
        text code UK
        text name
        text description "null"
        EmailTemplateTrigger trigger
        boolean isActive
        text subject
        text bodyText
        text bodyHtml
        text availableVariables "array"
        text fromName "null"
        text replyTo "null"
        integer sentCount
        timestamp lastSentAt "null"
        timestamp createdAt
        timestamp updatedAt
    }
    EmailLog {
        text id PK
        text templateId FK "-> EmailTemplate null"
        text toEmail
        text toName "null"
        text subject
        text bodyText
        text bodyHtml
        EmailLogStatus status
        text resendId "null"
        text failureReason "null"
        text contextType "null"
        text contextId "null"
        text triggeredByUserId "null"
        text triggeredByName "null"
        text triggerType
        timestamp sentAt "null"
        timestamp createdAt
    }
    EmailQueue {
        text id PK
        text toEmail
        text toName "null"
        text templateKey "null"
        text subject "null"
        text bodyText "null"
        text bodyHtml "null"
        jsonb payload
        EmailQueueStatus status
        integer attempts
        integer maxAttempts
        text error "null"
        text contextType "null"
        text contextId "null"
        timestamp scheduledAt
        timestamp sentAt "null"
        text emailLogId "null"
        timestamp createdAt
        timestamp updatedAt
    }
    OtpRequest {
        text id PK
        text target
        OtpChannel channel
        OtpPurpose purpose
        text codeHash
        timestamp expiresAt
        integer attempts
        integer maxAttempts
        timestamp verifiedAt "null"
        timestamp consumedAt "null"
        text userId "null"
        timestamp createdAt
        timestamp updatedAt
    }
    OtpDeliveryLog {
        text id PK
        text otpRequestId FK "-> OtpRequest"
        OtpChannel channel
        text target
        text provider
        text status
        text error "null"
        timestamp createdAt
    }
    WebhookDelivery {
        text id PK
        text source
        text externalId "null"
        jsonb payload
        WebhookStatus status
        timestamp receivedAt
        timestamp processedAt "null"
        text errorMessage "null"
        integer retryCount
    }
    IntegrationConfig {
        text id PK
        text provider UK
        boolean isEnabled
        jsonb settings
        timestamp updatedAt
        timestamp createdAt
    }
    IntegrationLog {
        text id PK
        text provider
        IntegrationDirection direction
        text action
        IntegrationStatus status
        jsonb requestPayload
        jsonb responsePayload "null"
        text errorMessage "null"
        timestamp createdAt
    }
    ZaloMessageLog {
        text id PK
        text toPhone "null"
        text templateKey "null"
        jsonb payload
        ZaloMessageStatus status
        text providerMessageId "null"
        text errorMessage "null"
        boolean fallbackEmailed
        timestamp createdAt
        timestamp sentAt "null"
    }
    SystemSetting {
        text key PK
        jsonb valueJson
        text updatedById "null"
        text updatedByName "null"
        timestamp updatedAt
        timestamp createdAt
    }
    CenterSetting {
        text orgUnitId PK
        text key PK
        jsonb valueJson
        text updatedById "null"
        text updatedByName "null"
        timestamp updatedAt
        timestamp createdAt
    }
    AuditLog {
        text id PK
        text actorId "null"
        text actorName
        text module
        text entityType
        text entityId
        text action
        jsonb oldValues "null"
        jsonb newValues "null"
        text changedFields "array"
        text reason "null"
        text orgUnitId "null"
        text ip "null"
        text userAgent "null"
        timestamp createdAt
    }
    DomainEvent {
        text id PK
        text type
        jsonb payloadJson
        text status
        integer attempts
        integer maxAttempts
        text lastError "null"
        text dedupeKey UK "null"
        timestamp createdAt
        timestamp processedAt "null"
    }
    IdempotencyKey {
        text id PK
        text key UK
        text scope "null"
        jsonb result "null"
        timestamp createdAt
    }
    Counter {
        text id PK
        text key UK
        integer lastValue
        timestamp updatedAt
    }
    EmailTemplate ||--o{ EmailLog : "templateId"
    OtpRequest ||--o{ OtpDeliveryLog : "otpRequestId"
```

---

## Thống kê

- Bảng: **150** · Enum: **105** · Tổng cột: **1792** · Quan hệ liên cụm: **66**.
