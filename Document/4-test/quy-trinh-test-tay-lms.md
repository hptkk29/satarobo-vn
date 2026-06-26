# Quy trình TEST TAY — LMS Sata Robo (bản hiện trạng)

> Mục đích: cầm tay test toàn bộ luồng vận hành đào tạo (LMS) đang chạy thật trên repo.
> Bám theo **luồng nghiệp vụ end-to-end**: Lead → (Học thử) → Chốt/Convert → Order/Payment → Enrollment → Lớp/Buổi → Điểm danh/Học bù → Bài thi/Điểm → Chứng chỉ/Học bạ → Portal phụ huynh xem.
> Mỗi mục: **Vào đâu → Làm gì → Kỳ vọng (PASS) → Điểm cần soi**.
>
> Ký hiệu: ✅ kết quả đúng · ⚠️ điểm dễ sai cần soi kỹ · 🔒 kiểm tra phân quyền/cách ly cơ sở.

---

## 0. Chuẩn bị trước khi test

### 0.1 Môi trường
- [ ] Chạy app: `pnpm dev` (hoặc test trên bản deploy admin/portal).
- [ ] 3 host (nếu test host-based): `admin.satarobo.vn`, `hocvien.satarobo.vn`, `satarobo.vn`. Local thường gộp 1 origin — đăng nhập rồi điều hướng `/admin/*` và `/portal/*`.
- [ ] DB có dữ liệu nền: ít nhất 1 **Course** có **Curriculum ACTIVE**, 1 **Center** (CS1/CS2), 1 **Teacher**.

### 0.2 Tài khoản test theo vai (cần có sẵn hoặc tạo)
Chuẩn bị mỗi vai 1 account để test phân quyền:

| Vai | Role | Dùng để test |
|---|---|---|
| Super Admin | `SUPER_ADMIN` | Toàn quyền, duyệt, cấu hình |
| Quản lý cơ sở | `CENTER_MANAGER` | Duyệt lớp, xác nhận tiền, scope cơ sở |
| Sale/CSKH | `SALES_CSM` | Lead, convert, ghi nhận tiền, tạo lớp |
| Giáo viên | `TEACHER` | Điểm danh, nhận xét, chấm bài, ảnh |
| Kế toán | `ACCOUNTANT` | Xác nhận/từ chối thanh toán |
| Phụ huynh | `PARENT` | Portal: xem điểm danh, điểm, học phí, gửi yêu cầu |

🔒 **Bài test cách ly cơ sở (làm xuyên suốt):** tạo dữ liệu ở **CS1** và **CS2**. Quản lý CS1 **không được** thấy lớp/HS của CS2 ở `/admin/classes`, `/admin/students`, `/admin/enrollments`. (Class/Student được scopedDb tự lọc; còn Enrollment/Session lọc qua `class.centerId` — soi kỹ chỗ này.)

### 0.3 Quy ước báo lỗi
Ghi lại theo mẫu: **[Trang] – [Hành động] – [Kỳ vọng] – [Thực tế] – [Role] – [Ảnh chụp]**.

---

## 1. ĐĂNG NHẬP & ĐIỀU HƯỚNG (gate auth)

**Vào:** `/login`

| # | Bước | Kỳ vọng (PASS) |
|---|---|---|
| 1.1 | Login bằng account **staff** (vd Sale) | ✅ Điều hướng về `/dashboard` (admin) |
| 1.2 | Login bằng account **PARENT** | ✅ Điều hướng về `/portal` |
| 1.3 | Chưa đăng nhập, gõ thẳng `/admin/classes` | ✅ Redirect `/login` |
| 1.4 | Chưa đăng nhập, gõ thẳng `/portal/hoc-phi` | ✅ Redirect `/login` |
| 1.5 | 🔒 Account PARENT gõ thẳng `/admin/...` | ✅ Bị đẩy về portal/login (staff-only) |
| 1.6 | 🔒 Account staff vào `/portal` | ✅ Bị đẩy về `/dashboard` (hasStaffRole) |
| 1.7 | Sai mật khẩu | ✅ Báo lỗi, không lộ "email tồn tại/không" |

⚠️ Soi: sau khi đổi mật khẩu ở portal (mục 11) thì **không bị logout** (không bump tokenVersion) — đúng thiết kế.

---

