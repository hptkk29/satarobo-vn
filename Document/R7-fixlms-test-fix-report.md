# Báo cáo Test & Fix — branch `fixlms-r7bugs` → `origin/FixLMS`

> **Ngày:** 2026-06-20 · **Thực hiện:** Claude Code (terminal + Playwright + multi-agent) · **DB:** Supabase chung (gần rỗng) · **Server:** `http://localhost:3000`
> **Kết luận:** ✅ **GO** — đã test toàn luồng LMS, fix 3 nhóm vấn đề (G.6 portal · cách ly cơ sở 44 trang admin · revert BUG-005), verify đầy đủ (typecheck/lint/build/Playwright) và **push lên `origin/FixLMS`** (tip `97580bb`).
> Bản ghi thao tác chi tiết: [`R7-LMS-test-session-record.md`](R7-LMS-test-session-record.md).

---

## 1. Tóm tắt điều hành

| Hạng mục | Kết quả |
|---|---|
| Manual test toàn luồng LMS (9 bug R7 + Phase A–K) | **PASS** (chi tiết §3) |
| Fix #1 — G.6 portal học phí (khoản CONFIRMED + số dư) | ✅ Fixed + verify |
| Fix #2 — Cách ly cơ sở (scopedDb) **44 trang admin** | ✅ Fixed + verify (CS1 không thấy CS2, IDOR→404) |
| Fix #3 — Revert BUG-005 (guard convert) | ✅ Đúng spec R7-05-C2 |
| Verify trước push: typecheck · lint · `pnpm build` · Playwright | **PASS toàn bộ** |
| Push `fixlms-r7bugs` → `origin/FixLMS` (fast-forward) | ✅ `97580bb`, đồng bộ 0/0 |

**9 commit trên `origin/FixLMS`** (§6). Không sửa data thật; data test đặt prefix `__TEST__` (cleanup §7).

---

## 2. Phạm vi & môi trường

- **Phương pháp:** drive qua UI thật bằng Playwright (`tests/manual/`, config `playwright.manual.config.ts`) — login form thật + server action, sát production. Kết hợp đối chứng DB (read-only) + đọc source.
- **Tài khoản test tạo mới (additive, dễ dọn):**
  - `test-admin@example.com` / `Test@1234!` — SUPER_ADMIN + `UserOrgRole SUPER_ADMIN@HO` (id `cmqlm80st00017b5jfo53ajta`).
  - `test-cs1@example.com` / `Test@1234!` — CENTER_MANAGER + `UserOrgRole CENTER_MANAGER@CS1` (id `cmqlu0mxo0001o3iz2nblg8op`) — dùng kiểm cách ly cơ sở.
  - Tái dùng: `test-convert@example.com` (phụ huynh của Bé A & Bé B), `test-teacher@example.com`.
- **RBAC:** seed đủ **11 RoleDef** (trước chỉ có SUPER_ADMIN) — chạy qua `DIRECT_URL` (session pooler 5432) vì transaction pooler 6543 lỗi `prepared statement "s1"`.
- **Data nền:** lead CS2 `__TEST__ PH Convert` → 2 HV `__TEST__ Bé A` (CS2-26-K9J7X8) + `Bé B` (CS2-26-2F55FQ) trong lớp **CS2.SATA1.26.001** (Cơ sở Hoàng Diệu = CS2, khoá Sata1 1.485.000đ); Order `ORD-TEST-…` + nhiều Payment.

---

## 3. Kết quả Manual Test

### 3.1 Regression render (auth mới)
| Hạng mục | Kết quả |
|---|---|
| Sweep **37 route admin** (Phase A–J) bằng `test-admin@HO` | **37/37 PASS** (http 200, không redirect login, không error boundary) → không hồi quy RC-A/RC-B |
| Phase A/B/D/H/J test sâu | render **PASS** (charts dashboard 12/14/7/3/8; `/admin/classes/<id>/students` hiện Bé A/B; `/admin/compliance` có consent) |

