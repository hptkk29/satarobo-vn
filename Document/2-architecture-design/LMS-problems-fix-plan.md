# LMS — Problems & Fix Plan

> Các vấn đề LMS phát hiện khi soi code thật (đối chiếu `luong-LMS.md` + [`LMS-usecase-catalog.md`](./LMS-usecase-catalog.md)). Mỗi mục: **mã · vấn đề · nguyên nhân · hướng fix · file:line · verify**.
> Ưu tiên: 🔴 Critical (bảo mật/toàn vẹn) · 🟠 High (đúng đắn/nghiệp vụ) · 🟡 Medium (đầy đủ tính năng). Snapshot 2026-06-18.

## Lộ trình

| Đợt | Mục tiêu | Lỗi |
|---|---|---|
| **L0 — Vá phân quyền** | Chặn rò/sửa chéo | LMS-1..4 |
| **L1 — Đúng đắn** | Chặn lách + bật guard có sẵn | LMS-5..8 |
| **L2 — Luồng tiền/lifecycle thiếu** | Hoàn tiền, hủy lớp, bảo lưu | LMS-9..11 |
| **L3 — Hoàn thiện tính năng** | Thi lại, học bạ, SCORM, comms, report | LMS-12..17 |

---

# 🔴 L0 — Vá phân quyền (làm trước)

## LMS-1 · Điểm danh không scope 🔴
**Vấn đề:** bất kỳ `TEACHER` nào sửa/xóa điểm danh của **mọi lớp toàn hệ thống**.
**Nguyên nhân:** `requireTeacherOrAdmin()` chỉ check role, không lọc lớp/cơ sở/owner.
**Fix:** thêm owner-scope (mẫu `canManageSessionClass` ở `sessions/[id]/_actions.ts:23`): TEACHER chỉ thao tác session thuộc `class.teacherId|assistantId = me`; admin/manager theo `scopedDb`.
**File:** `app/(admin)/admin/attendance/_actions.ts:33-41` (+ page selector `attendance/page.tsx:33`).
**Verify:** GV A không điểm danh được lớp của GV B (test e2e ownership).

## LMS-2 · Chấm điểm không scope 🔴
**Vấn đề:** GV chấm bài tập/thi của lớp bất kỳ.
**Fix:** mọi grade action thêm predicate `submission/attempt → class → teacherId|assistantId = me` (hoặc `report-cards:review`). Cân nhắc nâng `can(actor, action, target)` (RBAC v2) để truyền target.
**File:** `assignments/_actions.ts:385,695`, `exams/_actions.ts:510,604`.
**Verify:** GV không chấm được submission ngoài lớp mình.

## LMS-3 · `completeSession` R7 thiếu owner-check 🔴
**Vấn đề:** GV cùng cơ sở hoàn tất buổi của lớp khác (action sibling đã có check, action này thiếu).
**Fix:** thêm `actor.assignedClassIds.has(classId)` như `classes/[id]/session/_actions.ts:110-113` (homework action) vào `completeSessionAction`.
**File:** `classes/[id]/session/_actions.ts:49`.
**Verify:** chỉ GV phụ trách hoàn tất được buổi.

## LMS-4 · Sửa câu hỏi không check `authorId` 🔴
**Vấn đề:** GV sửa/xóa câu hỏi của GV khác (comment `permissions.ts:408` hứa "enforced separately" nhưng không có).
**Fix:** `updateQuestion`/`deleteQuestion` so `authorId === me` (trừ `training:manage`).
**File:** `questions/_actions.ts:121,195`.
**Verify:** GV chỉ sửa câu hỏi của mình.

> **Đòn bẩy chung L0:** cân nhắc đưa `ClassSession`/`Attendance`/`Enrollment` vào `SCOPED_MODELS` (`lib/db-scope.ts:11`) để auto-scope thay vì nhớ chain `classId IN scopedClassIds` thủ công (xem LMS-18). Vướng: các model này chưa có `centerId` → cần FK/scope qua `class`.

---

# 🟠 L1 — Đúng đắn