## 2. NỀN TẢNG ĐÀO TẠO — Khoá / Giáo trình / Gói (Super Admin / Quản lý)

### 2.1 Giáo trình — `/admin/curriculums`
- [ ] Xem danh sách giáo trình theo khoá, version, trạng thái.
- [ ] ✅ Mỗi khoá định dùng để mở lớp phải có **1 curriculum ACTIVE**.
- ⚠️ Nếu khoá **chưa** có curriculum ACTIVE → bước tạo lớp (3.1) phải **chặn** và báo lý do.

### 2.2 Gói khoá học — `/admin/course-packages`
- [ ] Tạo/sửa gói (Sata 1–8, Combo): mã, tên, cấp độ, **giá**, số buổi, published/featured.
- [ ] ✅ Giá ở đây là nguồn `listPrice` khi tạo Order/convert.

### 2.3 (Tuỳ chọn) Khoá học — `/admin/courses`, Câu hỏi — `/admin/questions`
- [ ] Kiểm tra khoá có buổi/lesson, kho câu hỏi đủ để tạo đề thi (mục 8).

---

## 3. LỚP HỌC — tạo → duyệt → khai giảng (`/admin/classes`)

> State máy: `PLANNED/RECRUITING → PENDING_APPROVAL → ACTIVE → COMPLETED` (hoặc `CANCELLED`).

| # | Vai | Bước | Kỳ vọng (PASS) |
|---|---|---|---|
| 3.1 | Sale/Quản lý | **Tạo lớp** (`createClass`): chọn khoá có curriculum ACTIVE, GV, cơ sở, lịch | ✅ Lớp tạo, **tự sinh mã lớp**; trạng thái PLANNED/RECRUITING |
| 3.2 | Sale/Quản lý | `submitClassForApproval` | ✅ RECRUITING → **PENDING_APPROVAL** |
| 3.3 | Quản lý CS | `approveClass` (chỉ lớp **cơ sở mình**) | ✅ PENDING_APPROVAL → **ACTIVE** + **tự sinh các buổi** (ClassSession SCHEDULED) |
| 3.4 | Quản lý CS | `rejectClass` (kịch bản khác) | ✅ PENDING_APPROVAL → RECRUITING |
| 3.5 | Quản lý | **Dời buổi**: `previewClassReschedule` rồi `applyClassReschedule` | ✅ Preview hiển thị buổi bị ảnh hưởng; apply chỉ dời **buổi tương lai** |
| 3.6 | Quản lý | `generateSessionsAction` (sinh buổi thủ công) | ✅ Sinh đủ số buổi theo curriculum |
| 3.7 | Quản lý | **Hủy lớp** `cancelClassAction` | ✅ Rút enrollment, hủy buổi tương lai, **tạo hoàn tiền** tương ứng |

🔒 3.8 — Quản lý CS1 thử `approveClass` lớp của CS2 → ✅ bị từ chối.
⚠️ 3.9 — Sau khi ACTIVE, vào `/admin/sessions` lọc theo lớp: phải thấy đủ buổi vừa sinh, đúng ngày/giờ/chủ đề.

---

## 4. LEAD & HỌC THỬ (nếu test từ đầu phễu) — CRM

> Có thể bỏ qua nếu chỉ test LMS lõi; nhưng convert cần Lead ở trạng thái đúng.

| # | Vai | Bước | Kỳ vọng |
|---|---|---|---|
| 4.1 | Sale | Tạo Lead (`/admin/leads` hoặc `/admin/crm`) | ✅ LeadStatus = NEW |
| 4.2 | Quản lý | Phân công Sale | ✅ NEW → ASSIGNED |
| 4.3 | Sale | Liên hệ/tư vấn | ✅ CONTACTED → CONSULTING |
| 4.4 | Sale | (Học thử) Tạo **Trial class** `/admin/trial-classes`, xếp con (LeadChild) vào, **điểm danh từng buổi**, ghi **TrialFeedback** gợi ý khoá | ✅ TRIAL_SCHEDULED → TRIAL_ATTENDED → AWAITING_DECISION |
| 4.5 | Sale | **Ghi nhận tiền** (Payment.saleStatus=RECORDED) cho lead | ✅ Lead → **REGISTERED** (điều kiện convert) |