### 3.2 Luồng nghiệp vụ trọng tâm
| Phase | Mục | Kết quả | Bằng chứng |
|---|---|---|---|
| **F.2** | Kế toán xác nhận khoản → sinh phiếu thu | **PASS** | `cmqksgj2o`→CONFIRMED, **1 receipt `RCP-SR-26-0001`**, SoD (recorder≠confirmer) đạt, idempotent (idempotencyKey), event `payment.confirmed` publish |
| **E** | Học bạ Bé A: criteria→draft→nộp duyệt→**phát hành**→portal | **PASS** | ReportCard PUBLISHED + snapshot (920c); portal `/portal/hoc-ba` hiện học bạ "Phát hành 2026-06-20" + 3 tiêu chí + nhận xét (R7-15) |
| **G** | Portal phụ huynh 7 route | **PASS render** | `/portal/{,/ho-so,/ho-so-con,/lich-hoc,/hoc-phi,/hoc-ba,/thong-bao}` đều 200, không lộ studentId URL |
| **G.6** | Học phí chỉ hiện khoản CONFIRMED | **đã FIX** (§4.1) | trước fix: hoc-phi không hiện khoản CONFIRMED |

### 3.3 FLAG (giới hạn automation / chờ mắt người — chưa khẳng định lỗi sản phẩm)
- Tạo **lead** qua UI: `lead-form` input bọc `Field` không có `<label for>`/`name` chuẩn → Playwright khó target (không phải lỗi với người dùng thật).
- Tạo **room** qua UI: `room-form.tsx:57-103` submit ở lại `/new` (nghi validation `code`/`orgUnitId`) — **cần soi mắt người**.
- **Paste/drag ảnh** news editor (BUG-007 phần thị giác) — chưa kiểm bằng mắt.
- Mã **receipt prefix `SR`** thay `CS2`: `payment.centerId` là id `Center` cũ, không map `OrgUnit.code` ("2 model center song song" Phase A) — không phải bug mới.

---

## 4. Phát hiện & Fix

### 4.1 Fix #1 — G.6: Portal học phí không hiển thị khoản đã xác nhận
- **Phát hiện:** `app/(portal)/portal/hoc-phi/page.tsx` chỉ gọi `getParentOrders` (lọc theo `Order.studentId`). Hàm `getParentConfirmedPayments` (R7-04, lọc `accountantStatus=CONFIRMED` + receipt) tồn tại nhưng **chưa được wire vào trang nào** → phụ huynh không thấy khoản kế toán đã xác nhận, số dư, phiếu thu.
- **Bản chất:** gap **có sẵn so với `main`** (`git diff main...HEAD` cho billing+hoc-phi = rỗng) — KHÔNG do branch fix R7. Thuộc tính bảo mật "PENDING không lộ cho PH" vẫn đúng.
- **Fix:** wire `getParentConfirmedPayments(session.user.id)` + thêm `getParentTuitionTotal`/`getParentBalance` vào `lib/portal/billing.ts`; render thẻ **Tổng học phí / Đã thanh toán / Còn lại** + section "Khoản đã thanh toán" (tên con · phương thức · ngày · *mã phiếu thu* · badge "Đã xác nhận").
- **Verify:** typecheck + lint PASS; UI (PARENT) hiện Tổng `2.970.000đ` / Đã trả `1.485.000đ` / Còn lại `1.485.000đ` + `RCP-SR-26-0001`; khoản PENDING vẫn ẩn.
- **Commit:** `1a6791b`.

### 4.2 Fix #2 — Cách ly cơ sở (scopedDb) lỗ hổng diện rộng
**Phát hiện gốc (I.3):** login `test-cs1` (CENTER_MANAGER@CS1) → `/admin/enrollments` hiển thị enrollment của CS2 (Bé A & Bé B). Trang dùng `db` trần (không `scopedDb`). Đối chiếu: `/admin/classes` và `/admin/payments` đã dùng `scopedDb` nên cách ly đúng → migration scopedDb mới làm dở.

