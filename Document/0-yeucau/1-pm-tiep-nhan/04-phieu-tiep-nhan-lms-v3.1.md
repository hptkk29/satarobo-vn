# Phiếu tiếp nhận yêu cầu #04 — SRS LMS v3.1 (BẢN HỢP NHẤT CHỐT CUỐI)

| | |
|---|---|
| **Nguồn** | `0-tai-lieu-goc/SataRobo_LMS_Requirements_v3.1_CHOT-CUOI.md` |
| **Văn bản gốc** | SRS "Hệ thống LMS và Quản lý lớp học SataRobo" **v3.1 — bản hợp nhất chốt cuối** (gộp mô tả logic v2.0 + SRS v2.1), **TGĐ xác nhận lần cuối 12/06/2026** (học bù liên cơ sở, Satacoin pending) |
| **Ngày tiếp nhận** | 2026-06-12 |
| **Người tiếp nhận (PM)** | PM |
| **Tính chất** | ⚠️ **SRS đã được TGĐ phê duyệt, 18 hạng mục bắt buộc hoàn thiện TRƯỚC go-live LMS** (SRS §2) — không phải wishlist. Thay thế phạm vi LMS của Phiếu #01 (phần QL HV & LMS). |
| **Trạng thái** | 🟢 **ĐÃ DUYỆT 12/06/2026** — TGĐ trả lời đủ Nhóm E (E1–E9) + chốt bổ sung XĐ-5 (trial linh động số buổi) → đã chuyển BA (xem `2-ba-phan-tich/05-gap-analysis-lms-v3.1.md` mục 0) |

> 📌 **Ghi chú tài liệu gốc:** file `LMS_Requirement.md` (bản nháp trước) đã được đổi tên thành chính file `SataRobo_LMS_Requirements_v3.1_CHOT-CUOI.md` trước khi tiếp nhận (chưa từng commit) — không còn bản cũ riêng để đánh dấu SUPERSEDED. Bản v3.1 là bản duy nhất có hiệu lực trong `0-tai-lieu-goc/`.

---

## 1. Tóm tắt yêu cầu theo module (SRS v3.1)

Vòng đời xuyên suốt: **Lead → chăm sóc → lớp trải nghiệm Robosim 4 buổi → chờ quyết định → ghi nhận thanh toán → convert → Parent/Student/Enrollment → xếp lớp chính thức → dạy/điểm danh/giao bài → portal PH → học bạ/khảo sát → báo cáo** (SRS §1, §29).