⚠️ 4.6 — Lead chưa REGISTERED (chưa có RECORDED payment và finalPrice>0) → nút **Chốt/Convert** phải **chặn**.

---

## 5. CHỐT ĐƠN / CONVERT — Lead → Order → Enrollment

> Gap #1 (commit gần đây): UI tạo Order gắn `leadId` **trước** convert. Luồng: tạo Order → ghi nhận Payment → convert.

### 5.1 Tạo Order — `/admin/orders/new`
- [ ] Tạo đơn gắn Lead: chọn loại `COURSE`/`PACKAGE`/`EXAM`/`PRODUCT`, item, giá (`listPrice`), giảm giá nếu có.
- [ ] ✅ Order tạo ở `DRAFT` → `PENDING_PAYMENT`.

### 5.2 Ghi nhận thanh toán — `/admin/payments`
- [ ] Sale **ghi nhận khoản thu** cho Order → `Payment.saleStatus = RECORDED`.
- [ ] (Trả góp) `recordInstallmentPlan`: đợt 1 PAID ngay, đợt 2 PENDING + dueDate (tối đa 2 đợt).

### 5.3 Convert — nút "Chốt" trên Lead (`convertLeadV2`)
| # | Bước | Kỳ vọng (PASS) | Soi |
|---|---|---|---|
| 5.3a | Convert khi đã có RECORDED payment | ✅ Lead REGISTERED → **ENROLLED**; tạo **User PARENT** (nếu mới, `PENDING_ACTIVATION`), tạo **Student**, tạo **Enrollment** (status **PENDING**) | snapshot giá: listPrice, discount, finalPrice |
| 5.3b | Convert khi `finalPrice ≤ 0` (học bổng 100%) | ✅ Pass (không cần payment) | |
| 5.3c | Convert khi **chưa** có payment & finalPrice>0 | ✅ Lỗi `PAYMENT_REQUIRED` | ⚠️ |
| 5.3d | Tick **đồng ý ảnh** (consentMedia) khi convert | ✅ Tạo `StudentConsent` CLASS_MEDIA = GRANTED + audit | liên quan mục 9 |
| 5.3e | parentEmail+phone trùng 2 User khác nhau | ✅ Tạo **ConvertConflict** (OPEN), báo `PARENT_CONFLICT`, **không** tạo bừa | |
| 5.3f | Bấm Convert 2 lần liên tiếp (double submit) | ✅ Idempotency chặn → không nhân đôi Enrollment | ⚠️ |

### 5.4 Xử lý xung đột — `/admin/convert-conflicts`
- [ ] Admin xem ConvertConflict OPEN, quyết định gộp/tạo mới.

---

## 6. GHI DANH — `/admin/enrollments`

> State: `PENDING → CONFIRMED → STUDYING → COMPLETED` (nhánh: PAUSED, WITHDREW, TRANSFERRED).

| # | Vai | Bước | Kỳ vọng |
|---|---|---|---|
| 6.1 | Sale/Quản lý | Xem enrollment vừa tạo từ convert | ✅ status PENDING, đúng HS/lớp/giá |
| 6.2 | Sale/Quản lý | **Ghi danh trực tiếp** `enrollStudent` (không qua lead) | ✅ Check **sĩ số lớp** (đầy → chặn), check **khoá tiên quyết** |
| 6.3 | Quản lý | `changeEnrollmentStatus` PENDING→CONFIRMED | ✅ Chỉ cho bước hợp lệ theo state machine; bước sai bị chặn |
| 6.4 | Quản lý | CONFIRMED→STUDYING (khi khai giảng) | ✅ HS hiện trong danh sách điểm danh |
| 6.5 | Quản lý | **Chuyển lớp** `transferEnrollment` | ✅ Tạo enrollment mới (lớp đích **cùng khoá**, không vượt tiến độ), enrollment cũ → TRANSFERRED |
| 6.6 | Quản lý | **Xóa** enrollment `deleteEnrollmentAction` | ✅ Nếu đã phát sinh **dữ liệu tài chính** → chặn/cảnh báo, không xoá cứng |

🔒 6.7 — Quản lý CS1 mở `/admin/enrollments`: **không** thấy enrollment thuộc lớp CS2. (⚠️ Enrollment không nằm trong scopedDb tự động — đây là điểm từng leak, soi kỹ.)

---

