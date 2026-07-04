# NHÓM 01 — Phân loại 221 file import `@/lib/db` trần trong `app/**`

> Nguồn: `grep -rlE "from [\"']@/lib/db[\"']" app --include="*.ts" --include="*.tsx"` chạy trên worktree
> `agent-a4d73468bb1dcb014` ngày 04/07. Đúng 221 file (khớp technical.md §1). Phân loại theo định nghĩa
> Loại A/B/C/D trong `technical.md` §2. Đây là phân loại **best-effort ở mức file** (dựa trên model chính +
> có/không `auth()`/actor) — khi migrate thực tế có thể phát hiện file cần đổi loại (dồn nhóm "khó" cuối batch).

## Tổng kết

| Loại | Số file | Ghi chú |
|---|---|---|
| A — cơ học | 139 | `db.X` → `scopedDb(actor).X`, phần lớn model đã ∈ SCOPED_MODELS hoặc model global (swap an toàn, không cần `where` tay) |
| B — scope tay | 47 | Model phụ thuộc quan hệ (Assignment/Exam/ParentRequest/LeadTask/TrialFeedback/StudentSkillAssessment...) cần thêm `where` qua class/enrollment/student/lead |
| C — GIỮ NGUYÊN | 21 | `app/(public)`, `app/api/cron/*`, `app/api/leads` (webhook), `sitemap.ts`, OG routes — không có actor |
| D — tech-debt giữ whitelist | 14 | report-cards/evaluations/tin-nhan/danh-gia-gv (model chưa center-scope) + `audit-log/_actions.ts` (chờ L9 viewer hợp nhất, không phải cùng lý do model nhưng cùng "giữ nguyên tạm") |
| **Tổng** | **221** | khớp technical.md §1 |

### Ghi chú quan trọng phát hiện trong lúc phân loại

- **9 file module `students/**` + `classes/**`** đang được migrate SONG SONG trong task này (xem commit riêng) — đánh dấu trong bảng bằng ghi chú "MIGRATE SONG SONG".
- **Model `Center` (legacy, khác `OrgUnit`)** xuất hiện ở rất nhiều file (đa số chỉ để đổ danh sách `<Select>` cơ sở) nhưng **KHÔNG có trong `SCOPED_MODELS` lẫn `SCOPE_EXEMPT`** của `lib/db-scope.ts`. Đề xuất: thêm `"Center"` vào `SCOPE_EXEMPT` (giống `OrgUnit` — hạ tầng tổ chức, không phải dữ liệu nghiệp vụ cách ly) để introspection test không báo thiếu khi flip ESLint error. Các file chỉ dùng `Center` để lấy list chọn được xếp Loại A (swap cơ học, không cần `where` tay).
- **`app/(admin)/admin/audit-log/_actions.ts`** đọc 5 bảng audit-log legacy (`userAuditLog`, `permissionGrantAuditLog`, `leadAuditLog`, `classAuditLog`, `studentAuditLog`) — các bảng này không phải SCOPED_MODELS, việc này thuộc **Việc 4 (L9 — audit viewer hợp nhất)**, không nằm trong batch migrate cơ học/scope-tay thông thường → xếp Loại D với lý do riêng (không phải "model chưa center-scope" như ReportCard mà là "chờ viết lại toàn bộ theo `AuditLog` hợp nhất").
- **`assignments/new/page.tsx`, `exams/new/page.tsx`** chỉ đọc `Class` (đã scoped) + `Lesson`/`Question` (global, không center-scope) để render form — KHÔNG đụng trực tiếp `Assignment`/`Exam` → xếp Loại A dù cùng thư mục với các file Loại B khác.
- Ước tính "~30 file public/cron/OG" trong technical.md §1 hơi cao hơn con số verify thực tế (21) — khả năng ước tính cũ tính luôn vài route đã migrate hoặc không còn tồn tại; số 21 là verify trực tiếp trên 221 file hiện có.
- File **khó / mơ hồ nhất** (cần xem tay kỹ khi migrate, khả năng đổi loại): `products/_actions.ts` (ProductMovement — chưa rõ có tied theo center hay không), `nhan-su/*` (Employee scoped nhưng EmployeeOrgAssignment/OrgUnit/DepartmentDef là hạ tầng tổ chức cross-cutting), `curriculums/[id]/edit/page.tsx` (Assignment chỉ xuất hiện qua include phụ, có thể chỉ là đếm số lượng — nếu vậy có thể hạ xuống Loại A), `api/scorm/runtime/route.ts` (ScormAttempt gắn GV không phải HV, mức độ cần cách ly theo center còn tranh cãi).

