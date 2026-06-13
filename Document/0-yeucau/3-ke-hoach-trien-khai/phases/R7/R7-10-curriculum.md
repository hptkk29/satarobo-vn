# R7-10 — Khung chương trình: resize N buổi an toàn + trạng thái buổi + đề xuất chỉnh sửa

**ID** R7-10 · **PR** 2 · **Ưu tiên** P1 (mở đầu R7b) · **Ước lượng** M · **Phụ thuộc** R7-00 · **Trạng thái** TODO · **US** US-PROG-1..2 · **SRS** §11, §28.4

## 1. Mục tiêu & bối cảnh
Curriculum/Lesson + versioning đã có (schema:1807–1868). Thiếu: UI "nhập N sinh N mục", quy tắc tăng/giảm an toàn, trạng thái từng buổi 5 mức + khóa sửa, kênh GV đề xuất chỉnh sửa, trạng thái "Ngưng xuất bản".

## 2. Phạm vi
- **In:** resize N buổi (append/giảm có cảnh báo + archive); `Lesson.status` 5 mức + lock; `LessonChangeRequest` (GV gửi → Đào tạo xử lý); CurriculumStatus + `UNPUBLISHED`.
- **Out:** gắn SCORM/bài tập vào buổi (R7-11/13) · snapshot lớp (R7-06 đã làm).

## 3. Thiết kế kỹ thuật
- Resize: form "Số buổi" → service so sánh; tăng → tạo Lesson cuối (status=Chưa hoàn thiện); giảm → modal liệt kê buổi loại, buổi có SCORM/Exam → confirm bắt buộc; loại = `archivedAt` (soft) — không xóa cứng.
- `Lesson.status enum(INCOMPLETE/COMPLETE/IN_USE/NEEDS_UPDATE/LOCKED)` + `lockedAt/lockedById`; LOCKED → mọi update field nội dung bị chặn trừ Đào tạo unlock (audit).
- `LessonChangeRequest{id, lessonId, requestedById(GV), content, status(OPEN/ACCEPTED/REJECTED), response, handledById}` — GV gửi từ màn lớp; Đào tạo xử lý trong admin curriculum.

## 4. Acceptance Criteria
- AC1: N=12 sinh đủ 12 mục accordion; 12→14 append giữ nguyên data cũ.
- AC2: 12→10 với buổi 11 có bài tập → liệt kê + confirm; buổi archive vẫn xem được (đọc-only), không mất SCORM/exam links.
- AC3: Buổi LOCKED chặn sửa (T4); unlock chỉ Đào tạo + audit.
- AC4: GV gửi đề xuất → Đào tạo accept/reject + phản hồi; GV thấy trạng thái.

## 5. Files dự kiến
migration `add_lesson_status_change_request` · `lib/lms/curriculum.ts` (+test resize) · `app/(admin)/admin/curriculums/*` · `tests/e2e/r7/curriculum-sessions.spec.ts`.

## 6. Edge cases & xử lý lỗi
Giảm N dưới số buổi lớp đang học (qua snapshot không ảnh hưởng lớp — chỉ cảnh báo) · archive buổi đang IN_USE → chặn, yêu cầu gỡ khỏi sử dụng trước · 2 người resize đồng thời → optimistic lock version.

## 7. Rollback / Feature flag
Additive; archive đảo ngược được (unarchive). Không flag.

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-10-C1 | T1 | B | N=12 → sinh; 12→14 | đủ mục; data cũ nguyên | Playwright |
| R7-10-C2 | T7 | B | 12→10, buổi 11 có exam | confirm bắt buộc; archive không mất link | Playwright |
| R7-10-C3 | T4/T9 | B | sửa buổi LOCKED; unlock bởi Đào tạo | chặn; unlock + audit | Playwright |
| R7-10-C4 | T1 | B | GV đề xuất → Đào tạo reject + phản hồi | GV thấy trạng thái + nội dung | Playwright |
| R7-10-C5 | T6 | E | 2 resize song song | optimistic lock — 1 thắng, 1 báo reload | Vitest |

## 9. Test data
Curriculum 12 buổi (buổi 11 gắn exam giả); GV + Đào tạo user.

## 10. RTM
AC1↔C1 · AC2↔C2 · AC3↔C3 · AC4↔C4 · race↔C5.

## 11. DoD
DoD chuẩn.
