# Phase FL-R2 — FixLMS **Vòng 2** (vá sau test tay vòng 1) · Kế hoạch MULTI-AGENT

> **Nguồn yêu cầu:** BA #08 (`2-ba-phan-tich/08-gap-analysis-fixlms-testday-round2.md`) — 17 nhóm phát hiện test tay (25/06/2026) + 4 quyết định QĐ-R2-1…4.
> **Quy trình:** [00-quy-trinh-thuc-hien.md](00-quy-trinh-thuc-hien.md) — vòng đời TODO→DOING→TEST_WRITTEN→TEST_PASS→REVIEW→DONE, DoD 10 mục, test T1–T12. Mỗi task sửa BE **bắt buộc kèm FE + DB** cùng PR.
> **Cách chạy:** đa agent song song theo LÀN, **CHẬM MÀ CHẮC** — mỗi làn 1 git worktree, sở hữu file RỜI NHAU, cổng kiểm tra + merge tuần tự sau mỗi wave.
> **Thứ tự (QĐ-R2-4 — làm trọn theo module):** W0 nền → W1 LEAD → W2 ORDER → W3 TRIAL → W4 RBAC+CLASS → W5 LMS.
> **Trạng thái:** 🟡 **TODO** — chờ `prepare-prompt` bung ticket chi tiết + chốt 3 TBD (BA #08 §7.1).

---

## 0. Nguyên tắc multi-agent (đọc trước)

1. **1 làn = 1 worktree = nhóm file RỜI NHAU.** Không 2 agent sửa cùng file trong cùng wave.
2. **Spine files đi Wave-0, một mình:** `prisma/schema.prisma` (+migrations), `lib/auth/permissions.ts`, `components/admin/sidebar.tsx`, `lib/db-scope.ts`. Làn feature sau **CHỈ ĐỌC**.
3. **1 migration nền/đợt.** Mọi DDL additive (trial redesign, Order.courseId, homework template, LeadTrialHistory, Kanban col, role/permission) gộp vào migration Wave-0.
4. **Cổng (Gate) giữa wave.** Hết wave → mỗi làn `typecheck && lint && build` + test làn → merge TUẦN TỰ → build lại sau mỗi merge.
5. **DoD mỗi task:** AC pass · test xanh (T-cột) · tsc+lint+build xanh · không bare-`db` cho SCOPED_MODELS · mutation nhạy cảm có audit · 2-phase (không drop cột) · smoke 375px nếu có UI.
6. **Repro trước khi vá** cho item 1, 3, 4 (BA #08 §0 — 3 triệu chứng "code đúng nhưng vẫn lỗi").

---

## 1. Wave-0 — Nền (spine + migration + ops) · 1 làn DB + 1 làn ops

| Task | Việc | File sở hữu |
|---|---|---|
| R2-W0-DB | 1 migration additive gộp: (a) `TrialClassV2.startDate` nullable + bỏ auto-gen; (b) `LeadTrialHistory` model; (c) Kanban `TRIAL_IN_PROGRESS` đưa vào logic; (d) `Order.courseId?` + backfill từ packageId; (e) homework template link (Lesson↔exam); (f) permission `teaching-materials:view-own-class` cho GV | `prisma/schema.prisma`, `prisma/migrations/**`, `lib/leads/status.ts` (Kanban cols) |
| R2-W0-PERM | siết/cấp quyền: `teaching-materials:view-own-class` (GV); giữ LMS authoring ở SUPER_ADMIN+TRAINING | `lib/auth/permissions.ts` |
| R2-W0-NAV | dọn sidebar: xoá Buổi học/Điểm danh/Ảnh lớp/Học bù (gộp vào lớp); đổi "Gói bán"→"Khoá học"; xoá "Khoá dạy"/"Tài liệu giảng dạy"/"SCORM" tab | `components/admin/sidebar.tsx` |
| R2-W0-SCORM | **Ops:** set `SCORM_ENABLED=true` Vercel + redeploy; verify R2 CORS + viewer (QĐ-R2-3) | — (env, không code) |
| R2-W0-SEED | seed GV test cho CS1/CS2 + backfill `User.centerId`; seed sẵn 1 EvalForm SESSION_EVAL mặc định (round mở) cho trial/lớp | `prisma/seed-*.ts`, `scripts/backfill-teacher-center.ts` |

**Gate-0:** migrate deploy lên test DB + backfill 100% (Order.courseId, User.centerId) + build xanh trước khi mở các wave feature.

---

## 2. Wave-1 — E2-LEAD (item 1, 2)

| Task | Item | Việc | Test |
|---|---|---|---|
| R2-LEAD-1 | 1 | **Điều tra** reload thủ công (HMR dev vs prod build; client state; path `/leads/[id]`) → vá đúng (bổ sung `router.refresh()`/`revalidateTag` nơi thiếu) | T-LEAD |
| R2-LEAD-2 | 2 | Khối "Thanh toán" (Đã nộp/Tổng phải thu/Còn thiếu + badge đủ-điều-kiện) ở **chi tiết lead** + trang convert; helper `getLeadPaymentSummary` qua scopedDb | T-LEAD |
| R2-LEAD-3 | 2 | Viết lại copy convert sang **ngôn ngữ nghiệp vụ** (bỏ mã `PAYMENT_REQUIRED`/`R7-04`/`REGISTERED`) | T-LEAD |

File sở hữu: `app/(admin)/admin/leads/[id]/**`, `lib/crm/convert-lead-v2.ts` (read), `lib/payments/summary.ts` (mới).

---

## 3. Wave-2 — E2-ORDER (item 3)

| Task | Item | Việc | Test |
|---|---|---|---|
| R2-ORDER-1 | 3 | Dropdown khoá học lọc `isTeachable:true` (`orders/_actions.ts:646`) | T-ORDER |
| R2-ORDER-2 | 3 | Kiểm DB `PaymentMethod.name` (nếu = mã → sửa seed); tạo `lib/payments/labels.ts` nếu cần nhãn loại | T-ORDER |
| R2-ORDER-3 | 3 | Refactor form dùng `ORDER_TYPE_LABEL`/`ORDER_STATUS_LABEL` (DRY) | — |

File sở hữu: `app/(admin)/admin/orders/**`.

---

## 4. Wave-3 — E2-TRIAL (item 4, 5, 6, 7) · QĐ-R2-1

| Task | Item | Việc | Test |
|---|---|---|---|
| R2-TRIAL-1 | 7 | Redesign lớp trải nghiệm **slot tái sử dụng**: form tạo bỏ ngày bắt đầu, **số buổi trong form**, tạo buổi ad-hoc; CRUD thêm/sửa/xoá | T-TRIAL |
| R2-TRIAL-2 | 4 | Repro lỗi gán → gán/huỷ HV **trong chi tiết lớp trải nghiệm** (tái dùng `enrollLeadChild`+`unenroll`) | T-TRIAL |
| R2-TRIAL-3 | 6 | Search/lọc lead học thử; ẩn lead đã rời pipeline; ghi `LeadTrialHistory` | T-TRIAL |
| R2-TRIAL-4 | 6 | Note "Đã học thử (ngày…)" trên lead/Kanban từ history; giữ khi lead quay lại | T-TRIAL |
| R2-TRIAL-5 | 7 | Auto-Kanban: điểm danh buổi đầu→"Đang học thử"; đủ buổi→"Đã học thử" | T-TRIAL |
| R2-TRIAL-6 | 7 | Hết buổi chưa ĐK → tự "Chờ quyết định" (rule-based; trigger theo TBD-2) | T-TRIAL |
| R2-TRIAL-7 | 5 | Xoá form nhận xét cũ; nút "Nhận xét học viên" mở phiếu SESSION_EVAL (giống PDF) | T-TRIAL, T-EVAL |
| R2-TRIAL-8 | 7 | Search HV trong chi tiết lớp → click HV → điểm danh + đánh giá GV (không lộ studentId URL) | T-TRIAL |

File sở hữu: `app/(admin)/admin/trial-classes/**`, `lib/trial/service.ts`, trial eval components.

---

## 5. Wave-4 — E2-RBAC + E2-CLASS (item 17, 8, 9, 10)

> RBAC ghép trước CLASS vì **gán GV theo cơ sở chặn việc tạo lớp**. Làn RBAC xong → làn CLASS dùng helper đã lọc.

### 5.1 Làn RBAC (item 17)
| Task | Việc | Test |
|---|---|---|
| R2-RBAC-1 | Backfill `User.centerId` GV (script Wave-0) + verify | T-RBAC |
| R2-RBAC-2 | `getAssignableTeachers({centerId, includeIds})` lọc theo center | T-RBAC |
| R2-RBAC-3 | Form tạo lớp truyền centerId → dropdown chỉ GV cùng cơ sở | T-RBAC |

File: `lib/teachers/assignable.ts`, `app/(admin)/admin/classes/new/**`, `class-form.tsx`.

### 5.2 Làn CLASS (item 8, 9, 10)
| Task | Item | Việc | Test |
|---|---|---|---|
| R2-CLASS-1 | 9,10 | Tạo `classes/[id]/page.tsx` đa tab (Thông tin·Buổi+Điểm danh·Ảnh·Học bù·Tài liệu SCORM) | T-CLASS |
| R2-CLASS-2 | 9 | Tự sinh buổi + bản ghi điểm danh sau tạo lớp+gán HV (`lib/classes/generate.ts`, transaction) | T-CLASS |
| R2-CLASS-3 | 8 | Verify phân quyền QL xem hết CS / GV chỉ lớp mình | T-CLASS, T-RBAC |
| R2-CLASS-4 | 8 | Gộp ô thông tin header chi tiết lớp gọn (1 card) | — |
| R2-CLASS-5 | 9 | GV mở/present SCORM tài liệu trong lớp (phụ thuộc SCORM bật) | T-CLASS |
| R2-CLASS-6 | 9 | Điểm danh học bù + ngày học bù trong chi tiết lớp | T-CLASS |
| R2-CLASS-7 | 9 | Upload ảnh (consent) + đánh giá per-HV mỗi buổi | T-CLASS, T-EVAL |

File: `app/(admin)/admin/classes/[id]/**`, `lib/classes/generate.ts`, tái dùng media/makeup/eval (read).

**Gate-4:** test cách ly CS1≠CS2 (GV + lớp); chi tiết lớp gộp đủ tab; xoá 4 mục sidebar không vỡ route.

---

## 6. Wave-5 — E2-LMS (item 11, 12, 13, 14, 15, 16) · QĐ-R2-2/3

> Wave nặng nhất — **gộp Course/Package triệt để** (rủi ro Order/Payment). Đi sau cùng khi các module khác ổn.

| Task | Item | Việc | Test |
|---|---|---|---|
| R2-LMS-1 | 13,16 | Gộp DB CoursePackage→Course (2-phase: Order.courseId backfill xong ở W0 → chuyển code đọc sang courseId → deprecate packageId); 1 màn "Khoá học" có giá | T-LMS |
| R2-LMS-2 | 11,3 | Rà mọi dropdown "khoá học" lọc `isTeachable=true` | T-LMS |
| R2-LMS-3 | 12,15 | Editor sửa buổi giáo trình: upload/gắn SCORM + chọn bài tập (nâng `LessonResources` từ read-only → editor) | T-LMS |
| R2-LMS-4 | 14 | Homework template theo buổi/khoá; tạo lớp+khung CT → tự add HomeworkAssignment theo buổi (móc vào R2-CLASS-2) | T-LMS |
| R2-LMS-5 | 16 | Cấp `teaching-materials:view-own-class` GV (sửa 404 "Tài liệu lớp tôi") | T-RBAC |

File: `app/(admin)/admin/courses/**`, `course-packages/**`, `curriculums/[id]/edit/**`, `lib/orders/**` (FK), `lib/lms/**`.

**Gate-5:** đơn hàng cũ vẫn trỏ đúng khoá học sau migrate (rollback test); sidebar còn đúng 1 tab "Khoá học".

---

## 7. Phụ thuộc & rủi ro

- **TBD đã chốt (25/06/2026):** TBD-1 = GV **không** kiêm nhiệm (RB-2 lọc thuần `centerId`); TBD-2 = "Chờ quyết định" trigger **ngay khi đủ buổi** (TR-6); TBD-3 = **xoá hẳn** `/course-packages`, không redirect (LM-1).
- **Rủi ro cao:** R2-LMS-1 (gộp Course/Package) đụng Order/Payment — bắt buộc 2-phase + rollback + test dữ liệu cũ. R2-TRIAL-1 (redesign model) — giữ data trial cũ (startDate nullable, không drop).
- **Phụ thuộc Ops:** R2-W0-SCORM phải xong trước R2-CLASS-5 + R2-LMS-3 (SCORM bật mới test được).

---

## 8. Bảng test (T-cột)

| Cột | Phủ |
|---|---|
| T-LEAD | payment summary đúng; convert copy nghiệp vụ; auto-refresh |
| T-ORDER | dropdown khoá học teachable; nhãn tiếng Việt |
| T-TRIAL | slot tái sử dụng; auto-Kanban; history; gán/search; eval form |
| T-CLASS | chi tiết lớp gộp; tự sinh điểm danh; phân quyền GV/QL; học bù; ảnh+eval |
| T-RBAC | GV lọc theo center (CS1≠CS2); teaching-materials quyền |
| T-LMS | gộp Course/Package không mất Order; SCORM/bài tập trong buổi; homework auto |
| T-EVAL | phiếu đánh giá buổi SESSION_EVAL dùng cho trial + lớp |
