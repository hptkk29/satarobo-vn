# R7-14 — Auto-giao bài khi "Hoàn tất buổi" + phân quyền hiển thị PH

**ID** R7-14 · **PR** 2 (PR1 auto-assign handler, PR2 phân quyền portal) · **Ưu tiên** P1 · **Ước lượng** L · **Phụ thuộc** R7-07 (event session.taught), R7-13 (Exam↔Lesson) · **Trạng thái** TODO · **US** US-HW-3..4 · **SRS** §13.5–13.6, §18.5, §28.5

## 1. Mục tiêu & bối cảnh
Assignment hiện tạo thủ công (`lib/lms/assignment.ts` chỉ có submit). SRS: GV đánh dấu đã dạy → hệ thống tự giao bài đã xuất bản cho lớp/HV (GV được chọn hạn/trì hoãn); PH tuyệt đối không thấy nội dung câu hỏi — chỉ trạng thái + tổng quan.

## 2. Phạm vi
- **In:** handler `session.taught` → tạo HomeworkAssignment cho mọi HV active của lớp (idempotent); UI hoàn tất buổi cho GV chọn: giao ngay (hạn mặc định defaultDueDays) / hạn khác / trì hoãn (giao sau từ màn buổi học, theo quyền); query portal tách 2 tầng: HV (chi tiết để làm bài — đúng Enrollment/lớp) vs PH (aggregate: đã giao/đã làm, x/y, trạng thái, điểm tổng quan nếu setting bật); notify bài mới + sắp hết hạn (cron — nối R7-17).
- **Out:** giao lại/làm lại nhiều lần (theo maxAttempts đã có ở R7-13) · chấm tự luận (ngoài SRS trắc nghiệm).

## 3. Thiết kế kỹ thuật
- Handler idempotent: unique `(classSessionId, examId, studentId)`; chỉ exam PUBLISHED gắn lesson của buổi (qua ClassSessionPlan R7-06); HV active = Enrollment status Đang học/Đã xếp lớp tại thời điểm buổi.
- GV options lưu trên completeSession payload: `{assignMode: NOW/DEFER/CUSTOM_DUE, dueAt?}`; DEFER → nút "Giao bài" riêng trên buổi (can `classes:teach` + đúng GV lớp).
- Portal: API PH trả DTO aggregate KHÔNG chứa question/choice (kiểm soát ở tầng query — select cụ thể, không trả model thô); HV profile mới được gọi API chi tiết làm bài (guard theo active profile cookie hiện có); setting `homework.showScoreToParent` (SystemSetting).

## 4. Acceptance Criteria
- AC1: Hoàn tất buổi (mode NOW) → Assignment sinh đủ HV active với dueAt = hôm nay + defaultDueDays; HV vào portal thấy bài; PH nhận notify.
- AC2: Hoàn tất 2 lần / replay event → không giao trùng.
- AC3: DEFER → chưa giao; GV bấm "Giao bài" sau → giao với hạn chọn; GV lớp khác không bấm được.
- AC4: HV chỉ thấy/làm bài của Enrollment mình; không thấy bài lớp khác/khóa chưa đăng ký.
- AC5: PH: chỉ x/y + trạng thái (+ điểm tổng quan nếu setting bật); mọi API trả câu hỏi chi tiết cho session PH (kể cả gọi thẳng endpoint HV) → từ chối.

## 5. Files dự kiến
migration `add_homework_assignment_unique` (nếu cần) · `lib/events/handlers/homework-assign.ts` (+test) · `lib/lms/assignment.ts` (mở rộng) · `lib/portal/learning.ts` (DTO aggregate) · portal `/portal/bai-tap` · `tests/e2e/r7/homework-auto-assign.spec.ts`.

## 6. Edge cases & xử lý lỗi
HV gán vào lớp SAU buổi đã dạy → không tự giao bài cũ (chỉ buổi từ lúc vào lớp; vắng→makeup flow lo phần bù) · buổi không có exam gắn → hoàn tất bình thường, không giao gì · exam bị UNPUBLISH sau khi giao → bài đã giao giữ nguyên · HV PAUSED giữa kỳ → không nhận bài mới.

## 7. Rollback / Feature flag
Handler đăng ký theo event — tắt handler là dừng auto (bài đã giao giữ). Setting showScoreToParent default OFF.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-14-C1 | T1 | B | hoàn tất buổi NOW | Assignment đủ HV active + dueAt đúng + notify | Playwright |
| R7-14-C2 | T6 | B | replay event ×3 | không trùng | Vitest |
| R7-14-C3 | T4 | B | DEFER → GV khác bấm giao | chặn; GV lớp giao với hạn chọn → OK | Playwright |
| R7-14-C4 | T5 | B | HV mở bài lớp khác / khóa khác | không thấy/403 | Playwright |
| R7-14-C5 | T4/T10 | B | session PH gọi endpoint chi tiết câu hỏi | từ chối; UI PH chỉ aggregate | Playwright |
| R7-14-C6 | T3 | B | setting điểm ON/OFF | PH thấy/không thấy điểm tổng quan | Playwright |
| R7-14-C7 | T7 | E | HV vào lớp sau buổi 3 → hoàn tất buổi 4 | chỉ nhận bài buổi 4 | Vitest |

## 9. Test data
Lớp 5 HV (1 PAUSED, 1 vào trễ); exam PUBLISHED buổi 3–4; PH 1 con; setting score OFF→ON.

## 10. RTM
AC1↔C1 · AC2↔C2 · AC3↔C3 · AC4↔C4,C7 · AC5↔C5,C6.

## 11. DoD
DoD chuẩn + demo D7 + D8.