---

## Loại A — cơ học (139 file)

| Đường dẫn file | Loại | Ghi chú |
|---|---|---|
| app/(admin)/admin/_actions/cron-trigger.ts | A | classSession, enrollment đều SCOPED_MODELS |
| app/(admin)/admin/assignments/new/page.tsx | A | chỉ đọc Class(scoped)+Lesson(global) để render form, không đụng Assignment |
| app/(admin)/admin/attendance/page.tsx | A | center/class/classSession/makeupNeed đều scoped hoặc global-select |
| app/(admin)/admin/audit-log/page.tsx | A | User exempt nhưng migrate sang sdb cho sạch whitelist (theo technical.md §5) |
| app/(admin)/admin/ban-giao-lead/page.tsx | A | Lead scoped |
| app/(admin)/admin/canh-bao-rui-ro/_actions.ts | A | StudentCareTask/StudentRiskAlert scoped |
| app/(admin)/admin/centers/[id]/edit/page.tsx | A | Center — đề xuất thêm SCOPE_EXEMPT (xem ghi chú tổng) |
| app/(admin)/admin/centers/_actions.ts | A | Center — như trên |
| app/(admin)/admin/centers/page.tsx | A | Center — như trên |
| app/(admin)/admin/cham-cong/actions.ts | A | EmployeeCheckin scoped |
| app/(admin)/admin/cham-cong/checklist-co-so/_actions.ts | A | CenterDayChecklist scoped |
| app/(admin)/admin/cham-cong/checklist-co-so/page.tsx | A | CenterDayChecklist scoped |
| app/(admin)/admin/cham-cong/checklist-co-so/tong-quan/page.tsx | A | CenterDayChecklist scoped |
| app/(admin)/admin/cham-cong/chinh-cong/page.tsx | A | TimesheetAdjustmentRequest scoped |
| app/(admin)/admin/cham-cong/duyet-ca/_actions.ts | A | ShiftRegistration scoped |
| app/(admin)/admin/cham-cong/duyet-ca/page.tsx | A | Center select |
| app/(admin)/admin/cham-cong/lich-ca-nhan-vien/page.tsx | A | EmployeeCheckin/ShiftRegistration/TimesheetAdjustmentRequest scoped |
| app/(admin)/admin/cham-cong/lich-ca/_actions.ts | A | ShiftRegistration scoped |
| app/(admin)/admin/cham-cong/lich-ca/page.tsx | A | ClassSession/ShiftRegistration scoped |
| app/(admin)/admin/cham-cong/man-hinh/page.tsx | A | Center select |
| app/(admin)/admin/cham-cong/page.tsx | A | EmployeeCheckin/ShiftRegistration scoped |
| app/(admin)/admin/cham-cong/yeu-cau-cong/page.tsx | A | TimesheetAdjustmentRequest scoped |
| app/(admin)/admin/class-groups/_actions.ts | A | Class/ClassGroup/Enrollment/Student scoped |
| app/(admin)/admin/classes/[id]/progress/page.tsx | A | Class/ClassSession scoped — MIGRATE SONG SONG |
| app/(admin)/admin/classes/_actions.ts | A | Class/ClassGroup/ClassSession/Enrollment scoped, Curriculum/Holiday global/scoped — MIGRATE SONG SONG |
| app/(admin)/admin/classes/new/page.tsx | A | ClassGroup/Course/Curriculum/Room — MIGRATE SONG SONG |
| app/(admin)/admin/course-packages/[id]/edit/page.tsx | A | Course/CoursePackage — catalog global |
| app/(admin)/admin/course-packages/_actions.ts | A | catalog global |
| app/(admin)/admin/course-packages/page.tsx | A | catalog global |
| app/(admin)/admin/course-prerequisites/_actions.ts | A | catalog global |
| app/(admin)/admin/course-prerequisites/page.tsx | A | catalog global |
| app/(admin)/admin/crm/page.tsx | A | Lead scoped |
| app/(admin)/admin/curriculums/new/page.tsx | A | Course catalog global |
| app/(admin)/admin/curriculums/page.tsx | A | Course/Curriculum catalog global |
| app/(admin)/admin/documents/[id]/edit/page.tsx | A | Document/Lesson — học liệu global, không center-scope |
| app/(admin)/admin/documents/_actions.ts | A | Document global |
| app/(admin)/admin/documents/new/page.tsx | A | Lesson global |
| app/(admin)/admin/documents/page.tsx | A | Document/Lesson global |
| app/(admin)/admin/email-logs/page.tsx | A | EmailLog/EmailTemplate global |
| app/(admin)/admin/email-templates/[id]/edit/page.tsx | A | global |
| app/(admin)/admin/email-templates/_actions.ts | A | global |
| app/(admin)/admin/email-templates/page.tsx | A | global |
| app/(admin)/admin/enrollments/[id]/edit/page.tsx | A | Enrollment scoped; EnrollmentAuditLog chỉ đọc lịch sử |
| app/(admin)/admin/enrollments/_actions.ts | A | Class/Enrollment/Student scoped |
| app/(admin)/admin/exams/new/page.tsx | A | chỉ đọc Class(scoped)+Lesson(global), không đụng Exam |
| app/(admin)/admin/holidays/[id]/edit/page.tsx | A | Holiday scoped |
| app/(admin)/admin/holidays/_actions.ts | A | Holiday scoped |
| app/(admin)/admin/honors/[id]/edit/page.tsx | A | Honor/Employee — nội dung vinh danh global (public-facing) |
| app/(admin)/admin/honors/actions.ts | A | như trên |
| app/(admin)/admin/honors/new/page.tsx | A | Employee scoped, dùng để chọn |
| app/(admin)/admin/honors/page.tsx | A | Honor global |
| app/(admin)/admin/honors/settings/page.tsx | A | SitePageContent global |
| app/(admin)/admin/honors/timeline/page.tsx | A | TimelineItem global |
| app/(admin)/admin/inventory/audit/[id]/edit/page.tsx | A | InventoryAudit scoped |
| app/(admin)/admin/inventory/audit/[id]/page.tsx | A | InventoryAudit scoped |
| app/(admin)/admin/inventory/audit/_actions.ts | A | InventoryAudit scoped |
| app/(admin)/admin/inventory/audit/page.tsx | A | InventoryAudit scoped |
| app/(admin)/admin/inventory/items/[id]/edit/page.tsx | A | StockBalance scoped, InventoryItem catalog |
| app/(admin)/admin/inventory/items/_actions.ts | A | StockBalance scoped |
| app/(admin)/admin/inventory/items/page.tsx | A | InventoryItem catalog global |
| app/(admin)/admin/inventory/movements/_actions.ts | A | StockBalance scoped |
| app/(admin)/admin/inventory/movements/page.tsx | A | StockMovement scoped |
| app/(admin)/admin/jobs/[id]/edit/page.tsx | A | JobPosting global |
| app/(admin)/admin/jobs/actions.ts | A | global |
| app/(admin)/admin/jobs/page.tsx | A | global |
| app/(admin)/admin/khao-sat/_actions.ts | A | Survey scoped |
| app/(admin)/admin/khao-sat/page.tsx | A | Survey/SurveyResponse scoped |
| app/(admin)/admin/kits/[id]/edit/page.tsx | A | ZMRoboKit catalog global |
| app/(admin)/admin/kits/_actions.ts | A | catalog global |
| app/(admin)/admin/kits/page.tsx | A | catalog global |
| app/(admin)/admin/layout.tsx | A | User exempt |
| app/(admin)/admin/leads/[id]/edit/page.tsx | A | Lead scoped |
| app/(admin)/admin/leads/cau-hinh-chia/page.tsx | A | LeadAssignmentConfig exempt (config toàn hệ thống) |
| app/(admin)/admin/leads/new/page.tsx | A | Course catalog |
| app/(admin)/admin/news/[id]/edit/page.tsx | A | News global content |
| app/(admin)/admin/news/_actions.ts | A | global |
| app/(admin)/admin/news/page.tsx | A | global |
| app/(admin)/admin/nhan-su/new/page.tsx | A | Employee scoped, DepartmentDef global |
| app/(admin)/admin/notifications/actions.ts | A | Notification scoped |
| app/(admin)/admin/orders/[id]/page.tsx | A | Order scoped |
| app/(admin)/admin/orders/_actions.ts | A | Order scoped |
| app/(admin)/admin/payment-methods/[id]/edit/page.tsx | A | catalog global |
| app/(admin)/admin/payment-methods/_actions.ts | A | global |
| app/(admin)/admin/payment-methods/page.tsx | A | global |
| app/(admin)/admin/products/[id]/edit/page.tsx | A | Product catalog global |
| app/(admin)/admin/products/[id]/page.tsx | A | global |
| app/(admin)/admin/products/_actions.ts | A | Product global (ProductMovement — xem ghi chú "khó phân loại") |
| app/(admin)/admin/products/new/page.tsx | A | global |
| app/(admin)/admin/products/page.tsx | A | global |
| app/(admin)/admin/questions/[id]/edit/page.tsx | A | Curriculum/Lesson/Question catalog global |
| app/(admin)/admin/questions/_actions.ts | A | global |
| app/(admin)/admin/questions/new/page.tsx | A | global |
| app/(admin)/admin/questions/page.tsx | A | global |
| app/(admin)/admin/rooms/[id]/edit/page.tsx | A | Room scoped |
| app/(admin)/admin/rooms/_actions.ts | A | Room scoped |
| app/(admin)/admin/satacoin/_actions.ts | A | SataCoinTransaction scoped, SataCoinRule exempt |
| app/(admin)/admin/sessions/[id]/page.tsx | A | ClassSession/Enrollment scoped |
| app/(admin)/admin/sessions/_actions.ts | A | Class/ClassSession scoped |
| app/(admin)/admin/sessions/new/page.tsx | A | Class scoped, Lesson global |
| app/(admin)/admin/settings/actions.ts | A | User exempt |
| app/(admin)/admin/settings/page.tsx | A | Center select |
| app/(admin)/admin/site-content/actions.ts | A | SitePageContent global |
| app/(admin)/admin/site-content/page.tsx | A | global |
| app/(admin)/admin/students/page.tsx | A | Student scoped — MIGRATE SONG SONG |
| app/(admin)/admin/teachers/page.tsx | A | User exempt (list GV) |
| app/(admin)/admin/tich-hop/page.tsx | A | IntegrationLog/ZaloMessageLog — log tích hợp global |
| app/(admin)/admin/trials/page.tsx | A | TrialClass scoped |
| app/(admin)/admin/users/[id]/edit/page.tsx | A | Employee scoped, User exempt |
| app/(admin)/admin/users/[id]/org-roles/page.tsx | A | OrgUnit exempt |
| app/(admin)/admin/users/[id]/permissions/_actions.ts | A | User exempt |
| app/(admin)/admin/users/[id]/permissions/page.tsx | A | User exempt |
| app/(admin)/admin/users/[id]/reset-password/page.tsx | A | User exempt |
| app/(admin)/admin/users/_actions.ts | A | User exempt |
| app/(admin)/admin/users/new/page.tsx | A | Employee scoped |
| app/(admin)/admin/users/page.tsx | A | User exempt |
| app/(admin)/admin/vouchers/[id]/edit/page.tsx | A | Voucher catalog global |
| app/(admin)/admin/vouchers/[id]/page.tsx | A | global |
| app/(admin)/admin/vouchers/_actions.ts | A | global |
| app/(admin)/admin/vouchers/page.tsx | A | global |
| app/(auth)/kich-hoat/_actions.ts | A | User exempt |
| app/(portal)/portal/ho-so-con/page.tsx | A | Student scoped (portal dùng ownership, không center-scope) |
| app/(portal)/portal/ho-so/actions.ts | A | Student/User |
| app/(portal)/portal/khao-sat/_actions.ts | A | Enrollment/Student/StudentCareTask/Survey scoped |
| app/(portal)/portal/khao-sat/page.tsx | A | Student/Survey/SurveyResponse |
| app/api/admin/cham-cong/shift-export/route.ts | A | ShiftRegistration scoped |
| app/api/admin/import/centers/route.ts | A | Center (bulk import, HO/SUPER) |
| app/api/admin/import/classes/route.ts | A | Center/Course/Employee/Room |
| app/api/admin/import/employees/route.ts | A | Employee scoped |
| app/api/admin/import/holidays/route.ts | A | Center |
| app/api/admin/import/inventory-items/route.ts | A | Center |
| app/api/admin/import/leads/route.ts | A | Lead scoped |
| app/api/admin/import/questions/route.ts | A | Course/Curriculum catalog |
| app/api/admin/import/rooms/route.ts | A | Room scoped |
| app/api/admin/import/students/route.ts | A | Center (tạo Student qua service riêng) |
| app/api/admin/leads/export/route.ts | A | Lead scoped |
| app/api/admin/reports/transcript/route.ts | A | Student scoped |
| app/api/admin/scorm/confirm/route.ts | A | ScormPackage — học liệu global, GV xem không center-scope |
| app/api/admin/scorm/presign/route.ts | A | Lesson/ScormPackage global |
| app/api/scorm/asset/[...path]/route.ts | A | ScormPackage — xác thực bằng vé HMAC + ownership user, không cần center-scope |

