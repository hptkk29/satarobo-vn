# FL-R2 — Tickets runnable (bung từ plan FL-R2 + BA #08)

> Mỗi mục dưới là **1 prompt structured** chạy được. Thứ tự: W0 → W1 → W2 → W3 → W4 → W5 (làm trọn theo module — QĐ-R2-4).
> Quy ước chung mọi ticket (DoD): `pnpm typecheck && pnpm lint && pnpm build` PASS · test T-cột xanh · không bare-`db` cho SCOPED_MODELS · mutation nhạy cảm ghi AuditLog · 2-phase (không drop cột ngay) · server action mở đầu `auth()`+`assertCan()` · smoke 375px nếu có UI.
> **3 TBD đã chốt:** GV không kiêm nhiệm cơ sở · "Chờ quyết định" trigger ngay khi đủ buổi · xoá hẳn `/course-packages`.

---

# Prompt W0 — Nền (spine + migration + ops)

> **Project:** satarobo-vn · **Phase:** FL-R2 / Wave-0 · **Risk:** 🔴 HIGH (schema + RBAC + 1 migration nền) · **Prerequisites:** nhánh `fl-integration`, FL vòng 1 DONE.

## 🎯 MỤC TIÊU
Đặt nền cho mọi wave: **1 migration additive duy nhất** + dọn spine files (sidebar, permissions, db-scope) + bật SCORM + seed test. Làn feature sau **chỉ đọc** 4 file spine.

## 📦 SCOPE — 5 NHIỆM VỤ
1. **R2-W0-DB** — 1 migration additive gộp:
   - `TrialClassV2.startDate` → **nullable** (chuẩn bị slot tái sử dụng; KHÔNG drop); thêm `sessionCount` nhập-khi-tạo (đã có, xác nhận).
   - Model mới **`LeadTrialHistory`** (xem §1).
   - Kanban thêm trạng thái `TRIAL_IN_PROGRESS` vào logic `lib/leads/status.ts` `KANBAN_COLUMNS`.
   - `Order.courseId String?` (FK Course) + **backfill từ packageId→course** (2-phase; chưa drop `packageId`).
   - Liên kết homework template theo buổi (xem §1 — `HomeworkTemplate` hoặc dùng `Assignment.lessonId`).
2. **R2-W0-PERM** — `lib/auth/permissions.ts`: cấp `teaching-materials:view-own-class` cho TEACHER; giữ LMS authoring ở SUPER_ADMIN+TRAINING.
3. **R2-W0-NAV** — `components/admin/sidebar.tsx`: **xoá** Buổi học · Điểm danh · Ảnh lớp học · Học bù · Khoá dạy · Tài liệu giảng dạy · SCORM (tab); **đổi** "Gói bán"→"Khoá học".
4. **R2-W0-SCORM** (Ops, không code) — set `SCORM_ENABLED=true` trên Vercel + redeploy; verify R2 CORS + viewer mở được.
5. **R2-W0-SEED** — seed GV test cho CS1/CS2 + script `backfill-teacher-center.ts` (set `User.centerId` cho mọi GV); seed sẵn 1 `EvalForm` scope `SESSION_EVAL` + round mở (cho trial + lớp dùng ngay).

## 1️⃣ Schema/data changes
```prisma
model LeadTrialHistory {
  id              String   @id @default(cuid())
  leadChildId     String
  trialClassId    String
  centerId        String        // scopedDb
  attendedCount   Int      @default(0)
  totalSessions   Int
  firstAttendedAt DateTime?
  lastAttendedAt  DateTime?
  outcome         String?       // ENROLLED | LOST | PENDING (rule-based)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  @@index([leadChildId])
  @@index([trialClassId])
}
// Order: thêm courseId (2-phase, giữ packageId tới khi LM-1 drop)
model Order { /* ... */ courseId String? /* FK Course */ }
// TrialClassV2.startDate -> DateTime?  (nullable, KHÔNG drop)
// Homework template: ưu tiên dùng Assignment.lessonId làm "bank theo buổi";
//   nếu cần tách: model HomeworkTemplate { lessonId, examId, @@unique([lessonId,examId]) }
```
- Thêm `LeadTrialHistory`, `Order.courseId`, `TrialClassV2` startDate nullable vào **SCOPED_MODELS** check (`lib/db-scope.ts`) nếu model mới có centerId.

