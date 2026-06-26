# Phase FL — FixLMS (vá sau test tay R7) · **Kế hoạch thực thi MULTI-AGENT**

> **Nguồn yêu cầu:** BA #07 (`2-ba-phan-tich/07-gap-analysis-fixlms-testday.md`) — 19 nhóm phát hiện test tay + 6 quyết định QĐ-T1…T6 (TGĐ 24/06/2026) · phiếu `Phiếu đánh giá buổi học.html` · checklist `Document/4-test/`.
> **Quy trình:** [00-quy-trinh-thuc-hien.md](00-quy-trinh-thuc-hien.md) — vòng đời TODO→DOING→TEST_WRITTEN→TEST_PASS→REVIEW→DONE, DoD 10 mục, test T1–T12. Mỗi task sửa BE **bắt buộc kèm FE + DB** cùng PR (item 19).
> **Cách chạy:** **đa agent song song theo LÀN (lane), CHẬM MÀ CHẮC** — mỗi agent 1 git worktree riêng (cách ly), mỗi làn sở hữu thư mục/ file RỜI NHAU (không đụng file của làn khác), có **cổng kiểm tra + merge tuần tự** sau mỗi đợt (wave). Ưu tiên ĐÚNG hơn NHANH.
> **Ưu tiên TGĐ:** FL1 LMS → FL2 Lead → FL3 RBAC → FL4 Eval (3→2→1→4). **FL0 (leak P0) đã DONE** trước (bảo mật).
> **Trạng thái:** 🟢 **CODE-COMPLETE (24/06/2026)** — toàn bộ FL0→FL4 đã code + verify (mọi Gate: tsc + eslint + **vitest 770/770** + build 105 trang xanh), commit nhánh `fl-integration` (21 commit). E2e spec đã viết (chưa chạy — cần test DB). **CHƯA deploy** — xem checklist §10.

---

## 10. CHECKLIST TRƯỚC KHI DEPLOY (việc còn lại, KHÔNG phải code feature)

| # | Việc | Lý do | Ai |
|---|---|---|---|
| D1 | **Deploy migration** `20260624000000_fl_foundation` lên Supabase (`prisma migrate deploy`) | Mới ở file + client; DB thật chưa có cột/role mới | Owner xác nhận |
| D2 | **FL3-02 deploy-gate:** verify `Enrollment.centerId`+`ClassSession.centerId` backfill 100% + e2e cách ly CS1≠CS2 trên test DB | centerId null sẽ bị scopedDb ẩn nhầm record (mất data UI) | Dev + test DB |
| D3 | **Gán role `TRAINING`** cho user phụ trách Đào tạo (data) | Không gán → trang LMS authoring chỉ SUPER_ADMIN vào được | Owner |
| D4 | **Chạy e2e `tests/e2e/fl/`** (12 spec) trên Postgres local + seed | Hiện skeleton/`fixme` — cần test DB | Dev |
| D5 | Dọn dead-code: `closeLeadAsEnrolled`, `close-deal-button.tsx`, `getLeadCloseDealOptions` | Không còn import sau khi gỡ popup | PR cleanup |
| D6 | Dựng trang **Payroll** rồi gắn menu `payroll:view` cho kế toán | Có quyền nhưng thiếu route | Backlog |
| D7 | (tuỳ chọn) flip **Attendance** vào SCOPED_MODELS + gỡ allowlist page đã sạch | Hoàn tất cách ly 2-phase | Backlog |
| D8 | **Đánh giá GV bởi học sinh (item 19) → FL5** khi có file front-end TGĐ | Hoãn theo yêu cầu | TGĐ |

---

## 1. Mục tiêu & phạm vi (tóm tắt)

Vá lỗi/khoảng trống test tay theo 4 epic BA #07: **E-LMS** (gắn học liệu vào buổi · bộ câu hỏi theo khung CT · GV xem tài liệu · tách role Đào tạo/Giáo viên) · **E-LEAD** (convert đầy đủ + học phí 1/2 đợt · auto-refresh · bàn giao · lớp trial đúng · bỏ Hội sở · truy vấn liền mạch) · **E-RBAC** (siết sidebar/quyền 4 vai · cách ly cơ sở) · **E-EVAL** (phiếu đánh giá buổi linh hoạt · khảo sát 4 loại — tái dùng EvalForm).

