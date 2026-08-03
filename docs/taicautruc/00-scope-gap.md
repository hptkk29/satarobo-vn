# 00 — Scope gap: `scopedDb` phủ gì, hở ở đâu

**Ngày đo:** 28/07/2026 · **Phạm vi:** BƯỚC 0b · **Nguồn số liệu:** [`00-baseline.md`](00-baseline.md)
Ký hiệu `[QS]` / `[SĐ]` xem quy ước ở `00-baseline.md`.

> **Kết luận một dòng:** độ phủ `centerId` **đầy đủ trên giấy** — 0 model có `centerId` rơi ngoài cả `SCOPED_MODELS` lẫn `SCOPE_EXEMPT`. Lỗ rò **không** nằm ở "quên model" mà ở **4 trục khác**, trong đó 2 trục nặng nhất lại xảy ra trên chính những model **đã được scope**.

---

## 1. Bản đồ độ phủ

`[QS]` Nguồn: `lib/db-scope.ts` + parse `prisma/schema.prisma`.

| Nhóm | Số lượng | Ý nghĩa |
|---|---|---|
| **`SCOPED_MODELS`** — auto-inject `centerId IN (...)` | **34** | `lib/db-scope.ts:11-37` |
| **`SCOPE_EXEMPT`** — có `centerId` nhưng cố ý không scope | **11** (10 có field `centerId` + `Center`) | `lib/db-scope.ts:60-90` |
| **`NULL_IS_GLOBAL_MODELS`** — `centerId NULL` = "toàn hệ thống" | **3** | `lib/db-scope.ts:49-53` |
| **`MAKEUP_EXCEPTION_MODELS`** — nới đọc chéo cho luồng học bù | **4** | `lib/db-scope.ts:343-348` |
| Model có field `centerId` | **44** | = 34 scoped + 10 exempt |
| Model có field `orgUnitId` | **30** (26 model có cả hai) | cột song song, **chưa dùng** |
| Model **không có cả hai** | **125** | phần lớn là catalog / nội dung / log |

### 34 model ĐƯỢC phủ

`Lead` · `Order` · `Student` · `Class` · `ClassGroup` · `TrialClass` · `Room` · `Holiday` · `InventoryAudit` · `StockBalance` · `StockMovement` · `Employee` · `EmployeeCheckin` · `CenterDayChecklist` · `MakeupNeed` · `Notification` · `ShiftRegistration` · `SataCoinTransaction` · `StudentCareTask` · `StudentCenterHistory` · `StudentRiskAlert` · `Survey` · `SurveyResponse` · `TimesheetAdjustmentRequest` · `MessengerConversation` · `Payment` · `TrialClassV2` · `LeadTrialHistory` · **`Enrollment`** · **`ClassSession`** · **`Attendance`** · **`ReportCard`** · **`ConversationMessage`** · **`EvaluationRound`**

