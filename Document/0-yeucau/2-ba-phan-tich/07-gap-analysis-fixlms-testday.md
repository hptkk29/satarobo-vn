# BA #07 — Gap Analysis & Kế hoạch FixLMS (từ test tay sau R7)

> **Input:** 19 nhóm phát hiện test tay của TGĐ (RBAC sidebar/cách ly cơ sở · luồng Lead→Đăng ký · LMS/SCORM/bài tập/câu hỏi · phiếu đánh giá buổi học · khảo sát trung tâm) · phiếu mẫu `0-tai-lieu-goc/Phiếu đánh giá buổi học.html` · checklist test tay `Document/4-test/` · **code hiện trạng sau A0→R7** (snapshot 23/06/2026, map qua 4 explorer) · Doc 15 · BA #05/#06 (LMS v3.1).
> **Output:** gap từng nhóm (hiện trạng file:line → đích → việc → độ phức tạp) + user story/AC + **đề xuất chia phase FixLMS (FL1→FL4)** theo ưu tiên TGĐ. Đầu vào cho `prepare-prompt` → ticket phase.
> **Nguyên tắc:** TÁI DÙNG pipeline & model sẵn có (EvalForm engine · ScormPackage.lessonId · Question.imageUrl/choices · scopedDb · convertLeadV2). Additive trước — drop sau (2-phase). **Doc 15 thắng doc cũ; code thắng doc khi mô tả hiện trạng.** Sửa BE thì **sửa kèm FE + DB cho khớp** (tránh lệch tầng). Tiền/enrollment đi transaction; side-effect đi DomainEvent; mọi đọc nghiệp vụ qua `scopedDb(actor)`; server action mở đầu `can()`; mutation nhạy cảm ghi AuditLog.
> **Trạng thái:** 🟢 **6 TBD đã chốt (TGĐ 24/06/2026 — xem mục 7).** Sẵn sàng `prepare-prompt` sinh ticket FL0–FL4. Ưu tiên TGĐ: **FL1 LMS → FL2 Lead → FL3 RBAC → FL4 Đánh giá/Khảo sát** (3→2→1→4).

---

## 0. Tổng quan & ánh xạ 19 nhóm → 4 epic

| Epic | Nhóm test tay | Bản chất | Ưu tiên TGĐ |
|---|---|---|---|
| **E-LMS** — Học liệu & giảng dạy | 11,12,13,14,16,17 | Gộp khoá học/gói × khoá dạy; gắn SCORM + bài tập + câu hỏi vào từng buổi; bộ câu hỏi theo khung CT; GV xem tài liệu giảng dạy; quyền sửa LMS | **1 (FL1)** |
| **E-LEAD** — Lead → Đăng ký | 5,6,7,8,9,10 | Reload thủ công sau thao tác; convert "đã đăng ký" thiếu nhập con + học phí 2 đợt; bàn giao trùng nguồn/đích; chọn lớp trial sai; bỏ Hội sở khỏi đơn vị; chuyển cơ sở & hoàn thành khoá truy vấn ngược | **2 (FL2)** |
| **E-RBAC** — Phân quyền & cách ly cơ sở | 1,2,3,4 | Sidebar lộ module sai vai; quản lý CS thấy data CS khác (leak); rà quyền dư/thiếu cho Sale/Teacher/Accountant | **3 (FL3)** |
| **E-EVAL** — Đánh giá buổi & Khảo sát | 15,18,19 | Phiếu đánh giá buổi học linh hoạt (admin/đào tạo cấu hình); khảo sát trung tâm 4 loại câu hỏi; đánh giá GV (hoãn) | **4 (FL4)** |

> Lưu ý ưu tiên: FL3 (RBAC) là **rủi ro bảo mật cao nhất** (leak cross-center). TGĐ xếp sau LMS/Lead vì giá trị nghiệp vụ trước mắt, nhưng **6 điểm leak P0 ở dashboard (mục 3.B) nên vá ngay trong FL1** dù epic xếp thứ 3 — đề xuất tách "hotfix leak" lên đầu (mục 6, FL0).

---

## 1. EPIC E-LMS — Học liệu & giảng dạy (item 11,12,13,14,16,17) · **FL1**

### 1.1 Hiện trạng (as-is)

| Thành phần | Model / Trang | Ghi chú hiện trạng |
|---|---|---|
| Khoá dạy | `Course` (`schema.prisma:798-852`) · `/admin/courses` | catalog phân loại; `isTeachable`, `totalSessions` |
| Gói bán | `CoursePackage` (`schema.prisma:1644-1700`) · `/admin/course-packages` | marketing/giá; **`curriculum` là JSON** (không link Curriculum model) |
| Chương trình | `Curriculum`+`Lesson` (`2016-2098`) · `/admin/curriculums/[id]/edit` | Lesson có `teacherGuide, objectives[], materials[], homeworkDefault, assessmentCriteria`; **không có field gắn SCORM / bài tập** trong UI edit |
| SCORM | `ScormPackage.lessonId` (`4370-4444`) · `/admin/scorm` | **đã có quan hệ tới Lesson**; gate `training:manage` + flag `SCORM_ENABLED`; **TEACHER không truy cập**; delivery track theo GV (không phải HS) |
| Bài tập | `Assignment.lessonId?` + `Assignment.questions[]` (`2388-2424`) · `/admin/assignments` | gắn `classId` bắt buộc, `lessonId` tuỳ chọn |
| Câu hỏi | `Question` (`2141-2194`) · `/admin/questions` (+`/import`) | có `type, difficulty, imageUrl, explanation, choices[]{text,isCorrect,imageUrl}, correctAnswer, lessonId?, assignmentId?`; **import Excel có sẵn** |