## Loại B — scope tay (47 file)

| Đường dẫn file | Loại | Ghi chú |
|---|---|---|
| app/(admin)/admin/assignments/[id]/edit/page.tsx | B | Assignment qua Class — thêm where class.centerId |
| app/(admin)/admin/assignments/_actions.ts | B | Assignment/AssignmentDocument/AssignmentSubmission qua Class/Enrollment |
| app/(admin)/admin/attendance/_actions.ts | B | Attendance CHƯA scoped (SCOPE_EXEMPT chờ L3) — scope tay qua classSession.class.centerId |
| app/(admin)/admin/classes/[id]/_actions.ts | B | ProgressReportLog qua enrollment/class — MIGRATE SONG SONG |
| app/(admin)/admin/crm/commission/page.tsx | B | CommissionStatement — hoa hồng theo cơ sở, cần where qua user/center |
| app/(admin)/admin/curriculums/[id]/edit/page.tsx | B | Assignment xuất hiện (đếm/liên kết) — xem lại khi migrate, có thể hạ Loại A |
| app/(admin)/admin/curriculums/_actions.ts | B | Assignment liên quan |
| app/(admin)/admin/dashboard/_components/sales-dashboard.tsx | B | LeadTask qua Lead |
| app/(admin)/admin/dashboard/_components/teacher-dashboard.tsx | B | AssignmentSubmission qua Class |
| app/(admin)/admin/exams/[id]/attempts/page.tsx | B | Exam/ExamAttempt qua Class |
| app/(admin)/admin/exams/[id]/builder/page.tsx | B | Exam qua Class |
| app/(admin)/admin/exams/_actions.ts | B | Exam/ExamAnswer/ExamAttempt/ExamQuestion qua Class/Enrollment |
| app/(admin)/admin/leads/[id]/page.tsx | B | TrialClassSession qua Lead |
| app/(admin)/admin/leads/actions.ts | B | LeadChild/LeadTask/TrialEnrollment qua Lead |
| app/(admin)/admin/leads/bao-cao-chuyen/page.tsx | B | LeadTransfer qua Lead/Center |
| app/(admin)/admin/media/actions.ts | B | ClassSessionMedia/StudentConsent qua ClassSession/Student |
| app/(admin)/admin/media/page.tsx | B | ClassSessionMedia qua Class |
| app/(admin)/admin/nhan-su/[id]/edit/page.tsx | B | EmployeeOrgAssignment/RoleAuditLog qua Employee/OrgUnit |
| app/(admin)/admin/nhan-su/actions.ts | B | EmployeeOrgAssignment qua Employee |
| app/(admin)/admin/nhan-su/page.tsx | B | EmployeeOrgAssignment/OrgUnit — cross-cutting, xem ghi chú "khó phân loại" |
| app/(admin)/admin/parent-feedback/_actions.ts | B | ParentFeedback qua Student |
| app/(admin)/admin/parent-feedback/page.tsx | B | ParentFeedback qua Student |
| app/(admin)/admin/parent-requests/actions.ts | B | ParentRequest + Attendance (chưa scoped) qua Student/ClassSession |
| app/(admin)/admin/parent-requests/page.tsx | B | ParentRequest qua ClassSession |
| app/(admin)/admin/sessions/[id]/_actions.ts | B | Attendance (chưa scoped) + StudentSessionFeedback qua ClassSession/Student |
| app/(admin)/admin/students/[id]/_actions.ts | B | StudentSkillAssessment qua Student — MIGRATE SONG SONG |
| app/(admin)/admin/students/[id]/edit/page.tsx | B | StudentReserve/StudentSkillAssessment qua Student — MIGRATE SONG SONG |
| app/(admin)/admin/students/_actions.ts | B | StudentReserve qua Student — MIGRATE SONG SONG |
| app/(admin)/admin/students/_components/reserve-history-section.tsx | B | StudentReserve qua Student — MIGRATE SONG SONG |
| app/(admin)/admin/teachers/[id]/page.tsx | B | ParentFeedback/TeacherReview qua Class/Employee |
| app/(admin)/admin/teachers/_actions.ts | B | TeacherProfile/TeacherReview qua Employee |
| app/(admin)/admin/trials/actions.ts | B | TrialFeedback qua TrialClass |
| app/(portal)/portal/bai-tap/actions.ts | B | Assignment/AssignmentSubmission qua Enrollment |
| app/(portal)/portal/bai-thi/[examId]/page.tsx | B | Exam/ExamAttempt qua Enrollment |
| app/(portal)/portal/bai-thi/actions.ts | B | Exam/ExamAnswer/ExamAttempt qua Enrollment |
| app/(portal)/portal/danh-gia/actions.ts | B | ParentFeedback qua Student (ownership, không phải center) |
| app/(portal)/portal/danh-gia/page.tsx | B | ParentFeedback qua Student |
| app/(portal)/portal/hinh-anh/page.tsx | B | ClassSessionMedia qua Enrollment |
| app/(portal)/portal/ket-qua/page.tsx | B | StudentSkillAssessment qua Student |
| app/(portal)/portal/nhan-xet/page.tsx | B | StudentSessionFeedback qua Student |
| app/(portal)/portal/yeu-cau/actions.ts | B | ParentRequest qua ClassSession |
| app/(portal)/portal/yeu-cau/page.tsx | B | ParentRequest/MakeupNeed |
| app/api/admin/crm/commission-export/route.ts | B | CommissionStatement — cùng lý do với crm/commission/page.tsx |
| app/api/admin/reports/certificate/route.ts | B | CourseCompletion qua Student |
| app/api/admin/reports/student-progress/route.ts | B | ProgressReportLog/AssignmentSubmission/ExamAttempt qua Class/Student |
| app/api/scorm/runtime/route.ts | B | ScormAttempt qua ClassSession — mức độ cần cách ly còn tranh cãi (xem ghi chú) |

