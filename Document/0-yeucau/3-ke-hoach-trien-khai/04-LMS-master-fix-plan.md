# 04 — LMS MASTER FIX PLAN (hợp nhất 3 tài liệu)

**Vai trò:** Bản kế hoạch **CHỐT, hợp nhất** — gộp `03-ke-hoach-fix-LMS-ERD-alignment.md` (ERD-alignment) + `LMS-problems-fix-plan.md` (LMS-1..18) + `LMS-usecase-catalog.md` (evidence). **Bản này thắng** khi xung đột.
**Quan hệ tài liệu:**
- 🔁 **Thay thế** `03-…` (đã hấp thụ toàn bộ vào W0–W2).
- 🔗 **Tham chiếu chi tiết kỹ thuật** từng lỗi: `LMS-problems-fix-plan.md` (giữ làm phụ lục — đã sửa stale LMS-7).
- 🔗 **Evidence/use-case** (file:line): `LMS-usecase-catalog.md` (đã sửa verdict A3).

**Nhánh thực thi:** `full-R7` (sau merge `main`). **KHÔNG** `migrate deploy` lên Supabase. **Ngày:** 2026-06-18.
**Truy vết chung:** Doc 15 §2 (RBAC/scopedDb) · §atomic-vs-event · phase R7-04/05/07/08 · erd-fix-p0 (FIX-C1..H7) · Test T2/T4/T6/T9.

---

## A. KẾT QUẢ ĐỐI CHIẾU 3 BẢN (chồng chéo · stale · thiếu sót)

### A.1 Chồng chéo đã khử
| Trùng | 03 | problems-plan | Xử lý trong bản này |
|---|---|---|---|
| State-machine guard | **FIX-2** (session) + **FIX-3** (enrollment) | **LMS-7** ("tạo status.ts") | Gộp thành **W2-1**. erd-fix đã *tạo* guards → việc còn lại = **nới guard offline + nối call-site chưa guard** (KHÔNG tạo mới). |
| completeSession | FIX-2 (state-machine) | **LMS-3** (owner-check) | **Khác mối lo, cùng file** → tách 2 việc, làm chung 1 PR có phối hợp: LMS-3=owner (W1), FIX-2=guard (W2). |

### A.2 Stale đã sửa (lỗi factual khi đối chiếu code thật)
1. **LMS-7 "Tạo `lib/enrollments/status.ts` + `lib/sessions/status.ts`"** → **SAI sau merge**: erd-fix-p0 (commit `1d9da7a`) đã tạo 2 file (xác nhận: chưa có trên `full-R7`, **đến cùng merge `main`**). Việc thật còn lại nhỏ hơn nhiều (nới + nối 2 site).
2. **Catalog A3 = `✅` adjustPayment** → **bỏ sót**: `adjustPayment` thiếu chặn `amount ≤ 0` (CHECK `payment_amount_nonzero` mới sẽ throw thô). Hạ verdict A3 → **⚠️ PARTIAL**.
3. **Catalog/problems-plan không biết erd-fix** (audit trên `full-R7` pre-merge) → thiếu lớp ERD: soft-delete, RESTRICT, partial-unique, CHECK, timestamptz, RLS.

### A.3 Thiếu sót đã bổ sung (có trong 03, vắng ở 2 bản kia)
- **W0 — MERGE `main→full-R7`** (prereq tuyệt đối; 2 bản kia không nhắc đến phân kỳ nhánh/ERD).
- **FIX-1 — soft-delete rò rỉ qua nested `include`/`_count`** (6 chỗ; chỉ xuất hiện **sau** merge).
- **FIX-4 — `adjustPayment` ≤0** (gắn CHECK constraint mới).
- **Hợp nhất 2 lớp lệch:** sau W0, `full-R7` có **cả** ERD mới **lẫn** fix LMS P0–P3 (`getParentBilling`, advisory-lock học bù, `payment.rejected`, audit hợp nhất) vốn chỉ có ở `full-R7`.

### A.4 Thiếu sót còn lại của bản 03 (đã khắc phục ở đây)
- 03 **quá hẹp** (chỉ 4 fix ERD), bỏ qua **L0 bảo mật scope (LMS-1..4)** — vốn **🔴 ưu tiên cao hơn** FIX-1. Bản này **sắp lại ưu tiên đúng**.