## LMS-5 · Hết giờ thi không chặn lúc submit 🔴
**Vấn đề:** `submitAttempt` không re-check deadline → nộp trễ vẫn nhận (chỉ `saveAnswer` check).
**Fix:** thêm check `now ≤ deadline` (hoặc grace) đầu `submitAttempt`; quá hạn → auto-submit/clamp.
**File:** `app/(portal)/portal/bai-thi/actions.ts:159`.
**Verify:** submit sau deadline bị từ chối/auto-finalize.

## LMS-6 · Chống trùng lịch coded nhưng không nối 🔴
**Vấn đề:** `detectScheduleConflict` chỉ được test gọi → xếp 1 GV 2 lớp trùng giờ / 2 lớp 1 phòng không bị chặn.
**Fix:** gọi `detectScheduleConflict` trong write-path tạo/sửa lớp + `adjustSession` + sinh session; conflict → cảnh báo/chặn. Bổ sung `ClassSession.roomId` để conflict phòng theo buổi (hiện chỉ `actualRoomId`).
**File:** `lib/lms/scheduling.ts:16`, `lib/classes/{generate,adjust}.ts`, `sessions/_actions.ts:60`.
**Verify:** tạo lớp trùng GV/phòng bị báo conflict.

## LMS-7 · State machine Enrollment/Session không guard 🟠
Trùng ERD **FIX-H4**. Tạo `lib/enrollments/status.ts` + `lib/sessions/status.ts`; chặn nhảy phi lý (CANCELLED→ACTIVE, mở lại buổi COMPLETED).

## LMS-8 · Field/state chết 🟡
- `Exam.maxAttempts` không đọc ở đâu → hoặc **xài** (LMS-12) hoặc xóa.
- `AttemptStatus.REVIEWED` không code nào set → thêm flow review hoặc bỏ.
- `AssignmentKind` CLASSWORK/HOMEWORK không drive logic → gắn logic (vd homework mới auto-giao) hoặc ghi rõ chỉ-là-nhãn.
**File:** `schema.prisma:2193,2171,2343`.

---

# 🟠 L2 — Luồng tiền & lifecycle còn thiếu

## LMS-9 · Hoàn tiền theo lifecycle (rút/chuyển/hủy) 🟠
**Vấn đề:** `refundPayment` là bút toán thủ công, **không nối** withdraw/transfer/cancel; **không prorate** buổi chưa học (TBD-2, "out of scope R7-04").
**Fix:** thêm `computeRefund(enrollment)` = `Σ confirmed − (buổi đã học × đơn giá)` (hoặc policy cơ sở); tạo `RefundRequest` workflow (đề xuất→duyệt→ghi sổ) nối từ `withdrawStudentAction`/transfer khác phí/hủy lớp.
**File:** `lib/finance/payment.ts:347`, `students/_actions.ts:578`, `lib/transfer/service.ts`.
**Verify:** rút giữa khóa → đề xuất hoàn đúng số buổi còn lại.

## LMS-10 · Hủy cả lớp = ngõ cụt 🟠
**Vấn đề:** `deleteClass` chỉ soft-delete, bỏ mặc enrollment/session/payment con → orphan; không có flow `ClassStatus.CANCELLED`.
**Fix:** `cancelClassAction` (tx): set lớp CANCELLED → với mỗi enrollment ACTIVE: đề nghị bulk-transfer hoặc WITHDREW + trigger refund (LMS-9) + notify PH; hủy session tương lai.
**File:** `classes/_actions.ts:364`.
**Verify:** hủy lớp → enrollment được xử lý, PH nhận thông báo, không còn orphan STUDYING.

## LMS-11 · Bảo lưu không tự hết hạn 🟠
**Vấn đề:** `expectedEndAt` có nhưng không cron auto-resume/cảnh báo.
**Fix:** cron `reserve-expiry` quét reserve quá `expectedEndAt` → cảnh báo staff / auto-resume theo policy. (Gộp với cron retention nếu muốn.)
**File:** `lib/students/reserve-service.ts`, `app/api/cron/`.
**Verify:** reserve quá hạn → tạo task/notify.

---

# 🟡 L3 — Hoàn thiện tính năng LMS

