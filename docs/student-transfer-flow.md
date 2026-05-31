# Chuyển lớp / chuyển cơ sở (Cụm C1)

## Model (additive, migration `20260601070000_student_transfer`)

- `StudentTransferRequest` (studentId, fromClassId/fromCenterId, toClassId/toCenterId,
  status `TransferRequestStatus` PENDING/APPROVED/REJECTED/WAITLISTED/CANCELLED, reason, note,
  requestedById, decidedById/decidedAt).
- `StudentCenterHistory` (studentId, centerId, fromDate, toDate?, reason) — giữ lịch sử cơ sở cũ.

## Quy tắc (`lib/transfer/service.ts`)

- Lớp đích **cùng khoá** với lớp hiện tại.
- **KHÔNG cho vượt buổi**: tiến độ lớp đích (`coveredLessons` = số bài đã dạy) **≤** tiến độ
  học viên hiện tại → tránh bỏ lỡ bài.
- **Hết chỗ** (`maxStudents` − enrollment đang học ≤ 0) → tự đưa vào **WAITLISTED** thay vì lỗi.
- `findEligibleTargetClasses` lọc ứng viên + chỗ trống; `createTransferRequest` tạo PENDING/WAITLISTED.

## Duyệt (`approveTransfer`, transaction)

1. Enrollment cũ → `TRANSFERRED` (endedAt, transferReason).
2. Tạo enrollment mới ở lớp đích (`STUDYING`).
3. Nếu đổi cơ sở: đóng `StudentCenterHistory` đang mở (toDate) + mở dòng mới + cập nhật `Student.centerId`.
4. Request → `APPROVED`. Ghi `logStudentAudit`.

## UI

- Admin `/admin/chuyen-lop` (gate `enrollments:transfer` = SUPER_ADMIN/CENTER_MANAGER, center scope):
  form chọn HV → lớp hiện tại → cơ sở đích (tuỳ chọn) → tìm lớp phù hợp → tạo yêu cầu;
  bảng yêu cầu chờ + duyệt/từ chối (waitlist chỉ từ chối được).

## Test (ZZTEST_)

1. HV `ZZTEST_*` đang học lớp A (khoá X, đã dạy 5 bài).
2. Tìm lớp đích: chỉ hiện lớp khoá X có ≤5 bài; lớp dạy 7 bài bị loại (vượt buổi).
3. Lớp đích còn chỗ → PENDING → Duyệt → enrollment cũ TRANSFERRED, enrollment mới STUDYING,
   nếu khác cơ sở thì centerId đổi + 2 dòng StudentCenterHistory.
4. Lớp đích hết chỗ / không có lớp → WAITLISTED.
