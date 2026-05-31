# Học bù (MakeupNeed) — Cụm B1

Quản lý nhu cầu học bù khi học viên vắng. Tái dùng báo vắng (ParentRequest ABSENCE) + `Attendance.makeupStatus`.

## Model

`MakeupNeed` (studentId, classId, centerId, missedSessionId, missedLessonId, status
PENDING/SCHEDULED/COMPLETED/CANCELLED, makeupSessionId?, note). `@@unique([studentId, missedSessionId])` → idempotent.

## Service (`lib/makeup/service.ts`)

- `createMakeupNeed` — tạo (idempotent) PENDING từ buổi đã lỡ.
- `suggestMakeupSessions` — gợi ý buổi bù: **CÙNG khoá** + **cùng lesson** đã lỡ, **không vượt tiến độ**
  (lesson order ≤ mốc đã lỡ), buổi tương lai.
- `scheduleMakeup` — gắn `makeupSessionId` → SCHEDULED.
- `completeMakeup` — COMPLETED + đồng bộ `Attendance.makeupStatus = MADE_UP` (đếm số buổi đúng).
- `cancelMakeup`.

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