## LMS-12 · Thi lại / nhiều lần 🟡
**Vấn đề:** `@@unique([examId, studentId])` + guard `startAttempt` chặn cứng; `maxAttempts` chết.
**Fix:** đổi unique → `@@unique([examId, studentId, attemptNo])`; `startAttempt` cho phép tới `maxAttempts`; báo cáo lấy điểm cao nhất/lần cuối theo policy.
**File:** `schema.prisma:2257`, `portal/bai-thi/actions.ts:86`.

## LMS-13 · Học bạ tổng hợp thiếu 🟡
**Vấn đề:** ReportCard chỉ gộp điểm danh + điểm thi; **bỏ điểm bài tập + kỹ năng robot**.
**Fix:** `lib/lms/report-card.ts` gộp thêm `AssignmentSubmission` (avg/đạt) + `StudentSkillAssessment` (level) vào metrics + snapshot.
**File:** `lib/lms/report-card.ts:23`.

## LMS-14 · SCORM ghi điểm/hoàn thành 🟡
**Vấn đề:** chỉ log mở (`ScormAccessLog`), **không runtime API** → không ghi điểm/completion về HV.
**Fix:** thêm SCORM runtime (`LMSInitialize/SetValue cmi.core.score/LMSCommit/Finish`) + model `ScormAttempt(score, completion, suspendData)`; nối vào tiến độ/học bạ.
**File:** `lib/scorm/*`, `app/api/scorm/*`.

## LMS-15 · Nhắn 2 chiều PH↔GV 🟡
**Vấn đề:** không có; `ParentRequest`/`Feedback` chỉ 1 lượt trả lời.
**Fix:** model `Comment`/`MessageThread` (entity=enrollment/student) + event `comment.added` (đã khai báo handler nhưng chưa có nguồn) + UI thread ở portal & admin.
**File:** mới `lib/comments/*`, portal + admin.

## LMS-16 · Báo cáo thiếu chiều 🟡
**Vấn đề:** thiếu hiệu-suất-GV, cohort tiến độ, doanh-thu-vs-mục-tiêu, churn/drop-off; retention thô.
**Fix:** thêm module report tương ứng (pure formula + Vitest, mẫu `lib/reports/*`); thêm `Target/KPI` config cho doanh-thu-vs-mục-tiêu.
**File:** `lib/reports/`, `trung-tam.ts:191`.

## LMS-17 · Đánh giá kỹ năng theo buổi + UI cho GV 🟡
**Vấn đề:** `StudentSkillAssessment` per-student, không gắn buổi/lesson; UI **disable cho GV**.
**Fix:** thêm `classSessionId?`/`lessonId?` vào assessment; mở quyền GV phụ trách ở `students/[id]/edit/page.tsx:100` (đã có backend `canAssessStudent`).
**File:** `schema.prisma` (StudentSkillAssessment), `students/[id]/edit/page.tsx:100`.

## LMS-18 · Auto-scope model LMS (giảm rò thủ công) 🟠
**Vấn đề:** `ClassSession/Attendance/Enrollment` không trong `SCOPED_MODELS` → reader trần rò chéo cơ sở; isolation dựa vào nhớ chain `classId IN scopedClassIds`.
**Fix:** sau khi có FK/scope (qua `class.centerId`/`orgUnitId`), đưa vào auto-scope; hoặc thêm wrapper bắt buộc.
**File:** `lib/db-scope.ts:11`.

---

# Checklist

- [ ] L0 LMS-1 điểm danh scope · LMS-2 chấm điểm scope · LMS-3 completeSession owner · LMS-4 question authorId
- [ ] L1 LMS-5 exam timer · LMS-6 conflict wiring · LMS-7 state machine · LMS-8 field chết
- [ ] L2 LMS-9 refund lifecycle · LMS-10 cancel class cascade · LMS-11 reserve expiry
- [ ] L3 LMS-12 retake · LMS-13 report-card aggregate · LMS-14 SCORM scoring · LMS-15 2-way comms · LMS-16 reports · LMS-17 skill-per-session · LMS-18 auto-scope

> Mỗi mục = 1 PR + test (unit guard/logic + e2e flow). L0 ưu tiên tuyệt đối (bảo mật). Verify chuẩn repo: `pnpm typecheck && lint && build` + e2e liên quan xanh.