## 7. BUỔI HỌC · ĐIỂM DANH · HỌC BÙ

### 7.1 Buổi học — `/admin/sessions`
- [ ] Lọc `upcoming / past / all`, theo lớp.
- [ ] ✅ Thấy ngày/giờ, chủ đề, số HS điểm danh. SessionStatus: SCHEDULED → IN_PROGRESS → COMPLETED / CANCELLED.
- 🔒 GV chỉ thấy buổi **lớp mình dạy**; Quản lý theo cơ sở; Super Admin tất cả.

### 7.2 Điểm danh — `/admin/attendance` (vai TEACHER) — `markAttendance`
| # | Bước | Kỳ vọng (PASS) | Soi |
|---|---|---|---|
| 7.2a | Chọn buổi, điểm danh từng HS: PRESENT/ABSENT/LATE/EXCUSED | ✅ Lưu (upsert theo sessionId+studentId), điểm danh lại ghi đè đúng | |
| 7.2b | Đánh dấu ABSENT + **NEEDS_MAKEUP** | ✅ Tạo **MakeupNeed**, hiện ở `/admin/hoc-bu` | ⚠️ |
| 7.2c | HS vắng **2 buổi liên tiếp** | ✅ Gắn cờ rủi ro (AT_RISK) + **thông báo phụ huynh** | mục 12 |
| 7.2d | (Nếu có) Ghi **nhận xét buổi** + rating ⭐ (StudentSessionFeedback) | ✅ Phụ huynh xem ở `/portal/nhan-xet` | |
| 7.2e | (Nếu có) **Đánh giá kỹ năng** robotics (StudentSkillAssessment) | ✅ Hiện ở `/portal/ket-qua` & `/portal/ho-so-con` | |

🔒 7.2f — GV thử điểm danh lớp **không** phải mình dạy → bị chặn.

### 7.3 Học bù — `/admin/hoc-bu` (vai Quản lý — `parent-requests:manage`)
- [ ] Thấy HS NEEDS_MAKEUP, buổi lỡ (ngày + bài).
- [ ] Gợi ý buổi bù **cùng khoá/bài, không vượt tiến độ**; xếp HS vào → điểm danh buổi bù PRESENT.
- [ ] ✅ Mark **MADE_UP** → tính như có mặt; tiến độ học bù ở portal cập nhật.

---

## 8. BÀI THI / BÀI TẬP · ĐIỂM

### 8.1 Đề thi (admin) — `/admin/exams`
- [ ] Tạo Exam (DRAFT): gắn lớp/khoá/lesson, durationMinutes, totalPoints, passingScore, maxAttempts, shuffle.
- [ ] Thêm câu hỏi (ExamQuestion từ kho `/admin/questions`).
- [ ] **Publish**: DRAFT → **PUBLISHED** (HS mới làm được). Khác: CLOSED/ARCHIVED.

### 8.2 Bài tập (admin) — `/admin/assignments`
- [ ] Giao bài tập/bài tập về nhà cho lớp.

### 8.3 HS/PH làm bài (portal) — `/portal/bai-thi`, `/portal/bai-tap`
| # | Bước | Kỳ vọng |
|---|---|---|
| 8.3a | `/portal/bai-thi` → **Bắt đầu** (`startAttempt`) | ✅ Tạo ExamAttempt IN_PROGRESS; resume nếu đang dở; **chặn khi hết maxAttempts** |
| 8.3b | Trả lời từng câu (`saveAnswer`) | ✅ Lưu đáp án; check deadline/timer |
| 8.3c | **Nộp** (`submitAttempt`) | ✅ Auto-chấm câu khách quan; câu tự luận chờ GV; gắn cờ **LATE** nếu quá hạn |
| 8.3d | `/portal/bai-tap/[id]` nộp bài (`submitAssignment`) | ✅ SUBMITTED hoặc **LATE** nếu trễ |
| 8.3e | Chuyển **Parent ↔ Student view** (`setPortalViewAction`) | ✅ Đúng view tương ứng |

### 8.4 GV chấm điểm (admin)
- [ ] Chấm câu tự luận (ExamAnswer: isCorrect/score/graderNote).
- [ ] ✅ ExamAttempt → **GRADED**, totalScore, passed=true/false.
- [ ] Phụ huynh xem điểm + feedback ở `/portal/ket-qua` và `/portal/bai-thi`.

