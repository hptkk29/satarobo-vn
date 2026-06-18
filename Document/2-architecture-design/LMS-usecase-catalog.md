# LMS — Catalog Use-Case theo Actor × Kịch bản

> Bổ sung cho `luong-LMS.md` (luồng vận hành as-implemented) — file đó kể **1 luồng dọc happy-path**; file này liệt kê **nhiều hướng dùng** theo từng actor, kèm nhánh thay thế (alt) và ngoại lệ (exc).
> Verdict mỗi use-case (đối chiếu code thực, có `file:line`): ✅ EXISTS · ⚠️ PARTIAL · ❌ MISSING.
> Vấn đề chi tiết + cách sửa: [`LMS-problems-fix-plan.md`](./LMS-problems-fix-plan.md). Snapshot 2026-06-18.

> 🔄 **RE-SYNC 2026-06-18 (đối chiếu lại code `FixLMS`):** cập nhật verdict đã lệch — **T3** completeSession nay đã có scope-cơ-sở (⚠️🔴→⚠️, còn hở cấp-lớp); **state-machine guard** Enrollment/Session ĐÃ có (mục LMS-7 DONE); **T8/M12** vẫn ⚠️ (skill backend đã mở GV nhưng UI chưa, report thiếu 4 chiều). Các verdict ❌ MISSING khác (P5 thi lại, P11 2-way, A4 hoàn tiền, M4 conflict, M8 hủy lớp, T11 dạy thay, SCORM scoring) **vẫn đúng**.

## Actor trong hệ LMS

| Actor | Vai trò LMS | Đăng nhập |
|---|---|---|
| `SALES_CSM` | Tư vấn tuyển sinh, chăm lead, convert | admin |
| `TEACHER` (+ trợ giảng) | Dạy buổi, điểm danh, chấm, học bạ, đánh giá kỹ năng | admin |
| `ACCOUNTANT` | Xác nhận thu, receipt, công nợ, hoàn tiền | admin |
| `CENTER_MANAGER` | Xếp lớp, lịch, duyệt, báo cáo cơ sở | admin |
| `MARKETING` / `HR` | Ngoài lõi LMS (chiến dịch / nhân sự) | admin |
| `PARENT` | Theo dõi con, học phí, yêu cầu, đánh giá | portal |
| Học viên (HV) | Học, làm bài/thi, đánh giá GV | portal (qua tài khoản PH) |

> ⚠️ HV **không có tài khoản riêng** (Doc 15 đã loại student-login) → mọi thao tác HV đi qua phiên PH.

---

## 1. 👩‍🏫 GIÁO VIÊN (Teacher)

| UC | Use-case | Happy path | Alt / Exc | Verdict | Evidence |
|---|---|---|---|---|---|
| T1 | Xem lớp/buổi hôm nay/việc cần chấm | Dashboard GV theo `teacherId` | alt: là **trợ giảng** (`assistantId`) → **không hiện** | ⚠️ | `dashboard/_components/teacher-dashboard.tsx:15` |
| T2 | Điểm danh buổi | Mở session → 6 nhãn → lưu batch | exc: **GV lớp khác cũng sửa được** (role-only) | ⚠️🔴 | `attendance/_actions.ts:33-41` |
| T3 | Hoàn tất buổi (lifecycle V2) | Gate trạng thái → ghi actuals → event `session.taught` | ✅ owner-check theo cơ sở (`resolveSessionScope`); ⚠️ còn hở GV cùng cơ sở lớp khác | ⚠️ | `classes/[id]/session/_actions.ts:53-55` |
| T4 | Chấm bài tập (scalar + rubric 6 tiêu chí) | Mở submission → chấm | exc: **chấm bài lớp bất kỳ**; không có hàng chờ | ⚠️🔴 | `assignments/_actions.ts:385,695` |
| T5 | Chấm thi (auto MC/TF/short) | "Auto-chấm" | exc: **ESSAY/CODE không có UI chấm** (chỉ Prisma Studio) | ⚠️ | `exams/_actions.ts:510,604` |
| T6 | Soạn bài giảng/curriculum/đề | CRUD lesson/question/curriculum | exc: **sửa câu hỏi GV khác** (không check `authorId`) | ⚠️ | `questions/_actions.ts:121,195` |
| T7 | Đề xuất sửa bài (LessonChangeRequest) | GV gửi → admin duyệt | alt: UI review LCR **chưa đủ** | ⚠️ | `curriculums/_actions.ts:500-583` |
| T8 | Đánh giá kỹ năng robot | 10 skill × 4 level | exc: **per-student, không gắn buổi**; UI **disable cho GV** | ⚠️ | `students/[id]/_components/skill-editor.tsx`; `edit/page.tsx:100` |
| T9 | Soạn học bạ (DRAFT→PENDING_REVIEW) | GV điền narrative + điểm năng lực | (publish do reviewer) | ✅ | `report-cards/_actions.ts:127` |
| T10 | Lịch dạy / đăng ký ca | Overlay lịch dạy + đăng ký ca | alt: overlay **read-only**, không gắn `ClassSession`/payroll | ⚠️ | `cham-cong/lich-ca/page.tsx:41` |
| T11 | Dạy thay (substitute) | adjustSession set `substituteTeacherId/RoomId` + event `session_changed` (thông báo) + conflict-aware | (duyệt riêng chưa có — đổi buổi đã là hành động của quản lý) | ✅ | `lib/classes/adjust.ts` (P5) |