## Loại C — GIỮ NGUYÊN (21 file)

| Đường dẫn file | Loại | Ghi chú |
|---|---|---|
| app/(public)/hoc-cu/page.tsx | C | Không actor |
| app/(public)/khoa-hoc/page.tsx | C | Không actor |
| app/(public)/page.tsx | C | Không actor |
| app/(public)/tin-tuc/[slug]/page.tsx | C | Không actor |
| app/(public)/tin-tuc/category/[slug]/page.tsx | C | Không actor |
| app/(public)/tin-tuc/page.tsx | C | Không actor |
| app/(public)/tin-tuc/tag/[slug]/page.tsx | C | Không actor |
| app/(public)/tuyen-dung/[slug]/page.tsx | C | Không actor |
| app/(public)/tuyen-dung/page.tsx | C | Không actor |
| app/(public)/vinh-danh/[slug]/og/route.tsx | C | OG image render |
| app/(public)/vinh-danh/[slug]/page.tsx | C | Không actor |
| app/(public)/vinh-danh/page.tsx | C | Không actor |
| app/(public)/vinh-danh/tat-ca/page.tsx | C | Không actor |
| app/api/cron/assignment-due-soon/route.ts | C | Cron, không actor |
| app/api/cron/class-reminder/route.ts | C | Cron |
| app/api/cron/debt-reminder/route.ts | C | Cron |
| app/api/cron/renewal-reminder/route.ts | C | Cron |
| app/api/cron/reserve-expiry/route.ts | C | Cron |
| app/api/leads/route.ts | C | Webhook public — không actor |
| app/sitemap.ts | C | Không actor |
| app/tin-tuc/[slug]/og/route.tsx | C | OG image render |