### 1.2 Gap & việc cần làm

| # | Nhóm | Hiện trạng | Đích (mong muốn) | Việc (BE/FE/DB) | Phức tạp |
|---|---|---|---|---|---|
| L-1 | 11 | `Course` (khoá dạy) và `CoursePackage` (gói bán) **tách rời**, người dùng thấy "trùng"; curriculum JSON trong package ≠ Curriculum model | Làm rõ ranh giới: **gói = đơn vị bán** (giá), **khoá dạy = đơn vị giảng** (curriculum). 1 gói ↔ 1+ khoá dạy; bỏ field `curriculum` JSON trùng, link sang `Course/Curriculum` | DB: thêm quan hệ `CoursePackage.courseId?`/bảng nối; deprecate JSON (2-phase). FE: gộp điều hướng (1 cụm "Chương trình & Khoá"), ẩn trùng. BE: helper resolve giá↔khoá | **Cao** |
| L-2 | 12,16 | Trang edit Lesson **không** có ô gắn tài liệu giảng dạy (SCORM) và chọn bài tập | Trong edit chi tiết buổi: thêm **(a) field tài liệu giảng dạy = chọn/ upload gói SCORM cho buổi**, **(b) field chọn các bài tập** (từ nguồn Bài tập về nhà) | DB: quan hệ đã có (`ScormPackage.lessonId`, `Assignment.lessonId`). FE: thêm 2 section vào lesson editor + picker. BE: action gắn/gỡ SCORM↔lesson, assignment↔lesson | **TB** |
| L-3 | 13 | Bài tập tạo ở `/admin/assignments`, gắn buổi qua `lessonId` tuỳ chọn (rời rạc) | Bài tập về nhà là **nguồn (bank)**; gán vào buổi tại lesson editor (L-2b). **Tách `AssignmentTemplate` (theo khung CT/lesson) khỏi `Assignment` (bài giao cho lớp)** — QĐ-T2 | DB: model `AssignmentTemplate` mới. FE: luồng tạo template→gán vào buổi→sinh bài giao cho lớp. | **Cao** |
| L-4 | 14 | `Question` thiếu: **khung chương trình** (lọc câu hỏi theo Sata 4 ≠ Sata 3), **điểm/câu**, **thời gian/câu** | Thêm `Question.curriculumId`/`courseId` (lọc theo khung khi soạn giáo trình), `points`, `timeLimitSec`. Giữ sẵn `type, difficulty, imageUrl, choices.imageUrl, explanation, correctAnswer`. Nút **add bằng template + tải template mẫu** (đã có import Excel — chuẩn hoá template) | DB: +3 field Question. FE: form CRUD đủ trường + filter khung CT + tải template mẫu. BE: validate theo `type` | **Cao** |
| L-5 | 16,3 | TEACHER **không** có menu/quyền xem tài liệu giảng dạy (SCORM) của lớp mình | GV nhận lớp → xem **khung CT lớp đó** → từng buổi: **tài liệu giảng dạy (view/present SCORM) + bài tập buổi + thống kê bài tập HS đã nộp**. Đọc-only, không sửa LMS | BE: quyền mới `teaching-materials:view-own-class` (đọc theo class GV dạy). FE: trang GV "Lớp của tôi → Khung CT → Buổi → tài liệu/bài tập". Tôn trọng `SCORM_ENABLED` | **Cao** |
| L-6 | 17 | LMS sửa được bởi `CENTER_MANAGER` + `TEACHER` (curriculum:edit), `training:manage`=SUPER+CM | **Chỉ Đào tạo (TRAINING) + Admin sửa** LMS; Quản lý + Giáo viên **chỉ xem** (QĐ-T1) | DB: thêm role `TRAINING`. BE: siết `curriculum:edit/training:manage/questions:author/assignments:edit` về SUPER_ADMIN+TRAINING; gỡ khỏi TEACHER+CENTER_MANAGER (giữ `*:view`). FE: gate sidebar LMS theo role mới | **Cao** |

### 1.3 User story tiêu biểu (E-LMS)

