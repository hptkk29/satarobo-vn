# Rubric chấm bài robotics (Cụm C3)

## Model (additive, migration `20260601090000_rubric_grading`)

- enum `RubricCriterion` (6): ANALYSIS, DESIGN, PROGRAMMING, TESTING, CREATIVITY, PRESENTATION.
- enum `RubricLevel` (4): NEED_SUPPORT(1), BASIC(2), GOOD(3), EXCELLENT(4).
- `SubmissionRubricScore` (submissionId, criterion, level) — `@@unique([submissionId, criterion])`,
  mỗi tiêu chí 1 mức/bài nộp.

## Nguồn chân lý (`lib/rubric/criteria.ts`)

`RUBRIC_CRITERIA` (label + mô tả), `RUBRIC_LEVELS` (label + điểm + màu), `rubricToScore()` quy đổi
6 mức → điểm 0-10 (trung bình mức / 4 × 10). Dùng chung admin + portal.

## Chấm (admin)

- Action `gradeSubmissionRubric` trong `app/(admin)/admin/assignments/_actions.ts`
  (gate SUPER_ADMIN/CENTER_MANAGER/TEACHER):
  - Bắt buộc đủ **6 tiêu chí** + **nhận xét** (≥5 ký tự).
  - Ghi lại SubmissionRubricScore (xoá + tạo lại trong transaction), cập nhật submission
    (`score` quy đổi, `feedback`, GRADED, gradedAt, gradedById).
  - Tuỳ chọn gửi email kết quả cho phụ huynh (A2 — enqueue, không gửi ngay).
- UI: nút **Rubric** trên mỗi dòng bài nộp (`submission-row.tsx`) → dialog 6 tiêu chí ×4 mức + nhận xét.

## Xem (phụ huynh)

- `/portal/bai-tap/[assignmentId]`: khi đã chấm, hiển thị bảng tiêu chí + mức + điểm quy đổi + nhận xét.
- Chỉ con đang chọn (`requireActiveStudent`) — không lộ con khác.

## Test (ZZTEST_)

1. HS `ZZTEST_*` nộp 1 bài.
2. GV mở Rubric → thử lưu thiếu nhận xét → bị chặn; chấm đủ 6 tiêu chí + nhận xét → lưu, điểm quy đổi đúng.
3. Tick gửi email → EmailQueue thêm 1 bản PENDING (không gửi).
4. Phụ huynh mở bài → thấy bảng rubric + nhận xét.