## ✅ ACCEPTANCE CRITERIA
- [ ] `pnpm db:migrate --name fl_r2_foundation` apply trên test DB; backfill `Order.courseId` + `User.centerId` = 100%.
- [ ] typecheck/lint/build PASS sau khi đổi spine.
- [ ] Sidebar không còn 7 mục đã xoá; "Khoá học" hiện thay "Gói bán" (route tạm trỏ `/courses`).
- [ ] SCORM viewer mở được trên prod (flag ON).

## 🚫 KHÔNG LÀM
- ❌ Drop `packageId`, drop `startDate` (để 2-phase).
- ❌ Sửa logic feature trong wave này (chỉ nền).
- ❌ Tạo 2 migration song song.

---

# Prompt W1 — E2-LEAD (item 1, 2)

> **Phase:** FL-R2 / Wave-1 · **Risk:** 🟡 MED (điều tra runtime + UI tiền) · **Prerequisites:** Gate-0.

## 🎯 MỤC TIÊU
Trang lead & chốt đơn tự cập nhật không cần F5; hiển thị **trạng thái thanh toán dễ hiểu** (đã nộp / tổng phải thu / còn thiếu) thay cho note kỹ thuật.

## 📦 SCOPE
1. **R2-LEAD-1** — **Điều tra trước**: vì sao phải F5 dù `revalidatePath` đủ (HMR dev vs prod build? client component giữ state? path `/leads/[id]` dynamic?). Ghi root-cause rồi vá (bổ sung `router.refresh()`/`revalidateTag` nơi thiếu). KHÔNG báo PASS chỉ vì "đã có revalidatePath".
2. **R2-LEAD-2** — Helper `lib/payments/summary.ts` `getLeadPaymentSummary(leadId)` (qua scopedDb): `paid` (Σ Payment RECORDED), `total` (Σ finalPrice/Order), `remaining`. Khối "Thanh toán" ở **chi tiết lead** + trang convert.
3. **R2-LEAD-3** — Viết lại copy convert sang ngôn ngữ nghiệp vụ; bỏ mã `PAYMENT_REQUIRED`/`R7-04`/`REGISTERED` khỏi UI.

## 3️⃣ UI
- Card "Thanh toán": 3 dòng tiền VND + badge "Đủ điều kiện chốt" / "Chưa đủ — cần ghi nhận thanh toán" / "Đủ điều kiện (miễn phí)".

## ✅ ACCEPTANCE CRITERIA
- [ ] Đổi trạng thái/ghi chú/chuyển lead → UI cập nhật ≤1s **không F5** (kèm note root-cause).
- [ ] Chi tiết lead + convert hiện đã nộp/tổng/còn thiếu đúng số.
- [ ] Không còn chuỗi mã kỹ thuật trên UI.
- [ ] T-LEAD test xanh.

## 🚫 KHÔNG LÀM
- ❌ Đổi guard `evaluatePaymentGuard` logic (chỉ đổi cách hiển thị).

---

# Prompt W2 — E2-ORDER (item 3)

> **Phase:** FL-R2 / Wave-2 · **Risk:** 🟢 LOW · **Prerequisites:** Gate-0.

## 🎯 MỤC TIÊU
Dropdown khoá học trong đơn chỉ liệt kê **khoá dạy thật** (Sata 1–8, Combo); mọi dropdown hiện tiếng Việt.

## 📦 SCOPE
1. **R2-ORDER-1** — `orders/_actions.ts:646` thêm `isTeachable:true` vào query Course.
2. **R2-ORDER-2** — Kiểm DB `PaymentMethod.name`: nếu = mã (CASH…) → sửa seed/data. Nếu cần nhãn loại: `lib/payments/labels.ts` `PAYMENT_METHOD_TYPE_LABEL`.
3. **R2-ORDER-3** — Refactor form dùng `ORDER_TYPE_LABEL`/`ORDER_STATUS_LABEL` (DRY).

## ✅ ACCEPTANCE CRITERIA
- [ ] Loại đơn = Khoá học → dropdown **không** hiện "Lập trình Robot"/"Luyện thi RoboSim".
- [ ] Phương thức TT/loại đơn/trạng thái/trung tâm hiện tiếng Việt.
- [ ] T-ORDER xanh.

## 🚫 KHÔNG LÀM
- ❌ Đụng model Course/Package (để W5).

---

# Prompt W3 — E2-TRIAL (item 4, 5, 6, 7) · QĐ-R2-1

> **Phase:** FL-R2 / Wave-3 · **Risk:** 🔴 HIGH (redesign model + auto-Kanban) · **Prerequisites:** Gate-0 (startDate nullable, LeadTrialHistory, Kanban col, EvalForm seed).