**US-LMS-1** · Là **Đào tạo**, tôi muốn **gắn tài liệu giảng dạy (SCORM) và chọn bài tập ngay trong màn chỉnh sửa từng buổi của chương trình học** để **mỗi buổi có đủ học liệu + bài tập, không phải nhảy nhiều trang**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 12,16 · Phase FL1 · Test T-LMS
- AC1: Given buổi học X trong curriculum, When mở edit buổi, Then thấy section "Tài liệu giảng dạy" cho phép chọn gói SCORM đã upload cho buổi (hoặc upload mới) — 1 bản active/buổi (`isActiveForLesson`).
- AC2: Given nguồn Bài tập về nhà, When ở edit buổi chọn "Thêm bài tập", Then gán được ≥1 bài tập vào buổi; gỡ ra được; lưu vào `Assignment.lessonId`/bảng nối.
- AC3: Given `SCORM_ENABLED=false`, Then section SCORM ẩn/disable (không vỡ trang).

**US-LMS-2** · Là **Đào tạo**, tôi muốn **bộ câu hỏi gắn theo khung chương trình + có điểm, thời gian, loại, ảnh, giải thích** để **khi soạn giáo trình Sata 4 chỉ hiện câu hỏi của Sata 4**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 14 · Phase FL1
- AC1: Given câu hỏi mới, When tạo, Then chọn được **khung chương trình** (curriculum/course), loại (trắc nghiệm/đúng-sai), độ khó, **điểm**, **thời gian/câu**, nội dung, đáp án + đánh dấu đáp án đúng, ảnh câu hỏi, ảnh đáp án, giải thích.
- AC2: Given đang soạn bài tập cho buổi thuộc Sata 4, When mở picker câu hỏi, Then chỉ thấy câu hỏi khung Sata 4 (không thấy Sata 3).
- AC3: Có nút **"Thêm câu hỏi bằng template"** + link **tải template mẫu chuẩn**; import hàng loạt validate theo loại câu hỏi.
- AC4: CRUD đầy đủ (tạo/sửa/xoá theo quyền author/admin).

**US-LMS-3** · Là **Giáo viên**, tôi muốn **xem khung chương trình của lớp mình dạy, kèm tài liệu giảng dạy + bài tập từng buổi + thống kê bài HS đã nộp** để **điểm danh → giảng → giao bài → đánh giá** trọn vòng.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 16 · Phase FL1
- AC1: GV chỉ thấy lớp mình dạy (scope ASSIGNED); mở lớp → khung CT → danh sách buổi.
- AC2: Mỗi buổi: xem (present) SCORM + danh sách bài tập của buổi (read-only, không sửa LMS).
- AC3: Xem thống kê nộp bài tập của HS lớp đó (đã nộp/chấm) phục vụ đánh giá cuối khoá.
- AC4: 🔒 GV không sửa được curriculum/lesson/SCORM (chỉ Đào tạo/Admin) — xem **US-LMS-4**.

**US-LMS-4** · Là **TGĐ/Admin**, tôi muốn **tạo role `TRAINING` (Đào tạo) riêng — chỉ Đào tạo và Admin được sửa LMS; Giáo viên + Quản lý chỉ xem** để **học liệu thống nhất toàn brand, không bị sửa lệch theo cơ sở** (QĐ-T1).
- Ưu tiên: **Must** · Loại: BR · Truy vết: item 17 · Phase FL1
- AC1: Thêm role `TRAINING` vào enum role + matrix `permissions.ts`; có user gán role này.
- AC2: `curriculum:edit/create/delete`, `training:manage`, `questions:author`, `assignments:edit/create`, `documents:upload` chỉ thuộc **SUPER_ADMIN + TRAINING**.
- AC3: TEACHER giữ `*:view` + thao tác **trong lớp mình** (điểm danh, chấm, đánh giá HS) nhưng **không sửa curriculum/lesson/SCORM/question bank**.
- AC4: CENTER_MANAGER có `*:view` LMS, không có `*:edit`.
- AC5: Thay đổi quyền/role có audit + reason (Doc 15 RBAC).

---

## 2. EPIC E-LEAD — Lead → Đăng ký (item 5,6,7,8,9,10) · **FL2**

### 2.1 Hiện trạng (as-is)

- **Convert v2 đã có** dạng **trang riêng** `/admin/leads/[id]/convert` (`convert-form.tsx` + `actions.ts` + `lib/crm/convert-lead-v2.ts`) — **hỗ trợ nhiều con + consent media + snapshot giá + idempotency + dedupe phụ huynh + payment guard**. Nhưng **vẫn tồn tại popup "close-deal" cũ ở Kanban** → đây là "popup chuyển đã đăng ký" mà TGĐ thấy thiếu trường.
- **Thiếu chọn học phí 1 đợt / 2 đợt** trong convert v2 (gap đã xác nhận).
- **Transfer/bàn giao** (`transfer-dialog.tsx` + `transferLead`): **không validate** chọn trùng cơ sở/sale nguồn-đích.
- **Kanban không auto-refresh** sau đổi trạng thái/chia lại/thêm việc (table & detail có `router.refresh()`).
- **Trial enroll widget** (`trial-enroll-widget.tsx`) dùng đúng **TrialClassV2 (OPEN, cùng cơ sở)**. ⚠️ Cần xác minh: chỗ TGĐ thấy "gán vào lớp học thay vì lớp trải nghiệm" là **popup close-deal cũ** hay path khác (**TBD-3**).
- **Hoàn thành khoá**: `/admin/hoan-thanh-khoa` (gate `completions:manage`).
- **Đơn vị/Hội sở**: dropdown cơ sở hiện gồm cả HO.