## Loại D — tech-debt giữ whitelist (14 file)

| Đường dẫn file | Loại | Ghi chú |
|---|---|---|
| app/(admin)/admin/audit-log/_actions.ts | D | Đọc 5 bảng audit-log legacy — chờ Việc 4 (L9 audit viewer hợp nhất), không phải lý do model center-scope |
| app/(admin)/admin/evaluations/page.tsx | D | EvaluationRound SCOPE_EXEMPT |
| app/(admin)/admin/evaluations/results/[roundId]/page.tsx | D | EvaluationRound SCOPE_EXEMPT |
| app/(admin)/admin/report-cards/[enrollmentId]/page.tsx | D | ReportCard SCOPE_EXEMPT (centerId nullable) |
| app/(admin)/admin/report-cards/_actions.ts | D | ReportCard SCOPE_EXEMPT |
| app/(admin)/admin/report-cards/criteria/page.tsx | D | ReportCard SCOPE_EXEMPT |
| app/(admin)/admin/report-cards/page.tsx | D | ReportCard SCOPE_EXEMPT |
| app/(admin)/admin/tin-nhan/_actions.ts | D | ConversationMessage không có centerId |
| app/(admin)/admin/tin-nhan/page.tsx | D | ConversationMessage không có centerId |
| app/(portal)/portal/danh-gia-gv/_actions.ts | D | EvaluationRound SCOPE_EXEMPT |
| app/(portal)/portal/danh-gia-gv/page.tsx | D | EvaluationRound SCOPE_EXEMPT |
| app/(portal)/portal/khao-sat/_eval-actions.ts | D | EvaluationRound SCOPE_EXEMPT |
| app/(portal)/portal/tin-nhan/actions.ts | D | ConversationMessage không có centerId |
| app/(portal)/portal/tin-nhan/page.tsx | D | ConversationMessage không có centerId |