## 2. 🧑‍🎓 HỌC VIÊN / 👪 PHỤ HUYNH (Portal)

| UC | Use-case | Happy path | Alt / Exc | Verdict | Evidence |
|---|---|---|---|---|---|
| P1 | Xem tiến độ/điểm danh con | Dashboard portal | (multi-con OK) | ✅ | `lib/portal/learning.ts` |
| P2 | Xem bài giảng/buổi học | List buổi + lesson | alt: chỉ list, **không calendar** | ⚠️ | `portal/lich-hoc/page.tsx:152` |
| P3 | Làm + nộp bài tập (upload file) | Nộp R2 ≤20MB | exc: trễ → LATE | ✅ | `portal/bai-tap/actions.ts:30` |
| P4 | Làm bài thi | Start → save → submit | exc: **submit trễ vẫn nhận** (không check deadline) | ⚠️🔴 | `portal/bai-thi/actions.ts:159` |
| P5 | **Thi lại bài rớt** | — | exc: **bị chặn cứng** (`@@unique`); `maxAttempts` chết | ❌ | `schema.prisma:2257`; `actions.ts:86` |
| P6 | Xem học bạ | Đọc snapshot PUBLISHED | — | ✅ | `portal/hoc-ba` |
| P7 | Xem học phí/công nợ | finalPrice − Σ confirmed | exc: chỉ thấy payment CONFIRMED | ✅ | `lib/portal/billing.ts` |
| P8 | Xem ảnh buổi học | Consent GRANTED + tag + APPROVED | — | ✅ | `lib/lms/media-consent.ts` |
| P9 | Đánh giá GV / khảo sát TT | Form 4 loại câu | (flag EVAL_V2) | ✅ | `lib/eval/*` |
| P10 | Gửi yêu cầu (nghỉ/bù/chuyển) | ParentRequest → 1 quyết định | alt: **không phải thread 2 chiều** | ⚠️ | `portal/yeu-cau/actions.ts:21` |
| P11 | **Nhắn 2 chiều với GV** | — | exc: **không có** (không `Comment`/`comment.added`) | ❌ | — |

## 3. 💰 KẾ TOÁN (Accountant)

| UC | Use-case | Happy path | Alt / Exc | Verdict | Evidence |
|---|---|---|---|---|---|
| A1 | Xác nhận thu (2 tầng) | RECORDED → CONFIRMED → Receipt | exc: reject sau khi có receipt → VOID | ✅ | `lib/finance/payment.ts` |
| A2 | Công nợ + nhắc hạn | Tính nợ + cron nhắc | — | ✅ | `lib/finance/debt.ts` |
| A3 | Điều chỉnh thanh toán | Bút toán âm `adjustmentOfId` | — | ✅ | `payment.ts` |
| A4 | **Hoàn tiền khi rút/chuyển/hủy** | — | exc: `refundPayment` thủ công, **không nối lifecycle, không prorate** | ❌ | `payment.ts:347` |

## 4. 🧑‍💼 QUẢN LÝ CƠ SỞ / 📋 TƯ VẤN (Manager / CSM)