---

## 9. ẢNH / MEDIA LỚP — `/admin/media` ↔ `/portal/hinh-anh`

| # | Vai | Bước | Kỳ vọng (PASS) | Soi |
|---|---|---|---|---|
| 9.1 | GV/Sale | Upload ảnh theo buổi, **gắn thẻ HS**, caption | ✅ Trạng thái **PENDING** | |
| 9.2 | GV/Sale | Ảnh chung lớp (whole-class) | ✅ Đánh dấu **isClassWide** (KHÔNG phải "không tag") | ⚠️ |
| 9.3 | Quản lý | **Duyệt** ảnh `media:approve` | ✅ PENDING → **APPROVED** | |
| 9.4 | Phụ huynh | `/portal/hinh-anh` | ✅ Chỉ thấy ảnh **APPROVED**, **gắn thẻ con** hoặc **class-wide**, và **chỉ khi con có consent** | 🔒 |
| 9.5 | Phụ huynh | Con **không** có consent media | ✅ Không thấy ảnh nào của con | 🔒 |

⚠️ 9.6 — URL ảnh dùng **signed URL** (khi bật flag), không lộ key R2; không lộ `studentId` trên URL.

---

## 10. HỌC PHÍ / THANH TOÁN (2 tầng) — admin ↔ portal

### 10.1 Admin xác nhận tiền — `/admin/payments`
| # | Vai | Bước | Kỳ vọng (PASS) |
|---|---|---|---|
| 10.1a | Sale | Ghi nhận khoản thu | ✅ saleStatus = RECORDED |
| 10.1b | Sale | Xác nhận thực thu | ✅ saleStatus = COLLECT_CONFIRMED |
| 10.1c | Kế toán | **Xác nhận** | ✅ accountantStatus = **CONFIRMED** → **sinh Receipt (ACTIVE)** per enrollment, giảm công nợ |
| 10.1d | Kế toán | **Từ chối** (có lý do) | ✅ REJECTED; nếu Receipt đã sinh → Receipt → **VOID** |
| 10.1e | Kế toán | **Điều chỉnh** | ✅ Bản ADJUSTED trỏ `adjustmentOfId` |
| 10.1f | Sale | Ghi nhận **đợt 2** (`markInstallmentPaid`) | ✅ Order: PENDING_PAYMENT → **CONFIRMED** khi PAID ≥ total |

🔒 10.1g — Sale **không** được tự xác nhận accountant (chỉ ACCOUNTANT/SUPER_ADMIN/CENTER_MANAGER).
⚠️ 10.1h — Enrollment liên quan: sau khi tiền CONFIRMED → enrollment PENDING có thể chuyển CONFIRMED (mục 6.3). Kiểm tra mối nối này.

### 10.2 Portal phụ huynh — `/portal/hoc-phi`
- [ ] ✅ Hiển thị **tổng học phí / đã trả / còn nợ**, danh sách enrollment + giá, **biên lai** (Receipt) đã xác nhận.
- [ ] ✅ Cảnh báo khoản **pending/rejected**.
- ⚠️ 10.2a — **Lưu ý known-gap:** trang chỉ liệt kê **Orders**; phần "khoản đã xác nhận" (`getParentConfirmedPayments`) **chưa nối** → nếu không thấy biên lai dù kế toán đã CONFIRMED, đó là **gap đã biết**, không phải bug mới. Ghi nhận, không kết luận sai.

---

## 11. PORTAL PHỤ HUYNH — xem & tương tác (vai PARENT)

> Đăng nhập `/login` → `/portal`. Nếu nhiều con: dùng **Site Switcher** chọn con (`setActiveSite`, verify ownership).

### 11.1 Chọn con & quyền sở hữu
- [ ] Chuyển giữa các con → dữ liệu (điểm danh/điểm/ảnh) đổi theo con.
- 🔒 11.1a — Thử ép `studentId` của **con nhà khác** (sửa cookie/URL) → ✅ bị chặn (`assertOwnsStudent`).