**Bài học kỹ thuật quan trọng:** `scopedDb(actor)` chỉ auto-inject `centerId IN visible` cho model ∈ `SCOPED_MODELS`. Model **không có cột centerId** (Enrollment, ClassSession, Assignment, Exam, CourseCompletion, ParentRequest, LeadTransfer…) phải **scope thủ công qua quan hệ center** (`class.centerId` / `student.centerId`) bằng `getModelVisibleCenterIds("Class"|"Student", actor)`. `ReportCard`/`EvaluationRound` là `SCOPE_EXEMPT` (manual scope ở lib) — **giữ nguyên**.

**Quy mô fix — 44 trang admin:**
| Đợt | Số trang | Cách làm | Commit |
|---|---|---|---|
| enrollments (gốc) | 1 | scopedDb + scope `class.centerId` | `cb32e90` |
| Batch 1 (nghiệp vụ nhạy) | 12 | Workflow multi-agent | `20ba4ae` |
| Batch 2 (còn lại) | 31 | Workflow multi-agent (guarded) | `f767e7b` |

Trang batch 1: leads, students, trials, cham-soc-hv, hoc-bu, satacoin, notifications, khao-sat, ban-giao-lead, chuyen-lop, sessions, attendance.
Trang batch 2 (tiêu biểu): assignments(+new/[id]/edit), canh-bao-rui-ro, class-groups(+[id]/edit), classes/[id]/progress + new, crm, enrollments(new/[id]/edit), evaluations/results, exams(+new/builder), hoan-thanh-khoa, hoc-ba, holidays, leads/[id](+edit), marketing, nhan-su/[id]/schedule, parent-requests, rooms, sessions/[id]/edit + new, students/[id]/edit, teachers/[id].

**Độ phủ:** re-scan toàn bộ `app/(admin)/**/page.tsx` → mọi trang đọc data nghiệp vụ scoped đã cách ly (scopedDb / scope quan hệ / guard `canManageSessionClass` / self-scope `userId`). 3 trang còn `db.<scoped>` không qua wrapper đã kiểm tay đều AN TOÀN (`parent-requests` scope student.centerId, `sessions/[id]` guard redirect, `cham-cong/lich-ca` self-scope).

**Verify (đầy đủ):**
- typecheck + lint PASS; **render-smoke 37/37 route, BAD=0** (test-admin, không 500/crash).
- **CS1 mở record CS2 by id → HTTP 404** (IDOR chặn: leads/classes/sessions/students `[id]`); list (leads/students/sessions/hoc-ba) **không lộ** CS2.
- **SUPER_ADMIN guard:** vẫn truy cập đầy đủ (không over-restrict).

### 4.3 Fix #3 — Revert BUG-005 (guard convert lead)
- **Vấn đề:** BUG-005 (phiên trước) siết guard convert thành `accountantStatus=CONFIRMED`, mâu thuẫn spec R7-05-C2 ("KT chưa confirm vẫn pass") + deadlock (`confirmPayment` cần `enrollmentId` do convert tạo).
- **Fix:** khôi phục `hasRecordedPayment` theo `saleStatus=RECORDED` + cập nhật test.
- **Commit:** `72ebfcd`. (Đã verify guard 2 chiều trong phiên test 9-bug.)

---

## 5. Verify tổng hợp trước push

| Kiểm | Kết quả |
|---|---|
| `pnpm typecheck` (toàn tree) | **PASS** — 0 error |
| `pnpm lint` (file thay đổi) | **clean** |
| `pnpm build` (`prisma generate` + `next build`) | **PASS** — Compiled successfully · TypeScript no-error · **105/105 static pages** · không ELIFECYCLE |
| Playwright manual — sweep 37 route | **37/37 PASS** |
| Playwright manual — F.2 / E / G | **PASS** |
| Playwright manual — render-smoke (44 trang fix) | **37/37, BAD=0** |
| Playwright manual — cách ly CS1 (IDOR + list) | **chặn đúng** (404 / không lộ) |
| Playwright manual — SUPER_ADMIN guard | **không over-restrict** |

