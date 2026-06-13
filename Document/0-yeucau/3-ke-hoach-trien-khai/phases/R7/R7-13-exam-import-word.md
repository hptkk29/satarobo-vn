# R7-13 — Bài tập gắn buổi + cấu hình + ảnh + Import Word .docx field-template

**ID** R7-13 · **PR** 3 (PR1 Exam↔Lesson+cấu hình+ảnh, PR2 parser docx + spike, PR3 preview UI + import nháp) · **Ưu tiên** P1 · **Ước lượng** XL · **Phụ thuộc** R7-10 · **Trạng thái** TODO · **US** US-HW-1..2 · **SRS** §13.1–13.4, §28.5 · **QĐ** 15/33 SRS

## 1. Mục tiêu & bối cảnh
Exam/Question/Choice/Attempt đã có (schema:1888–2031); import hiện chỉ Excel (route.ts:93–288). SRS đòi: bài gắn buổi chương trình với cấu hình đầy đủ, câu hỏi/đáp án có ảnh thật (không phải URL trong text), import Word .docx theo field-template có ảnh nhúng + preview sửa lỗi; template đồng bộ skill AI ngoài hệ thống (§0.7).

## 2. Phạm vi
- **In:** Exam + `lessonId` + cấu hình (durationMinutes có sẵn; thêm: maxAttempts, defaultDueDays, scoringMode, passScore có sẵn, shuffleQuestions, shuffleChoices, showResultAfterSubmit); `Question.imageUrl` + `Choice.imageUrl` (upload R2); parser .docx (block/bảng theo field QUESTION_CODE…TAGS) + trích ảnh nhúng + map vị trí; màn preview lỗi từng câu + sửa inline; import NHÁP idempotent theo QUESTION_CODE; file template mẫu tải về; quyền: chỉ Đào tạo/Admin CRUD gốc.
- **Out:** auto-giao + hiển thị PH (R7-14) · loại câu hỏi mở rộng (ghép cặp/sắp xếp — SRS "mở rộng sau") · skill AI (ngoài hệ thống).

## 3. Thiết kế kỹ thuật
- Parser `lib/exams/docx-import.ts`: unzip .docx (JSZip) → `word/document.xml` đọc block theo marker `QUESTION_CODE:`; ảnh từ `word/media/*` map qua relationship id theo vị trí trong block (`QUESTION_IMAGE`/`OPTION_X_IMAGE`); ảnh đẩy R2 lúc XÁC NHẬN import (preview dùng data-url tạm). Chỉ nhận `.docx` (mime + magic bytes); `.doc` reject.
- Validate per câu: code trùng (trong file + DB), QUESTION_TYPE ∈ {SINGLE, MULTI, TRUE_FALSE}, CORRECT_ANSWER trỏ option tồn tại (MULTI: danh sách "A,C"), thiếu QUESTION_TEXT, SCORE số dương, TRUE_FALSE đúng 2 option. Map SINGLE→MULTIPLE_CHOICE 1 đáp án đúng.
- Preview: bảng câu hỏi, badge lỗi đỏ per dòng, sửa inline (text/đáp án đúng), re-validate client+server; "Xác nhận import" → upsert DRAFT theo questionCode (idempotent); file lớn (>50 câu hoặc >10MB) → job nền + progress.
- Template mẫu: file .docx chuẩn trong `public/templates/exam-import-template.docx` + nút tải; trang admin ghi chú "không đổi tên field" (khóa cấu trúc §13.4).

## 4. Acceptance Criteria
- AC1: Exam gắn Lesson + đủ cấu hình; publish được; GV xem-không-sửa (T4).
- AC2: .docx chuẩn 10 câu (2 câu ảnh, 1 đáp án ảnh) → parse đủ field, ảnh đúng câu/đáp án.
- AC3: File lỗi hỗn hợp → preview đánh dấu đúng từng câu lỗi + sửa inline được; câu lỗi không chặn câu đúng; .doc → reject.
- AC4: Import 2 lần cùng file → không nhân đôi (upsert theo code); kết quả ở DRAFT; chỉ Đào tạo publish.
- AC5: Tải được file mẫu chuẩn; checklist đồng bộ field với template skill AI (đối chiếu tay khi nghiệm thu — QĐ-33 SRS).

## 5. Files dự kiến
migration `add_exam_lesson_config_question_images` · `lib/exams/docx-import.ts` (+Vitest fixture-driven) · `app/(admin)/admin/exams/import-word/*` (upload, preview, confirm) · `public/templates/exam-import-template.docx` · `tests/e2e/r7/exam-import-word.spec.ts`.

## 6. Edge cases & xử lý lỗi
Ảnh chèn bằng link internet (không nhúng) → báo lỗi dòng đó (SRS cấm) · block thiếu OPTION_C/D (chỉ A,B) → hợp lệ với SINGLE/TRUE_FALSE · ký tự xuống dòng trong QUESTION_TEXT → giữ nguyên (multiline) · file 0 câu / sai template toàn bộ → thông báo "không tìm thấy block hợp lệ" + link file mẫu · EXPLANATION/TAGS optional.

## 7. Rollback / Feature flag
Import Word là route mới — ẩn menu là đủ. Import Excel cũ giữ nguyên (2 đường song song).

## 8. Test plan
| Case ID | Nhóm | B/E | Bước | Kết quả | Tool |
|---|---|---|---|---|---|
| R7-13-C1 | T1 | B | tạo exam gắn buổi + cấu hình + publish | đủ field; GV sửa → chặn | Playwright |
| R7-13-C2 | T1 | B | import fixture 10 câu có ảnh | parse đủ; ảnh đúng vị trí | Vitest parser |
| R7-13-C3 | T2 | B | fixture lỗi (code trùng, đáp án ma, thiếu text, type sai) | preview đánh dấu đúng 4 lỗi; sửa inline → pass | Playwright |
| R7-13-C4 | T2 | B | upload .doc / file đổi tên đuôi | reject (magic bytes) | Vitest |
| R7-13-C5 | T6 | B | xác nhận import ×2 | số câu không đổi | Playwright |
| R7-13-C6 | T4 | B | GV mở trang import / publish DRAFT | chặn | Playwright |
| R7-13-C7 | T11 | E | file 100 câu | chạy job + progress, hoàn tất | Playwright |
| R7-13-C8 | T1 | B | tải file mẫu | đúng template field §13.4 | Playwright |

## 9. Test data
Fixtures `tests/fixtures/docx/`: chuẩn-10-câu (ảnh nhúng), lỗi-hỗn-hợp, file .doc, file 100 câu (generate script).

## 10. RTM
AC1↔C1 · AC2↔C2 · AC3↔C3,C4 · AC4↔C5,C6 · AC5↔C8 · NFR↔C7.

## 11. DoD
DoD chuẩn + demo D6 + ghi chú đồng bộ template với skill `tao-bai-tap-trac-nghiem-satarobo` trong biên bản.