**KHÔNG phạm vi:** đánh giá GV bởi học sinh (item 19 — hoãn, chờ file front-end → FL5 sau) · RBAC động DB (giữ matrix tĩnh) · form-builder tổng quát · drop cột/model ngay (deprecate 2-phase).

---

## 2. Nguyên tắc multi-agent "CHẬM MÀ CHẮC" (đọc trước khi chạy)

1. **1 làn = 1 worktree = 1 nhóm thư mục RỜI NHAU.** Không bao giờ 2 agent sửa cùng 1 file trong cùng 1 đợt. → triệt tiêu merge-conflict & ghi đè nhau.
2. **Spine files đi TRƯỚC, một mình.** 3 file "xương sống" nhiều task đụng tới — `prisma/schema.prisma` (+migrations), `lib/auth/permissions.ts`, `components/admin/sidebar.tsx` — gom HẾT thay đổi vào **Wave 0** (1 PR nền). Các làn feature sau **CHỈ ĐỌC**, không sửa 3 file này.
3. **Một migration nền duy nhất.** Mọi DDL additive (enum role, field Question, model AssignmentTemplate, CoursePackage.courseId, EvalForm scope…) gộp vào 1 migration ở Wave 0 → không có 2 migration "đua" nhau.
4. **Cổng kiểm tra (Gate) giữa các wave.** Hết 1 wave → mỗi làn tự verify trong worktree (`typecheck && lint && build` + test của làn) → **merge TUẦN TỰ** vào nhánh tích hợp, build lại sau MỖI lần merge. Có lỗi tích hợp → dừng, sửa, rồi mới merge làn kế.
5. **DoD mỗi task** (chặn báo DONE): AC pass · test viết & xanh (Vitest/Playwright theo cột test) · typecheck+lint+build xanh · không bare-`db` cho SCOPED_MODELS · mutation nhạy cảm có audit · 2-phase (không drop cột) · smoke 375px nếu có UI.
6. **Đồng thời tối đa ~5–6 làn/đợt** (không phải tất cả cùng lúc) — đủ song song mà reviewer còn theo kịp. Chất lượng > tốc độ.
7. **Worktree isolation bắt buộc** cho làn có sửa file (Agent `isolation: "worktree"`); làn chỉ-đọc/điều tra thì không cần.

---

## 3. Bản đồ SỞ HỮU FILE (mỗi file chỉ 1 chủ/đợt) + ma trận xung đột

| File / thư mục | Chủ sở hữu (wave/làn) | Ghi chú chống đụng |
|---|---|---|
| `prisma/schema.prisma` + `prisma/migrations/**` | **Wave 0 · DB** | Làn feature KHÔNG sửa schema; chỉ dùng field/model đã có sau Gate-0 |
| `lib/auth/permissions.ts` | **Wave 0 · PERM** | Gom mọi đổi quyền (TRAINING, siết LMS, gỡ students:edit ACCT, +teaching-materials) |
| `components/admin/sidebar.tsx` | **Wave 0 · NAV** | Gom mọi gate sidebar 4 vai + menu GV tài liệu |
| `lib/db-scope.ts` | **Wave 1 · RBAC** | Chỉ làn RBAC chạm (flip Enrollment/Session) — không trùng Wave 0 |
| `app/(admin)/admin/curriculums/**` | Wave 1 · LMS-A | lesson editor |
| `app/(admin)/admin/questions/**` | Wave 1 · LMS-B | bộ câu hỏi |
| `app/(admin)/admin/teaching-materials/**` (mới) | Wave 1 · LMS-C | trang GV xem tài liệu |
| `app/(admin)/admin/{course-packages,courses}/**` | Wave 1 · LMS-D | gộp gói/khoá |
| `app/(admin)/admin/assignments/**` | Wave 1 · LMS-E | AssignmentTemplate |
| `app/(admin)/admin/leads/**` (gồm convert, kanban, transfer-dialog) | Wave 1 · LEAD-A | 1 làn nắm trọn `leads/` — các task lead chạy TUẦN TỰ trong làn |
| `app/(admin)/admin/trials/**` | Wave 1 · LEAD-B | ghép lớp trải nghiệm |
| `app/(admin)/admin/{chuyen-lop,hoan-thanh-khoa}/**` + enrollment unit picker | Wave 1 · LEAD-C | bỏ HO + truy vấn liền mạch |
| `app/(admin)/admin/{enrollments,sessions}/**` | Wave 1 · RBAC | flip scope (đi cùng db-scope.ts) |
| `app/(admin)/admin/evaluations/**` + `sessions/[id]/_components/session-feedback-editor.tsx` | Wave 1 · EVAL-A | phiếu SESSION_EVAL |
| `app/(portal)/portal/nhan-xet/**` | Wave 2 · EVAL-B | xem nhận xét (cần EVAL-A) |
| `app/(admin)/admin/khao-sat/**` + `app/(portal)/portal/khao-sat/**` | Wave 2 · EVAL-C | khảo sát 4 loại (cần EVAL-A) |
| `lib/payments/**` (installment) | Wave 1 · LEAD-A | dùng `recordInstallmentPlan` sẵn có |