> 6 model in đậm mới flip gần đây (FL3-02, #04 08/07, #03 Pha B 10/07) và **dựa trên `centerId` denormalized nullable**. `[SĐ]` Nếu còn bất kỳ đường ghi nào quên set `centerId`, record sẽ **vô hình** với actor cấp cơ sở — vì các model này **không** thuộc `NULL_IS_GLOBAL_MODELS` nên `passesScope` chặn thẳng record `centerId = null` (`lib/db-scope.ts:254`). Deploy-gate cảnh báo đúng điều này ở `lib/db-scope.ts:22-23`. **Chưa xác minh được trạng thái backfill** (cấm đụng DB) — xem `00-baseline.md` §8.

### 10 model có `centerId` nhưng KHÔNG phủ (đều khai báo tường minh, có lý do)

| Model | Lý do ghi trong code |
|---|---|
| `OrgUnit` | `centerId` = link Center cũ, hạ tầng tổ chức (`:61`) |
| `User` | identity/auth, đọc toàn cục (`:62`) |
| `LeadAssignmentConfig` · `SataCoinRule` · `WorkShiftConfig` · `RevenueTarget` | config; `centerId NULL` = quy tắc toàn hệ thống (`:63,64,66,69`) |
| `FacebookPageMapping` | mapping Page→center, hạ tầng (`:65`) |
| `RefundRequest` | scope qua `enrollment→class`; `centerId` chỉ là snapshot nullable (`:72-74`) |
| `WorkRequest` | đọc theo `requesterId`; duyệt so `centerId` **thủ công** trong `reviewWorkRequest` (`:75-78`) |
| `CourseCompletionRequest` | scope qua quan hệ + so `centerId` thủ công (`:79-82`) |
| (`Center`) | ranh giới tenant, không self-scope; bảo vệ phải ở call-site. **Comment còn để TODO chưa audit** `db.center.findMany` (`:83-89`) |

`[QS]` Kiểm chéo hai chiều đều sạch: `centerId NOT scoped NOT exempt` → **rỗng**; `SCOPED nhưng thiếu field centerId` → **rỗng**.

---

## 2. `scopedDb` can thiệp cái gì — chính xác

`[QS]` **7 method ĐỌC, 0 method GHI** (`lib/db-scope.ts:306-328`):

- 6 method đi qua `injectScope()` (thêm `where`): `findMany`, `findFirst`, `count`, `aggregate`, `groupBy`, `findFirstOrThrow`.
- `findUnique` đi **đường khác**: lọc **hậu kỳ** bằng `passesScope`, trả `null` nếu ngoài scope (`:275-293`).
- **`findUniqueOrThrow` KHÔNG được hook** trong cả `scopedDb` lẫn `portalDb`. Hiện **0 call-site** trong `app/`+`lib/` (chỉ 12 lần trong tests) → chưa chảy máu, nhưng là **bẫy im lặng cho code mới**: `sdb.model.findUniqueOrThrow(<id cơ sở khác>)` trả record nguyên vẹn.

> ⚠️ CLAUDE.md nói "auto-scope 7 method đọc" — con số đúng, nhưng **chỉ 6/7** thực sự inject `where`.

---

## 3. Bằng chứng giới hạn "chỉ TOP-LEVEL, nested include không lọc"

`[QS]` Hai loại bằng chứng:

- **Comment cảnh báo tường minh:** `lib/db-scope.ts:4-5` — *"Prisma client extension chỉ chạy cho query TOP-LEVEL. Nested `include` KHÔNG được auto-scope → khi include model scoped khác, PHẢI tự thêm `where`"*. Lặp lại ở `lib/soft-delete.ts:5-6` và `lib/db.ts:64`.
- **Implement:** `injectScope` (`:230-237`) chỉ đọc/ghi `args.where` **cấp 1**, không duyệt `args.include` / `args.select`. `findUniqueScoped` chỉ merge `centerId` vào `select` **top-level** (`:283-285`).
- **8 call-site phải scope TAY** vì giới hạn này: `exams/[id]/attempts/page.tsx:49` · `dashboard/_components/teacher-dashboard.tsx:21` · `inventory/items/page.tsx:73` · `inventory/items/_actions.ts:156-157` · `inventory/audit/[id]/edit/page.tsx:44` · `vouchers/[id]/page.tsx:66` · `lib/finance/debt.ts:133` · `lib/portal/billing.ts:216`.

---

## 4. 14 model chưa phủ — truy vấn cụ thể nào đang trả dữ liệu xuyên cơ sở

> Đề bài yêu cầu 10 model. Đã soi **14** và phân loại đầy đủ. Mọi phán quyết dưới đây **đã qua một vòng phản biện độc lập** (agent kiểm chứng mở lại từng `file:dòng`, đọc cả hàm bao quanh, và đã **bác/sửa 4 khẳng định**).

### 4.1 RÒ RỈ THẬT — 4 ca

| # | Model | Truy vấn rò | Ai khai thác được |
|---|---|---|---|
| L1 | **`ZaloMessageLog`** (không `centerId`, `schema:4715-4728`) | `app/(admin)/admin/tich-hop/page.tsx:35` — `sdb.zaloMessageLog.findMany({ orderBy, take: 30, select: {…toPhone…} })` **KHÔNG có `where`**; comment `:32` tự thừa nhận *"log tích hợp global (∉ SCOPED_MODELS) → pass-through"*. Render `toPhone` **thô, không mask** ở `:100`. | `settings:view` = `[SUPER_ADMIN, CENTER_MANAGER]` (`permissions.ts:544`) → **CENTER_MANAGER@CS1 thấy SĐT phụ huynh/lead của CS2** trong 30 log ZNS gần nhất |
| L2 | **`ConvertConflict`** (không `centerId`, `schema:5233-5246`) | `app/(admin)/admin/convert-conflicts/page.tsx:21` — `where` **chỉ** `{ status: 'OPEN' }`; kèm `sdb.user.findMany` ở `:35` (User ∈ `SCOPE_EXEMPT`) trả `name`/`email`, render `:123-126` | Gate `hasRole(SUPER_ADMIN) \|\| hasRole(CENTER_MANAGER)` (`:16-18`) → CM@CS1 **thấy và merge/resolve được** conflict của lead CS2. Đường GHI cũng hở: `actions.ts:37` và `:93` dùng `sdb.convertConflict.findUnique` mà `findUniqueScoped` chỉ chặn model ∈ `SCOPED_MODELS` → pass-through, **không guard nào khác** |
| L3 | **`ParentRequest`** (không `centerId`, scope qua `student.centerId`) | `lib/pending-tasks.ts:171-176` — **`db` TRẦN**, `where` = `{ status:'PENDING', ...(centerScope ? { student: { centerId: centerScope } } : {}) }`; `centerScope` ở `:105` = `isCM && !isSuper ? user.centerId : null` | `parent-requests:manage` = `[SUPER_ADMIN, CENTER_MANAGER, SALES_CSM]` (`:343`) → **SALES_CSM@CS1 rơi vào `centerScope = null`** → thấy tên HV + loại yêu cầu PENDING của CS2. Hiển thị **vô điều kiện** cho mọi user admin (`dashboard/page.tsx:122` → `pending-tasks-section.tsx:9`) + chuông (`lib/staff-notifications.ts:28`).<br>Đối chứng: trang `/admin/parent-requests` **đã chặn đúng** (`page.tsx:93-96`) |
| L4 | **`EmailLog`** (không `centerId`, `schema:3563-3601`) | `app/(admin)/admin/email-logs/page.tsx:63` — `where` chỉ `q/status/templateId` (`:51-59`); comment `:38` *"model global → sdb pass-through"* | `emails:view` = `[SUPER_ADMIN, CENTER_MANAGER, MARKETING]` (`:580`) → CM@CS1 xem `toName` + `toEmail` **không mask** (vì CM có `leads:view-pii`, `:309`) + `subject` + trigger của email gửi cho PH-HV **CS2**.<br>⚠️ **Phản biện đã siết lại:** trang **có** mask email cho actor thiếu `leads:view-pii` (`:183`); `bodyText`/`bodyHtml`/`contextId` được fetch nhưng **không render** (`:154-225`) → không tới trình duyệt |

### 4.2 CẦN QUYẾT ĐỊNH NGHIỆP VỤ — 1 ca (không phải bug)

| # | Model | Tình huống |
|---|---|---|
| L5 | **`EvalResponse`** (không `centerId`; chỉ `EvaluationRound` cha có) | `lib/eval/aggregate.ts:174-176` — `db.evalResponse.findMany({ where: { roundId } })`, **`db` trần**, lọc duy nhất theo `roundId`. Cổng chặn ở `app/(admin)/admin/evaluations/results/[roundId]/page.tsx:37` là `passesScope('EvaluationRound', …)` — nhưng `EvaluationRound` ∈ `NULL_IS_GLOBAL_MODELS` nên **đợt có `centerId = NULL` luôn pass với mọi actor** (`lib/db-scope.ts:254`).<br>→ `evaluations:view-detail` = `[SUPER_ADMIN, CENTER_MANAGER]` (`:418`): CM@CS1 đọc **nguyên văn góp ý tự do** (`valueText`) của PH cơ sở khác. Tên người **có** mask qua `sdb.user` (`:60`); `teacherId/parentUserId/enrollmentId` **không** render.<br>⚠️ Phản biện: đây là **hành vi có chủ đích**, ghi rõ ở `lib/db-scope.ts:40-48` + comment `page.tsx:31-36`. Gọi là "rò rỉ" là suy diễn. Nhưng phạm vi **rộng hơn** mô tả: `valueText` còn lộ qua đường tổng hợp (`page.tsx:196-200`) chỉ cần `evaluations:view-aggregate` — **role `TEACHER` cũng có**. |

### 4.3 ĐÃ CHẶN GIÁN TIẾP — 9 ca (kiểm tra kỹ, **không** phải rò rỉ)

`[QS]` Ghi lại để **chặn kết luận bi quan sai** ở các bước sau. Mỗi ca đều có `where` thủ công qua quan hệ, kèm comment giải thích.

| Model | Cơ chế chặn |
|---|---|
| `Assignment` | `assignments/page.tsx:65-67` đặt `where.class = { centerId: { in: visibleClassCenters } }` từ `getModelVisibleCenterIds('Class', actor)` (`:46`) |
| `AssignmentSubmission` | `groupBy` bó theo `assignmentId ∈` tập đã lọc (`:92-96`); `teacher-dashboard.tsx:43-49`; `api/admin/reports/student-progress/route.ts:105` sau khi verify student+class |
| `ClassSessionMedia` | `media/page.tsx:25-31` lấy `classIds` qua `sdb.class.findMany` (auto-scope); teacher guard `actor.assignedClassIds.has(classId)` (`anh-lop/page.tsx:114`) |
| `CourseCompletion` | `hoan-thanh-khoa/page.tsx:34-37` `{ student: { centerId: { in: visibleStudentCenters } } }` |
| `ParentFeedback` | `studentId` là **cột phẳng** không có relation → cách ly **2 bước**: lấy `visibleStudents` qua `sdb.student` rồi `where = { studentId: { in: … } }` (`:33-38`) |
| `StudentTransferRequest` | `chuyen-lop/page.tsx:44-53` `OR: [{ fromCenterId: { in: … } }, { toCenterId: { in: … } }]`, fail-safe `in: []` |
| `CommissionStatement` / `Line` | `crm/commission/page.tsx:33-45` `lineWhere` theo `recipientId ∈ user thuộc visibleCenters`; export lọc lại (`commission-export/route.ts:39-49`) |
| `OrderInstallment` | Top-level là `Order` ∈ `SCOPED_MODELS` → `findUnique` bị `passesScope`, `findMany` bị inject |
| `Exam` / `ExamAttempt` | `exams/[id]/attempts/page.tsx:58` lọc `class.centerId ∈ classScope`, **và** nested `attempts` có `where: { student: { centerId: { in: studentScope } } }` (`:72-74`) — hiếm hoi lọc đúng cả nested |

> `[QS]` Agent đo đã quét **257** lời gọi `sdb\|xdb.<model>.findMany\|count\|aggregate\|groupBy` trên model ngoài `SCOPED_MODELS` và loại thêm: `StudentReserve` · `TrialEnrollment` · `TrialAttendance` · `ReportCardScore` · `HomeworkAssignment` · `StudentSkillAssessment` · `StudentSessionFeedback` · `RefundRequest` · `AuditLog` (scope qua `orgUnitId`, `lib/audit/audit-log.ts:185`) · `WebhookDelivery` (gate `settings:edit` = chỉ SUPER_ADMIN) · `LessonChangeRequest` (cross-center **có chủ đích**).

---

## 5. Hai trục rò rỉ NẶNG HƠN — trên chính model đã được scope

`[QS]` Đây là phát hiện quan trọng nhất của BƯỚC 0b, và nó **nằm ngoài** câu hỏi gốc.

### 5.1 Code đi `db` TRẦN trong `lib/` — ESLint không chặn

Cổng ESLint chỉ cấm import `@/lib/db` trong `app/(admin|portal|teacher)`, **không cấm trong `lib/`**. Nên model **đã scoped** vẫn rò:

| Ca | Bằng chứng |
|---|---|
| **`Enrollment`** | `lib/students/renewal.ts:129-153` — `db.enrollment.findMany`, lọc cơ sở **chỉ khi** caller truyền `centerId`. Call-site `students/sap-het-khoa/page.tsx:19-22` tính `centerScope` = `hasRole(CENTER_MANAGER) && !hasRole(SUPER_ADMIN) ? user.centerId : null`; gate trang là `enrollments:view-all` = `[SUPER_ADMIN, CENTER_MANAGER, SALES_CSM, ACCOUNTANT]` (`:406`) → **SALES_CSM@CS1 / ACCOUNTANT@CS1 thấy tên HV + lớp + cột "Cơ sở" của CẢ HAI cơ sở**. Nặng hơn: `sales-dashboard.tsx:27` gọi `getNearingEndEnrollments()` **không tham số** |
| **`Lead`** | `lib/pending-tasks.ts:383-390` và `:537-548` — `db.lead.findMany` trả `parentName`/`childName`; `centerScope` chỉ tính cho CENTER_MANAGER (`:371`, `:534`). `leads:view-all` = `[SUPER_ADMIN, CENTER_MANAGER, MARKETING]` (`:299`) → **MARKETING gắn 1 cơ sở vẫn thấy tên PH của lead cả 2 cơ sở** trên dashboard |

### 5.2 Mẫu lỗi hệ thống lặp lại 3 nơi — suy cách ly từ `hasRole` thay vì `visibleCenterIds`

`[QS]` Công thức sai giống hệt nhau ở:

- `lib/pending-tasks.ts:105`
- `app/(admin)/admin/students/sap-het-khoa/page.tsx:19-22`
- `app/(admin)/admin/teachers/page.tsx:29-30` → `where` `:45`, nested `teacherClass` `:99-102`; `employees:view-all` = `[SUPER_ADMIN, CENTER_MANAGER, HR]` (`:272`) → **HR@CS1 thấy danh sách GV + lịch dạy 2 cơ sở**

**Hệ quả chung:** mọi role cấp cơ sở **không phải** `CENTER_MANAGER` (SALES_CSM, ACCOUNTANT, HR, MARKETING, TRAINING) đều rơi về `null = mọi cơ sở`.

`[QS]` Bổ sung đắt giá: `teachers/page.tsx:31-35` **có** truyền `target.centerId` vào `checkPermission`, nhưng khi `RBAC_V2_ENABLED` OFF thì `evaluatePermission` trả kết quả **v1 matrix** (`lib/auth/check-permission.ts:22-36`) → **`target` không tạo ra cách ly nào**.

---

## 6. Nested include — 3 ví dụ, mức độ khác nhau

| # | Nơi | Đánh giá sau phản biện |
|---|---|---|
| N1 | `chuyen-lop/page.tsx:92-96` — top-level `sdb.student.findMany` có `centerId: fromCenterId` (auto-scope), nhưng nhánh `enrollments → class { name, classCode }` là include **lồng** → không inject. Mẫu tương tự `parent-requests/page.tsx:115-124` | **RÒ RỈ CÓ ĐIỀU KIỆN** — lộ tên + mã lớp CS2 nếu tồn tại HV thuộc CS1 còn `Enrollment` ACTIVE ở lớp CS2. `[SĐ]` phần "có dữ liệu thật" (cấm đụng DB) |
| N2 | `students/page.tsx:95` — `_count: { select: { enrollments: true } }` trong `STUDENT_LIST_SELECT` | ⚠️ Phản biện đã **hạ mức**: chỉ **đếm sai** (cộng cả ghi danh cơ sở cũ) trên HV **vốn đã trong tầm nhìn**; **không** lộ dữ liệu cơ sở khác. `reserves` (`:96-104`) là bản ghi con của chính HV đó → không tạo phơi bày |
| N3 | `sessions/page.tsx:79`, `attendance/page.tsx:70`, `nhan-su/[id]/schedule/page.tsx:123` — `_count: { attendances }` | ⚠️ Phản biện đã **sửa lý giải**: chỉ rò **con số**, không rò danh tính. **KHÔNG được viện dẫn `MAKEUP_EXCEPTION_MODELS`** — whitelist đó chỉ gồm `Class/ClassSession/Lesson/MakeupNeed`, và `lib/db-scope.ts:29-30` ghi rõ *"Makeup đọc Attendance qua raw db (KHÔNG qua scopedDb)"*. `class-groups/page.tsx:43` **không** cùng lỗi (lớp của nhóm lớp luôn cùng cơ sở) |

---

## 7. Bề mặt GHI — `scopedDb` không che, đã lượng hoá

`[QS]` Đo bằng script quét regex `(sdb|xdb|db|tx).<34 model>.(update|updateMany|delete|deleteMany|upsert|create|createMany)` trên `app/`+`lib/` (bỏ test):

- **248 lời gọi GHI** trên `SCOPED_MODELS`, nằm ở **84 file**.
- **139/248 (56%)** nằm trong file **không hề nhắc** `passesScope` — thuộc **56 file**.
- Tập trung: `lib/finance/payment.ts` (12) · `inventory/movements/_actions.ts` (11) · `lib/trial/service.ts` (7) · `lib/orders/installments.ts` (6) · `lib/makeup/service.ts` (5) · `lib/transfer/service.ts` (5).

`[QS]` **Kết quả ÂM tính — ghi lại để chặn kết luận sai:** vệ sinh `centerId` lúc **CREATE** về cơ bản **ỔN**. 91 lời gọi `create/upsert` trên `SCOPED_MODELS`, 79 có `centerId` kề bên; 12 ứng viên nghi ngờ đã spot-check 3 → **cả 3 là dương tính giả** (`centerId` nằm trong biến `data`/`dataCommon` khai trước đó). Heuristic grep **không đủ tin cậy** để kết luận nhóm còn lại.

---

## 8. Bốn đường thoát scope (rộng hơn tên gọi `bypassesScope`)

| # | Đường | Bằng chứng |
|---|---|---|
| B1 | `isSuperAdmin` | `lib/db-scope.ts:92-94` — đây là đường duy nhất `bypassesScope()` nhận |
| B2 | **HO qua `centerScope = "ALL"`** | Role gắn ở OrgUnit type `HO`/`ROOT` → mọi perm của role đó có `centerScope: "ALL"` (`lib/auth/actor.ts:161`) |
| B3 | **HO qua fallback khi model thiếu map prefix** | `lib/db-scope.ts:184` và `:218` — `actor.isHoLevel ? "ALL" : visibleCenterIds`. Comment `:133-140` **tự thừa nhận đã dính 2 lần**: `Attendance` và `LeadTrialHistory` từng quên map prefix → *"bất kỳ ai có 1 role HO đều thấy điểm danh toàn hệ thống bất kể chức năng"* |
| B4 | **Bất kỳ `UserPermissionGrant` ALLOW nào khớp prefix của model** | `lib/db-scope.ts:203-210` — comment *"per-user grants are global exceptions"* → `hasAll = true` → **"ALL"**. `[SĐ]` Cấp một quyền **action** đơn lẻ **vô tình mở luôn cách ly dữ liệu** cho toàn bộ model đó |

`[QS]` Ngoài ra `isHoLevel` = **bất kỳ role nào** gắn ở HO/ROOT, không lọc `roleCode` (`lib/auth/actor.ts:133`) → *"Khối HO"* hiện = **quyền toàn quốc phẳng**, không có khái niệm "HO chỉ phụ trách vùng X".

`[QS]` `DENY` bị **bỏ qua hoàn toàn** ở tầng actor: `buildActor` chỉ giữ `grant === "ALLOW"` (`lib/auth/actor.ts:166-170`).

---

## 9. `portalDb` — cơ chế khác hẳn

`[QS]` Cách ly bằng **quan hệ sở hữu**, không dùng `centerId` — vì actor PARENT không có `UserOrgRole` nên `visibleCenterIds = []`, `scopedDb` sẽ inject `centerId IN []` và phụ huynh **mất sạch dữ liệu** (`lib/portal/db.ts:1-5`).

4 nhóm model: `Student` (`parentUserId`) · **DIRECT_STUDENT 10 model** (`studentId IN childIds`) · **STUDENT_OR_PARENT 2** (`SurveyResponse`, `EvalResponse`) · **VIA_ENROLLMENT 1** (`ConversationMessage`). Model khác = **pass-through** (`:15-17`, gồm `Exam`, `Assignment`, `Survey`, `Class`, `User`, `ClassSessionMedia`).

Cùng 7 method đọc, **0 method ghi**. `findUnique` hậu kiểm 3 giá trị `true/false/'unknown'` — `'unknown'` = **pass-through**. `portalTx` delegate về `db` **gốc**, không qua extension (`:181-183`). File tự nhận là *"BELT-AND-SUSPENDERS"* trên guard tay, **không thay thế** (`:7-13`).

---

## 10. Vùng KHÔNG HỀ có khái niệm cơ sở (quan trọng nhất cho nhượng quyền)

`[QS]` **15 model** dưới đây `centerId = false` **VÀ** `orgUnitId = false`:

`Course` · `Curriculum` · `Lesson` · `ScormPackage` · `CoursePackage` · `Question` · `Exam` · `Document` · `Voucher` · `Product` · `InventoryItem` · `PaymentMethod` · `EmailTemplate` · `Receipt` · `TeacherProfile`

- **Nội dung chương trình dạy gate 100% bằng ma trận role tĩnh TOÀN CỤC, không tham số cơ sở:** `curriculum:create/edit/delete` và `courses:create/edit/delete` = `[SUPER_ADMIN, TRAINING]` (`permissions.ts:452-454, 466-468`); `training:manage` = `[SUPER_ADMIN, TRAINING]` (`:328`). Trang SCORM tự thừa nhận pass-through (`scorm/page.tsx:20-21`).
- **Quyền mở SCORM player CỐ Ý bỏ scope:** `lib/scorm/access.ts:45-48` — comment nguyên văn *"(bỏ qua scope — xem thử mọi gói)"`.
- `[SĐ]` **Hệ quả cho FRANCHISEE:** không có khái niệm "chủ sở hữu nội dung" hay license theo OrgUnit → **một tài khoản `TRAINING` gán ở bất kỳ đâu sẽ đọc/sửa giáo trình + SCORM của MỌI cơ sở**, kể cả FRANCHISEE khác chủ.
- **Tài chính không đồng nhất:** `Order` có cả `centerId` + `orgUnitId`; `Payment` **chỉ** `centerId`; `Receipt` **không có gì**; model `Invoice` **không tồn tại**. `Payment.centerId` là giá trị **suy ra 3 tầng lúc ghi** (`order.centerId → lead.centerId → actor.centerId`, `lib/finance/payment.ts:92-98`) → `[SĐ]` nhân viên HO ghi nhận hộ thì doanh thu rơi về cơ sở của **actor**, không phải cơ sở phát sinh.
- **`Center` không có trường pháp nhân:** không MST, không tài khoản ngân hàng, không tiền tệ, không múi giờ (`schema:235-280`). MST duy nhất trong hệ thống là **hằng số trong code** (`lib/locations.ts:63`).
- **Giá là toàn cục:** 45 setting key, 18 `centerOverridable` / 27 global-only, **0 key về giá/thuế/tiền tệ**; `CoursePackage`/`Course` không có `centerId` → **một bảng giá cho mọi cơ sở**.

---

## 11. Ngữ nghĩa "record thuộc cơ sở nào" — CHƯA ĐƯỢC ĐỊNH NGHĨA

`[QS]` Học bù liên cơ sở làm lộ mâu thuẫn này rõ nhất:

- `MakeupNeed.centerId` = cơ sở của **lớp bị lỡ** (cơ sở NHÀ) — `lib/makeup/service.ts:34-43`.
- `Attendance.centerId` = cơ sở của **lớp diễn ra** (cơ sở HOST) — `app/(teacher)/teacher/lop/_actions.ts:107` → `:138`; cùng công thức ở `admin/attendance/_actions.ts:89 → :146`.

→ Cùng **một** sự kiện học bù chéo tạo **2 bản ghi thuộc 2 cơ sở khác nhau**. Quản lý cơ sở NHÀ **mất** bản ghi điểm danh của chính học viên mình.

`[SĐ]` **Mọi con số "cách ly cơ sở" ở tài liệu này đều giả định `centerId` có một nghĩa duy nhất. Giả định đó SAI.** Cần bổ sung phép đo: liệt kê mọi model có `centerId` kèm **công thức gán** (đọc từ đâu), phân loại "trực thuộc" vs "tác nghiệp".

Bổ sung về học bù (liên quan trực tiếp **D7**):

- `MAKEUP_EXCEPTION_MODELS` chỉ nới **ĐỌC** (`withMakeupException` hook 7 method đọc, 0 method ghi). Đường **GHI** (`scheduleMakeup`) đi `db` trần trong transaction, **không** `passesScope` (`lib/makeup/service.ts:255-269`).
- Cross-center **có audit** (`MAKEUP_CROSS_CENTER`, `:291-300`) nhưng **không sinh giao dịch nội bộ nào** — không có đối soát tiền/chi phí giữa 2 cơ sở.
- Cờ bật/tắt học bù liên cơ sở **FAIL-OPEN**: `getSetting("makeup.crossCenterEnabled").catch(() => true)` (`:103`) → lỗi đọc setting = **BẬT** cross-center.
- `Lesson` nằm trong `MAKEUP_EXCEPTION_MODELS` nhưng **không** thuộc `SCOPED_MODELS` → exception với `Lesson` là **no-op**.

---

## 12. Cách ly CỘT và cách ly HÀNG hoàn toàn rời nhau

`[QS]` Toàn repo chỉ có **4 chỗ `$extends`** (`lib/db.ts:66`, `lib/db-scope.ts:303`, `:365`, `lib/portal/db.ts:146`) và **CẢ 4 đều là hook `query:`** (lọc **dòng**). **Không có hook `result:`** nào (biến đổi **trường**).

→ Masking hoàn toàn ở tầng page/component, phải nhớ gọi tay từng màn: chỉ **9 file `app/*`** gọi mask; 3 helper thuần nằm rời (`lib/utils.ts` `maskPhone`, `lib/lead/pii.ts`, `lib/finance/pii-mask.ts`).

`[QS]` `getEmployeeFieldVisibility` là **allowlist role tĩnh 4 nhóm**, **không nhận** actor/centerId/orgUnit (`lib/auth/permissions.ts:686-707`) → **không thể diễn đạt** "HR cơ sở A chỉ xem lương NV cơ sở A".

`[SĐ]` Đây là **một nguyên nhân gốc duy nhất** sinh ra các ca L1/L2/L4 ở §4.1 — nên trình bày như vậy, không phải 3 bug rời.

---

## 13. Điểm chưa đo được

1. Trạng thái backfill `centerId` prod cho 6 model mới flip (§1).
2. Có bao nhiêu `Attendance` mang `centerId` khác `Student.centerId` (§11) — quyết định mức nghiêm trọng.
3. Vai trò thật của tài khoản prod — các ca L3, §5.1, §5.2 chỉ xảy ra **nếu** có user cấp cơ sở giữ role SALES_CSM / MARKETING / HR / ACCOUNTANT.
4. Toàn bộ phân tích trên dùng ma trận **v1** (vì `RBAC_V2_ENABLED` OFF). Bật v2 thì tập role có quyền **sẽ khác**.
5. 3 module báo cáo (`lib/reports/{cohort,dao-tao,teacher-performance}.ts`) có **0** tham chiếu `centerId` — nhưng là hàm **thuần, 0 lời gọi DB**; cách ly phụ thuộc **hoàn toàn** vào dữ liệu page truyền vào (`lib/reports/filters.ts` mới là chỗ chặn IDOR). Chưa đo "ai truyền và truyền gì".
