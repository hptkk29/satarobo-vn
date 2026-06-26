# ✅ CHECKLIST TEST TAY — LMS Sata Robo (theo luồng)

> 1 file, chia theo **luồng nghiệp vụ riêng** để test từng phần độc lập, cuối cùng có **1 luồng tổng** chạy từ lead → hoàn thành khoá.
> Mỗi dòng: `[ ]` việc làm → **kỳ vọng PASS**. Ký hiệu: ⚠️ điểm dễ sai cần soi · 🔒 phân quyền / cách ly cơ sở · 💡 known-gap (đừng báo nhầm bug).
>
> **Mục lục luồng:**
> - [0. Chuẩn bị](#0-chuẩn-bị)
> - [Luồng A — Lead → Đã chuyển đăng ký (convert)](#luồng-a--lead--đã-chuyển-đăng-ký)
> - [Luồng B — Học thử của học viên (trial)](#luồng-b--học-thử-của-học-viên)
> - [Luồng C — Lớp học → buổi học → điểm danh → học bù](#luồng-c--lớp-học--buổi-học--điểm-danh--học-bù)
> - [Luồng D — LMS dạy–học (khoá → chương trình → tài liệu/SCORM → bài tập/bài thi)](#luồng-d--lms-dạyhọc)
> - [Luồng E — Học phí & thanh toán 2 tầng](#luồng-e--học-phí--thanh-toán-2-tầng)
> - [Luồng F — Portal phụ huynh (xem & tương tác)](#luồng-f--portal-phụ-huynh)
> - [Luồng G — TỔNG: từ lead đến hoàn thành khoá](#luồng-g--tổng-từ-lead-đến-hoàn-thành-khoá)
> - [Phụ lục: phân quyền & known-gaps](#phụ-lục)

---

## 0. Chuẩn bị

### 0.1 Môi trường
- [ ] `pnpm dev` chạy được; vào được `/admin/*` và `/portal/*`.
- [ ] DB nền: ≥1 **Course** + **Curriculum ACTIVE**, ≥1 **Center** (CS1 & CS2 để test cách ly), ≥1 **Teacher**, ≥1 **Gói/giá**.

### 0.2 Tài khoản test theo vai
- [ ] `SUPER_ADMIN` · [ ] `CENTER_MANAGER` (CS1) · [ ] `CENTER_MANAGER` (CS2) · [ ] `SALES_CSM` · [ ] `TEACHER` · [ ] `ACCOUNTANT` · [ ] `PARENT`

### 0.3 Đăng nhập (gate)
- [ ] Staff login → `/dashboard`; PARENT login → `/portal`.
- [ ] 🔒 PARENT vào `/admin/*` → bị đẩy ra; Staff vào `/portal` → về `/dashboard`.
- [ ] Chưa login gõ `/admin/classes` hoặc `/portal/hoc-phi` → redirect `/login`.

### 0.4 Mẫu ghi lỗi
`[Trang] – [Hành động] – [Kỳ vọng] – [Thực tế] – [Role] – [Cơ sở] – [Ảnh]`

---

## Luồng A — Lead → Đã chuyển đăng ký

**Phạm vi:** nhập/tạo lead → tư vấn → ghi nhận tiền → REGISTERED → tạo Order → Payment RECORDED → **Convert** → Student + Enrollment + tài khoản phụ huynh.
**Trang:** `/admin/leads`, `/admin/crm`, `/admin/orders`, `/admin/payments`, nút Chốt (convertLeadV2), `/admin/convert-conflicts`.

### A1. Tạo / nhập lead
- [ ] Tạo Lead mới → **LeadStatus = NEW**.
- [ ] (Nếu có import) Nhập lead hàng loạt → các lead vào NEW, không trùng.
- [ ] Quản lý **phân công Sale** → NEW → **ASSIGNED**.
- [ ] Sale liên hệ/tư vấn → **CONTACTED → CONSULTING** (đổi đúng theo thao tác).

### A2. Ghi nhận tiền để đủ điều kiện chốt
- [ ] Tạo **Order** gắn `leadId` (`/admin/orders/new`): loại COURSE/PACKAGE/EXAM/PRODUCT, item, listPrice, giảm giá → Order **DRAFT → PENDING_PAYMENT**.
- [ ] Sale **ghi nhận khoản thu** (`/admin/payments`) → `Payment.saleStatus = RECORDED`.
- [ ] ✅ Lead chuyển **REGISTERED** (điều kiện convert).
- [ ] ⚠️ Lead chưa REGISTERED (chưa có RECORDED & finalPrice>0) → nút **Chốt** bị **chặn**.

### A3. Convert (convertLeadV2)
- [ ] Bấm **Chốt** khi đã có RECORDED → ✅ Lead **REGISTERED → ENROLLED**, tạo **Student** + **Enrollment (PENDING)**, tạo **User PARENT** (mới = `PENDING_ACTIVATION`); snapshot giá (listPrice/discount/finalPrice) đúng.
- [ ] Convert khi `finalPrice ≤ 0` (học bổng 100%) → ✅ pass không cần payment.
- [ ] ⚠️ Convert khi chưa có payment & finalPrice>0 → ✅ lỗi **PAYMENT_REQUIRED**.
- [ ] Tick **đồng ý ảnh** (consentMedia) lúc convert → ✅ tạo `StudentConsent` CLASS_MEDIA = GRANTED + audit.
- [ ] ⚠️ parentEmail+phone trùng 2 User khác nhau → ✅ tạo **ConvertConflict (OPEN)**, báo **PARENT_CONFLICT**, không tạo bừa.
- [ ] ⚠️ Bấm Convert **2 lần** liên tiếp → ✅ idempotency chặn, không nhân đôi Enrollment.

### A4. Xử lý xung đột
- [ ] `/admin/convert-conflicts`: xem ConvertConflict OPEN → quyết định gộp/tạo mới → đóng conflict.

🔒 A5. Sale/Quản lý **CS1** không thấy lead/đơn của **CS2** (nếu scope theo cơ sở).

---

## Luồng B — Học thử của học viên

**Phạm vi:** lead có nhu cầu học thử → tạo lớp trải nghiệm → xếp con vào → điểm danh học thử → nhận xét → ra quyết định.
**Trang:** `/admin/trial-classes` (+ `/new`, config).

- [ ] Lead → đặt lịch học thử → **TRIAL_SCHEDULED**.
- [ ] (Quản lý/training) Cấu hình **số buổi** trial (TrialConfig) → ✅ áp đúng số buổi.
- [ ] Tạo **Trial class** (RoboSim/Robot) → status **OPEN**; mở ghi danh.
- [ ] Xếp **con (LeadChild)** vào lớp thử (TrialEnrollment) → **ACTIVE**; theo dõi sĩ số đúng.
- [ ] Lớp chạy → **RUNNING**; GV **điểm danh từng buổi** (TrialAttendance) PRESENT/ABSENT.
- [ ] Sau khi dự học → Lead **TRIAL_ATTENDED**.
- [ ] GV/Sale ghi **TrialFeedback** (nhận xét + gợi ý khoá) → Lead **AWAITING_DECISION**.
- [ ] Trial COMPLETED/CANCELLED đúng khi kết thúc/hủy.
- [ ] ➡️ Nếu phụ huynh đồng ý: tiếp **Luồng A** (ghi nhận tiền → REGISTERED → convert). Con từ LeadChild dùng lại khi convert (không tạo trùng Student).

🔒 GV chỉ điểm danh lớp thử mình phụ trách.

---

## Luồng C — Lớp học → buổi học → điểm danh → học bù

**Phạm vi:** vòng đời lớp nhóm + vận hành buổi học.
**Trang:** `/admin/classes`, `/admin/sessions`, `/admin/attendance`, `/admin/hoc-bu`, `/admin/chuyen-lop`, `/admin/enrollments`.

### C1. Tạo & duyệt lớp (state: PLANNED/RECRUITING → PENDING_APPROVAL → ACTIVE)
- [ ] (Sale/Quản lý) **Tạo lớp** `createClass`: khoá có **curriculum ACTIVE**, GV, cơ sở, lịch → ✅ **tự sinh mã lớp**, trạng thái PLANNED/RECRUITING.
- [ ] ⚠️ Khoá **không** có curriculum ACTIVE → tạo lớp bị **chặn** + báo lý do.
- [ ] `submitClassForApproval` → RECRUITING → **PENDING_APPROVAL**.
- [ ] (Quản lý CS) `approveClass` → PENDING_APPROVAL → **ACTIVE** + **tự sinh buổi (ClassSession SCHEDULED)**.
- [ ] (Kịch bản khác) `rejectClass` → PENDING_APPROVAL → RECRUITING.
- [ ] 🔒 Quản lý **CS1** duyệt lớp **CS2** → bị từ chối.

### C2. Ghi danh học viên vào lớp
- [ ] Enrollment từ convert (Luồng A) hiện ở `/admin/enrollments` đúng HS/lớp/giá, status **PENDING**.
- [ ] Ghi danh trực tiếp `enrollStudent` → ✅ check **sĩ số** (đầy → chặn) + **khoá tiên quyết** (xem Luồng D).
- [ ] `changeEnrollmentStatus`: PENDING→CONFIRMED→STUDYING theo state machine; bước sai bị chặn.
- [ ] 🔒 ⚠️ Quản lý **CS1** mở `/admin/enrollments` **không** thấy enrollment lớp CS2 (Enrollment không auto-scopedDb — chỗ từng leak).

### C3. Buổi học & điều chỉnh lịch
- [ ] `/admin/sessions` lọc upcoming/past/all theo lớp → ✅ đủ buổi, đúng ngày/giờ/chủ đề; status SCHEDULED→IN_PROGRESS→COMPLETED/CANCELLED.
- [ ] **Dời buổi**: `previewClassReschedule` (xem trước) → `applyClassReschedule` → ✅ chỉ dời **buổi tương lai**.
- [ ] `generateSessionsAction` sinh buổi thủ công → đủ số theo curriculum.

### C4. Điểm danh (vai TEACHER) — `markAttendance`
- [ ] Điểm danh từng HS: PRESENT/ABSENT/LATE/EXCUSED → ✅ lưu (upsert sessionId+studentId), điểm lại ghi đè đúng.
- [ ] ABSENT + **NEEDS_MAKEUP** → ✅ tạo **MakeupNeed**, hiện ở `/admin/hoc-bu`.
- [ ] HS vắng **2 buổi liên tiếp** → ✅ gắn cờ AT_RISK + thông báo phụ huynh.
- [ ] 🔒 GV điểm danh lớp **không** phải mình dạy → bị chặn.

### C5. Học bù (vai Quản lý — `parent-requests:manage`)
- [ ] `/admin/hoc-bu`: thấy HS NEEDS_MAKEUP + buổi lỡ (ngày + bài).
- [ ] Gợi ý buổi bù **cùng khoá/bài, không vượt tiến độ** → xếp HS → điểm danh buổi bù PRESENT.
- [ ] Mark **MADE_UP** → ✅ tính như có mặt; tiến độ học bù ở portal cập nhật.

### C6. Chuyển lớp / chuyển cơ sở
- [ ] (Sale/Quản lý) `/admin/chuyen-lop` tạo yêu cầu chuyển → Quản lý duyệt.
- [ ] `transferEnrollment` → ✅ lớp đích **cùng khoá**, không vượt tiến độ; enrollment cũ → **TRANSFERRED**, mới được tạo. Hết chỗ → **WAITLISTED**.

### C7. Hủy lớp
- [ ] `cancelClassAction` → ✅ rút enrollment, hủy buổi tương lai, **tạo hoàn tiền** tương ứng.

---

## Luồng D — LMS dạy–học

**Phạm vi:** khoá học → chương trình học (tiên quyết) → tài liệu giảng dạy cho GV (bài giảng + **SCORM**) → bài tập về nhà → bài thi → chấm điểm → kết quả học tập.
**Trang:** `/admin/courses`, `/admin/curriculums`, `/admin/scorm`, `/admin/assignments`, `/admin/exams`, `/admin/questions`; portal `/portal/bai-giang`, `/portal/bai-tap`, `/portal/bai-thi`, `/portal/ket-qua`.

### D1. Khoá học & chương trình (curriculum) + tiên quyết
- [ ] `/admin/courses`: khoá có lesson/buổi định nghĩa.
- [ ] `/admin/curriculums`: mỗi khoá mở lớp có **curriculum ACTIVE** (version, số buổi); activate/deactivate đúng.
- [ ] **Khoá tiên quyết**: ghi danh HS chưa hoàn thành khoá tiên quyết → ✅ `checkPrerequisites` cảnh báo/chặn (fail-open: nếu không xác định được vẫn cho qua — soi đúng hành vi).

### D2. Tài liệu giảng dạy cho giáo viên
- [ ] Bài giảng theo buổi (nội dung, mục tiêu, tài liệu đính kèm) gắn vào lesson → ✅ phụ huynh thấy ở `/portal/bai-giang` (download tài liệu).

### D3. SCORM (bài giảng tương tác) — `/admin/scorm`
> 💡 Mặc định **tắt** (`SCORM_ENABLED`). Trang **404** đến khi bật flag + redeploy — đúng thiết kế khi OFF.
- [ ] Upload gói SCORM (.zip) theo buổi → status **UPLOADED → VALIDATED** (hoặc ERROR nếu gói sai).
- [ ] Xem thử (test) → **phát hành** → đặt **bản đang dùng** (`isActiveForLesson` — mỗi buổi **1 bản**).
- [ ] Upload bản mới → ✅ **không xoá** bản cũ (giữ version), bản active chuyển sang bản mới.
- [ ] Theo dõi **GV** đã giảng (delivery tracking = GV, không phải HS), completion status hiện đúng.

### D4. Bài tập về nhà — `/admin/assignments`
- [ ] Giao bài tập/bài tập về nhà cho lớp/buổi.
- [ ] HS làm ở portal `/portal/bai-tap/[id]` (`submitAssignment`) → ✅ **SUBMITTED**, trễ hạn → **LATE**.
- [ ] Chuyển **Parent ↔ Student view** (`setPortalViewAction`) → đúng view.
- [ ] GV chấm → điểm + nhận xét hiện lại cho phụ huynh.

### D5. Bài thi — `/admin/exams` (+ `/admin/questions`)
- [ ] Tạo Exam **DRAFT**: gắn lớp/khoá/lesson, durationMinutes, totalPoints, passingScore, maxAttempts, shuffle.
- [ ] Thêm câu hỏi (ExamQuestion từ kho) → **Publish** DRAFT → **PUBLISHED**.
- [ ] (Portal) HS **bắt đầu** `startAttempt` → IN_PROGRESS; resume nếu dở; **chặn khi hết maxAttempts**.
- [ ] Trả lời `saveAnswer` (check timer/deadline) → **nộp** `submitAttempt`: auto-chấm câu khách quan, tự luận chờ GV, quá hạn gắn **LATE**.
- [ ] GV chấm tự luận (ExamAnswer isCorrect/score/note) → ExamAttempt **GRADED**, totalScore, passed đúng.

### D6. Kết quả & năng lực
- [ ] GV ghi **đánh giá kỹ năng** robotics (StudentSkillAssessment) + **nhận xét buổi** (StudentSessionFeedback + rating).
- [ ] ✅ Phụ huynh xem tổng hợp ở `/portal/ket-qua` (năng lực + điểm bài thi/tập), `/portal/nhan-xet`.

---

## Luồng E — Học phí & thanh toán 2 tầng

**Phạm vi:** Sale ghi nhận → Sale xác nhận thực thu → Kế toán xác nhận → Receipt; trả góp 2 đợt.
**Trang:** `/admin/payments`, `/admin/orders`, portal `/portal/hoc-phi`.

- [ ] (Sale) Ghi nhận khoản thu → `saleStatus = RECORDED`.
- [ ] (Sale) Xác nhận thực thu → `saleStatus = COLLECT_CONFIRMED`.
- [ ] (Kế toán) **Xác nhận** → `accountantStatus = CONFIRMED` → ✅ **sinh Receipt (ACTIVE)** per enrollment, giảm công nợ.
- [ ] (Kế toán) **Từ chối** (có lý do) → REJECTED; Receipt đã sinh → **VOID**.
- [ ] (Kế toán) **Điều chỉnh** → bản ADJUSTED trỏ `adjustmentOfId`.
- [ ] 🔒 Sale **không** được tự xác nhận accountant (chỉ ACCOUNTANT/SUPER_ADMIN/CENTER_MANAGER).
- [ ] **Trả góp**: `recordInstallmentPlan` đợt 1 PAID + đợt 2 PENDING/dueDate → ghi nhận đợt 2 `markInstallmentPaid` → Order PENDING_PAYMENT → **CONFIRMED** khi PAID ≥ total.
- [ ] (Cron) Nhắc đợt 2 trước hạn (mặc định 14 ngày) — kiểm tra log/nhắc.
- [ ] ➡️ Sau khi tiền CONFIRMED → Enrollment PENDING có thể chuyển **CONFIRMED** (nối với Luồng C2).
- [ ] (Portal) `/portal/hoc-phi`: tổng/đã trả/còn nợ, biên lai, cảnh báo pending/rejected.
- [ ] 💡 Nếu biên lai confirmed không hiện dù kế toán đã CONFIRMED → **known-gap** (`getParentConfirmedPayments` chưa nối), **không** phải regression.

---

## Luồng F — Portal phụ huynh

**Phạm vi:** phụ huynh đăng nhập xem dữ liệu con + tương tác.
**Trang:** `/portal/*`.

### F1. Chọn con & quyền sở hữu
- [ ] Nhiều con → **Site Switcher** (`setActiveSite`) đổi con → dữ liệu đổi theo con.
- [ ] 🔒 Ép `studentId` con nhà khác (sửa cookie/URL) → bị chặn (`assertOwnsStudent`).

### F2. Trang xem (đọc)
- [ ] `/portal` — 3 card (công nợ, yêu cầu mở, thông báo) + học bù cần làm + lớp đang học.
- [ ] `/portal/lich-hoc` & `/portal/lich` — buổi sắp tới/đã học + tiến độ (Tổng/Đã học/Vắng/Chờ bù/Đã bù).
- [ ] `/portal/bai-giang` — nội dung buổi đã dạy + tài liệu download.
- [ ] `/portal/ket-qua` — năng lực robotics + báo cáo tiến độ + điểm.
- [ ] `/portal/nhan-xet` — nhận xét GV + rating.
- [ ] `/portal/hinh-anh` — ảnh con (đã duyệt + có consent).
- [ ] `/portal/hoc-ba` — học bạ PUBLISHED (snapshot) hoặc transcript + PDF.
- [ ] `/portal/satacoin` — số dư + lịch sử (EARN/SPEND/ADJUST/REVERSAL).
- [ ] `/portal/ho-so-con` — thông tin con, lớp, năng lực.
- [ ] `/portal/thong-bao` — thông báo theo cơ sở, 7 ngày.

### F3. Hành động (ghi)
- [ ] `/portal/yeu-cau` tạo yêu cầu ABSENCE/MAKEUP/TRANSFER_CLASS/TRANSFER_CENTER/RESERVE/OTHER → PENDING; hiện ở admin tương ứng.
- [ ] Huỷ yêu cầu (chỉ khi PENDING).
- [ ] `/portal/tin-nhan` gửi tin GV → vào đúng thread enrollment.
- [ ] `/portal/danh-gia` đánh giá trung tâm → hiện admin `/admin/evaluations`.
- [ ] `/portal/danh-gia-gv` đánh giá GV (chỉ khi `EVAL_V2_ENABLED` & đủ điều kiện & chưa làm).
- [ ] `/portal/khao-sat` trả lời NPS/khảo sát/center survey theo round.
- [ ] `/portal/ho-so` đổi tên / đổi mật khẩu → ✅ **không** bị logout.

---

## Luồng G — TỔNG: từ lead đến hoàn thành khoá

> Chạy 1 mạch để nghiệm thu tích hợp (gồm cả LMS dạy-học). Tham chiếu các luồng trên.

1. [ ] **Nền tảng (D1):** tạo Course + **Curriculum ACTIVE** + gói/giá; (D2/D3) chuẩn bị bài giảng + 1 gói **SCORM** + bài tập + 1 **Exam**.
2. [ ] **Lớp (C1):** tạo Lớp → submit → **duyệt** → tự sinh buổi.
3. [ ] **Lead (A1) / Học thử (B):** nhập/tạo Lead → (tuỳ chọn) lớp thử + điểm danh thử + feedback.
4. [ ] **Tiền (A2/E):** tạo Order gắn lead → Payment **RECORDED** → Lead **REGISTERED**.
5. [ ] **Convert (A3):** Chốt → sinh **Student + Enrollment (PENDING)** + tài khoản phụ huynh + consent ảnh.
6. [ ] **Xác nhận tiền (E):** Kế toán **CONFIRMED** → **Receipt** → Enrollment **CONFIRMED → STUDYING** (C2).
7. [ ] **Dạy-học (C4 + D):** GV điểm danh nhiều buổi (1 buổi ABSENT → **NEEDS_MAKEUP**) → xếp **học bù** → **MADE_UP** (C5).
8. [ ] **LMS (D4/D5):** giao **bài tập** → HS nộp ở portal; mở **bài thi** → HS làm → GV **chấm GRADED**; GV ghi **đánh giá kỹ năng + nhận xét**.
9. [ ] **Media (C/D):** GV upload **ảnh** → Quản lý **duyệt** → phụ huynh thấy ở `/portal/hinh-anh`.
10. [ ] **Portal (F):** phụ huynh xem lịch/điểm danh/điểm/nhận xét/ảnh/học phí; gửi 1 **yêu cầu** + 1 **tin nhắn**.
11. [ ] **Hoàn thành:** HS đủ buổi + điểm ≥ passingScore → tạo **CourseCompletion** + **chứng chỉ** (CERT-YYMMDD-XXXX) → Enrollment **COMPLETED**, Student **GRADUATED** (nếu hết khoá).
12. [ ] **Học bạ:** `/admin/hoc-ba` xuất **PDF transcript**; phụ huynh xem `/portal/hoc-ba`.
13. [ ] 🔒 **Cách ly cơ sở:** lặp tạo 1 HS ở **CS2**, đăng nhập vai **CS1** → xác nhận **không** thấy dữ liệu CS2 ở classes/students/enrollments/sessions/payments.

---

## Phụ lục

### P1. Ma trận phân quyền (test nhanh 🔒)
| Hành động | SUPER_ADMIN | CENTER_MANAGER | SALES_CSM | TEACHER | ACCOUNTANT |
|---|:--:|:--:|:--:|:--:|:--:|
| Tạo/sửa/xoá lớp | ✅ | ✅ | create | ❌ | ❌ |
| Duyệt lớp | ✅ | ✅ (cơ sở mình) | ❌ | ❌ | ❌ |
| Tạo enrollment / convert | ✅ | ✅ | ✅ | ❌ | ❌ |
| Chuyển lớp (duyệt) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Điểm danh | ✅ | ✅ | ❌ | ✅ (lớp mình) | ❌ |
| Ghi nhận tiền | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Xác nhận** tiền | ✅ | ✅ | ❌ | ❌ | ✅ |
| Duyệt ảnh | ✅ | ✅ | ❌ | ❌ | ❌ |
| SCORM/curriculum/trial config | ✅ | ✅ | ❌ | ❌ | ❌ |

### P2. Bảng trạng thái nhanh (đối chiếu khi test)
- **Lead:** NEW→ASSIGNED→CONTACTED→CONSULTING→TRIAL_SCHEDULED→TRIAL_ATTENDED→AWAITING_DECISION→**REGISTERED**→**ENROLLED** (·NURTURING·LOST·DUPLICATE·NO_ANSWER).
- **Order:** DRAFT→PENDING_PAYMENT→CONFIRMED→COMPLETED (·CANCELLED·REFUNDED).
- **Payment Sale:** RECORDED→COLLECT_CONFIRMED · **Acct:** PENDING→CONFIRMED (·REJECTED·REFUNDED·ADJUSTED) · **Receipt:** ACTIVE/VOID.
- **Enrollment:** PENDING→CONFIRMED→STUDYING→COMPLETED (·PAUSED·WITHDREW·TRANSFERRED).
- **Class:** PLANNED/RECRUITING→PENDING_APPROVAL→ACTIVE→COMPLETED (·CANCELLED).
- **Session:** SCHEDULED→IN_PROGRESS→COMPLETED (·CANCELLED).
- **Attendance:** PRESENT/ABSENT/LATE/EXCUSED · **Makeup:** NONE/NEEDS_MAKEUP/MADE_UP.
- **Exam attempt:** IN_PROGRESS→SUBMITTED→GRADED.
- **Student:** ACTIVE/PAUSED/GRADUATED/INACTIVE.

### P3. Known-gaps (đừng báo nhầm thành bug 💡)
- `/portal/hoc-phi`: biên lai confirmed chưa nối hết (`getParentConfirmedPayments`) — gap có sẵn.
- `/admin/scorm` **404** khi `SCORM_ENABLED` OFF — bật flag + redeploy mới hiện.
- **Enrollment/Session/Payment không tự scopedDb** — cách ly cơ sở dựa `class.centerId`; soi kỹ khi test 🔒 (chỗ từng leak).
- Ảnh chung lớp dùng cờ **isClassWide**, không phải "ảnh không gắn thẻ".