### 2.2 Gap & việc cần làm

| # | Nhóm | Hiện trạng | Đích | Việc (BE/FE/DB) | Phức tạp |
|---|---|---|---|---|---|
| LD-1 | 5,8 | Sau chuyển/chia lại lead/thêm việc ở **Kanban** phải reload tay | Tự cập nhật UI sau mọi mutation (Kanban + list + detail) | FE: `router.refresh()`/revalidate cho Kanban; kiểm các action thiếu revalidate | **Thấp** |
| LD-2 | 6,9,10 | Nút "chuyển đã đăng ký" ngoài Lead mở **popup close-deal cũ** (thiếu nhập con, thiếu học phí 2 đợt) | Nút ngoài Lead **điều hướng vào trang chi tiết lead** (vd `/leads/{id}`), tại đó dùng convert v2 (đa con) + **thêm chọn học phí 1 đợt/2 đợt**; **gỡ popup cũ** | FE: bỏ popup Kanban → link detail; thêm UI chọn kỳ học phí. BE: convert v2 nhận `installmentPlan` (1 hoặc 2 đợt) → nối `recordInstallmentPlan`. DB: không đổi (đã có Payment/installment) | **TB** |
| LD-3 | 6,8 | Bàn giao: nguồn/đích có thể trùng | Validate **cơ sở nguồn≠đích** và/hoặc **sale nguồn≠đích**; chọn lead bàn giao rõ ràng | FE+BE: thêm validation `transferLead` + form | **Thấp** |
| LD-4 | 6,8 | Tab Học thử `/admin/trials` → "Ghép vào lớp" (`trials-list.tsx:335`) đổ từ `Class` (lớp chính thức), ghi `TrialClass.classId` | Picker chỉ list **TrialClassV2 (lớp trải nghiệm) OPEN cùng cơ sở**; **gán HS trực tiếp tại tab Học thử** (không bắt vào lead gán LeadChild) — QĐ-T3 | FE: đổi nguồn dropdown sang TrialClassV2; thêm luồng gán trực tiếp (chọn HS/con). BE: ghi `TrialEnrollment` thay vì `TrialClass.classId`; điều tra "link cơ sở (bug)" kèm | **TB** |
| LD-5 | 7,8 | Đơn vị trong đăng ký học gồm **Hội sở** | **Bỏ Hội sở** khỏi danh sách đơn vị chọn khi đăng ký (HO không nhận HV) | FE: lọc OrgUnit loại HO khỏi center picker (qua OrgUnit tree, không hardcode) | **Thấp** |
| LD-6 | 7,8 | Chuyển cơ sở: luồng truy vấn ngược | Luồng **từ cơ sở → chọn học sinh** (giảm truy vấn), không phải HS→cơ sở | FE: đổi thứ tự chọn; BE: query theo centerId trước | **TB** |
| LD-7 | 7,8 | Hoàn thành khoá: chọn rời rạc | Liên mạch **tên học viên → khoá đang học → lớp** | FE: stepper phụ thuộc; BE: query khoá theo enrollment của HS, lớp theo khoá | **TB** |

### 2.3 User story tiêu biểu (E-LEAD)

**US-LEAD-1** · Là **Sale**, tôi muốn **bấm "chuyển đã đăng ký" ngoài Lead đưa tôi vào trang chi tiết lead có nhập nhiều con + chọn học phí 1 đợt/2 đợt** để **chốt đơn đầy đủ thông tin trong một luồng**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 6,9,10 · Phase FL2
- AC1: Given lead ở Kanban/list, When bấm "chuyển đã đăng ký", Then điều hướng `/leads/{id}` (không mở popup cũ).
- AC2: Trang chi tiết cho **thêm/sửa nhiều con** trước convert (đã có LeadChild + convert v2 đa con).
- AC3: Khối học phí cho chọn **1 đợt (full)** hoặc **2 đợt** (đợt 1 + đợt 2 có ngày); convert nối `recordInstallmentPlan`.
- AC4: Giữ nguyên guard cũ: payment-required, dedupe phụ huynh, idempotency, consent media.

**US-LEAD-2** · Là **Sale/Quản lý**, tôi muốn **UI tự cập nhật sau khi chuyển lead / chia lại / thêm việc** để **không phải F5 thủ công**.
- Ưu tiên: **Must** · Loại: FR/NFR(usability) · Truy vết: item 5,8 · Phase FL2
- AC: Sau mỗi action ở Kanban, danh sách & cột trạng thái cập nhật ngay (không reload tay).