Specs: `tests/manual/{lms-r7-sweep,lms-r7-flows,lms-r7-eval,lms-r7-deep,g6-hoc-phi,i3-isolation,i3-admin-isolation,i3-batch2,admin-render-smoke}.spec.ts`.

---

## 6. Commit đã push (`origin/FixLMS`, tip `97580bb`)

```
97580bb docs(test): batch 2 cách ly admin + kết luận độ phủ (§9.3)
f767e7b fix(security): cách ly cơ sở 31 trang admin còn lại qua scopedDb (batch 2)
eff615e docs(test): ghi nhận batch fix cách ly 12 trang admin (§9.2)
20ba4ae fix(security): cách ly cơ sở 12 trang admin nghiệp vụ qua scopedDb
2106679 test(lms): manual Playwright specs + bản ghi phiên test toàn luồng LMS R7
cb32e90 fix(security): cách ly cơ sở /admin/enrollments qua scopedDb
1a6791b feat(portal): hiển thị khoản đã xác nhận + số dư ở /portal/hoc-phi (G.6)
72ebfcd fix(R7-05): revert BUG-005 — guard convert về saleStatus=RECORDED
0be3bd9 fix(R7): port 9 bug-fix R7 (RC-A/RC-B/BUG-005..009) lên FixLMS   (base)
```
Push fast-forward `f479dae..97580bb`; local ↔ `origin/FixLMS` đồng bộ (0/0).

---

## 7. Dữ liệu test cần dọn (sau khi xong)

- **Tài khoản:** `test-admin@example.com`, `test-cs1@example.com` (+ UserOrgRole tương ứng); `test-convert@…`, `test-teacher@…`.
- **RBAC:** 11 RoleDef đã seed (additive, idempotent — giữ hay xoá tuỳ).
- **Data `__TEST__`:** lead `cmqkflvjj…` + 2 LeadChild + 2 Student (Bé A/B) + 2 Enrollment + lớp `CS2.SATA1.26.001` + Order `ORD-TEST-…` + Payment (gồm `cmqksgj2o` CONFIRMED + Receipt `RCP-SR-26-0001`) + Session `__TEST__ Buổi 1` + 3 ReportCardCriterion + 1 ReportCard PUBLISHED.
- **`.env.local`:** cân nhắc gỡ `SCORM_ENABLED="true"` (giữ AUTH_SECRET).
- **Specs `tests/manual/*`** + screenshots: giữ (chạy lại regression) hoặc xoá.

---

## 8. Việc còn lại / khuyến nghị (không chặn push)

1. **Soi mắt người:** `/admin/bao-cao/*` (multi-agent đánh giá HO-global → xác nhận CENTER_MANAGER không thấy số liệu cơ sở khác); `room-form` submit; paste/drag ảnh news editor. *(còn TODO — chưa đụng phiên 2026-06-21)*
2. ✅ **Audit `_actions.ts` (mutation)** cho cách ly cơ sở — **đã chẩn đoán + fix 21 file (chưa commit)** ở phiên follow-up. Phát hiện cốt lõi: `scopedDb` không scope `update/delete/create`. → xem **§9 (WS-A)**. Còn **10 mục NEEDS-HUMAN** (lib-service / by-design) → backlog mới §9.6.
3. **Gap #1 (chưa quyết):** convert-v2 chưa có UI tạo Order gắn `leadId` trước convert (`order-create-form` set cứng `leadId:null`). *(còn TODO — phiên 2026-06-21 không xử lý)*
4. ✅ **DEFERRED — đã chẩn đoán** ở phiên follow-up: **K SCORM** = 2 rào hạ tầng (R2 CORS + dispatcher local), không phải bug code → **§9 (WS-C)**; receipt prefix `SR` = **bug thật, đã fix (chưa commit)** → **§9 (WS-B)**.

---

## 9. Phiên follow-up 2026-06-21 — 5 workstream (CHƯA commit/push)