| Module | Nội dung chính |
|---|---|
| **A — Lead & LeadChild** | Lead 1..N con (`LeadChild` riêng từng con: tuổi, trường, khóa quan tâm, trạng thái học thử, điểm danh 4 buổi); SLA chăm sóc **24h** (cấu hình được); luồng 10 trạng thái Mới→Đã chuyển đổi |
| **B — Lớp trải nghiệm Robosim 4 buổi** | Lớp `TRIAL_ROBOSIM` đúng 4 buổi tự sinh lịch, sức chứa, GV do QL cơ sở gán; 1 LeadChild chỉ 1 lớp trải nghiệm active |
| **C — Convert** | **CHỈ convert khi đã có ≥1 khoản thanh toán Sale ghi nhận**; check trùng email+phone parent (xung đột → khoá, Admin xử lý); trùng student theo Parent+tên+DOB; **cờ đồng ý sử dụng hình ảnh tại form convert** (NĐ 13/2023, audit người tick); mã học viên `CSx-YY-RANDOM`; tạo tài khoản PH + email kích hoạt |
| **D — Khóa học, giá, Enrollment** | Giá chung toàn hệ thống; ưu đãi/giảm giá/học bổng; **snapshot giá tại Enrollment**; mỗi con 1 Enrollment/khóa |
| **E — Thanh toán & công nợ** | **2 tầng trạng thái: Sale ghi nhận ↔ Kế toán xác nhận thực thu**; thanh toán 1 lần / 2 đợt; **nhắc công nợ trước X ngày do Sale nhập**; phiếu thu riêng từng Enrollment, không gộp hóa đơn, điều chỉnh bằng bút toán; PH chỉ thấy khoản đã xác nhận |
| **F — Khung chương trình** | Program toàn hệ thống, N buổi tự sinh, versioning, trạng thái nháp/xuất bản, trạng thái từng buổi, gắn mặc định theo Course |
| **G — SCORM** | Bài giảng chính; chỉ GV mở trên web, không tải nguồn, HV/PH không xem; upload zip→manifest→publish; storage private + signed URL; **làm mờ khi phát hiện quay/chụp + watermark động**; version pin theo lớp |
| **H — Bài tập trắc nghiệm** | Đào tạo CRUD gốc; **import Word .docx template field** (`QUESTION_CODE/QUESTION_TYPE/OPTION_A.../CORRECT_ANSWER`) **có ảnh nhúng** + preview sửa lỗi; **tự động giao bài khi GV đánh dấu đã dạy**; PH không xem nội dung câu hỏi |
| **I — Lớp chính thức** | Tạo lớp theo Course → tự gắn Program → **ClassProgramSnapshot (pin version)** → sinh lịch đủ N buổi; đổi lịch lặp có preview + recalc buổi tương lai |
| **J — Gán học viên** | Dropdown chỉ hiện Enrollment đúng khóa/cơ sở/trạng thái; "Thêm toàn bộ" theo bộ lọc; check sức chứa |
| **K — GV vận hành buổi** | Mở SCORM dạy → điểm danh → nhận xét lớp + từng HV → ảnh → **đánh dấu đã dạy** → hệ thống giao bài + cập nhật tiến độ + thông báo |
| **L — Điểm danh & học bù** | 6 trạng thái điểm danh; **học bù LIÊN CƠ SỞ CS1↔CS2** (TGĐ chốt 12/06), ưu tiên hiển thị cơ sở con đang học; thống kê riêng buổi học bù |
| **M — Portal PH + HV** | 1 tài khoản PH nhiều con, chuyển profile, không lộ studentId; dashboard PH (công nợ, lịch, khảo sát) + dashboard từng HV (tiến độ, bài tập, học bạ, đánh giá GV) |
| **N — Hình ảnh lớp** | Ảnh gắn lớp+buổi+tag HV; HV không consent → loại khỏi ảnh/làm mờ + cảnh báo người upload; signed URL |
| **O — Học bạ** | 1 học bạ / Enrollment; GV nhập, QL/Đào tạo duyệt, **chỉ bản phát hành mới hiện cho PH** |
| **P — Đánh giá & khảo sát** | **HỌC VIÊN đánh giá GV** (trong profile con, theo đợt, chống trùng) + **PH khảo sát trung tâm/cơ sở** — cả hai dùng **form builder cho Admin tự cấu hình câu hỏi/phương án** |
| **§22 Trạng thái** | Student 7 trạng thái; Enrollment 11 trạng thái đề xuất (Chờ thanh toán → Tái tục) |
| **§23 Thông báo** | 17 trigger in-app + email (kích hoạt, xếp lớp, đổi lịch, bài tập, vắng, học bù, thanh toán xác nhận, nhắc nợ, học bạ, khảo sát) |
| **§24 Báo cáo** | 7 nhóm: Lead, lớp trải nghiệm, học viên, lớp học, đào tạo, tài chính, trung tâm |
| **⏸ Satacoin** | **PENDING** (TGĐ chốt 12/06) — chỉ thiết kế sẵn schema bảng cấu hình điểm động để kích hoạt nhanh, KHÔNG phát triển |

---

## 2. Bảng phân loại đối chiếu CODE HIỆN TRẠNG (sau A0→R5, đã grep/đọc code thật)

> Ký hiệu: ✅ đã có trong code, dùng được ngay · 🟡 đã có nền nhưng cần sửa/mở rộng theo v3.1 · 🔴 build mới · 🔬 R&D/pending. Bằng chứng = file/model/route thật trong repo (snapshot 2026-06-12).