**US-LEAD-3** · Là **Quản lý**, tôi muốn **không chọn được nguồn và đích trùng nhau khi bàn giao lead** để **tránh thao tác vô nghĩa/sai dữ liệu**.
- Ưu tiên: **Must** · Loại: BR · Truy vết: item 6,8 · Phase FL2
- AC: When cơ sở/sale đích = nguồn, Then chặn + báo lỗi rõ (code EN, message VI).

**US-LEAD-4** · Là **Sale**, tôi muốn **ở tab Học thử, mục "ghép vào lớp học thử" chỉ hiện lớp trải nghiệm và cho gán học sinh trực tiếp** để **không gán nhầm vào lớp chính thức và không phải vào lead gán LeadChild** (QĐ-T3).
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 6,8 · Phase FL2
- AC1: Picker ở `/admin/trials` chỉ liệt kê **TrialClassV2 OPEN cùng cơ sở**; không hiện `Class`.
- AC2: Gán HS/con vào lớp trải nghiệm ngay tại tab Học thử → tạo `TrialEnrollment` (không cần mở lead).
- AC3: 🔒 chỉ lớp trải nghiệm cùng cơ sở lead/HS.

**US-LEAD-5** · Là **Sale**, tôi muốn **chọn cơ sở trước rồi mới chọn học viên khi chuyển cơ sở/hoàn thành khoá** để **giảm truy vấn và liền mạch**.
- Ưu tiên: **Should** · Loại: FR · Truy vết: item 7,8 · Phase FL2
- AC1: Chuyển cơ sở: từ cơ sở → danh sách HS thuộc cơ sở.
- AC2: Hoàn thành khoá: HS → khoá đang học → lớp (phụ thuộc dây chuyền).
- AC3: Danh sách đơn vị chọn HV **không gồm Hội sở** (qua OrgUnit tree).

---

## 3. EPIC E-RBAC — Phân quyền & cách ly cơ sở (item 1,2,3,4) · **FL3** (+ hotfix FL0)

### 3.A Hiện trạng (as-is)

- **Sidebar** (`components/admin/sidebar.tsx:76-213`) gate theo permission; nhiều menu gate **quá rộng** (`students:view-all`, `classes:view-all`) làm lộ module sang vai không liên quan (đúng các bảng "module dư thừa" TGĐ liệt kê cho Sale/Teacher/Accountant).
- **scopedDb** (`lib/db-scope.ts`): **26 SCOPED_MODELS** auto-scope; **EXEMPT**: `Enrollment, ClassSession, Attendance, ReportCard, EvaluationRound, RefundRequest` (+ config/identity) — cách ly thủ công qua relation.
- Các `_actions.ts` đã dùng đúng `scopedDb`/`passesScope`.

### 3.B 🔴 Leak P0 — dashboard dùng `db` trần (vá ngay, FL0)

| File | Line | Model (SCOPED) | Hậu quả |
|---|---|---|---|
| `dashboard/_components/accountant-dashboard.tsx` | 18-30 | Order | Kế toán thấy đơn **mọi cơ sở** |
| `dashboard/_components/manager-dashboard.tsx` | 64-72 | Lead | Quản lý thấy lead **mọi cơ sở** |
| `dashboard/_components/manager-dashboard.tsx` | 68 | Student | Quản lý thấy HS **mọi cơ sở** |
| `dashboard/_components/marketing-hr-dashboards.tsx` | 17-26 | Lead | Marketing thấy lead **mọi cơ sở** |
| `dashboard/_components/marketing-hr-dashboards.tsx` | 74 | Employee | HR thấy nhân sự **mọi cơ sở** |
| `dashboard/_components/marketing-hr-dashboards.tsx` | 76 | ShiftRegistration | HR thấy ca **mọi cơ sở** |

→ **US-RBAC-0 (Must, FL0):** thay `db` trần bằng `scopedDb(actor)` ở 6 điểm; thêm test CI bắt cross-center ở dashboard.

### 3.C Gap sidebar/quyền theo vai (item 1-4)

| # | Vai | Vấn đề | Đích | Việc |
|---|---|---|---|---|
| RB-1 | CENTER_MANAGER | Thấy data CS khác (GV/HV/lớp/kho…) | Cách ly chặt theo cơ sở | Vá leak FL0 + audit toàn bộ page bare-db; cân nhắc flip `Enrollment/Session` vào SCOPED_MODELS (2-phase) |
| RB-2 | SALES_CSM | Menu dư: Buổi học, Điểm danh, Phòng học, Khoá dạy, Học bạ, Tuyển dụng, Tin tức, Tổng hợp công ca, 3 báo cáo đào tạo | Ẩn module ngoài vai Sale | Siết gate sidebar (gate riêng thay vì `classes:view-all`); gỡ quyền dư (vd `students:view-all` lộ Học bạ) |
| RB-3 | TEACHER | Dư: Chăm sóc HV, Học thử (CRM), Báo cáo trải nghiệm, Tổng hợp công ca, Tin tức. **Thiếu**: Đăng ký học (own-class), SCORM (giảng), Học bù, Đánh giá xem tổng hợp | Đúng vai GV (xem E-LMS US-LMS-3) | Siết gate dư; mở menu thiếu theo quyền GV thực |
| RB-4 | ACCOUNTANT | Dư: Học bạ, Khoá dạy, Tin nhắn, Cảnh báo/Chăm sóc HV, báo cáo đào tạo, Tổng hợp công ca, Tin tức, Email templates. **Thiếu**: Payroll, xem lương nhân sự, kiểm kê kho. Quyền lạ: `students:edit` | Đúng vai kế toán | Siết gate dư; thêm menu Payroll/Inventory theo `payroll:*`/`inventory:*`; **gỡ `students:edit`** (QĐ-T4) |

