# Prompt manual test — TOÀN BỘ luồng LMS (branch `fixlms-r7bugs`, local)

> Copy phần trong khung dán vào **Claude extension (VS Code)**. Dev server đã chạy `http://localhost:3000` (DB = Supabase chung). Tiếp nối phiên test 9-bug R7 (đã PASS). Mục tiêu: quét **hết luồng LMS** để chắc không hồi quy trước khi push.

---

## SETUP / TIỀN ĐỀ (đọc trước — vài mục cần Claude Code hoặc user lo)

- **Server**: đã chạy `http://localhost:3000`. Admin đang đăng nhập = **Hồ Đắc Phúc (Super Admin)**.
- **DB Supabase chung, gần như rỗng** — chỉ ít data thật (GV/nhân sự: vd Hoàng Phan Tuấn Kiệt). **KHÔNG đụng data thật**; mọi record tạo mới đặt prefix `__TEST__`.
- **Feature flags đang OFF mặc định**: `SESSION_LIFECYCLE_V2`, `MEDIA_SIGNED_URL`, `EVAL_V2_ENABLED`, `SCORM_ENABLED`. Mục nào cần bật sẽ ghi `[CẦN FLAG: X]` — báo user bật trong `.env.local` + restart dev (Claude Code làm), nếu không thì test ở hành vi default.
- **Tài khoản (trạng thái thực tế 2026-06-19):**
  - ✅ **Admin**: Hồ Đắc Phúc (Super Admin) — đang đăng nhập. Dùng cho Phase A–F, H, I (catalog), J.
  - ✅ **Phụ huynh** (Phase G – Portal): `test-convert@example.com` / `Test@1234!` (ACTIVE, là PH của Bé A & Bé B). Đăng xuất admin → login PH để test portal.
  - ⚠️ **Giáo viên** (Phase C/E – góc nhìn GV): `test-teacher@example.com` / `Test@1234!` đã tạo + gán lớp `CS2.SATA1.26.001`, NHƯNG **chưa có `UserOrgRole`** → các trang dùng `scopedDb` sẽ ra **scope rỗng** (kiểu RC-A), có thể không thấy data. → **Phase C/E góc-nhìn-GV HOÃN** cho tới khi user duyệt seed RBAC. Phần admin (Super Admin thao tác hộ) vẫn test được logic; chỉ riêng "đăng nhập GV để chấm/đánh giá" tạm hoãn.
  - ⏸️ **User scope CS1** (Phase I.3 – cách ly cơ sở): **HOÃN** — cần seed RoleDef + gán `CENTER_MANAGER@CS1` (user chưa duyệt). Bỏ qua I.3, ghi DEFERRED.
  - **Kế toán**: Super Admin xác nhận payment được → không cần tài khoản riêng.
- **Data nền sẵn có** (từ phiên trước, tái dùng): lead `cmqkflvjj003yr3o7gwyndp1o` đã ENROLLED → 2 HV `__TEST__ Bé A` (CS2-26-K9J7X8) + `Bé B` (CS2-26-2F55FQ) trong lớp `CS2.SATA1.26.001` (Cơ sở Hoàng Diệu, khoá Sata1, 1.485.000đ). Order `ORD-TEST-…` + Payment RECORDED/PENDING.
- **Cách báo cáo**: mỗi mục ghi **Kỳ vọng / Thực tế / PASS-FAIL-FLAG** + console/network lỗi. Cuối mỗi Phase: tiểu kết. **KHÔNG push/merge. KHÔNG xoá data thật. Đổi DB → báo trước.**

---

## PHASE A — CRM / Phễu Lead (L1→L2→L3)
Routes: `/admin/leads`, `/admin/trial-classes`, `/admin/trials`, `/admin/convert-conflicts`, `/admin/ban-giao-lead`, `/admin/cham-soc-hv`, `/admin/crm`, `/admin/chuyen-lop`.
1. `/admin/leads` — list + kanban: lọc trạng thái, đổi trạng thái 1 lead `__TEST__`, kiểm timezone hiển thị (giờ VN).
2. Tạo lead `__TEST__` mới → thêm con → **xếp lớp học thử** (`trial-classes/new`): chọn lớp trial, ngày, GV → lưu. Kỳ vọng: TrialEnrollment tạo, lead chuyển trạng thái phù hợp.
3. `/admin/trial-classes/[id]` — ghi nhận buổi trial (6 nhãn điểm danh nếu có), feedback.
4. `/admin/convert-conflicts` — nếu có lead trùng email+SĐT 2 hồ sơ → màn xử lý xung đột hiển thị.
5. `/admin/ban-giao-lead`, `/admin/cham-soc-hv` — load + thao tác cơ bản (giao lead, task chăm sóc).
6. **Convert lại 1 lead khác** (đầy đủ: tạo order+payment RECORDED → REGISTERED → convert) để chắc luồng lặp lại OK (không chỉ lead cũ).