| # | Yêu cầu v3.1 | TT | Bằng chứng hiện trạng |
|---|---|---|---|
| **A — Lead & LeadChild** | | | |
| A1 | Lead cơ bản (nguồn, cơ sở, sale, trạng thái, hoạt động chăm sóc) | ✅ | `Lead.source/centerId/assignedToId` (schema:863–867), `LeadStatus` 13 giá trị (schema:36–51), `LeadActivity` (schema:2529), `LeadAuditLog` (schema:2454) |
| A2 | Lịch sử trạng thái + người thao tác + thời gian | ✅ | `LeadAuditLog` + `LeadActivity(STATUS_CHANGE)`; `LeadAssignmentHistory` (schema:3871) |
| A3 | **LeadChild 1..N** riêng từng con + nút "Thêm con" | 🔴 | Lead chỉ có field phẳng `childName/childAge` = tối đa 1 con (schema:861–862); không có bảng con |
| A4 | SLA chăm sóc 24h, cấu hình được | 🟡 | `lib/crm/sla.ts:7–14` có 5 mốc (5'/30'/3h/4h/2 ngày) + cron `/api/cron/sla-check`; **chưa có mốc 24h "không hoạt động" + ngưỡng hard-code, không có SystemSetting** |
| A5 | Luồng 10 trạng thái v3.1 (tách "Đã đăng ký" ↔ "Đã chuyển đổi", thêm "Đang học thử") | 🟡 | Enum hiện có TRIAL_SCHEDULED/TRIAL_ATTENDED/AWAITING_DECISION/ENROLLED/LOST/NO_ANSWER… — cần mapping + bổ sung trạng thái |
| **B — Lớp trải nghiệm Robosim 4 buổi** | | | |
| B1 | Lớp trải nghiệm `TRIAL_ROBOSIM` 4 buổi (lịch 4 buổi, sức chứa, GV, DS LeadChild) | 🔴 | `TrialClass` hiện tại = **1 buổi học thử cá nhân** gắn 1 lead (`scheduledAt` đơn, schema:3182–3206) — không phải lớp 4 buổi có danh sách |
| B2 | Điểm danh 4 buổi + nhận xét học thử per con | 🟡 | `TrialClassStatus` ATTENDED/MISSED + `TrialFeedback` (schema:3208–3219) — nền có, chưa theo mô hình lớp-buổi |
| B3 | Ràng buộc 1 LeadChild chỉ 1 lớp trải nghiệm active; sau buổi 4 → "Đã học thử" | 🔴 | Chưa có model TrialEnrollment/TrialAttendance |
| **C — Convert** | | | |
| C1 | Convert 1 transaction: Parent + Student + Enrollment + Order + account | ✅ | `closeLeadAsEnrolled` (app/(admin)/admin/leads/actions.ts:357–719, `$transaction`) + `convertLeadToEnrollment` (lib/crm/convert-lead.ts) + event `lead.converted` |
| C2 | **CHẶN convert khi chưa có thanh toán Sale ghi nhận** | 🔴 | Hiện `paidAmount` tuỳ chọn — Order tạo `PENDING_PAYMENT` nếu chưa thu (convert-lead.ts:95–105) → convert không cần tiền |
| C3 | Trùng email+phone parent; xung đột (email∈A, phone∈B) → khoá + Admin gộp | 🟡 | Check email PARENT (actions.ts:451–460) + `findConvertDuplicates` 90 ngày (cảnh báo); **chưa có khoá xung đột + flow Admin gộp + log xung đột** |
| C4 | Trùng student theo Parent + tên chuẩn hoá + ngày sinh | 🟡 | Dedup 90 ngày theo phone; chưa đúng rule Parent+tên+DOB |
| C5 | Form convert nhiều học viên ("Thêm học viên") + Enrollment riêng từng con | 🟡 | Convert hiện 1 con/lần; multi-con phải lặp thao tác |
| C6 | Cờ đồng ý ảnh tại form convert + ghi người tick/thời điểm (audit) | 🟡 | `StudentConsent(CLASS_MEDIA, GRANTED/REVOKED)` (schema:585–596) + grant/revoke ở portal (lib/lms/media-consent.ts:16–30); **chưa có ở form convert, chưa audit người tick** |
| C7 | Mã học viên `CSx-YY-RANDOM` unique, không sửa tay | 🟡 | Đã có `genStudentCode` nhưng format **`CS1.HV.26.001` tuần tự** (lib/codegen.ts:43–48) — khác format random → xung đột XĐ-7 |
| C8 | Tài khoản PH + email kích hoạt + tự đặt mật khẩu | ✅ | `AccountStatus.PENDING_ACTIVATION` (schema:3526) → OTP email (`OtpRequest`, lib/otp/service.ts) → `/kich-hoat` (app/(auth)/kich-hoat/_actions.ts) — khớp Doc 15 Q13 |
| **D — Khóa học, giá, Enrollment** | | | |
| D1 | Course: giá niêm yết, tổng buổi, trạng thái, toàn hệ thống | ✅ | `Course.price/totalSessions/isActive/isPublished` (schema:734–751) |
| D2 | Độ tuổi/trình độ trên Course | 🟡 | Chưa có field tuổi; `CourseCategory` enum chỉ 2 giá trị (schema:723–726) |
| D3 | Ưu đãi cấu hình theo khóa (giảm tiền/%/học bổng/chương trình) | 🟡 | `Voucher` theo OrderType (schema:2859–2892); chưa có discount/scholarship gắn Course |
| D4 | Snapshot giá tại Enrollment (niêm yết/loại ưu đãi/giảm/phải thu) | 🟡 | Snapshot thực tế nằm ở `Order.totalAmount` + `OrderItem.unitPrice`; chưa có cấu trúc 4 thành phần rõ + `Enrollment.tuition` legacy |
| D5 | Enrollment riêng per con per khóa, trạng thái, lớp, sale | ✅ | `Enrollment` (schema:1170–1223) + `EnrollmentStatus` 9 giá trị (schema:59–72); sale lưu qua Lead |
| **E — Thanh toán & công nợ** | | | |
| E1 | 2 tầng trạng thái Sale ↔ Kế toán (đủ: từ chối/hoàn/điều chỉnh) | 🟡 | Tầng kế toán có: `Order.confirmedByUserId/confirmedAt` + `confirmOrderPayment` (lib/finance/debt.ts:27, idempotent) + `changeOrderStatusAction` (orders/_actions.ts:475); **chưa tách 2 tầng trạng thái riêng + chưa có Từ chối/Hoàn tiền/Điều chỉnh** |
| E2 | Thanh toán 2 đợt, tự tính đợt 2, ngày dự kiến | ✅ | `OrderInstallment(soDot 1/2, amount, dueDate, paidAt, lastReminderAt)` (schema:2746–2764) + `recordInstallmentPlan` (lib/orders/installments.ts:42–83) — docs/payment-qr-installments.md |
| E3 | **Nhắc công nợ trước X ngày do Sale nhập** | 🟡 | Cron `/api/cron/debt-reminder` 03:00 nhắc **cố định 14 ngày** (route.ts:19) + chống spam `lastReminderAt`; **X per-enrollment chưa có** → xung đột XĐ-6 (BA #04 muốn X = SystemSetting) |
| E4 | PH chỉ thấy khoản Kế toán đã xác nhận | ✅ | Portal `/portal/hoc-phi` đọc theo `Order.status` CONFIRMED/COMPLETED (lib/portal/billing.ts:21–57) |
| E5 | Phiếu thu riêng/nhiều phiếu per Enrollment + bút toán điều chỉnh, không xóa cứng | 🟡 | Order/OrderItem per enrollment + `OrderStatusHistory` (schema:2808–2827, không hard-delete ✅); **chưa có nhiều phiếu thu/Enrollment + phiếu điều chỉnh** |
| E6 | Công nợ đa chiều (Enrollment/HV/PH/cơ sở/Sale/mức quá hạn) | 🟡 | `computeDebt` (lib/finance/debt.ts:8–10) + cron quá hạn; chưa có màn hình công nợ đa chiều |
| **F — Khung chương trình** | | | |
| F1 | Program + buổi + versioning + nháp/xuất bản/lưu trữ | ✅ | `Curriculum`(status DRAFT/ACTIVE/ARCHIVED, `@@unique([courseId,version])`) + `Lesson`(order, teacherGuide, homeworkDefault…) (schema:1807–1868) + admin/curriculums/_actions.ts |
| F2 | Nhập N buổi tự sinh N mục; tăng/giảm buổi có cảnh báo + lưu trữ thay xóa | 🟡 | Lesson per curriculum có order; UI sinh N + quy tắc giảm buổi an toàn chưa có |
| F3 | Trạng thái từng buổi (5 mức) + khóa chỉnh sửa | 🔴 | `Lesson` không có status |
| F4 | Course → chương trình mặc định đang xuất bản; chưa có thì không cho kích hoạt lớp | 🟡 | Hiện lấy curriculum ACTIVE version mới nhất (orderBy version desc); chưa có khái niệm "default" + chưa chặn kích hoạt lớp |
| **G — SCORM** | | | |
| G1 | Upload zip → quét → manifest → launch URL → metadata → kiểm thử → xuất bản | 🔴 | grep `scorm` toàn repo = 0 kết quả; chỉ có `Document` model (PDF/IMAGE/VIDEO/SLIDE/WORKSHEET) |
| G2 | Player web cho GV, storage private + signed URL ngắn hạn, không nút tải, log mở | 🔴 | Chưa có |
| G3 | Làm mờ khi blur/visibilitychange/PrintScreen/DevTools/screen-share + watermark động | 🔴 | Chưa có |
| G4 | Versioning SCORM + pin version theo lớp + audit khi thay | 🔴 | Chưa có |
| **H — Bài tập trắc nghiệm** | | | |
| H1 | Exam/Question/Choice/Attempt + trạng thái nháp/xuất bản | ✅ | `Exam`(DRAFT/PUBLISHED/CLOSED, schema:1951–1985), `Question`(MULTIPLE_CHOICE/TRUE_FALSE/SHORT_ANSWER/ESSAY/CODE, schema:1888–1922), `Choice`, `ExamAttempt`, `Assignment`(CLASSWORK/HOMEWORK, dueAt) |
| H2 | Câu hỏi/đáp án có hình ảnh | 🟡 | Chỉ nhét URL trong text — chưa có field ảnh + pipeline media riêng |
| H3 | **Import Word .docx template field + ảnh nhúng + preview sửa lỗi từng câu** | 🔴 | Hiện chỉ có **import Excel** (app/api/admin/import/questions/route.ts:93–288, idempotent theo questionCode); Word+ảnh nhúng+preview = mới |
| H4 | Bài tập gắn sẵn vào buổi chương trình | 🟡 | `Lesson.homeworkDefault` (text mô tả); chưa có link Exam ↔ Lesson |
| H5 | **Tự động giao bài khi GV đánh dấu đã dạy** + GV chọn hạn/trì hoãn | 🔴 | Chỉ có `submitAssignment` (lib/lms/assignment.ts:1–47) — Assignment tạo thủ công, không auto |
| H6 | PH không xem nội dung câu hỏi/đáp án — chỉ trạng thái + tổng quan | 🟡 | Portal đã ràng buộc bài theo con (audit ✅ IDOR); cần chặn tường minh nội dung chi tiết với role PH |
| **I — Lớp chính thức** | | | |
| I1 | Tạo lớp + tự sinh lịch theo thứ/giờ/tổng buổi, né ngày nghỉ | ✅ | `generateClassSessions` (lib/classes/generate.ts:11–71) — scheduleDays + Course.totalSessions + Holiday, gắn lessonId theo order |
| I2 | **ClassProgramSnapshot — lớp pin version chương trình** | 🔴 | Lớp đang tham chiếu curriculum "sống" qua Course; Doc 15 §6.3 đã chốt cùng hướng ("mỗi lớp gắn 1 curriculum version") — chưa code |
| I3 | Đổi lịch lặp: preview + recalc buổi tương lai, không đụng buổi đã hoàn thành | ✅ | `previewClassReschedule/applyClassReschedule` (classes/_components/class-reschedule.tsx:49–86) |
| I4 | Điều chỉnh từng buổi (ngày/giờ/GV/phòng/nghỉ lễ/bù) + lịch sử + thông báo | 🟡 | Có chỉnh buổi; audit per-buổi + notify các bên chưa đủ |
| **J — Gán học viên vào lớp** | | | |
| J1 | Dropdown chỉ hiện Enrollment đúng khóa + đúng cơ sở + trạng thái hợp lệ | 🟡 | enrollments/new có đếm sức chứa (`CAPACITY_COUNT_STATUSES`); lọc course/center/trạng thái theo rule v3.1 chưa đủ |
| J2 | "Thêm toàn bộ" theo bộ lọc + cảnh báo vượt sức chứa + xác nhận của người có quyền | 🔴 | Chưa có bulk-add |
| J3 | Sau gán: sinh tiến độ, quyền bài tập, lịch portal, thông báo PH | 🟡 | Enrollment→lớp + portal lịch có; tiến độ per-session + notify tự động chưa trọn |
| **K — GV vận hành buổi học** | | | |
| K1 | Điểm danh + nhận xét từng HV + media + checklist buổi | ✅ | `markAttendance` (admin/attendance/_actions.ts:43–140), `StudentSessionFeedback` (schema:1325–1339), `lib/lms/checklist.ts` (9 mục) |
| K2 | Nhận xét lớp + "đánh dấu đã dạy" là cổng trigger (giao bài, tiến độ, thông báo) | 🟡 | Checklist có `lessonConfirmed/feedback`; chưa là state machine buổi + chưa trigger giao bài (Doc 15 §6.3 "Hoàn tất buổi" cùng hướng) |
| **L — Điểm danh & học bù** | | | |
| L1 | Trạng thái điểm danh + trạng thái học bù | ✅ | `Attendance.status` PRESENT/ABSENT/LATE/EXCUSED + `makeupStatus` NONE/NEEDS_MAKEUP/MADE_UP (schema:1341–1365); lưu ý Doc 15 §6.3 chốt đổi enum ABSENT_EXCUSED/UNEXCUSED (2-phase, chưa làm) |
| L2 | Luồng học bù end-to-end (need → gợi ý → PH yêu cầu → duyệt → điểm danh bù → sync tiến độ) | ✅ | `lib/makeup/service.ts:7–148` (createMakeupNeed/suggestMakeupSessions/scheduleMakeup/completeMakeup + sync Attendance) + `ParentRequest.MAKEUP` + docs/makeup-flow.md |
| L3 | **Học bù LIÊN CƠ SỞ + ưu tiên cơ sở con đang học** | 🟡⚠️ | `suggestMakeupSessions` lọc `courseId` + lesson order, **KHÔNG lọc centerId** (service.ts:51–102) → kỹ thuật đã "liên cơ sở" nhưng vô tình, **không có sắp xếp ưu tiên cơ sở nhà + va chạm rule cách ly scopedDb** → XĐ-1 (3 nguồn mâu thuẫn, xem mục 6) |
| L4 | 5 chỉ số buổi trên portal (tổng/đã học/vắng/cần bù/đã bù) | 🟡 | Portal đếm real-time PRESENT/ABSENT/MADE_UP; chưa đủ 5 chỉ số tách bạch |
| **M — Portal PH + HV** | | | |
| M1 | 1 tài khoản PH nhiều con, chuyển profile, KHÔNG lộ studentId trên URL | ✅ | 17 trang `/portal/*`, SiteSwitcher + cookie HMAC (lib/portal/active-site-token.ts, session.ts:100 `assertOwnsStudent`) — khớp Doc 15 Q10 |
| M2 | Dashboard PH (công nợ + ngày đến hạn, khảo sát mở, yêu cầu) + dashboard HV đủ mục v3.1 | 🟡 | Dashboard hiện: buổi tới/bài tập/bài thi/lớp (portal/page.tsx:22–96); thiếu công nợ đến hạn, khảo sát đang mở, trạng thái học bạ… |
| **N — Hình ảnh lớp** | | | |
| N1 | Ảnh + tag HV + duyệt + consent enforce ở query | ✅ | `ClassSessionMedia`(PENDING/APPROVED/REJECTED) + `MediaStudentTag` (schema:3364–3392) + `/portal/hinh-anh` check `hasMediaConsent` + `tags.some({studentId})` (page.tsx:14–35) |
| N2 | Ảnh gắn theo BUỔI học + ngày chụp + người upload theo vai trò (GV/Sale phụ trách) | 🟡 | Model gắn lớp; gắn buổi + quyền upload theo "Sale phụ trách lớp" cần bổ sung |
| N3 | HV không consent → làm mờ trong ảnh chung + cảnh báo người upload | 🔴 | Hiện chỉ lọc-bỏ ảnh khỏi portal; chưa có làm mờ/cảnh báo lúc upload |
| N4 | Signed URL ảnh, chặn truy cập chéo qua URL | 🟡 | `fileUrl` trực tiếp; cần signed URL R2 ngắn hạn (Doc 15 §8.3 cùng hướng) |
| **O — Học bạ** | | | |
| O1 | Xuất học bạ/transcript + portal xem | ✅ | `lib/pdf/{transcript,progress-report,certificate}.tsx` + `/portal/hoc-ba` + `ProgressReportLog` (schema:2202–2219) |
| O2 | **ReportCard cấu trúc**: tiêu chí năng lực theo khóa, nhận xét giai đoạn, GV nhập → duyệt → **PHÁT HÀNH mới hiện cho PH** | 🔴 | Không có model ReportCard + máy trạng thái duyệt/phát hành; nền `StudentSkillAssessment` (10 kỹ năng × 4 mức) tái dùng được |
| **P — Đánh giá & khảo sát** | | | |
| P1 | **HỌC VIÊN đánh giá GV** (trong profile con, theo đợt, gắn Enrollment/lớp/GV, chống trùng) | 🔴 | `TeacherReview` = đánh giá **nội bộ** (schema:842–854); `ParentFeedback` = PH→trung tâm (schema:3337–3353); **không có student→teacher evaluation** |
| P2 | PH khảo sát trung tâm/cơ sở theo đợt, chỉ gửi PH đủ điều kiện | 🟡 | `Survey/SurveyQuestion/SurveyResponse` + `SurveyMilestone` 6 mốc (schema:3727–3791) + `/portal/khao-sat`; cần "đợt + cơ sở + điều kiện đủ" |
| P3 | **Form builder cho Admin** (tự cấu hình câu hỏi + phương án, thang mức/lựa chọn/mở, phù hợp lứa tuổi) | 🔴 | `SurveyQuestionType` cứng NPS/RATING/TEXT — không có FormTemplate động; **xung đột XĐ-2 với BA #04 IR-2 (cấm form-builder tổng quát)** |
| **Chung** | | | |
| X1 | Trạng thái Student 7 + Enrollment 11 theo §22 | 🟡 | EnrollmentStatus 9 giá trị có PAUSED (bảo lưu); thiếu "Chờ kế toán xác nhận"/"Tái tục"; `lib/students/renewal.ts` lo tái tục dạng alert |
| X2 | Thông báo 17 trigger in-app + email (§23) | 🟡 | `Notification`(4 audience) + `StaffNotification`(dedupeKey) + email Resend + Zalo stub; nhiều trigger thiếu (bài tập sắp hết hạn, học bạ phát hành, khảo sát mở, xác nhận thực thu…) |
| X3 | Báo cáo 7 nhóm (§24) | 🟡 | Có: marketing/lead funnel, LeadTransfer, CommissionStatement, MarketingReport snapshot, AdsInsightDaily, dashboard theo role; thiếu: báo cáo lớp trải nghiệm, đào tạo (buổi thiếu SCORM/bài tập), trung tâm hợp nhất |
| X4 | Satacoin | 🔬⏸ | Ledger + `/portal/satacoin` đã có từ trước; **giữ PENDING theo SRS** — chỉ thiết kế schema bảng cấu hình điểm động khi vào phase, không build UI/quy tắc |

### Thống kê phân loại

| ✅ Đã có | 🟡 Có nền, sửa/mở rộng | 🔴 Build mới | 🔬/⏸ Pending |
|---|---|---|---|
| **17 mục (~26%)** | **31 mục (~47%)** | **17 mục (~26%)** | 1 (Satacoin) |

**Nhận định PM:** R2–R4 đã dựng được "xương sống" (convert transaction, enrollment, installment, curriculum version, sinh lịch, attendance, makeup, portal, media consent, survey NPS). Khối build-mới tập trung 5 cụm: **(1) LeadChild + lớp trải nghiệm 4 buổi** (tái cấu trúc đầu phễu CRM), **(2) SCORM toàn bộ** (nặng nhất về hạ tầng), **(3) import Word + auto-giao bài**, **(4) ReportCard phát hành**, **(5) đánh giá GV bởi HV + form builder**.

---

## 3. Đề xuất MoSCoW (chờ Owner duyệt)

> ⚠️ SRS §2 quy định **18 hạng mục đều bắt buộc trước go-live LMS** → về nguyên tắc tất cả là Must theo khách. MoSCoW dưới đây là đề xuất **trình tự bên trong phase** (tách đợt R6a/R6b nếu >4 tuần), không phải đề xuất cắt scope.

| Mức | Hạng mục |
|---|---|
| **Must (đợt 1 — lõi vận hành)** | Tiền đề bảo mật C1–C3 (mục 4); LeadChild + lớp trải nghiệm 4 buổi; chặn convert chưa thanh toán + consent tại convert + khoá xung đột parent; hoàn thiện 2 tầng thanh toán + nhắc nợ X ngày; ClassProgramSnapshot (pin version); state machine buổi học + **tự động giao bài**; học bù theo quyết định XĐ-1; 5 chỉ số tiến độ portal; ảnh gắn buổi + cảnh báo consent |
| **Should (đợt 2 — nội dung đào tạo)** | SCORM end-to-end (upload→publish→player+signed URL) + blur/watermark mức trình duyệt; import Word .docx field-template có ảnh + preview; ReportCard duyệt→phát hành; đánh giá GV bởi HV + khảo sát PH theo đợt (phạm vi form builder chờ XĐ-2); báo cáo 7 nhóm |
| **Could** | Trạng thái buổi chương trình 5 mức + khóa chỉnh sửa; công nợ đa chiều; thông báo phủ đủ 17 trigger; sắp xếp ưu tiên đề xuất học bù nâng cao |
| **Won't (giai đoạn này)** | Satacoin (PENDING — chỉ schema cấu hình); OTP/Zalo login (phase sau, SRS 8.7); app mobile/FLAG_SECURE (SRS 12.4 ghi nhận xem xét sau); skill AI tạo bài tập (ngoài hệ thống, chỉ đồng bộ template) |

---

## 4. ĐIỀU KIỆN TIÊN QUYẾT GO-LIVE (bắt buộc — từ audit `Document/3-hien-trang/06-audit-lo-hong.md`)

LMS v3.1 mở rộng mạnh dữ liệu trẻ em + tiền + thao tác liên cơ sở → 3 lỗ hổng mức CAO phải đóng **trước khi bất kỳ tính năng LMS v3.1 nào go-live** (đề xuất: task đầu tiên của phase mới):

| # | Lỗ hổng | Hiện trạng | Yêu cầu đóng |
|---|---|---|---|
| **C1** | scopedDb chưa enforce → IDOR theo center | ~236/238 file `app/**` import `@/lib/db` trần; rule dependency-cruiser còn `warn`; bằng chứng IDOR: `leads/actions.ts updateLeadStatus`, `orders/_actions.ts` | Áp `scopedDb(actor)` rộng cho module có centerId + đổi rule sang `error` (CI chặn) |
| **C2** | RBAC v2 OFF — prod chạy matrix tĩnh v1 | `lib/flags.ts isRbacV2Enabled()` default false; can() v2 chỉ chạy shadow | Hoàn tất shadow-compare → bật `RBAC_V2_ENABLED` staging → prod |
| **C3** | Webhook fail-OPEN khi thiếu secret | `lib/lead/webhook.ts` thiếu env secret → return ok=true (cả 3 webhook + Meta signature) | Guard fail-CLOSED ở production (thiếu secret → 503) + checklist go-live secret |

> Đặc biệt liên quan v3.1: **học bù liên cơ sở (XĐ-1) chỉ an toàn khi C1+C2 đã đóng** — cho phép đọc chéo cơ sở phải là exception có kiểm soát trong scopedDb, không phải vì scopedDb chưa bật.

---

## 5. Rủi ro & phụ thuộc

1. **Trùng slot phase R6** — BA #04 (`2-ba-phan-tich/04-ba-r6-flexibility-hardening.md`, BASELINE TGĐ 11/06/2026) đã đặt **R6 = "Flexibility & Hardening"** (đóng C1/C2, B1–B4, settings động). SRS v3.1 chồng lấn trực tiếp 3 hạng mục (học bù chéo cơ sở, nhắc nợ X ngày, trả góp) → phải chốt cách xếp phase (câu hỏi E1) **trước khi BA viết spec**, tránh 2 spec mâu thuẫn cho cùng 1 tính năng.
2. **SCORM là hạ tầng mới hoàn toàn**: giải nén zip + serve nội dung tĩnh private qua R2 + signed URL trên Vercel serverless — cần job queue DB-backed (Doc 15 Q4, không message broker), giới hạn dung lượng/time-out function. Biện pháp blur/watermark chỉ ở mức trình duyệt (SRS đã tuyên bố trung thực giới hạn — giữ nguyên wording khi nghiệm thu).
3. **Import Word .docx có ảnh nhúng** phức tạp hơn Excel hiện có (parser docx + trích media + map theo block) — cần file template khóa cấu trúc + màn preview; đồng bộ template với skill AI ngoài hệ thống (SRS §0.7).
4. **Chặn convert chưa thanh toán** thay đổi hành vi flow R2 đang chạy prod → cần 2-phase + xử lý lead/order PENDING_PAYMENT tồn tại (câu hỏi E6).
5. **Tái cấu trúc đầu phễu CRM** (LeadChild + lớp trải nghiệm) đụng R1 đã đóng — migrate lead cũ 1-con sang LeadChild (câu hỏi E8); báo cáo phễu/hoa hồng SR217 phải không gãy (T12 regression).
6. **Mã học viên đổi format** đụng mã đã phát hành cho học viên thật (XĐ-7/E4) — nếu đổi, bắt buộc 2-phase, không sửa mã cũ.
7. **Phụ thuộc prod migrate**: ~18 migration A0→R5 **chưa apply lên Supabase prod** (quyết định của Owner còn treo) — mọi schema mới của LMS v3.1 xếp hàng sau quyết định này.
8. **NĐ 13/2023**: consent ảnh tại convert + làm mờ ảnh + watermark — cần wording pháp lý chuẩn trên form (Sale bắt buộc trao đổi trước khi tick) và quy trình PH thay đổi consent có log.

---

## 6. Xung đột phát hiện sớm (PM ghi nhận — BA sẽ lập bảng xung đột đầy đủ ở bước 2, KHÔNG tự chốt)

| # | Xung đột | Nguồn A | Nguồn B |
|---|---|---|---|
| XĐ-1 | **Học bù liên cơ sở** | SRS v3.1 §17.4 + QĐ-31 (TGĐ 12/06): **cho phép CS1↔CS2 mặc định**, ưu tiên cơ sở nhà | BA #04 R6 (BASELINE TGĐ 11/06): *"mặc định cùng cơ sở; chéo cơ sở = exception cần duyệt + audit"*; code hiện tại không lọc center (vô tình mở) + rule cách ly scopedDb (Doc 15 §4.4) |
| XĐ-2 | **Form builder** đánh giá GV/khảo sát | SRS v3.1 §21 + QĐ-27: Admin tự cấu hình câu hỏi + phương án (form builder) | BA #04 IR-2: *"KHÔNG xây form-builder kéo-thả tổng quát"* |
| XĐ-3 | **Nhắc nợ X ngày** | SRS v3.1 §10.2 + QĐ-10: X do **Sale nhập per-Enrollment** | BA #04: X = SystemSetting toàn hệ thống; code hiện tại: cứng 14 ngày |
| XĐ-4 | **Convert điều kiện thanh toán** | SRS v3.1 §8.1 + QĐ-4: bắt buộc có thanh toán ghi nhận TRƯỚC convert | Code R2 prod: convert không cần tiền (Order PENDING_PAYMENT) |
| XĐ-5 | **Mô hình trial** | SRS v3.1: lớp trải nghiệm 4 buổi + LeadChild + TrialEnrollment | Code R1/R2: TrialClass = 1 buổi cá nhân per lead, không LeadChild |
| XĐ-6 | **SCORM trong scope** | SRS v3.1: SCORM = bài giảng chính (bắt buộc go-live) | Doc 15 Q12/§6.3: LMS offline "không build video LMS", §6.3 không nhắc SCORM — cần Owner xác nhận SCORM (tài liệu tương tác đóng gói, không phải video LMS) thuộc scope |
| XĐ-7 | **Format mã học viên** | SRS v3.1 §8.6: `CSx-YY-RANDOM` (random, không đoán được) | Code: `CS1.HV.26.001` (tuần tự, đã phát hành thật — lib/codegen.ts) |
| XĐ-8 | **Enum điểm danh** | SRS v3.1 §17.1: 6 trạng thái (có "Học bù", "Buổi hủy") | Doc 15 §6.3: PRESENT/LATE/ABSENT_EXCUSED/ABSENT_UNEXCUSED (2-phase); code: PRESENT/ABSENT/LATE/EXCUSED + makeupStatus riêng |

---

## 7. Câu hỏi mở

Đã gộp thành **Nhóm E — LMS v3.1** trong [`03-cau-hoi-xac-nhan-khach-hang.md`](03-cau-hoi-xac-nhan-khach-hang.md) (E1–E9): xếp phase R6/R7, chốt 8 xung đột trên, migrate lead cũ, ngoại lệ học bổng 100%, phạm vi form builder.

## 8. Bước tiếp theo

1. 🔴 **CHỜ OWNER DUYỆT**: (a) phiếu này + phân loại; (b) MoSCoW/tách đợt mục 3; (c) điều kiện tiên quyết C1–C3 mục 4; (d) trả lời Nhóm E trong file 03.
2. Sau duyệt → BA lập `2-ba-phan-tich/05-gap-analysis-lms-v3.1.md` (kèm **bảng xung đột bắt buộc** XĐ-1…8 + 2–3 phương án/khuyến nghị mỗi xung đột) + `06-user-stories-lms-v3.1.md`.
3. Sau khi Owner chốt xung đột + duyệt user stories → PM+Lead lập kế hoạch phase trong `3-ke-hoach-trien-khai/` (ticket 11 mục theo `phases/00-quy-trinh-thuc-hien.md`, task đầu = tiền đề bảo mật C1–C3).