### 3.D User story tiêu biểu (E-RBAC)

**US-RBAC-1** · Là **Quản lý cơ sở**, tôi muốn **chỉ thấy dữ liệu cơ sở mình ở mọi danh sách và dashboard** để **không lộ thông tin cơ sở khác**.
- Ưu tiên: **Must** · Loại: NFR(security)/BR · Truy vết: item 1 · Phase FL0+FL3 · Test 🔒 (luồng G)
- AC1: Mọi đọc nghiệp vụ (kể cả dashboard, Enrollment/Session) lọc theo `visibleCenterIds`.
- AC2: Test CI: tạo HS/lớp/order CS2, đăng nhập CM CS1 → 0 bản ghi CS2 ở students/classes/enrollments/sessions/payments/dashboard.

**US-RBAC-2..4** · Là **Sale/GV/Kế toán**, tôi muốn **sidebar chỉ hiện module đúng vai** để **giao diện gọn, không vào nhầm chức năng không có quyền**.
- Ưu tiên: **Should** · Loại: FR · Truy vết: item 2,3,4 · Phase FL3
- AC: Theo bảng 3.C — mỗi vai ẩn module dư, mở module thiếu; gate sidebar = đúng quyền nghiệp vụ (không mượn `*:view-all` rộng). Mỗi thay đổi quyền có audit.

> ⚠️ Doc 15 đích là **RBAC động (DB)**; FixLMS giai đoạn này **siết matrix tĩnh `permissions.ts` + gate sidebar** là đủ (không chờ RBAC động). Khi A0 RBAC động chạy, gate map giữ nguyên ngữ nghĩa.

---

## 4. EPIC E-EVAL — Đánh giá buổi & Khảo sát (item 15,18,19) · **FL4**

### 4.1 Hiện trạng (as-is) — **đòn bẩy lớn: EvalForm engine đã có**

- **`EvalForm`+`EvalQuestion`+`EvaluationRound`+`EvalResponse`+`EvalAnswer`** (`schema.prisma:5034-5109`) — **form builder 4 loại câu hỏi đã chạy**: `STAR_RATING, RADIO, CHECKBOX, TEXTBOX`; scope `TEACHER_EVAL, CENTER_SURVEY`; admin `/admin/evaluations` (forms/rounds/question builder). **→ Tái dùng cho cả phiếu đánh giá buổi học và khảo sát trung tâm.**
- **Đánh giá buổi (hiện tại):** `StudentSessionFeedback` = chỉ `comment + rating(1-5)` cố định (`1509-1523`); admin `sessions/[id]/.../session-feedback-editor.tsx`; portal `/portal/nhan-xet`. **Không linh hoạt** theo phiếu mẫu.
- **Phiếu mẫu** (`Phiếu đánh giá buổi học.html`): 4 nhóm tiêu chí (Kiến thức, Kỹ năng, Sản phẩm, Thái độ) × 9 tiêu chí, **mỗi tiêu chí = select 5 mức mô tả**; + nhận xét tự luận; + 3 ảnh dự án/lớp; + thông tin buổi/dự án.
- **`TrialFeedback`** (`3492-3503`) và **`StudentSkillAssessment`** (`1489-1506`): **có model, CHƯA có UI**.
- **Survey/NPS** (`4099-4152`): hỗ trợ `NPS/RATING/TEXT`, **thiếu CHECKBOX**; admin chỉ 1 câu NPS/survey.

### 4.2 Gap & việc

