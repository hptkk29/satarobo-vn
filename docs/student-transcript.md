# Học bạ học viên (Cụm B5)

## Nguyên tắc

**KHÔNG tạo bảng mới.** Học bạ = tổng hợp on-the-fly từ dữ liệu đã có:
Enrollment + progress per-class (`getStudentProgress`) + CourseCompletion (B4) +
StudentSkillAssessment (năng lực) + đếm StudentSessionFeedback.

## Service (`lib/transcript/service.ts` → `getStudentTranscript(studentId)`)

Trả `StudentTranscript`: thông tin HV, mảng lớp (chuyên cần, điểm TB, exam, trạng thái),
khoá đã hoàn thành, đánh giá năng lực, tổng hợp (số lớp, khoá hoàn thành, chuyên cần %, điểm TB).

> Caller **PHẢI tự kiểm quyền** trước khi gọi — service không tự lọc con khác.

## Truy cập

- **Phụ huynh** `/portal/hoc-ba`: chỉ học bạ **con đang chọn** (`requireActiveStudent`) →
  không lộ con khác. PDF: `GET /api/portal/transcript` (dựa active student cookie).
- **Admin/GV/quản lý** `/admin/hoc-ba?studentId=`: gate `students:view-all|view-own-class`,
  **center scope** (CENTER_MANAGER chỉ HV cơ sở). PDF: `GET /api/admin/reports/transcript?studentId=`
  (cũng guard center scope).

## PDF

`lib/pdf/transcript.tsx` (@react-pdf, NotoSans) — bảng lớp + khoá hoàn thành + năng lực.
View HTML dùng chung `components/transcript/transcript-view.tsx` (portal + admin).

## Test (ZZTEST_)

1. HV `ZZTEST_*` có ≥1 enrollment + 1 completion + vài skill assessment.
2. `/portal/hoc-ba` (đăng nhập phụ huynh, chọn con) → thấy đúng học bạ con đó; đổi sang con khác → đổi data.
3. Tải PDF portal → khớp on-screen.
4. Admin `/admin/hoc-ba` chọn HV → xem + PDF. CENTER_MANAGER thử HV cơ sở khác → "ngoài phạm vi".