> ⚠️ **Giao nhau cần lưu:** `sessions/[id]/_components/session-feedback-editor.tsx` thuộc EVAL-A; làn RBAC chỉ sửa `sessions/page.tsx` & list (không đụng feedback editor). Nếu trùng → RBAC nhường, để EVAL-A.

---

## 4. WAVE 0 — Foundation (spine, KHÔNG fan-out) · gồm FL1-01 + FL3-01 + phần schema/quyền

> Làm cẩn thận, ÍT song song. Có thể 1 agent làm tuần tự cả 3 hoặc 3 agent worktree merge theo thứ tự **DB → PERM → NAV**. Đây là nơi dễ "nhanh mà ẩu" nhất → đi chậm.

| Task | Mô tả | File | Test bắt buộc |
|---|---|---|---|
| **W0-DB** ✅ | 1 migration additive `20260624000000_fl_foundation`: enum role +`TRAINING` · enum `EvalScope` +`SESSION_EVAL` · `Question` +`curriculumId/courseId/points/timeLimitSec` · model `AssignmentTemplate` + `Assignment.templateId` · `CoursePackage.courseId` · `EvalResponse` +`classSessionId` (studentId đã có sẵn) | `prisma/schema.prisma`, migration mới, + fallout: `lib/labels.ts`, `employees-admin-table.tsx`, `evaluations/page.tsx` | ✅ schema valid · prisma generate OK · migration purely additive (diff schema↔schema, không drift) · `tsc --noEmit` xanh |
| **W0-PERM** ✅ | TRAINING matrix (full LMS authoring); gỡ LMS-edit (`curriculum:create/edit/delete`,`training:manage`,`questions:author/edit/delete`,`assignments:create/edit/delete`,`documents:upload/delete`,`exams:create/edit/delete`) khỏi TEACHER+CM (giữ view+grade); +`teaching-materials:view-own-class`; **gỡ `students:edit` của ACCOUNTANT**; +`evaluations:manage` cho TRAINING | `lib/auth/permissions.ts` + `permissions.test.ts` (mới) | ✅ tsc 0 lỗi · vitest 10/10 (TRAINING có quyền, TEACHER/CM mất sửa giữ view+grade, ACCT mất students:edit) |
| **W0-NAV** ✅ | Thêm menu "Tài liệu lớp tôi" (`/teaching-materials`, gate `teaching-materials:view-own-class`, icon Presentation) | `components/admin/sidebar.tsx` | ✅ eslint sạch · hiện với TEACHER/TRAINING/CM/SUPER_ADMIN |
| **W0-NAV-2** ⏳ (pass riêng, soi kỹ — rủi ro lockout cao) | Role hygiene rộng: ẩn module dư cho Sale/Kế toán/GV theo BA #07 mục 3.C (gỡ `sessions:view/attendance:view/rooms:view/courses:view/jobs:view/news:view`… khỏi role không thuộc vai) | `lib/auth/permissions.ts`, `components/admin/sidebar.tsx` | C1 Sale/Kế toán/GV thấy đúng menu (snapshot per role) · C2 vào module ẩn→redirect (T4) · C3 không khoá nhầm chức năng lõi |

**Gate-0 (chặn Wave 1):** `pnpm typecheck && pnpm lint && pnpm build` xanh · test W0-* xanh. **Áp migration lên Supabase = bước riêng cần xác nhận** (outward, khó đảo). Wave 1 chỉ cần Prisma Client đã generate (đã xong) — không chờ deploy DB.