### 11.2 Các trang xem (đọc)
| Trang | Kỳ vọng |
|---|---|
| `/portal` | ✅ 3 card: công nợ, yêu cầu mở, thông báo; học bù cần làm; lớp đang học |
| `/portal/lich-hoc` & `/portal/lich` | ✅ Buổi sắp tới/đã học; tiến độ (Tổng/Đã học/Vắng/Chờ bù/Đã bù) |
| `/portal/bai-giang` | ✅ Nội dung buổi đã dạy + tài liệu (download) |
| `/portal/ket-qua` | ✅ Năng lực robotics, báo cáo tiến độ, điểm bài thi/tập |
| `/portal/nhan-xet` | ✅ Nhận xét GV theo buổi + rating |
| `/portal/hinh-anh` | ✅ Ảnh con (đã duyệt + consent) |
| `/portal/hoc-ba` | ✅ Học bạ PUBLISHED (snapshot) hoặc transcript + PDF |
| `/portal/satacoin` | ✅ Số dư + lịch sử (EARN/SPEND/ADJUST/REVERSAL) |
| `/portal/ho-so-con` | ✅ Thông tin con, lớp, năng lực |
| `/portal/thong-bao` | ✅ Thông báo theo cơ sở, 7 ngày |

### 11.3 Các hành động (ghi)
| # | Trang | Hành động | Kỳ vọng |
|---|---|---|---|
| 11.3a | `/portal/yeu-cau` | Tạo yêu cầu: ABSENCE/MAKEUP/TRANSFER_CLASS/TRANSFER_CENTER/RESERVE/OTHER (`createParentRequest`) | ✅ status PENDING; hiện ở admin `/admin/chuyen-lop` hoặc `/admin/hoc-bu` tuỳ loại |
| 11.3b | `/portal/yeu-cau` | Huỷ yêu cầu (`cancelParentRequest`) | ✅ Chỉ huỷ được khi còn PENDING |
| 11.3c | `/portal/tin-nhan` | Gửi tin cho GV (`sendParentMessage`) | ✅ Vào đúng thread enrollment, verify ownership |
| 11.3d | `/portal/danh-gia` | Đánh giá trung tâm (rating+nội dung) | ✅ Lưu, hiện admin `/admin/evaluations` |
| 11.3e | `/portal/danh-gia-gv` | Đánh giá GV (nếu `EVAL_V2_ENABLED`) | ✅ Chỉ hiện khi đủ điều kiện & chưa làm; flag OFF → khoá |
| 11.3f | `/portal/khao-sat` | Trả lời NPS/khảo sát/center survey | ✅ Lưu đúng round |
| 11.3g | `/portal/ho-so` | Đổi tên hiển thị | ✅ Cập nhật, **không** logout |
| 11.3h | `/portal/ho-so` | Đổi mật khẩu | ✅ Verify mật khẩu cũ, đổi xong **không** logout |

---

## 12. THÔNG BÁO & CRON (phụ trợ)

- [ ] 12.1 — HS vắng → phụ huynh nhận thông báo (xem `/portal/thong-bao`); kiểm tra **chống spam** (`lastNotifiedAt`).
- [ ] 12.2 — Trả góp đợt 2: cron nhắc trước hạn (mặc định 14 ngày) — kiểm tra có nhắc/log.

---

## 13. HỌC BẠ / CHỨNG CHỈ — `/admin/hoc-ba`

- [ ] 13.1 — Chọn HS → xem TranscriptView (lịch sử enrollment + điểm + trạng thái).
- [ ] 13.2 — **Xuất PDF** qua `/api/admin/reports/transcript?studentId=...` → ✅ ra file đúng HS.
- [ ] 13.3 — HS đủ điều kiện (đủ buổi + điểm ≥ passingScore) → tạo **CourseCompletion** → sinh `certificateCode` (CERT-YYMMDD-XXXX).
- [ ] 13.4 — Phụ huynh xem/tải chứng chỉ ở `/portal/hoc-ba`.

---

## 14. SCORM / HỌC LIỆU (nếu bật) — `/admin/scorm`

> ⚠️ Mặc định **tắt** (`SCORM_ENABLED` flag). Trang **404** đến khi bật flag trên môi trường + redeploy. Nếu thấy 404 → đúng thiết kế khi flag OFF, không phải bug.

- [ ] 14.1 — Upload gói SCORM (.zip) theo buổi → status UPLOADED → VALIDATED (hoặc ERROR).
- [ ] 14.2 — Xem thử (test), **phát hành**, đặt **bản đang dùng** (`isActiveForLesson` — mỗi buổi 1 bản).
- [ ] 14.3 — Bản mới **không xoá** bản cũ (giữ lịch sử). Theo dõi **GV** đã giảng (delivery = GV, không phải HS).

