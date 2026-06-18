# LMS — Problems & Fix Plan

> Các vấn đề LMS phát hiện khi soi code thật (đối chiếu `luong-LMS.md` + [`LMS-usecase-catalog.md`](./LMS-usecase-catalog.md)). Mỗi mục: **mã · vấn đề · nguyên nhân · hướng fix · file:line · verify**.
> Ưu tiên: 🔴 Critical (bảo mật/toàn vẹn) · 🟠 High (đúng đắn/nghiệp vụ) · 🟡 Medium (đầy đủ tính năng). Snapshot 2026-06-18.

> 🔄 **RE-SYNC 2026-06-18 (đối chiếu lại code nhánh `FixLMS`):** snapshot đầu under-count — nhiều mục đã vá. Trạng thái đúng hiện tại:
> - ✅ **LMS-3 DONE** — `completeSessionAction` đã có `resolveActor`+`resolveSessionScope` (cách ly theo **cơ sở**). ⚠️ còn hở nhẹ: chưa chặn GV **cùng cơ sở lớp khác** ở cấp lớp (sibling `assignSessionHomeworkAction` có `assignedClassIds.has(classId)`, action này chưa) → gom vào L0.
> - ✅ **LMS-7 DONE** — `lib/enrollments/status.ts` + `lib/sessions/status.ts` đã tồn tại & **nối write-path** (`enrollments/_actions.ts:526`, `sessions/[id]/_actions.ts:227,243`) + test.
> - ⚠️ **LMS-8 PARTIAL** (đúng mô tả: field/state vẫn chết). **LMS-16 PARTIAL** (4 module report có, 4 chiều còn thiếu). **LMS-17 PARTIAL** — backend `canAssessStudent` ĐÃ mở cho GV; còn lại = UI gate (`edit/page.tsx:100`) + gắn-buổi (`classSessionId?`).
> - **Nền ERD đã làm phần lớn:** C1 RLS · C2 timestamptz · C3 finance onDelete-restrict + soft-delete · C4 TOCTOU (`runSerializable`) · C5 order-code race · H7 check-constraints — **đã có migration** (`prisma/migrations/20260617000000`→`...040000`). LMS-7/H4 state-machine xong.
> - **Nền còn OPEN:** **Money type (H5/H6/COL2)** (4 cột Float tiền + tổng tiền Int, chưa BigInt/Decimal, chưa serialize layer) · **RBAC v2** (`can.ts` có nhưng flag default **OFF**, chạy shadow, 240 file vẫn dùng `permissions.ts` cũ) · **auto-scope LMS-18** (thiếu `centerId` trên Enrollment/ClassSession/Attendance) · **compliance C6/C7** (retention/erasure NĐ13 + PITR — hoàn toàn thiếu).
> - **OPEN đúng như mô tả ban đầu:** LMS-1, LMS-2, LMS-4, LMS-5, LMS-6, LMS-9, LMS-10, LMS-11, LMS-12, LMS-13, LMS-14, LMS-15, LMS-18.
> - ⚠️ Sửa lệch nhỏ: LMS-15 — KHÔNG có handler `comment.added` nào trong `lib/events/` (claim cũ ghi "đã khai báo handler" là sai).

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

## LMS-3 · `completeSession` R7 thiếu owner-check ✅ DONE (còn hở cấp-lớp)
**Trạng thái (re-sync 2026-06-18):** ĐÃ vá phần lớn — `completeSessionAction` gọi `resolveActor` + `resolveSessionScope` (`classes/[id]/session/_actions.ts:53-55`); `resolveSessionScope:16-30` dùng `scopedDb(actor)` + `passesScope("Class", {centerId}, actor)` → chặn GV **cơ sở khác**.
**Còn hở:** chưa chặn GV **cùng cơ sở nhưng lớp khác** (chỉ chặn bởi `can(user,"sessions:edit")`). Sibling `assignSessionHomeworkAction` (cùng file, `:105-113`) chặt hơn nhờ `assignedClassIds.has(sc.classId)`.
**Fix còn lại:** thêm `assignedClassIds.has(sc.classId)` cho TEACHER vào `completeSessionAction` (gom vào L0 cùng LMS-1/2/4).
**File:** `classes/[id]/session/_actions.ts:49`.
**Verify:** GV cùng cơ sở không hoàn tất được buổi của lớp không phụ trách.

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