> **Ngày:** 2026-06-21 · **Thực hiện:** Claude Code (5 agent song song WS-A…WS-E). Đào sâu các mục §8 còn lại sau khi batch isolation `page.tsx` đã push phiên trước.
> 🔴 **Trạng thái chốt:** **TẤT CẢ thay đổi code phiên này CHƯA commit, CHƯA push, `pnpm build` đang verify.** Chưa GO — chờ verify build + user duyệt. Tip `97580bb` (§6) là của phiên TRƯỚC, KHÔNG bao gồm thay đổi phiên này. Bản ghi thao tác chi tiết: [`R7-LMS-test-session-record.md`](R7-LMS-test-session-record.md) §10.

### 9.1 WS-A — Audit MUTATION (`_actions.ts`) cách ly cơ sở — ✅ đã fix (chưa commit)

**Phát hiện cốt lõi:** `scopedDb(actor)` **chỉ auto-scope READ** (`findMany`/`findUnique`), **KHÔNG scope `update`/`delete`/`create`/`updateMany`**. Mọi `db.<scopedModel>.update/delete({ where:{ id } })` theo id client = ghi cross-center chưa chặn (CS1 sửa/xoá record CS2). §9 phiên trước chỉ audit READ (`page.tsx`); đây là tầng GHI.

- **Quy mô:** quét **77 file** server-action `app/(admin)/**` → **fix 21 file**. Pattern: load `centerId` row qua scoped read + `passesScope("Model", row, actor)` (model SCOPED trực tiếp) hoặc `canManageClass`/`passesScope("Class"|"Student", { centerId }, actor)` (scope qua quan hệ) **trước khi ghi**. SUPER_ADMIN/HO giữ full access.
- **21 file:** khao-sat, notifications, rooms, holidays, canh-bao-rui-ro, satacoin, leads, trials, students, class-groups, classes, enrollments, sessions, assignments, exams, media, parent-requests, parent-feedback, nhan-su + **2 RBAC gap**: `crm/messenger/actions.ts` (`replyAction` trước **không có gate** → thêm `can(…, "leads:edit")`), `crm/commission/actions.ts` (`reopenStatementAction` thiếu `can()` → thêm `can(…, "payments:manage")`).
- **Verify:** typecheck PASS · lint PASS (1 warning pre-existing `class-form.tsx`). **Chưa build, chưa commit.**

### 9.2 WS-B — Receipt prefix `SR` → ✅ BUG THẬT, đã fix (chưa commit)

- **Root cause:** `lib/finance/payment.ts` `centerCodeOf` tra `orgUnit.findUnique({ where:{ id: centerId } })` nhưng `centerId` = `Payment.centerId` = `Center.id` (model cũ) **≠ `OrgUnit.id`** → null → fallback `"SR"`. (Gốc của FLAG "2 model center" §3.3 / receipt `RCP-SR-26-0001`.)
- **Fix:** `findUnique({ where:{ centerId }, select:{ code:true } })` dùng `OrgUnit.centerId @unique` → `RCP-CS2-26-0001`. Không đổi schema/migration; chỉ ảnh hưởng receipt MỚI (counter key tách `receipt:CS2:YY`); giữ fallback SR. typecheck + lint PASS. **Chưa commit.**
- **Khuyến nghị:** seed-check `OrgUnit.centerId` khi mở cơ sở mới.

### 9.3 WS-C — SCORM upload: không phải bug code, 2 rào hạ tầng/vận hành

- **Luồng:** client presigned PUT (`scorm/_actions.ts createScormPackage`) → browser XHR PUT trực tiếp R2 → `confirmUpload` publish DomainEvent `scorm.uploaded` → dispatcher `onScormUploaded` (`lib/events/handlers/scorm-ingest.ts`) JSZip giải nén → R2.
- **Root cause xếp hạng:** **(b) R2 thiếu CORS cho browser PUT** — rào 1, khả dĩ nhất (đường browser→R2 trực tiếp DUY NHẤT; upload ảnh khác đi server-proxy nên bucket chưa từng có CORS; preflight fail → "Lỗi mạng khi upload"). **(c) Dispatcher không chạy local** — rào 2 (chỉ qua Vercel Cron `/api/cron/dispatch-events`; local phải curl thủ công Bearer `CRON_SECRET`; prod tự chạy mỗi phút). (a) thiếu file zip = tiền đề, không phải bug.
- Đã tạo `scripts/r2-cors.json` (mẫu CORS, origins `localhost:3000` + `admin.satarobo.vn`) — **CHƯA apply** (thủ công qua `aws s3api put-bucket-cors` / CF dashboard). Dead code: `app/api/admin/scorm/{presign,confirm}/route.ts` (client không gọi + lệch field) → dọn sau.
- **Kết luận:** SCORM **chạy được trên prod**; chỉ kẹt dev local.