---

## 15. MA TRẬN PHÂN QUYỀN (test nhanh, 🔒)

Đăng nhập từng vai, kiểm tra **thấy đúng / không vượt quyền**:

| Hành động | SUPER_ADMIN | CENTER_MANAGER | SALES_CSM | TEACHER | ACCOUNTANT |
|---|:--:|:--:|:--:|:--:|:--:|
| Tạo/sửa/xoá lớp | ✅ | ✅ | ➖(create) | ❌ | ❌ |
| Duyệt lớp | ✅ | ✅ (cơ sở mình) | ❌ | ❌ | ❌ |
| Tạo enrollment/convert | ✅ | ✅ | ✅ | ❌ | ❌ |
| Chuyển lớp (duyệt) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Điểm danh | ✅ | ✅ | ❌ | ✅ (lớp mình) | ❌ |
| Ghi nhận tiền | ✅ | ✅ | ✅ | ❌ | ✅ |
| **Xác nhận** tiền (kế toán) | ✅ | ✅ | ❌ | ❌ | ✅ |
| Duyệt ảnh | ✅ | ✅ | ❌ | ❌ | ❌ |
| SCORM/curriculum/trial config | ✅ | ✅ | ❌ | ❌ | ❌ |

🔒 **Cách ly cơ sở (xuyên suốt):** mọi danh sách (classes/students/enrollments/sessions/payments) — Quản lý/GV/Sale của **CS1 không thấy dữ liệu CS2**. Super Admin / HO (centerId=null) thấy tất cả.

---

## 16. KỊCH BẢN END-TO-END "1 HỌC VIÊN" (chạy 1 mạch để nghiệm thu)

1. [ ] Tạo Course + Curriculum ACTIVE + Gói giá → tạo **Lớp** → submit → **duyệt** (sinh buổi).
2. [ ] Tạo **Lead** → (học thử nếu muốn) → **ghi nhận tiền** → Lead **REGISTERED**.
3. [ ] Tạo **Order** gắn lead → ghi nhận **Payment RECORDED** → **Convert** → sinh **Student + Enrollment (PENDING)** + (consent ảnh).
4. [ ] Kế toán **CONFIRMED** payment → **Receipt** → đổi Enrollment **CONFIRMED → STUDYING**.
5. [ ] GV **điểm danh** vài buổi (1 buổi ABSENT → NEEDS_MAKEUP) → xếp **học bù** → MADE_UP.
6. [ ] GV ghi **nhận xét** + **đánh giá kỹ năng**; tạo **Exam** → HS **làm bài** ở portal → GV **chấm** → GRADED.
7. [ ] GV upload **ảnh** → Quản lý **duyệt** → phụ huynh thấy ở `/portal/hinh-anh`.
8. [ ] Phụ huynh login portal: xem **lịch học, điểm danh, điểm, nhận xét, ảnh, học phí**; gửi 1 **yêu cầu**; gửi 1 **tin nhắn**.
9. [ ] HS đủ điều kiện → **CourseCompletion + chứng chỉ** → phụ huynh xem `/portal/hoc-ba`.
10. [ ] 🔒 Lặp lại tạo 1 HS ở **CS2**, đăng nhập vai CS1 → xác nhận **không** thấy dữ liệu CS2.

---

### Các điểm "đã biết" / dễ hiểu nhầm (đừng báo nhầm thành bug)
- **`/portal/hoc-phi`**: phần biên lai confirmed chưa nối hết (`getParentConfirmedPayments`) — gap có sẵn, không phải regression.
- **`/admin/scorm` 404**: do `SCORM_ENABLED` chưa bật trên môi trường — bật flag + redeploy mới hiện.
- **Enrollment/Session/Payment không tự scopedDb**: cách ly cơ sở dựa vào `class.centerId` — đây là chỗ từng leak, **soi kỹ** khi test 🔒.
- **Ảnh chung lớp**: dùng cờ **isClassWide**, không phải "ảnh không gắn thẻ".

> Khi gặp khác kỳ vọng: chụp màn hình + ghi theo mẫu mục 0.3, kèm **role** và **cơ sở** đang test.