> **Tiến độ Wave 0 (24/06):** W0-DB ✅ · W0-PERM ✅ · W0-NAV ✅ → **Gate-0 PASSED** (tsc + eslint + vitest 10/10 + build 105 trang đều xanh). Còn lại: W0-NAV-2 (hygiene rộng) ⏳ pass riêng soi kỹ · **migration CHƯA deploy Supabase** (chờ xác nhận).
>
> **⚠️ Follow-up Wave 1 do W0-PERM phát hiện (cần xử lý khi vào lane tương ứng):**
> 1. **Gán role `TRAINING`** cho user phụ trách Đào tạo (data, không phải code) — nếu không, các trang LMS authoring không ai vào được ngoài SUPER_ADMIN.
> 2. **Page-level gate redirect** cho TEACHER/CM ở các trang LMS authoring (tránh 403 cứng): `curriculums/`, `questions/`, `exams/`, `assignments/`, `documents/`, `scorm/`. → việc của LMS-A/B/E + RBAC lane.
> 3. **QUYẾT ĐỊNH cần TGĐ:** `training:manage` đã gỡ khỏi CENTER_MANAGER → CM mất **cấu hình lớp trải nghiệm (số buổi)** + **duyệt LessonChangeRequest** + SCORM. Theo QĐ-O10 trial-config là việc Đào tạo (TRAINING) — hợp lý. Nhưng cần xác nhận: CM có cần giữ **duyệt đề xuất sửa bài (LessonChangeRequest)** / **cấu hình trial** không? Nếu có → tách action riêng (vd `trials:config`, `lesson-change:approve`) cấp cho CM, KHÔNG dùng chung `training:manage`. (LEAD-B / W0-NAV-2 xử lý.)

---

## 5. WAVE 1 — Feature fan-out (song song tối đa, thư mục rời nhau)

> Mỗi làn rẽ worktree từ `fl-integration` (đã có spine). Các task trong cùng làn chạy TUẦN TỰ. Đề xuất chạy **2 mẻ ~5 làn** để reviewer theo kịp.

**Mẻ 1 ✅ DONE+merged (Gate-1 xanh: tsc+eslint+vitest 723/723+build):** W0-NAV-2 · LMS-B · LMS-D · LEAD-A · EVAL-A. (LMS-A dời sang Mẻ 2 để tránh tranh chấp `curriculums/` với handoff lesson-change.)
**Mẻ 2a (4 làn rời nhau):** LMS-A · LMS-C · LMS-E · LEAD-B
**Mẻ 2b (cần phối hợp `enrollments/`):** LEAD-C · RBAC (chạy sau 2a hoặc tách file kỹ)

> **Handoff Mẻ 1→2 (BẮT BUỘC nhớ):**
> - **LMS-A** swap gate `training:manage`→`lesson-change:approve` ở `curriculums/[id]/edit/page.tsx:94` + `_actions.ts` (CHỈ nhánh duyệt LessonChangeRequest; GIỮ `training:manage`/unlock buổi LOCKED cho TRAINING). FL1-02 lesson editor gắn SCORM (ScormPackage.lessonId) + bài tập (Assignment.lessonId) — KHÔNG đụng `lesson-change-requests.tsx` (W0-NAV-2 đã chạm comment).
> - **LMS-E** dùng `buildQuestionWhere({curriculumId,publicOnly})` (LMS-B đã export) cho picker câu hỏi trong AssignmentTemplate; sở hữu `assignments/` (KHÔNG đụng lesson editor — đó là LMS-A).
> - **LEAD-C vs RBAC**: RBAC sở hữu `lib/db-scope.ts` + `enrollments/page.tsx` + `sessions/`; LEAD-C sở hữu `enrollments/new` (unit picker bỏ HO) + `chuyen-lop/` + `hoan-thanh-khoa/`. Tách file rõ.
> - **Dead code** (`closeLeadAsEnrolled`, `close-deal-button.tsx`, `getLeadCloseDealOptions`) + **Payroll menu** (chưa có route) → PR cleanup/backlog riêng.

