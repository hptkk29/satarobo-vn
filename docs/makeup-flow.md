# Học bù (MakeupNeed) — Cụm B1

Quản lý nhu cầu học bù khi học viên vắng. Tái dùng báo vắng (ParentRequest ABSENCE) + `Attendance.makeupStatus`.

## Model

`MakeupNeed` (studentId, classId, centerId, missedSessionId, missedLessonId, status
PENDING/SCHEDULED/COMPLETED/CANCELLED, makeupSessionId?, note). `@@unique([studentId, missedSessionId])` → idempotent.

## Service (`lib/makeup/service.ts`)

- `createMakeupNeed` — tạo (idempotent) PENDING từ buổi đã lỡ.
- `suggestMakeupSessions(needId, actor)` — gợi ý theo **6 tiêu chí**: cùng khoá + cùng lesson đã lỡ +
  không vượt tiến độ (lesson order ≤ mốc) + chưa diễn ra + **còn sức chứa** + **không trùng lịch HV**.
  Sort `[isHomeCenter desc, date asc]` (cơ sở nhà trước → lịch gần nhất).
- `scheduleMakeup({ needId, makeupSessionId, actor, ... })` — re-check sức chứa trong transaction
  (chống giành chỗ cuối) → SCHEDULED.
- `completeMakeup` — COMPLETED + đồng bộ `Attendance.makeupStatus = MADE_UP` (đếm số buổi đúng).
- `cancelMakeup`.

## R7-08 — Học bù LIÊN CƠ SỞ (QĐ-O2)

- Mặc định cho phép bù **liên cơ sở** (setting `makeup.crossCenterEnabled`, default true; tắt → quay về
  lọc cùng cơ sở — 1 dòng filter). Ưu tiên cơ sở nhà của HS, rồi tới buổi gần nhất.
- Đọc CHÉO cơ sở đi qua `withMakeupException(actor)` trong `lib/db-scope.ts` — whitelist HẸP
  (`Class`, `ClassSession`, `Lesson`, `MakeupNeed`). Mọi model khác (Lead/Order/Student/Payment...)
  **vẫn cách ly cơ sở** — exception là function-scoped, không rò sang query khác (AC6).
- Bù chéo cơ sở (`makeupClass.centerId ≠ centerId nhà của HS`) → ghi `AuditLog` action
  `MAKEUP_CROSS_CENTER` `{studentId, fromCenterId, toCenterId, sessionId, approvedById}`, `reason = requestId`.
- GV cơ sở đích thấy HS bù trong ĐÚNG buổi đó (badge "Học bù từ &lt;CS&gt;" ở trang điểm danh),
  KHÔNG lộ hồ sơ đầy đủ HS cơ sở khác (T5 hẹp).

## Chỉ số & nhãn (R7-08)

- `lib/attendance/summary.ts` — 5 chỉ số `{ total, attended (gồm đã-bù), absent, needMakeup, madeUp }`;
  buổi bù KHÔNG tăng `total`; buổi CANCELLED không tính vắng. Hiển thị ở portal `/lich-hoc` + dashboard.
- `lib/labels.ts` `attendanceLabel(status, makeupStatus, sessionStatus)` — 6 nhãn: Có mặt · Đi muộn ·
  Vắng có phép · Vắng không phép · Chờ học bù · Đã học bù; buổi CANCELLED → "Buổi học bị hủy".

## Tự sinh nhu cầu bù

- Điểm danh chọn **"Cần học bù"** (NEEDS_MAKEUP) → `markAttendance` tạo MakeupNeed.
- Tư vấn xử lý báo vắng chọn **"Xếp học bù"** → `resolveAbsence` tạo MakeupNeed.

## UI

- Admin `/hoc-bu` (gate `parent-requests:manage`, center scope): list PENDING/SCHEDULED → gợi ý → xếp → đánh dấu đã bù.
- Portal `/yeu-cau`: khu "Trạng thái học bù" của con (chỉ con đang chọn).

## Test (ZZTEST_, không đụng data thật)

1. Đánh vắng + "Cần học bù" → MakeupNeed PENDING.
2. /hoc-bu → "Gợi ý buổi bù" (đúng khoá/lesson, không vượt tiến độ) → chọn → SCHEDULED.
3. "Đánh dấu đã bù" → COMPLETED + Attendance.makeupStatus=MADE_UP → số buổi đã học tăng đúng.
4. Phụ huynh /yeu-cau thấy trạng thái bù.