## 🎯 MỤC TIÊU
Lớp trải nghiệm = **slot tái sử dụng**; gán/search học viên trong trang lớp; auto-Kanban theo điểm danh; lưu lịch sử học thử; nhận xét theo phiếu SESSION_EVAL.

## 📦 SCOPE
1. **R2-TRIAL-1** — Form tạo: **bỏ field ngày bắt đầu**, **số buổi cấu hình tại đây**; tạo buổi ad-hoc (không auto weekly); CRUD thêm/sửa/xoá lớp. (Giữ data cũ — startDate nullable.)
2. **R2-TRIAL-2** — Repro item 4 → gán/huỷ HV **trong chi tiết lớp trải nghiệm** (tái dùng `enrollLeadChild` + thêm `unenrollLeadChild`).
3. **R2-TRIAL-3** — Search/lọc lead học thử ở trang chính; **ẩn lead đã rời pipeline** (ENROLLED/LOST) khỏi list active; ghi `LeadTrialHistory` khi điểm danh.
4. **R2-TRIAL-4** — Note "Đã học thử (ngày…)" trên lead/Kanban từ history; giữ khi lead quay lại.
5. **R2-TRIAL-5** — Auto-Kanban: điểm danh buổi đầu → "Đang học thử" (`TRIAL_IN_PROGRESS`); đủ buổi → "Đã học thử" (`TRIAL_ATTENDED`).
6. **R2-TRIAL-6** — **Ngay khi `attendedCount ≥ totalSessions`** & chưa ENROLLED → set `AWAITING_DECISION` (rule-based, event idempotent). (TBD-2 đã chốt.)
7. **R2-TRIAL-7** — Xoá form nhận xét cũ; nút **"Nhận xét học viên"** mở `SessionEvalEditor` (EvalForm SESSION_EVAL — giống `Phiếu đánh giá buổi học.pdf`).
8. **R2-TRIAL-8** — Search HV trong chi tiết lớp → click HV → điểm danh + đánh giá GV của HV (KHÔNG lộ `studentId` trên URL).

## 1️⃣ Data
- `LeadTrialHistory` (đã tạo W0): cập nhật `attendedCount/firstAttendedAt/lastAttendedAt/outcome` trong action điểm danh + đổi trạng thái lead.

## ✅ ACCEPTANCE CRITERIA
- [ ] Form tạo lớp trải nghiệm không có ngày bắt đầu, có số buổi; CRUD đủ.
- [ ] Gán/huỷ HV trong chi tiết lớp chạy; search lead OK.
- [ ] Điểm danh buổi đầu/đủ buổi đổi Kanban đúng; đủ buổi chưa ĐK → "Chờ quyết định" ngay.
- [ ] Lead rời pipeline biến mất khỏi list nhưng còn history + note thời gian.
- [ ] Nút nhận xét mở phiếu SESSION_EVAL; form cũ đã gỡ.
- [ ] T-TRIAL, T-EVAL xanh; cách ly CS scopedDb.

## 🚫 KHÔNG LÀM
- ❌ Drop `startDate`/data trial cũ.
- ❌ Build form-builder mới (tái dùng EvalForm).

---

# Prompt W4 — E2-RBAC + E2-CLASS (item 17, 8, 9, 10)

> **Phase:** FL-R2 / Wave-4 · **Risk:** 🔴 HIGH (cách ly cơ sở + trang chi tiết lớp + tự sinh điểm danh) · **Prerequisites:** Gate-0 (backfill `User.centerId`), SCORM bật.

## 🎯 MỤC TIÊU
GV được lọc theo cơ sở khi tạo lớp; trang chi tiết lớp **gộp** buổi/điểm danh/ảnh/học bù/tài liệu SCORM; tự sinh điểm danh sau tạo lớp.

## 📦 SCOPE — Làn RBAC (chạy trước)
1. **R2-RBAC-1** — Verify backfill `User.centerId` GV 100% (script W0).
2. **R2-RBAC-2** — `getAssignableTeachers({ centerId, includeIds })` lọc `User.centerId = centerId`. (TBD-1: **không** kiêm nhiệm → lọc thuần.)
3. **R2-RBAC-3** — Form tạo lớp truyền `centerId` lớp → dropdown chỉ GV cùng cơ sở.