### 9.4 WS-D — C.4 / C.5: by-design, không phải bug

- **C.5** (form buổi thiếu GV/phòng): by-design — GV/phòng kế thừa từ Class (override `actualTeacherId`/Room + `substitute*`); form buổi lẻ chỉ nhận `classId`/`date`/`topic`/`lesson`/`notes`. Conflict detection ở **luồng lớp**: `lib/classes/adjust.ts → detectSessionConflicts`; `lib/classes/generate.ts → detectBatchConflicts`. Tech-debt track: cột `ClassSession.roomId` (`LMS-problems-fix-plan.md:68`).
- **C.4** (capacity học bù): logic ĐÃ đúng ở `lib/makeup/service.ts` (`suggest` lọc buổi đầy :170-171; `scheduleMakeup` re-check FULL trong transaction :247-249). Chỉ thiếu **dữ liệu seed** buổi đích đầy để chạm nhánh FULL.
- **Đề xuất:** 2 e2e test (conflict luồng lớp; makeup FULL branch). **Không sửa code.**

### 9.5 WS-E — Dọn data test — ✅ xong

- DRY-RUN → XOÁ → VERIFY. Xoá: 4 User test + 2 UserOrgRole + Lead/2 LeadChild + 2 Student + 2 Enrollment + Class `CS2.SATA1.26.001` + Session/Attendance/MakeupNeed + Order `ORD-TEST`/5 Payment/Receipt `RCP-SR-26-0001` + ReportCard/3 Score/3 Criterion + 1 DomainEvent.
- **Verify:** 10/10 nhóm marker = 0. **GIỮ 11 RoleDef** (RBAC v2). Đối chứng data thật: User 25→21, Student 8→6, Lead 37→36, Order 3→2, Class 9→8.
- `.env.local SCORM_ENABLED="true"` **GIỮ NGUYÊN** (chờ user quyết). `scripts/cleanup-test-data.ts` untracked, **chưa `git add`**.

### 9.6 Backlog mới phát sinh

1. **Audit mutation NEEDS-HUMAN (10 mục)** — cần xác nhận nội bộ lib-service hoặc cross-center by-design: `ban-giao-lead`(lib/lead-handover), `chuyen-lop`(lib/transfer), `hoc-bu`(completeMakeup/cancelMakeup không truyền actor→lib/makeup), `hoan-thanh-khoa`(markCourseCompletion single chưa scope), `leads`(closeLeadAsEnrolled/transferLead chỉ guard assignedToId), `inventory`(audit/items/movements theo centerId client; recordTransfer cross-center by-design), `cham-cong`(checklist-co-so/duyet-ca chỉ giới hạn CENTER_MANAGER), 🔴 `centers/_actions.ts`(CENTER_MANAGER sửa/xoá Center bất kỳ qua id — governance gap, nên SUPER_ADMIN-only), `convert-conflicts`(student.updateMany theo parentId), `evaluations`(lib/eval/rounds, EvaluationRound SCOPE_EXEMPT).
2. **Audit `_actions.ts` cho lib-service layer** — các action ủy thác xuống `lib/*` chưa truyền `actor`/chưa scope; cần kiểm tầng service (ngoài tầng action) để bịt cross-center.
3. **Apply CORS R2** (`scripts/r2-cors.json`) cho SCORM dev local + dọn dead route `api/admin/scorm/{presign,confirm}`.
4. **2 e2e test** WS-D (conflict luồng lớp; makeup FULL branch).