---

## B. BACKLOG HỢP NHẤT THEO WAVE (ưu tiên đã sắp lại)

> Thứ tự bắt buộc: **W0 → W1 → W2 → W3 → W4**. Mỗi mục = 1 PR + test; verify chuẩn repo `pnpm typecheck && lint && build` + e2e liên quan.

### 🔗 W0 — MERGE `main → full-R7` (PREREQ)
**Mục tiêu:** hợp nhất ERD mới + fix LMS P0–P3 về 1 nhánh; mở khoá toàn bộ wave sau.
- **Đã verify (thăm dò, reversible):** `schema.prisma` auto-merge **sạch & đúng** (đủ R7 + erd-fix markers); chỉ **2 conflict**: `enrollments/_actions.ts`, `sessions/[id]/_actions.ts`.
- **AC1:** Giải 2 conflict **additive** — giữ **CẢ** guard H4 (erd-fix) **LẪN** audit/tx của R7 (5397839); không mất hunk nào.
- **AC2:** Sau merge, grep schema còn đủ: R7 models + `deletedAt`×17 + `onDelete: Restrict`×10 + `@@index([studentId,classId])` + `@@unique` cũ = 0.
- **AC3:** `typecheck && build` xanh trước khi commit merge.
- **Risk:** tiền lệ `cc3c493` mất field R7 → **grep markers bắt buộc** trước commit. Migration erd-fix về dạng **file** (không apply).

### 🔴 W1 — AN TOÀN DỮ LIỆU & PHÂN QUYỀN (ngay sau merge)
*Cross-tenant exposure/modification = nghiêm trọng nhất. FIX-1 chỉ tồn tại sau merge.*

**W1-1 · LMS-1 Điểm danh không scope** 🔴 — `attendance/_actions.ts:33-41` dùng `requireTeacherOrAdmin()` role-only.
- AC: GV A **không** điểm danh được lớp của GV B; admin/manager theo `scopedDb`. Mẫu: `canManageSessionClass` (`sessions/[id]/_actions.ts:23`). *(chi tiết: problems-plan §LMS-1)*

**W1-2 · LMS-2 Chấm điểm không scope** 🔴 — `assignments/_actions.ts:385,695`, `exams/_actions.ts:510,604`.
- AC: GV chỉ chấm submission/attempt thuộc lớp mình (`teacherId|assistantId`) hoặc có `report-cards:review`.

**W1-3 · LMS-3 `completeSessionAction` thiếu owner-check** 🔴 — `classes/[id]/session/_actions.ts:33` thiếu, trong khi sibling `assignSessionHomeworkAction:116` đã có `actor.assignedClassIds.has(classId)`.
- AC: chỉ GV phụ trách lớp hoàn tất được buổi.

**W1-4 · LMS-4 Sửa câu hỏi không check `authorId`** 🔴 — `questions/_actions.ts:121,195`.
- AC: GV chỉ sửa/xóa câu hỏi `authorId === me` (trừ `training:manage`).

**W1-5 · FIX-1 Soft-delete rò rỉ qua nested (post-merge)** 🟠→**HIGH**
- **US-LMS-W1** · Là **QTV/kế toán**, tôi muốn **mọi nơi đếm/hiển thị Enrollment & Receipt loại bản ghi đã xóa mềm** để **sĩ số/công suất/chứng từ đúng thực tế**.
- **Gốc:** hook `lib/db.ts` chỉ lọc top-level; nested `include`/`_count` KHÔNG lọc (`lib/soft-delete.ts:5`).
- **AC1 (sĩ số):** Enrollment `deletedAt!=null` **không** tính vào công suất lớp (không cho vượt `maxCapacity`).
- **AC2 (chứng từ):** confirm/reject Payment chỉ trả Receipt còn sống.
- **AC3:** không phá "Thùng rác" (override bằng `deletedAt` tường minh vẫn chạy).
- **Điểm sửa (6):** `lib/finance/payment.ts:101,182` · `classes/page.tsx:141` · `leads/actions.ts:469` · `leads/[id]/page.tsx:129` · `trial-classes/page.tsx:43` · `dashboard/_components/teacher-dashboard.tsx:20`.
- Test T2/T6: e2e capacity + payment.