## PHASE B — Lớp học, Lớp ghép, Chương trình, Khoá
Routes: `/admin/classes`, `/admin/class-groups`, `/admin/curriculums`, `/admin/courses`, `/admin/course-packages`, `/admin/course-prerequisites`, `/admin/rooms`, `/admin/enrollments`.
1. `/admin/classes/new` — tạo lớp `__TEST__` (chọn Đơn vị, khoá, GV, phòng, lịch). Kiểm `classes/[id]/edit`, `classes/[id]/students`, `classes/[id]/progress`.
2. `/admin/class-groups` — tạo nhóm lớp + ghi danh nhóm vào lớp.
3. `/admin/curriculums/new` — tạo chương trình + bài học; thử **khoá bài (Lesson.status/lock)** + tạo **LessonChangeRequest** (resize/đổi). [R7-10]
4. `/admin/courses`, `/admin/course-packages`, `/admin/course-prerequisites` — CRUD + giá; kiểm prerequisite chặn đăng ký nếu chưa đạt.
5. `/admin/rooms` — CRUD phòng theo cơ sở.
6. `/admin/enrollments` — chuyển lớp (`/admin/chuyen-lop`), tạm dừng/bảo lưu/rút (reserve/withdraw), kiểm state machine Enrollment (PENDING→CONFIRMED→STUDYING→PAUSED→COMPLETED/WITHDREW/TRANSFERRED).

## PHASE C — Buổi học & Điểm danh
Routes: `/admin/sessions`, `/admin/sessions/[id]`, `/admin/attendance`, `/admin/classes/[id]/progress`.
1. `/admin/sessions/new` — tạo buổi cho lớp `CS2.SATA1.26.001`; `sessions/[id]` xem chi tiết.
2. **`[CẦN FLAG: SESSION_LIFECYCLE_V2]`** "Hoàn tất buổi" (session.taught) → kiểm: phát sinh **HomeworkAssignment tự động** [R7-14] + thông báo "bài tập mới". Khi flag OFF: nút lifecycle ẩn/không hiệu lực — xác nhận đúng hành vi default.
3. **Điểm danh**: `/admin/attendance` — 6 nhãn điểm danh; **học bù chéo cơ sở (makeup)** [R7-08]: xếp HV CS2 học bù ở buổi khác → kiểm không quá sĩ số (race guard), 5 metrics.
4. **Phân công GV / GV dạy thay (substitute)** cho buổi; thử **trùng phòng / trùng GV** cùng khung giờ → kỳ vọng cảnh báo conflict.
5. Feedback per-HV cuối buổi (StudentSessionFeedback) → kiểm phát sinh thông báo cho phụ huynh.

## PHASE D — Bài tập & Bài thi
Routes: `/admin/assignments`, `/admin/exams`, `/admin/questions`, portal `/portal/bai-tap`, `/portal/bai-thi`.
1. `/admin/assignments` — bài tập tạo tay + bài auto từ buổi (Phase C.2); `assignments/[id]/edit`.
2. `/admin/questions` (+ `questions/import`) — ngân hàng câu hỏi; `questions/new`.
3. `/admin/exams/new` → `exams/[id]/builder` (cấu hình đề) → `exams/[id]/preview`. **Import Word**: `/admin/exams/import-word` (.docx) [R7-13] — cần file .docx mẫu (user cấp hoặc flag điểm verify control).
4. `exams/[id]/attempts` — xem lượt làm; kiểm **thi lại (attemptNo + maxAttempts)** [W5a].

## PHASE E — Học bạ & Đánh giá
Routes: `/admin/report-cards`, `/admin/report-cards/criteria`, `/admin/evaluations`.
1. `/admin/report-cards/criteria` — tiêu chí; `report-cards/[enrollmentId]` — tạo học bạ cho HV `__TEST__ Bé A`: nhập điểm bài-tập + kỹ-năng → **state machine** (DRAFT→…→PUBLISHED) + **snapshot** [R7-15]. Kiểm GV phụ trách mở SkillEditor được [W4].
2. Publish học bạ → kiểm hiện ở portal phụ huynh (Phase G).
3. **`[CẦN FLAG: EVAL_V2_ENABLED]`** `/admin/evaluations` — vòng đánh giá GV (teacher-eval) + khảo sát trung tâm (center-survey) [R7-16]; `evaluations/[id]`, `evaluations/results/[roundId]`.

## PHASE F — Tài chính (2 tầng) & Công nợ
Routes: `/admin/orders`, `/admin/payments`, `/admin/cong-no`, `/admin/vouchers`. (FixLMS **không có** `/admin/hoan-tien`.)
1. `/admin/orders` — danh sách + `orders/new` (đơn walk-in); `orders/[id]`.
2. `/admin/payments` — **luồng 2 tầng** [R7-04]: Sale ghi nhận (RECORDED) → **Kế toán xác nhận (CONFIRMED) → sinh Receipt** (per Enrollment) → kiểm idempotent (bấm confirm 2 lần chỉ 1 phiếu). Thử **reject** (thu hồi receipt VOID + event `payment.rejected`) + **điều chỉnh (ADJUSTED)**.
   - Lưu ý: dùng Order `ORD-TEST-…` đã có (payment đang PENDING) → confirm thử. Nhưng `confirmPayment` cần `enrollmentId` → gắn enrollment của Bé A/Bé B vào khoản khi ghi nhận.