## 📦 SCOPE — Làn CLASS (sau RBAC)
4. **R2-CLASS-1** — `classes/[id]/page.tsx` đa tab: Thông tin · Buổi+Điểm danh · Ảnh · Học bù · (GV) Tài liệu SCORM. Di chuyển UI từ 4 trang rời vào.
5. **R2-CLASS-2** — `lib/classes/generate.ts`: sau tạo lớp + gán HV → **tự sinh ClassSession theo lịch + Attendance (PENDING)**; transaction; idempotent.
6. **R2-CLASS-3** — Verify QL xem hết lớp CS mình / GV chỉ lớp mình dạy.
7. **R2-CLASS-4** — Gộp ô thông tin header chi tiết lớp gọn (1 card).
8. **R2-CLASS-5** — GV mở/present SCORM tài liệu giảng dạy của buổi trong lớp.
9. **R2-CLASS-6** — Điểm danh **học bù + ngày học bù** trong chi tiết lớp (tái dùng makeup-service).
10. **R2-CLASS-7** — Sau điểm danh: upload ảnh (consent C6.2) + đánh giá per-HV (SESSION_EVAL) mỗi buổi.

## ✅ ACCEPTANCE CRITERIA
- [ ] Tạo lớp CS1 → dropdown GV **không** hiện GV CS2 (test cách ly).
- [ ] Tạo lớp + gán HV → buổi + điểm danh tự sinh; chi tiết lớp gộp đủ tab.
- [ ] GV mở được SCORM; điểm danh học bù ghi ngày; ảnh + eval per-HV chạy.
- [ ] T-CLASS, T-RBAC xanh.

## 🚫 KHÔNG LÀM
- ❌ Logic kiêm nhiệm GV (đã chốt không có).
- ❌ Xoá route cũ buổi/điểm danh trước khi chi tiết lớp ổn (giữ tới khi verify; sidebar đã ẩn ở W0).

---

# Prompt W5 — E2-LMS (item 11, 12, 13, 14, 15, 16) · QĐ-R2-2/3

> **Phase:** FL-R2 / Wave-5 · **Risk:** 🔴 HIGH NHẤT (gộp Course/Package đụng Order/Payment) · **Prerequisites:** Gate-0 (Order.courseId backfill), SCORM bật, W4 (tự sinh buổi cho homework auto).

## 🎯 MỤC TIÊU
Một khái niệm **"Khoá học"** (gộp Course + Package); sửa buổi giáo trình gắn SCORM + bài tập; bài tập tự add theo buổi khi tạo lớp.

## 📦 SCOPE
1. **R2-LMS-1** — Gộp DB: chuyển code đọc Order/Payment sang `Order.courseId` (backfill xong W0) → **xoá hẳn** `/course-packages` (route + tab, TBD-3) → deprecate `packageId` (2-phase, drop ở PR sau khi prod ổn 2-3 ngày). 1 màn "Khoá học" quản lý Course + giá.
2. **R2-LMS-2** — Rà mọi dropdown "khoá học" lọc `isTeachable=true`.
3. **R2-LMS-3** — Nâng `LessonResources` (curriculum edit buổi) từ read-only → **editor**: upload/gắn `ScormPackage.lessonId` (1 active/buổi) + picker bài tập về nhà.
4. **R2-LMS-4** — Homework template theo buổi/khoá (dùng `Assignment.lessonId` hoặc `HomeworkTemplate`); móc vào R2-CLASS-2: tạo lớp+khung CT → tự sinh `HomeworkAssignment` theo buổi.
5. **R2-LMS-5** — Cấp `teaching-materials:view-own-class` GV → sửa 404 "Tài liệu lớp tôi".

## ✅ ACCEPTANCE CRITERIA
- [ ] Sidebar còn **1 tab "Khoá học"**; `/course-packages` 404/gỡ; "Khoá dạy" gỡ.
- [ ] Đơn hàng cũ trỏ đúng khoá học sau migrate (rollback test).
- [ ] Sửa buổi giáo trình upload SCORM + chọn bài tập; GV view SCORM trong lớp.
- [ ] Tạo lớp + khung CT → bài tập tự add theo buổi.
- [ ] "Tài liệu lớp tôi" không còn 404.
- [ ] T-LMS, T-RBAC xanh.

## 🚫 KHÔNG LÀM
- ❌ Drop `packageId` ngay (2-phase — PR drop riêng sau khi ổn prod).
- ❌ Đổi schema SCORM (đã đủ).

---

## 📝 GIT — quy ước commit mỗi wave
```
feat(FL-R2-W<n>/<epic>): <summary>

- <task id> ...
Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
```