> **Đòn bẩy W1 (LMS-18, kéo lên cân nhắc sớm):** đưa `ClassSession/Attendance/Enrollment` vào `SCOPED_MODELS` để auto-scope thay vì nhớ chain thủ công — **chặn** cần FK `centerId`/scope qua `class` → xem **W2-6**. Nếu làm trước thì W1-1..3 nhẹ đi.

### 🟠 W2 — ĐÚNG ĐẮN NGHIỆP VỤ + ĐỒNG BỘ ERD
**W2-1 · State-machine guard (gộp FIX-2 + FIX-3 + LMS-7 refined)** 🟠
- **Bối cảnh (đã sửa stale):** sau W0 guards `lib/{sessions,enrollments}/status.ts` **đã tồn tại**. 2 phiên bản hoàn tất buổi là **flag-gated** (`SESSION_LIFECYCLE_V2`), **không va chạm runtime** → đây là **đồng bộ chuẩn**, không phải data-bug.
- **US-LMS-W2a (buổi offline):** GV bấm "Hoàn tất" ngay từ `SCHEDULED` (offline không có pha "đang diễn ra").
  - AC1: thêm `SCHEDULED→COMPLETED` vào `SESSION_TRANSITIONS`; `session-lifecycle.completeSession` gọi `canCompleteSession()` (giữ `classifySessionForComplete` cho CANCELLED-chặn/idempotent).
  - AC2: `CANCELLED`→chặn; `COMPLETED`→idempotent (không phát lại `session.taught`).
  - AC3: Đường A (flag OFF) **không đổi UX** (UI vẫn start→complete).
- **US-LMS-W2b (enrollment):** mọi set `Enrollment.status` đi qua `canTransition`.
  - AC1: chặn transition phi lý (vd COMPLETED→PENDING) trước khi ghi DB.
  - Điểm sửa: `lib/lms/assign.ts:140`, `students/_actions.ts:555` (+ sửa comment lỗi thời `assign.ts:166`). `enrollments/_actions.ts:526` đã đúng.
- **TBD-1:** xác nhận hướng "nới guard" (vs ép R7 qua IN_PROGRESS) — **owner: user** — hạn: trước khi code W2-1.

**W2-2 · FIX-4 `adjustPayment` chặn `amount ≤ 0`** 🟠 (sửa verdict catalog A3)
- AC: `amount ≤ 0` → `fail("Số tiền điều chỉnh phải lớn hơn 0")` không chạm DB; `record/refundPayment` không đổi. Điểm sửa: `lib/finance/payment.ts:257-258`.

**W2-3 · LMS-5 Hết giờ thi không chặn lúc submit** 🔴 — `portal/bai-thi/actions.ts:159` `submitAttempt` không re-check deadline.
- AC: submit sau deadline → từ chối/auto-finalize.

**W2-4 · LMS-6 Chống trùng lịch coded nhưng không nối** 🔴 — `lib/lms/scheduling.ts:16` chỉ test gọi.
- AC: tạo/sửa lớp + `adjustSession` + sinh session gọi `detectScheduleConflict`; trùng GV/phòng → cảnh báo/chặn. (Cần thêm `ClassSession.roomId` cho conflict theo buổi — **schema change, hoãn tới khi ERD chốt**.)

**W2-5 · LMS-8 Field/state chết** 🟡 — `Exam.maxAttempts` (→ dùng ở W4 retake hoặc xóa), `AttemptStatus.REVIEWED`, `AssignmentKind` (gắn logic hoặc ghi rõ chỉ-là-nhãn). `schema.prisma:2193,2171,2343`.

**W2-6 · LMS-18 Auto-scope model LMS** 🟠 (enabler cho W1) — đưa `ClassSession/Attendance/Enrollment` vào `SCOPED_MODELS` sau khi có FK `centerId`/scope qua `class`. **Chặn:** cần schema/backfill → **hoãn phần schema tới khi ERD chốt**; phần code wrapper làm trước được.