| # | Nhóm | Hiện trạng | Đích | Việc (BE/FE/DB) | Phức tạp |
|---|---|---|---|---|---|
| EV-1 | 15 | Đánh giá buổi cố định comment+sao | **Phiếu đánh giá buổi linh hoạt**: Đào tạo/Admin cấu hình nhóm tiêu chí + mức mô tả; GV chọn mức hoặc tự nhập; áp cho lớp chính & lớp trải nghiệm | Mở rộng EvalForm scope **`SESSION_EVAL`** (+ option "tự nhập tay"); BE: response gắn `classSessionId`+`studentId`; FE: editor buổi dùng form động; DB: thêm scope enum + liên kết session/student | **Cao** |
| EV-2 | 15 | Lớp trải nghiệm không có phiếu cuối buổi | Cuối buổi trial có phiếu đánh giá dùng **EvalForm SESSION_EVAL** (QĐ-T5); `TrialFeedback` deprecate | FE: UI phiếu động ở trial session; BE: response gắn trial session | **TB** |
| EV-3 | 15,16 | PH chưa xem nhận xét theo phiếu linh hoạt + ảnh buổi | Portal PH xem nhận xét từng buổi (theo form mới) + ảnh lớp con (đã có consent) | FE portal `/portal/nhan-xet` render form động; nối ảnh `ClassSessionMedia` theo consent | **TB** |
| EV-4 | 18 | Survey NPS thiếu CHECKBOX, 1 câu | **Khảo sát trung tâm 4 loại câu hỏi, admin tự cấu hình** | **Hợp nhất về EvalForm scope CENTER_SURVEY** (đã đủ 4 loại — QĐ-T6); deprecate `Survey*` 2-phase; portal `/portal/khao-sat` render form động | **TB** |
| EV-5 | 19 | Đánh giá GV bởi học sinh | **Hoãn** — chờ file front-end của TGĐ; chỉ ghi nhận, không build | Không làm trong FixLMS; tạo placeholder yêu cầu khi có input | **—** |

### 4.3 User story tiêu biểu (E-EVAL)

**US-EVAL-1** · Là **Đào tạo/Admin**, tôi muốn **cấu hình phiếu đánh giá buổi học linh hoạt (nhóm tiêu chí + 5 mức mô tả + cho phép GV tự nhập)** để **mỗi khoá/lớp dùng tiêu chí phù hợp như phiếu mẫu**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 15 · Phase FL4 · Doc 15 §form-builder (QĐ-O3 — 4 loại)
- AC1: Form builder cho phép tạo phiếu SESSION_EVAL với câu hỏi STAR_RATING/RADIO(5 mức mô tả)/CHECKBOX/TEXTBOX + tuỳ chọn "ô tự nhập".
- AC2: GV mở buổi → chọn HS → điền phiếu động; lưu gắn `classSessionId`+`studentId`.
- AC3: Áp cho cả lớp chính thức và lớp trải nghiệm.
- AC4: Admin/Đào tạo sửa được mọi thành phần phiếu; thay đổi không phá response cũ (versioning).

**US-EVAL-2** · Là **Phụ huynh**, tôi muốn **xem nhận xét từng buổi của con theo phiếu mới + ảnh lớp (nếu đồng ý)** để **theo dõi tiến bộ con**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 15,16 · Phase FL4
- AC: `/portal/nhan-xet` render phiếu động; ảnh chỉ hiện khi `StudentConsent` CLASS_MEDIA = GRANTED; không lộ `studentId` trên URL.

**US-EVAL-3** · Là **Admin**, tôi muốn **khảo sát trung tâm hỗ trợ 4 loại câu hỏi và tôi tự cấu hình** để **đo hài lòng PH linh hoạt**.
- Ưu tiên: **Should** · Loại: FR · Truy vết: item 18 · Phase FL4 · QĐ-T6
- AC: Dùng EvalForm CENTER_SURVEY (STAR_RATING/RADIO/CHECKBOX/TEXTBOX); PH trả lời ở portal; admin xem tổng hợp; `Survey*` cũ deprecate 2-phase.

---

## 5. Delta data model (tổng hợp, additive — 2-phase)

| Model | Thay đổi | Phục vụ | Phase |
|---|---|---|---|
| `Question` | +`curriculumId?`/`courseId?`, +`points`, +`timeLimitSec` | L-4 (khung CT, điểm, thời gian) | FL1 |
| `CoursePackage` | +`courseId?`/bảng nối package↔course; deprecate `curriculum` JSON | L-1 (gộp gói/khoá) | FL1 (drop sau) |
| `AssignmentTemplate` (mới) + `Assignment` | tách template (theo curriculum/lesson) khỏi bài giao (theo class/buổi) — QĐ-T2 | L-3 | FL1 |
| Role enum + `permissions.ts` | **+role `TRAINING`** (QĐ-T1); siết LMS edit về SUPER_ADMIN+TRAINING; +`teaching-materials:view-own-class` (TEACHER); **gỡ `students:edit` của ACCOUNTANT** (QĐ-T4) | L-5,L-6,RB-3,RB-4 | FL1/FL3 |
| `Enrollment`/`ClassSession` | flip vào `SCOPED_MODELS` (2-phase, đã có `centerId` backfill) | RB-1 cách ly | FL3 |
| `EvalQuestionScope`/`EvalForm.scope` | +`SESSION_EVAL`; option "free text" | EV-1 phiếu buổi | FL4 |
| `EvalResponse` | +`classSessionId?`, +`studentId?` (cho SESSION_EVAL) | EV-1 | FL4 |
| `TrialFeedback` | deprecate — phiếu trial chuyển sang EvalForm SESSION_EVAL (QĐ-T5) | EV-2 | FL4 (drop sau) |
| `Survey*` | deprecate 2-phase, gộp về EvalForm CENTER_SURVEY (QĐ-T6) | EV-4 | FL4 (drop sau) |

---

## 6. Đề xuất chia phase FixLMS

