# Hoàn thành khoá + chứng chỉ (Cụm B4)

## Mục tiêu

Khi học viên hoàn thành khoá: ghi nhận, GV đánh giá cuối khoá, đề xuất khoá tiếp,
chăm sóc tái tục, email chúc mừng, sinh chứng chỉ in được. **KHÔNG NFT/Web3.**

## Model

`CourseCompletion` (additive, migration `20260601060000_course_completion`):
- `studentId` + `courseId` (`@@unique` — mỗi HV/khoá 1 bản ghi, upsert).
- `finalAssessment` (@db.Text) — GV đánh giá cuối khoá; `finalGrade` — xếp loại.
- `certificateCode` `@unique` dạng `CERT-YYMMDD-XXXX`.
- `nextCourseId` — gợi ý khoá tiếp (không có relation riêng → map tên ở UI).
- `classId?`, `createdById?`.

## Luồng (`lib/completion/service.ts` → `completeCourse`)

1. Upsert `CourseCompletion` (idempotent theo student+course).
2. Gợi ý khoá tiếp: tìm `CoursePrerequisite` mà khoá hiện tại là **tiên quyết**
   (`requiredCourseId = courseId`) → `nextCourseId`.
3. Tạo `StudentCareTask` "Tư vấn tái đăng ký" cho **SALES_CSM** cùng cơ sở (dueAt +3 ngày).
4. `enqueueEmail` (A2) email chúc mừng + mời khảo sát cuối khoá (PENDING, KHÔNG gửi ngay).
5. Chứng chỉ PDF: `lib/pdf/certificate.tsx` (@react-pdf, font NotoSans) qua
   `GET /api/admin/reports/certificate?code=CERT-...` (runtime nodejs, inline PDF).
6. Khảo sát END_COURSE (B3) đã hiển thị ở `/portal/khao-sat`.

## UI

- Admin `/admin/hoan-thanh-khoa` (gate `completions:manage` = SUPER_ADMIN/CENTER_MANAGER/TEACHER,
  center scope): form chọn HV + khoá + xếp loại + đánh giá GV (bắt buộc) → đánh dấu hoàn thành;
  bảng "đã hoàn thành gần đây" + link tải chứng chỉ.

## Test (ZZTEST_, KHÔNG đụng data thật, KHÔNG gửi email thật)

1. Tạo HV `ZZTEST_*` + 1 khoá có tiên quyết → mark completion.
2. Kiểm: CourseCompletion tạo, certificateCode sinh, care task SALES_CSM tạo,
   EmailQueue có 1 bản PENDING (không gửi), nextCourseId đúng khoá kế.
3. Mở `/api/admin/reports/certificate?code=...` → PDF chứng chỉ hiển thị tên HV + khoá.
4. Mark lại cùng HV/khoá → upsert (không nhân đôi).