| UC | Use-case | Happy path | Alt / Exc | Verdict | Evidence |
|---|---|---|---|---|---|
| M1 | Chăm lead → trial → convert | Lead→TrialV2→Convert (guard payment) | exc: dedupe conflict → `ConvertConflict` chặn | ✅ | `lib/crm/convert-lead-v2.ts` |
| M2 | Xếp lớp + sinh lịch | Pin `ClassSessionPlan` → sinh `ClassSession` | exc: **không có `ClassProgramSnapshot`** (doc sai) | ⚠️ | `lib/classes/generate.ts:11` |
| M3 | Đổi/hủy 1 buổi + báo PH | adjust/cancel → event `session.session_changed` | exc: cancel auto-append buổi bù | ✅ | `lib/classes/adjust.ts:33,127` |
| M4 | **Chống trùng lịch GV/phòng** | — | exc: helper coded **không nối write-path** | ❌ | `lib/lms/scheduling.ts:16` |
| M5 | Chuyển lớp HV | request → approve (cross-center OK) | exc: **khác mức phí bị chặn**; progress không carry | ⚠️ | `lib/transfer/service.ts:108,160` |
| M6 | Bảo lưu / phục học | reserve → PAUSED → resume | exc: **`expectedEndAt` không auto-hết hạn** | ⚠️ | `lib/students/reserve-service.ts:52` |
| M7 | Rút học | INACTIVE + đóng enrollment | exc: **0 logic tiền** | ⚠️ | `students/_actions.ts:578` |
| M8 | **Hủy cả lớp** | — | exc: `deleteClass` chỉ soft-delete, **bỏ mặc enrollment/session/payment** | ❌ | `classes/_actions.ts:364` |
| M9 | Hoàn thành khóa + chứng chỉ | CourseCompletion + cert + gợi ý khóa kế | exc: **tách rời** với `Enrollment.status=COMPLETED` (drift) | ⚠️ | `lib/completion/service.ts` |
| M10 | Soạn thông báo (broadcast) | Compose → CLASS/CENTER/ALL_PARENTS | (1 chiều) | ✅ | `notifications/actions.ts:38` |
| M11 | Duyệt học bạ (PUBLISH) | review → PUBLISHED + snapshot | — | ✅ | `report-cards/_actions.ts:166` |
| M12 | Báo cáo | 4 module: lead/trial/đào-tạo/trung-tâm | exc: **thiếu** hiệu-suất-GV, cohort, doanh-thu-vs-mục-tiêu, churn | ⚠️ | `lib/reports/*` |

---

## Ma trận phủ kịch bản (tổng)

| Loại flow | ✅ Đủ | ⚠️ Một phần | ❌ Thiếu |
|---|---|---|---|
| **Happy path** | Hầu hết | — | — |
| **Alternate** | trial/convert dedupe, transfer request, reserve, renewal | multi-con, cross-center | thi lại, mid-course join |
| **Exception** | payment reject/void, session cancel→bù | exam timer, transfer khác phí | hoàn tiền, hủy lớp cascade, dạy thay, 2-way comms, SCORM scoring |
| **Authorization** | session checklist, report card (scoped) | — | điểm danh, chấm điểm, completeSession R7, sửa câu hỏi (role-only) |

## State machine LMS (tham chiếu)

- `EnrollmentStatus`: PENDING→CONFIRMED→STUDYING→{COMPLETED|WITHDREW|TRANSFERRED|PAUSED⇄STUDYING|CANCELLED} — ✅ **đã có transition guard** (`lib/enrollments/status.ts` nối `enrollments/_actions.ts:526`; ERD-H4 DONE).
- `SessionStatus`: SCHEDULED→IN_PROGRESS→COMPLETED|CANCELLED — ✅ **guard** `canStartSession`/`canCompleteSession` (`lib/sessions/status.ts` nối `sessions/[id]/_actions.ts:227,243`).
- `AssignmentSubmission`: NOT_SUBMITTED→SUBMITTED→LATE→GRADED.
- `ExamAttempt`: IN_PROGRESS→SUBMITTED→GRADED→~~REVIEWED~~ (**state chết, không code nào set**).
- `ReportCard`: DRAFT→PENDING_REVIEW→PUBLISHED→RECALLED→PENDING_REVIEW — ✅ guard đầy đủ.
- `ScormPackage`: UPLOADING→PROCESSING→TESTING→PUBLISHED→ARCHIVED.

## Lỗ hổng "looks done, isn't" (doc nói xong nhưng thực tế dở)

> 🔄 Re-sync 2026-06-18: mục 1 đã thu hẹp — `completeSession` (LMS-3) nay scope theo cơ sở; còn lại **điểm danh/chấm điểm/sửa câu hỏi vẫn role-only** (LMS-1/2/4 OPEN).

1. Điểm danh/chấm điểm/sửa câu hỏi — **không scope** (LMS-1/2/4, rủi ro bảo mật). ~~completeSession~~ đã vá (cơ sở; còn hở cấp-lớp).
2. `ClassProgramSnapshot` — **model không tồn tại** (doc §0,§6 ghi sai).
3. Thi lại — **chặn cứng**, `maxAttempts` field chết.
4. SCORM — **không ghi điểm/hoàn thành** về HV.
5. Học bạ — **bỏ điểm bài tập + kỹ năng robot** khi tổng hợp.
6. Dạy thay / hoàn tiền / hủy lớp — **chỉ audit / không có**.
7. `AssignmentKind`, `AttemptStatus.REVIEWED` — **field/state không drive logic**.