| Phase | Nội dung | Story | Lý do thứ tự |
|---|---|---|---|
| **FL0** (hotfix) | Vá 6 leak dashboard (3.B) + test CI cross-center | US-RBAC-0 | Bảo mật P0, nhỏ, làm trước mọi thứ |
| **FL1** | E-LMS: gắn SCORM/bài tập vào buổi · bộ câu hỏi theo khung CT · GV xem tài liệu lớp · gộp gói/khoá · siết quyền sửa LMS | US-LMS-1..4 | Ưu tiên TGĐ #1; giá trị giảng dạy |
| **FL2** | E-LEAD: convert vào trang chi tiết + nhiều con + học phí 1/2 đợt · auto-refresh Kanban · validate bàn giao · lớp trial đúng · bỏ HO · chuyển CS/hoàn thành khoá liền mạch | US-LEAD-1..5 | Ưu tiên #2; chốt đơn |
| **FL3** | E-RBAC: siết sidebar/quyền 4 vai · cách ly cơ sở (flip Enrollment/Session) · rà quyền lạ | US-RBAC-1..4 | Ưu tiên #3 (leak nặng đã vá ở FL0) |
| **FL4** | E-EVAL: phiếu đánh giá buổi linh hoạt (SESSION_EVAL) · portal xem · khảo sát 4 loại · (hoãn đánh giá GV) | US-EVAL-1..3 | Ưu tiên #4; tái dùng EvalForm |

> Mỗi phase: ticket + test (Vitest+Playwright) theo T1–T12; quy trình **PO→BA→Architect→Dev (BE+FE+DB cùng nhịp)→Test** (item 19). Mọi story sửa BE **bắt buộc kèm FE+DB** để không lệch tầng.

---

## 7. Quyết định TBD — ✅ ĐÃ CHỐT (TGĐ 24/06/2026)

| # | Câu hỏi | ✅ Quyết định | Ảnh hưởng |
|---|---|---|---|
| **QĐ-T1** | Role Đào tạo? (item 17) | **Tạo 2 role tách biệt: `TRAINING` (Đào tạo) — quản lý toàn bộ LMS; `TEACHER` (Giáo viên) — chỉ trong phạm vi lớp được giao.** TEACHER đã có, TRAINING là role mới. CENTER_MANAGER → chỉ xem LMS | US-LMS-3/4, RB-3, delta model |
| **QĐ-T2** | Tách AssignmentTemplate? (item 13) | **Theo đề xuất: TÁCH** — `AssignmentTemplate` (bank theo khung CT/lesson) ≠ `Assignment` (bài giao cho lớp/buổi) | L-3 |
| **QĐ-T3** | "Ghép vào lớp học thử" lấy nhầm lớp (item 6,8) | **ĐÃ REPRO:** tab Học thử `/admin/trials` → `trials-list.tsx:335` "Ghép vào lớp" đổ từ `Class` (lớp chính thức) + ghi `TrialClass.classId`. **Đích:** picker chỉ liệt kê **lớp trải nghiệm (TrialClassV2 OPEN, cùng cơ sở)** và **gán HS trực tiếp tại tab Học thử** (không bắt vào lead gán LeadChild) | LD-4, US-LEAD-4 |
| **QĐ-T4** | `students:edit` của ACCOUNTANT? | **Theo đề xuất: GỠ** khỏi ACCOUNTANT (kế toán không sửa hồ sơ HV; nếu cần sửa field billing → action riêng giới hạn) | RB-4 |
| **QĐ-T5** | Engine phiếu trial? | **Theo đề xuất: dùng `EvalForm` scope `SESSION_EVAL`** (thống nhất với phiếu buổi chính); `TrialFeedback` deprecate dần | EV-1, EV-2 |
| **QĐ-T6** | Gộp Survey NPS? | **Theo đề xuất: HỢP NHẤT** khảo sát trung tâm về `EvalForm` scope `CENTER_SURVEY`; `Survey/SurveyQuestion/SurveyResponse` deprecate 2-phase | EV-4, delta model |

---

## 8. Guardrails đã soi (Doc 15)

- ✅ Không thêm scope đã loại (không video LMS — SCORM là gói tương tác, QĐ-O5; không AI learning-path).
- ✅ Cách ly cơ sở qua OrgUnit/scopedDb; **bỏ HO khỏi picker qua tree, không hardcode** (LD-5).
- ✅ Privacy: ảnh buổi theo `StudentConsent`; không lộ `studentId` URL portal (EV-2,3).
- ✅ Tái dùng engine sẵn (EvalForm, ScormPackage.lessonId, Question.imageUrl, convertLeadV2) — không over-engineer.
- ✅ Tiền/enrollment transaction (LD-2 installment); side-effect qua DomainEvent; AuditLog cho đổi quyền/consent.

---

*Soạn bởi BA (skill ba-analysis) · snapshot code 23/06/2026 · 6 TBD đã chốt 24/06/2026 → sẵn sàng `prepare-prompt` sinh ticket phase FL0–FL4.*