## LMS-7 · State machine Enrollment/Session không guard ✅ DONE
**Trạng thái (re-sync 2026-06-18):** ĐÃ làm. Trùng ERD **FIX-H4**. `lib/enrollments/status.ts` (`canTransition`) nối `enrollments/_actions.ts:526` (CANCELLED→ACTIVE block, COMPLETED terminal → `INVALID_TRANSITION`); `lib/sessions/status.ts` (`canStartSession`/`canCompleteSession`) nối `sessions/[id]/_actions.ts:227,243` (chặn mở lại buổi COMPLETED → `INVALID_SESSION_STATE`) + UI gating + test `status.test.ts`.

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

## LMS-14 · SCORM ghi điểm/hoàn thành 🟡 — ✅ DONE (un-defer 2026-06-18)
**Trạng thái:** ĐÃ làm. `ScormAttempt` model + runtime `window.API`/`API_1484_11` (SCORM 1.2+2004) trong `components/admin/scorm-player.tsx` buffer cmi → POST `/api/scorm/runtime` (auth = launchTicket HMAC) ghi `scoreRaw/lessonStatus/completion/suspendData`. Migration `20260618060000`. (Player hiện admin/GV; portal player cho HV = follow-up nếu cần.)

<details><summary>Mô tả gap cũ (đã đóng)</summary>
**Vấn đề:** chỉ log mở (`ScormAccessLog`), **không runtime API** → không ghi điểm/completion về HV.
**Quyết định DEFER (P4):** player SCORM hiện CHỈ ở `app/(admin)/admin/scorm/play/[id]` — admin/GV quản lý/xem, **KHÔNG có lối vào cho học viên**. Học online của HV → **SataWorld** (Doc 15 §0: "không build video LMS"). Vì vậy "ghi điểm về HV" chưa có flow để gắn; xây runtime per-student lúc này = xây cho luồng chưa tồn tại + nghịch scope. **Mở lại khi** quyết định cho HV làm SCORM tự host.
**File:** `lib/scorm/*`, `app/api/scorm/*`.
</details>

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

> ✅ **HOÀN TẤT 2026-06-18 (nhánh `FixLMS`)** — toàn bộ kế hoạch L0–L3 + nền đã làm & verify (typecheck+lint+631 unit test+build PASS). Chi tiết migrate/rollout: [`lms-fix-rollout.md`](./lms-fix-rollout.md).

- [x] L0 LMS-1 điểm danh scope · LMS-2 chấm điểm scope · LMS-3 completeSession owner (cấp-lớp) · LMS-4 question authorId
- [x] L1 LMS-5 exam timer · LMS-6 conflict wiring · LMS-7 state machine · LMS-8 field chết (maxAttempts dùng; REVIEWED/Kind ghi rõ)
- [x] L2 LMS-9 refund lifecycle (prorate) · LMS-10 cancel class cascade · LMS-11 reserve expiry cron
- [x] L3 LMS-12 retake · LMS-13 report-card aggregate · ⏸️ LMS-14 SCORM (DEFER, có lý do) · LMS-15 2-way comms · LMS-16 reports + KPI · LMS-17 skill (UI GV + cột buổi) · ⏭️ LMS-18 auto-scope (defer — relation-scope đủ)
- **NỀN (ERD):** [x] C1 RLS · [x] C2 timestamptz · [x] C3 finance restrict · [x] C4 TOCTOU · [x] C5 order-code · [x] H7 check-constraint · [x] **Money type (Float→Int VND)** · [x] **RBAC (owner-scope per-action, v2 giữ shadow)** · [x] **compliance C6 (erasure/portability/retention) + C7 (runbook PITR)**.
- ⏳ **Việc của bạn:** apply các migration `2026061700*`→`2026061805*` lên Supabase prod (xem rollout doc).

> Mỗi mục = 1 PR + test (unit guard/logic + e2e flow). L0 ưu tiên tuyệt đối (bảo mật). Verify chuẩn repo: `pnpm typecheck && lint && build` + e2e liên quan xanh.