| Làn | Task | US (BA #07) | ƯL | Test bắt buộc |
|---|---|---|---|---|
| **LMS-A** | FL1-02 lesson editor: gắn SCORM + chọn bài tập cho từng buổi | US-LMS-1 | L | C1 gắn/gỡ SCORM (1 active/buổi) · C2 gắn/gỡ bài tập · C3 `SCORM_ENABLED=off`→ẩn không vỡ · C4 chỉ TRAINING/Admin sửa (T4) |
| **LMS-B** | FL1-03 bộ câu hỏi: dùng field mới (khung CT/điểm/thời gian) + CRUD đủ trường + ảnh + template/tải mẫu | US-LMS-2 | XL | C1 form đủ trường · C2 soạn Sata 4 chỉ thấy câu hỏi khung Sata 4 · C3 import template validate theo loại · C4 file mẫu tải được · C5 CRUD theo quyền (T4) |
| **LMS-C** | FL1-04 trang GV "Lớp của tôi → khung CT → buổi": view SCORM + bài tập + thống kê nộp (read-only) | US-LMS-3 | L | C1 GV chỉ thấy lớp mình (T5) · C2 view SCORM+bài tập từng buổi · C3 thống kê nộp · C4 GV không sửa LMS (T4) |
| **LMS-D** | FL1-05 gộp gói/khoá: link CoursePackage↔Course/Curriculum, deprecate JSON, gộp điều hướng | L-1 | L | C1 gói trỏ đúng khoá · C2 giá từ gói (regression convert) · C3 JSON cũ còn đọc · C4 hết trùng điều hướng |
| **LMS-E** | FL1-06 dùng model `AssignmentTemplate`: tạo template theo lesson → sinh bài giao cho lớp | L-3 | L | C1 tạo template theo lesson · C2 gán vào buổi · C3 sinh bài giao theo lớp · C4 assignment luôn có classId |
| **LEAD-A** | FL2-01→02→03 (tuần tự): convert vào trang chi tiết + học phí 1/2 đợt; auto-refresh Kanban; validate bàn giao | US-LEAD-1,2,3 | XL | C1 nút→`/leads/{id}` không popup · C2 nhiều con + chọn 1/2 đợt→`recordInstallmentPlan` · C3 guard cũ giữ (T6) · C4 Kanban refresh không F5 · C5 bàn giao đích≠nguồn (chặn) |
| **LEAD-B** | FL2-04 tab Học thử "Ghép vào lớp" chỉ TrialClassV2 + gán HS trực tiếp | US-LEAD-4 | L | C1 picker chỉ TrialClassV2 OPEN cùng cơ sở · C2 gán→`TrialEnrollment` tại tab · C3 không gán nhầm lớp chính thức · C4 cách ly cơ sở (T5) |
| **LEAD-C** | FL2-05 bỏ HO khỏi picker đơn vị; FL2-06 chuyển CS (cơ sở→HS) + hoàn thành khoá (HS→khoá→lớp) | US-LEAD-5 | M | C1 dropdown không HO (qua tree) · C2 chuyển CS chọn cơ sở trước→HS · C3 hoàn thành khoá liền mạch · C4 cách ly cơ sở (T5) |
| **RBAC** | FL3-02 flip `Enrollment`+`ClassSession` vào SCOPED_MODELS (2-phase shadow); FL3-03 quét CI bare-db còn lại | US-RBAC-1 | L | C1 CM CS1 `/enrollments` không thấy CS2 (T5) · C2 sessions cách ly · C3 shadow log sạch trước flip · C4 makeup cross-center exception còn chạy · C5 CI scan bare-db = 0 |
| **EVAL-A** | FL4-01 phiếu SESSION_EVAL: EvalForm scope mới + GV điền theo HS + áp lớp chính & trải nghiệm | US-EVAL-1 | XL | C1 form builder SESSION_EVAL 4 loại + free-text · C2 GV điền→lưu gắn session+student · C3 áp lớp trải nghiệm · C4 sửa form không phá response cũ (T7) · C5 chỉ TRAINING/Admin cấu hình (T4) |

**Gate-1 (chặn Wave 2):** mỗi làn verify trong worktree → **merge tuần tự** vào `fl-integration` (build lại sau mỗi merge) → chạy regression T12 (SR217 + convert + portal). Xong mới sang Wave 2.

---

## 6. WAVE 2 — Phụ thuộc Wave 1 (EVAL-A xong)

| Làn | Task | US | ƯL | Test bắt buộc |
|---|---|---|---|---|
| **EVAL-B** | FL4-02 portal PH xem nhận xét phiếu mới + ảnh lớp (consent) | US-EVAL-2 | M | C1 `/portal/nhan-xet` render phiếu động · C2 ảnh chỉ khi consent GRANTED (T2) · C3 không lộ studentId (T10) |
| **EVAL-C** | FL4-03 khảo sát trung tâm 4 loại (gộp EvalForm CENTER_SURVEY), deprecate Survey* 2-phase | US-EVAL-3 | L | C1 admin tạo 4 loại · C2 PH trả lời portal · C3 admin xem tổng hợp · C4 Survey cũ còn đọc · C5 cách ly cơ sở (T5) |

**Gate-2 (đóng phase):** merge tuần tự → full `pnpm typecheck && lint && build` + toàn bộ `tests/e2e/fl` + regression T12 xanh → merge `fl-integration` → nhánh chính.

---

## 7. Sơ đồ phụ thuộc (ai chờ ai)

```
FL0 (DONE) ─┐
            ▼
        Wave 0 (DB → PERM → NAV)  ── Gate-0 ──┐
                                              ▼
   ┌──────── Wave 1 (song song, thư mục rời) ────────┐
   LMS-A  LMS-B  LMS-C  LMS-D  LMS-E   LEAD-A  LEAD-B  LEAD-C   RBAC   EVAL-A
   └──────────────────────── Gate-1 ────────────────────────────────────┘
                                              ▼
                          Wave 2:  EVAL-B   EVAL-C  ── Gate-2 ── merge main
```

Phụ thuộc cứng: tất cả Wave 1/2 cần **Gate-0** (role+schema+quyền+sidebar). EVAL-B/C cần **EVAL-A**. Trong làn LEAD-A: FL2-01→02→03 tuần tự (chung `leads/`).

---

## 8. Traceability

| Task | US (BA #07) | Item test tay | Test file dự kiến |
|---|---|---|---|
| FL0-01 ✅ | US-RBAC-0 | 1 | `fl/dashboard-scope.spec.ts` + Vitest injectScope |
| W0-DB/PERM/NAV (FL1-01,FL3-01,FL3-03 perm) | US-LMS-4, US-RBAC-2..4 | 2,3,4,17 | `fl/role-training.spec.ts`, `fl/sidebar-gates.spec.ts` + Vitest can() |
| LMS-A (FL1-02) | US-LMS-1 | 12,16 | `fl/lesson-scorm-assignment.spec.ts` |
| LMS-B (FL1-03) | US-LMS-2 | 14 | `fl/question-bank.spec.ts` + Vitest filter khung CT |
| LMS-C (FL1-04) | US-LMS-3 | 16 | `fl/teacher-materials.spec.ts` |
| LMS-D (FL1-05) | L-1 | 11 | `fl/package-course-merge.spec.ts` |
| LMS-E (FL1-06) | L-3 | 13 | `fl/assignment-template.spec.ts` |
| LEAD-A (FL2-01..03) | US-LEAD-1,2,3 | 5,6,8,9,10 | `fl/convert-installment.spec.ts`, `fl/handover-validate.spec.ts` |
| LEAD-B (FL2-04) | US-LEAD-4 | 6,8 | `fl/trial-assign.spec.ts` |
| LEAD-C (FL2-05,06) | US-LEAD-5 | 7,8 | `fl/unit-no-ho.spec.ts`, `fl/transfer-completion-flow.spec.ts` |
| RBAC (FL3-02,03) | US-RBAC-1 | 1 | `fl/enrollment-session-scope.spec.ts` + CI bare-db scan |
| EVAL-A (FL4-01) | US-EVAL-1 | 15 | `fl/session-eval-form.spec.ts` |
| EVAL-B (FL4-02) | US-EVAL-2 | 15,16 | `fl/portal-session-eval.spec.ts` |
| EVAL-C (FL4-03) | US-EVAL-3 | 18 | `fl/center-survey.spec.ts` |

## 9. Ghi chú thực thi

- **Quy trình mỗi ticket (item 19):** PO chốt phạm vi → BA AC → Architect chốt delta model (BA #07 mục 5) → Dev BE+FE+DB **cùng PR** → Test → Review → DONE.
- **Worktree:** mỗi làn Wave 1/2 chạy agent `isolation: "worktree"`, rẽ từ `fl-integration` sau Gate-0; merge tuần tự + build lại.
- **2-phase drop:** `Survey*`, `TrialFeedback`, `CoursePackage.curriculum` JSON, cột Question cũ — giữ đọc được, drop PR sau khi prod ổn 2–3 ngày.
- **Đánh giá GV (item 19):** hoãn → FL5 riêng khi có file front-end (qua `/ba-analysis` → `/prepare-prompt`).
- **Vì sao chậm-mà-chắc:** spine đi 1 mình (Wave 0) triệt conflict gốc; làn feature thư mục rời → 0 file đụng nhau; Gate + merge tuần tự bắt lỗi tích hợp sớm; DoD chặn báo DONE non.