3. `/admin/cong-no` — OrderInstallment 2 đợt + nhắc nợ (reminderDays, cron `/api/cron/debt-reminder`); kiểm anti-spam 1 lần/ngày.
4. `/admin/vouchers` — CRUD + áp voucher vào đơn.

## PHASE G — Portal phụ huynh `[CẦN tài khoản PHỤ HUYNH]`
Routes: `/portal/*`. **Đăng xuất admin → đăng nhập phụ huynh** (xem Setup).
1. `/portal` dashboard + `/portal/ho-so`, `/portal/ho-so-con` — hồ sơ con (KHÔNG lộ studentId trên URL).
2. `/portal/lich-hoc`, `/portal/lich` — lịch buổi học (calendar tháng).
3. `/portal/hinh-anh` — ảnh theo buổi; **`[CẦN FLAG: MEDIA_SIGNED_URL]`** kiểm signed URL có hạn; chỉ ảnh con mình + tôn trọng StudentConsent.
4. `/portal/bai-tap` (+ `lam-bai/[homeworkId]`), `/portal/bai-thi` (+ `[examId]`) — làm bài, **nút "Thi lại"** [W5a], `/portal/ket-qua`.
5. `/portal/hoc-ba` — học bạ đã publish (Phase E.2) hiển thị đúng.
6. `/portal/hoc-phi` — **CHỈ hiện khoản accountantStatus=CONFIRMED** (khoản PENDING không hiện); số dư = finalPrice − Σ CONFIRMED + Receipt.
7. `/portal/tin-nhan` — **nhắn 2 chiều** [W5c] với admin/GV (ConversationMessage); `/portal/nhan-xet`, `/portal/danh-gia`, `/portal/danh-gia-gv`, `/portal/khao-sat`.
8. `/portal/thong-bao` — thông báo (17 trigger: convert, bài tập mới, makeup, học bạ publish, nợ…), `/portal/yeu-cau`, `/portal/satacoin`, `/portal/bai-giang`.

## PHASE H — Thông báo · Lịch · Báo cáo dashboard
1. `/admin/lich` (nếu có) / lịch tháng buổi học admin.
2. **Báo cáo (Recharts)**: `/admin/bao-cao/lms`, `/bao-cao/lead`, `/bao-cao/trial`, `/bao-cao/dao-tao`, `/bao-cao/trung-tam` — load, số liệu không lỗi, biểu đồ render. (Không có `/admin/bao-cao` index → 404 là đúng.)
3. `/admin/canh-bao-rui-ro` — cảnh báo rule-based (HV sắp hết khoá `students/sap-het-khoa`, nợ quá hạn…).

## PHASE I — RBAC, Tổ chức & Cách ly cơ sở
Routes: `/admin/roles`, `/admin/users`, `/admin/users/[id]/org-roles`, `/users/[id]/permissions`, `/admin/centers`, `/admin/audit-log`.
1. `/admin/centers` — cây OrgUnit (HO/CS1/CS2 ngang hàng); thêm/sửa.
2. `/admin/roles` + `/admin/users/[id]/org-roles` — gán UserOrgRole; chỉ SUPER_ADMIN sửa role + bắt buộc reason/audit.
3. **Cách ly cơ sở**: đăng nhập user chỉ thuộc CS1 → vào lớp/HV/payment → **KHÔNG thấy data CS2** (scopedDb). Đây là kiểm bảo mật quan trọng.
4. `/admin/audit-log` — các thao tác trên đều ghi AuditLog (mask PII theo quyền).

## PHASE J — Tuân thủ NĐ13
Route: `/admin/compliance`.
1. Kiểm StudentConsent (đã tick lúc convert) hiển thị; thu hồi consent → ảnh con bị ẩn ở portal.
2. Xoá ẩn danh / xuất dữ liệu (có watermark + audit lại) nếu UI có.

## PHASE K — SCORM `[CẦN FLAG: SCORM_ENABLED + R2 creds]`
Routes: `/admin/scorm`, `/admin/scorm/play/[id]`. Mặc định OFF + cần R2 → **chỉ verify trang gate/ẩn đúng khi OFF**; ingest/play thật để staging.

---

## ƯU TIÊN nếu thiếu thời gian
P1 (bắt buộc trước push): Phase G.6 (hoc-phi chỉ CONFIRMED), Phase F.2 (payment 2 tầng + receipt), Phase C (session/attendance), Phase E.1-2 (học bạ publish→portal), Phase I.3 (cách ly cơ sở).
P2: phần còn lại. P3: K (SCORM).

## ĐỊNH DẠNG KẾT QUẢ
Bảng `Phase | Mục | Kỳ vọng | Thực tế | PASS/FAIL/FLAG | Ghi chú` + tiểu kết mỗi Phase + danh sách bug (file:line nghi ngờ) + kết luận GO/NO-GO tổng. **Không push.**