### 🟠 W3 — LUỒNG TIỀN & LIFECYCLE CÒN THIẾU
- **W3-1 · LMS-9 Hoàn tiền theo lifecycle** 🟠 — `computeRefund` + `RefundRequest` nối withdraw/transfer/cancel; prorate buổi chưa học. (TBD-2 prorate policy — owner: kế toán/CM.) *(problems-plan §LMS-9)*
- **W3-2 · LMS-10 Hủy cả lớp cascade** 🟠 — `cancelClassAction` (tx): lớp→CANCELLED, mỗi enrollment ACTIVE→bulk-transfer/WITHDREW + refund (W3-1) + notify PH; hủy session tương lai. `classes/_actions.ts:364`.
- **W3-3 · LMS-11 Bảo lưu tự hết hạn** 🟠 — cron `reserve-expiry` quét quá `expectedEndAt`. `lib/students/reserve-service.ts` + `app/api/cron/`.

### 🟡 W4 — HOÀN THIỆN TÍNH NĂNG
LMS-12 thi lại (`@@unique([examId,studentId,attemptNo])`) · LMS-13 học bạ gộp bài-tập+kỹ-năng · LMS-14 SCORM scoring (runtime API + `ScormAttempt`) · LMS-15 nhắn 2 chiều (`Comment`+`comment.added`) · LMS-16 báo cáo bổ sung chiều · LMS-17 đánh giá kỹ năng theo buổi + mở UI GV. *(đa số cần schema change → hoãn tới khi ERD chốt; chi tiết problems-plan §LMS-12..17)*

---

## C. NGUYÊN TẮC SẮP XẾP & RÀNG BUỘC

1. **Schema change bị đóng băng** tới khi ERD chốt (guardrail). Các mục cần cột/bảng mới (W2-4 roomId, W2-6 centerId, W4 retake/SCORM/comment/skill) → **chỉ làm phần code-only trước**, phần schema chờ ERD.
2. **W0 trước hết** — không wave nào chạy trước merge (FIX-1/guards/CHECK đều đến từ merge).
3. **W1 (🔴 bảo mật) trước W2-4** — rò/sửa chéo cơ sở nguy hiểm hơn.
4. Mỗi mục: **AC đo được → map Vitest/Playwright (T1–T12)**; PR rời; verify xanh.

## D. RỦI RO & GUARDRAILS (đã soi)
- Merge mất field R7 → grep markers bắt buộc (W0-AC2).
- Nới guard session phá Đường A → AC3 (UI không đổi).
- Vá soft-delete phá "Thùng rác" → override `deletedAt` tường minh.
- Scope W1 dùng `scopedDb`/owner-check, **không hardcode center** (qua `class`/OrgUnit).
- Tiền/enrollment giữ **transaction**; thông báo/sync đi **DomainEvent idempotent**; external call qua `modules/integration`.
- Không đưa lại scope đã loại (video LMS, student-login…). SCORM scoring (W4-14) = runtime SCORM chuẩn, **không** phải video LMS.

## E. TBD (owner + hạn)
1. **Hướng W2-1** (nới guard vs ép IN_PROGRESS) — **user** — trước W2.
2. **Prorate hoàn tiền** (W3-1) — **kế toán/CM** — trước W3.
3. **Apply migration R7+erd-fix lên Supabase** — **user/ops** — sau khi ERD chốt (ngoài phạm vi plan).
4. **Mở khoá schema-change** (roomId/centerId/retake/SCORM/comment) — **user** — sau khi ERD chốt.

## F. Checklist thực thi
- [ ] **W0** merge + giải 2 conflict + verify markers
- [ ] **W1** LMS-1 điểm danh · LMS-2 chấm điểm · LMS-3 completeSession owner · LMS-4 question authorId · **FIX-1 soft-delete nested (6)**
- [ ] **W2** state-machine (FIX-2+3/LMS-7) · **FIX-4 adjustPayment** · LMS-5 exam timer · LMS-6 conflict wiring · LMS-8 field chết · LMS-18 auto-scope (code-only)
- [ ] **W3** LMS-9 refund · LMS-10 cancel-class · LMS-11 reserve-expiry
- [ ] **W4** LMS-12..17 (phần code-only; schema chờ ERD)
