# BA #08 — Gap Analysis & Kế hoạch FixLMS **Vòng 2** (test tay sau FL vòng 1)

> **Input:** 17 nhóm phát hiện test tay của TGĐ (25/06/2026) sau khi nghiệm thu FL vòng 1 (19 task, nhánh `fl-integration`) · phiếu mẫu `0-tai-lieu-goc/Phiếu đánh giá buổi học.pdf` · **code hiện trạng nhánh `fl-integration`** (map qua 6 explorer agent, snapshot 25/06/2026) · BA #07 + Phase FL · Doc 15.
> **Output:** gap từng nhóm (hiện trạng file:line → đích → việc → độ phức tạp) + user story/AC + **đề xuất chia wave FL-R2** theo module. Đầu vào cho `prepare-prompt` → ticket.
> **Nguyên tắc:** TÁI DÙNG model/pipeline sẵn có (EvalForm engine · ScormPackage.lessonId · scopedDb · convertLeadV2 · TrialClassV2). Additive trước — drop sau (2-phase). **Doc 15 thắng doc cũ; code thắng doc khi mô tả hiện trạng.** Sửa BE thì **sửa kèm FE + DB** cùng PR. Tiền/enrollment đi transaction; side-effect đi DomainEvent; đọc nghiệp vụ qua `scopedDb(actor)`; server action mở đầu `can()`; mutation nhạy cảm ghi AuditLog.
> **Trạng thái:** 🟢 **4 quyết định kiến trúc đã chốt (TGĐ 25/06/2026 — xem §7).** Sẵn sàng `prepare-prompt` sinh ticket FL-R2.

---

## 0. Tổng quan & ánh xạ 17 nhóm → 6 epic (thứ tự: **làm trọn theo module**)

| Epic | Nhóm test tay | Bản chất | Thứ tự |
|---|---|---|---|
| **E2-LEAD** — Lead chi tiết & Convert | 1, 2 | Phải F5 mới thấy data mới; convert→ghi danh hiện note kỹ thuật thay vì trạng thái thanh toán (đã nộp/tổng phải thu) | **1** |
| **E2-ORDER** — Tạo đơn thủ công | 3 | Dropdown khoá học load nhầm danh mục (Course không lọc `isTeachable`); nhãn phương thức TT hiện như mã (data seed) | **2** |
| **E2-TRIAL** — Học thử / Lớp trải nghiệm | 4, 5, 6, 7 | Gán lớp không được; form nhận xét sai (phải dùng phiếu đánh giá buổi); thiếu CRUD/search lead + lịch sử học thử; **redesign lớp trải nghiệm thành slot tái sử dụng** + auto-Kanban | **3** |
| **E2-CLASS** — Lớp học & gộp buổi/điểm danh/ảnh/học bù | 8, 9, 10 | Chưa có trang chi tiết lớp gộp; chưa tự sinh điểm danh; phân quyền GV/QL; gộp 4 module rời vào trang lớp + xoá khỏi sidebar; mở SCORM cho GV trong lớp | **4** |
| **E2-LMS** — Khoá học / Giáo trình / Bài tập / SCORM | 11, 12, 13, 14, 15, 16 | **Gộp Gói bán + Khoá dạy → 1 "Khoá học" (gộp DB)**; sửa buổi giáo trình thiếu upload SCORM + chọn bài tập; bài tập theo buổi/khoá auto-add khi tạo lớp; bật SCORM; dọn sidebar | **5** |
| **E2-RBAC** — Phân giáo viên theo cơ sở | 17 | GV chưa gán center → tạo lớp CS1 vẫn hiện GV CS2 | **6** (xen kẽ — chặn E2-CLASS) |

> ⚠️ **Lưu ý phụ thuộc:** E2-RBAC (item 17 — gán GV theo cơ sở) **chặn** phần "tạo lớp" của E2-CLASS, và backfill center cũng cần cho scopedDb. Đề xuất **làm item 17 ngay đầu E2-CLASS** (cùng wave) dù xếp module cuối.

> 🔬 **3 triệu chứng "code đã đúng nhưng người dùng vẫn thấy lỗi"** — cần **repro runtime trước khi code** (không sửa mù):
> - **Item 1** (reload thủ công): 15/15 action lead **đã có** `revalidatePath` + vài chỗ `router.refresh()`. Triệu chứng vẫn còn → nghi client component giữ state cục bộ / path dynamic `/leads/[id]` không khớp / dev-server Turbopack HMR lỗi (đã thấy panic khi chạy local). **Task R2-LEAD-1 = điều tra rồi mới vá.**
> - **Item 3** (nhãn hiện như mã): code form **đã** map nhãn tiếng Việt; "phương thức TT" lấy `PaymentMethod.name` từ DB → nghi **data seed** ghi name = mã. Kiểm DB trước.
> - **Item 4** (không gán được lớp trải nghiệm): service `enrollLeadChild` **có** hoạt động qua widget ở trang chi tiết lead; "không gán được" có thể là (a) không có nút gán **tại trang học thử**, hoặc (b) bug runtime. Repro trước.

---

## 1. EPIC E2-LEAD — Lead chi tiết & Convert→Ghi danh (item 1, 2)

### 1.1 Hiện trạng (as-is)

| Thành phần | Trang / file | Ghi chú |
|---|---|---|
| Chi tiết lead | `app/(admin)/admin/leads/[id]/page.tsx` | hiện ghi chú, con, học thử, hoạt động — **KHÔNG có khối thanh toán** |
| Actions lead | `app/(admin)/admin/leads/actions.ts` | **15/15 action có `revalidatePath`** (xem bảng BA gốc) |
| Convert v2 | `app/(admin)/admin/leads/[id]/convert/page.tsx` · `lib/crm/convert-lead-v2.ts` | hiện payment status **chỉ ở trang convert**; text cảnh báo là **ngôn ngữ kỹ thuật** |
| Guard thanh toán | `convert-lead-v2.ts:23-30` `evaluatePaymentGuard()` | cho convert nếu ≥1 `Payment.saleStatus=RECORDED` **hoặc** `finalPrice=0` |
| Số liệu đã thu | `convert/page.tsx:58-64` | `payment.aggregate({where:{saleStatus:RECORDED, order:{leadId}}})` → count + sum |

### 1.2 Gap & việc

| # | Item | Hiện trạng | Đích | Việc (BE/FE/DB) | Phức tạp |
|---|---|---|---|---|---|
| LE-1 | 1 | Phải F5 mới thấy data mới dù action có revalidate | Thao tác xong tự cập nhật, không F5 | **Điều tra runtime** (Turbopack HMR? client state? path khớp?) → vá đúng chỗ. Có thể bổ sung `router.refresh()` ở component thao tác còn thiếu, hoặc `revalidateTag` | TB (điều tra trước) |
| LE-2 | 2 | Trang convert + chi tiết hiện **note kỹ thuật** ("REGISTERED/R7-04/PAYMENT_REQUIRED…") | Hiện **trạng thái thanh toán dễ hiểu cho admin**: *Đã nộp X đ / Tổng phải thu Y đ / Còn thiếu Z đ* + badge "Đủ điều kiện chốt / Chưa đủ" | FE: viết lại copy thành ngôn ngữ nghiệp vụ + khối số tiền. BE: bổ sung `finalPrice` (tổng phải thu) + `remaining` vào dữ liệu trang. Thêm khối thanh toán **ở cả trang chi tiết lead** (LE-3) | TB |
| LE-3 | 2 | Payment status chỉ ở trang convert | Khối "Thanh toán" hiển thị ngay **trang chi tiết lead** trước nút Chuyển đổi | FE: card thanh toán ở `[id]/page.tsx`. BE: helper `getLeadPaymentSummary(leadId)` (đã thu/tổng/còn thiếu) qua scopedDb | TB |

### 1.3 User story

**US2-LEAD-1** · Là **Sale/CSM**, tôi muốn **thấy ngay 'đã nộp bao nhiêu / tổng phải thu / còn thiếu' ở trang lead và trang chốt đơn** để **biết lead đã đủ điều kiện ghi danh chưa, không phải đọc dòng ghi chú kỹ thuật**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 2 · Test T-LEAD
- AC1: Given lead có ≥1 Order, When mở chi tiết lead, Then thấy khối "Thanh toán": *Đã nộp (Σ Payment RECORDED), Tổng phải thu (Σ finalPrice/Order), Còn thiếu* — định dạng tiền VND.
- AC2: Given chưa đủ tiền & học phí > 0, When xem trạng thái, Then badge "Chưa đủ điều kiện chốt" + câu hướng dẫn **nghiệp vụ** ("Cần ghi nhận thanh toán trước khi chuyển sang Đã đăng ký"), **không** hiện mã `PAYMENT_REQUIRED`/`R7-04`.
- AC3: Given học bổng 100% (tổng phải thu = 0), Then badge "Đủ điều kiện chốt (miễn phí)".

**US2-LEAD-2** · Là **Sale/CSM**, tôi muốn **danh sách & chi tiết lead tự cập nhật sau khi tôi thao tác** để **không phải F5 thủ công**.
- Ưu tiên: **Must** · Loại: NFR(usability) · Truy vết: item 1 · Test T-LEAD
- AC1: Given đang ở chi tiết lead, When đổi trạng thái / thêm ghi chú / chuyển lead, Then UI phản ánh thay đổi **không cần F5** (≤1s).
- AC2: Điều tra & ghi nhận **nguyên nhân gốc** (HMR dev vs prod build) trước khi kết luận pass — không báo PASS chỉ vì "đã có revalidatePath".

---

## 2. EPIC E2-ORDER — Tạo đơn hàng thủ công (item 3)

### 2.1 Hiện trạng

- Trang: `app/(admin)/admin/orders/new/page.tsx` · form `orders/_components/order-create-form.tsx` · data `orders/_actions.ts:627 loadCreateOrderFormData()`.
- Nhãn dropdown **đã tiếng Việt** (hardcode "Khoá học/Gói combo/Sản phẩm", "Nháp/Chờ TT/Đã xác nhận"); có sẵn `ORDER_TYPE_LABEL`, `ORDER_STATUS_LABEL` (`lib/orders/status.ts`).
- Phương thức TT lấy `PaymentMethod.name` từ DB (`_actions.ts:632-644`).
- Dropdown sản phẩm khi `type=COURSE`: `db.course.findMany({where:{isActive,isPublished}})` (`_actions.ts:646-650`) → **lọt "Lập trình Robot"/"Luyện thi RoboSim"** (là Course cũ `isTeachable:false` = danh mục) vì **không lọc `isTeachable:true`**.

### 2.2 Gap & việc

| # | Item | Hiện trạng | Đích | Việc | Phức tạp |
|---|---|---|---|---|---|
| OR-1 | 3 | Dropdown khoá học lọt 2 "danh mục" LTR/LTRS | Chỉ hiện **khoá dạy thật**: Sata 1–8 + Combo | BE: thêm `isTeachable:true` vào query (`_actions.ts:646`). (Sau khi gộp Course/Package ở E2-LMS thì nguồn duy nhất) | Thấp |
| OR-2 | 3 | Phương thức TT hiển thị như mã | Hiện "Tiền mặt", "Chuyển khoản"… | **Kiểm DB**: `PaymentMethod.name` có đang = mã (CASH…) không → sửa seed/data. Nếu muốn nhãn loại: thêm `lib/payments/labels.ts` `PAYMENT_METHOD_TYPE_LABEL` | Thấp |
| OR-3 | 3 | Nhãn loại đơn/trạng thái hardcode rời | Dùng chung `ORDER_TYPE_LABEL`/`ORDER_STATUS_LABEL` (DRY) | FE refactor form → import label registry | Thấp |

### 2.3 User story

**US2-ORDER-1** · Là **Sale**, tôi muốn **dropdown khoá học trong đơn chỉ liệt kê khoá dạy thật (Sata 1–8, Combo)** để **không chọn nhầm danh mục**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 3 · Test T-ORDER
- AC1: When chọn loại đơn = Khoá học, Then dropdown chỉ hiện Course có `isTeachable=true`; **không** hiện "Lập trình Robot"/"Luyện thi RoboSim".
- AC2: Mọi dropdown (phương thức TT, loại đơn, trạng thái, trung tâm) hiển thị **tên tiếng Việt**, không hiển thị mã enum/ID.

---

## 3. EPIC E2-TRIAL — Học thử / Lớp trải nghiệm (item 4, 5, 6, 7)

> **QĐ-R2-1 (chốt): Lớp trải nghiệm = "slot tái sử dụng"** — bỏ `startDate`, cấu hình **số buổi trong form tạo**, gán học viên bất kỳ lúc nào, mỗi buổi điểm danh độc lập, **dùng lại nhiều lần**. → đổi schema `TrialClassV2`/`TrialClassSession` (2-phase, migration mới).

### 3.1 Hiện trạng

| Thành phần | file:line | Ghi chú |
|---|---|---|
| List/Detail | `trial-classes/page.tsx`, `[id]/page.tsx` | list nhóm theo status; **không search**, **không CRUD lead tại đây** |
| Create form | `_components/create-form.tsx` | **bắt buộc startDate** (validate future); cấu hình số buổi tách ở `config-section.tsx` (TrialProgramConfig) |
| Model | `schema.prisma:4905-4995` | `TrialClassV2`(startDate, sessionCount snapshot) · `TrialClassSession`(auto weekly từ startDate) · `TrialEnrollment`(summaryNote — **chưa có UI**) · `TrialAttendance`(PRESENT/ABSENT) |
| Gán lead | `leads/[id]/_components/trial-enroll-widget.tsx` + `lib/trial/service.ts:225` `enrollLeadChild` | gán từ **trang lead** (không từ trang học thử); set `LeadChild.trialStatus=SCHEDULED`; event `trial.assigned` |
| Auto-Kanban | `lib/trial/service.ts:368-433` `completeTrialSession` | khi buổi cuối COMPLETED → `trialStatus=ATTENDED`, nếu mọi con ATTENDED → `Lead.status=TRIAL_ATTENDED` |
| Form nhận xét | `evaluations/_components/trial-session-eval-fill.tsx` + `session-eval-actions.ts:116` | **đã** dùng `SessionEvalEditor` (EvalForm SESSION_EVAL) — đúng hướng phiếu đánh giá buổi |
| Kanban cols | `lib/leads/status.ts:63-76` | **thiếu** cột `TRIAL_IN_PROGRESS`; trạng thái `AWAITING_DECISION` có enum nhưng **không auto-trigger** |
| Lịch sử học thử | — | **KHÔNG có bảng lịch sử**; chỉ `LeadChild.trialStatus` (current state, không timestamp, không ref class) |

### 3.2 Gap & việc

| # | Item | Hiện trạng | Đích | Việc (BE/FE/DB) | Phức tạp |
|---|---|---|---|---|---|
| TR-1 | 7 | Model cohort: startDate bắt buộc, auto buổi tuần | **Slot tái sử dụng**: bỏ startDate, **số buổi cấu hình trong form tạo**, add HV bất kỳ lúc nào, buổi điểm danh độc lập (theo giờ/GV), dùng lại nhiều lần. CRUD đầy đủ (thêm/sửa/xoá) | DB: `TrialClassV2` bỏ ràng buộc startDate (nullable + 2-phase), `sessionCount` nhập khi tạo; bỏ auto-gen weekly → tạo buổi ad-hoc. FE: form tạo bỏ field ngày bắt đầu, thêm số buổi + nút thêm/sửa/xoá lớp | **Cao** |
| TR-2 | 4 | Gán lớp chỉ từ trang lead; báo "không gán được" | Gán/huỷ học viên **ngay trong trang chi tiết lớp trải nghiệm** + repro lỗi gán | FE: nút "Thêm học viên" trong `[id]/page.tsx` (search lead/child). BE: tái dùng `enrollLeadChild` + thêm `unenroll`. Repro item 4 trước | TB |
| TR-3 | 6 | Trang chính học thử không CRUD/search lead | **Search + lọc** lead học thử; lead **biến mất khỏi list khi đã chuyển Kanban** (đăng ký/mất) nhưng **lưu lịch sử** | DB: model `LeadTrialHistory` (leadChildId, trialClassId, attendedSessions, firstAttendedAt, lastAttendedAt, outcome). FE: search box + filter; ẩn lead đã rời pipeline trial nhưng giữ history. BE: ghi history khi điểm danh/đổi trạng thái | **Cao** |
| TR-4 | 6 | Không hiện "đã học thử + thời gian" | Note **"Đã học thử (ngày…)"** trên lead/Kanban; nếu lead quay lại (đã mất → quan tâm lại) vẫn còn thông tin cũ | FE: badge/note từ `LeadTrialHistory`. BE: query history theo leadChild | TB |
| TR-5 | 7 | Điểm danh không auto đổi Kanban "đang/đã học thử" | **Điểm danh buổi đầu → Kanban "Đang học thử" (TRIAL_IN_PROGRESS)**; buổi cuối/đủ buổi → "Đã học thử" | DB: thêm cột Kanban `TRIAL_IN_PROGRESS` vào `KANBAN_COLUMNS`. BE: trong action điểm danh trial → set trialStatus + Lead.status. Event idempotent | TB |
| TR-6 | 7 | Hết buổi chưa ĐK → không auto chuyển | **Hết số buổi học thử mà chưa đăng ký → tự chuyển Kanban "Chờ quyết định" (AWAITING_DECISION)** | BE: trong `completeTrialSession`/khi attendedSessions ≥ sessionCount & chưa ENROLLED → set `AWAITING_DECISION` + event | TB |
| TR-7 | 5 | Form nhận xét hiện tại ở trang học thử (cần bỏ) | **Xoá form nhận xét cũ**; thêm **nút "Nhận xét học viên"** mở phiếu giống `Phiếu đánh giá buổi học.pdf`, **tạo sẵn từ trang Đánh giá & Khảo sát** (EvalForm SESSION_EVAL) | FE: gỡ form cũ, thêm nút mở `SessionEvalEditor` cho trial session. BE: đảm bảo **seed sẵn 1 EvalForm SESSION_EVAL mặc định** (round mở) để trial dùng ngay | TB |
| TR-8 | 7 | Click HV chưa dẫn tới điểm danh + đánh giá | Trong chi tiết lớp: **search HV đã học** → click HV → trang **điểm danh lớp trải nghiệm của HV đó + phần đánh giá của GV** | FE: list HV có search; route/section per-HV (điểm danh + eval). Không lộ `studentId` trên URL (Doc 15) | TB |

### 3.3 User story tiêu biểu

**US2-TRIAL-1** · Là **Quản lý cơ sở**, tôi muốn **tạo lớp trải nghiệm như một "khung" tái sử dụng (theo giờ/giảng viên, cấu hình số buổi ngay khi tạo, không cần ngày bắt đầu)** để **dùng lại nhiều lần cho nhiều học viên đến học thử**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 7 · Test T-TRIAL
- AC1: When tạo lớp trải nghiệm, Then form **không có** field "ngày bắt đầu"; **có** field "số buổi" cấu hình tại đây.
- AC2: Given lớp đã tạo, When add học viên bất kỳ lúc nào, Then học viên vào lớp không phụ thuộc lịch cố định; mỗi buổi điểm danh độc lập.
- AC3: CRUD đầy đủ: thêm/sửa/xoá lớp trải nghiệm (theo quyền QL cơ sở; scopedDb cách ly CS).

**US2-TRIAL-2** · Là **Sale/QL**, tôi muốn **điểm danh buổi học thử tự cập nhật Kanban, và khi hết buổi mà chưa đăng ký thì tự đưa lead về "Chờ quyết định"** để **pipeline tự chạy không phải kéo thẻ tay**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 7 · Test T-TRIAL
- AC1: Given lead `TRIAL_SCHEDULED`, When điểm danh buổi đầu, Then Lead → "Đang học thử"; có cột Kanban tương ứng.
- AC2: When điểm danh đủ số buổi cấu hình, Then Lead → "Đã học thử".
- AC3: Given đã đủ buổi & chưa ENROLLED sau Δ ngày (hoặc ngay khi đủ buổi), When hệ thống xét, Then Lead → "Chờ quyết định" (AWAITING_DECISION) — rule-based, không AI.

**US2-TRIAL-3** · Là **Sale**, tôi muốn **lead đã rời pipeline học thử biến mất khỏi danh sách học thử nhưng vẫn lưu lịch sử "đã từng học thử + thời gian"** để **nếu họ quay lại quan tâm thì không mất dữ liệu cũ**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 6 · Test T-TRIAL
- AC1: Given lead đã chuyển ENROLLED hoặc LOST, When xem danh sách học thử, Then **không** thấy lead đó trong danh sách đang hoạt động.
- AC2: Given lead đó, When mở chi tiết, Then thấy lịch sử "Đã học thử: lớp X, n buổi, ngày…".
- AC3: Given lead LOST quay lại quan tâm, When tái mở pipeline, Then history cũ còn nguyên (không bị xoá).

---

## 4. EPIC E2-CLASS — Lớp học & gộp buổi/điểm danh/ảnh/học bù (item 8, 9, 10)

### 4.1 Hiện trạng

| Thành phần | file:line | Ghi chú |
|---|---|---|
| Lớp học list | `classes/page.tsx:73-95` | phân quyền `classes:view-all` (QL) vs `classes:view-own` (GV → lọc `teacherId`); Class ∈ SCOPED_MODELS |
| Chi tiết lớp | — | **KHÔNG có `classes/[id]/page.tsx`**; rải ở `[id]/students`, `[id]/edit`, `[id]/progress`, `[id]/session` |
| Buổi học | `sessions/page.tsx` · `lib/lms/session-gen.ts` | `generateSessionDates()` helper; tạo buổi thủ công; trang riêng |
| Điểm danh | `attendance/page.tsx` (2-phase chọn buổi→grid) | **chưa tự sinh** Attendance khi tạo lớp |
| Học bù | `lib/lms/makeup-service.ts` · `MakeupNeed` (`schema.prisma:4060`) · `/hoc-bu` | lifecycle PENDING→SCHEDULED→COMPLETED; cross-center exception |
| Ảnh lớp | `ClassSessionMedia` (`schema.prisma:3735`) · `/media` | GV upload→QL duyệt; `isClassWide`, tag HS, consent C6.2 |
| Đánh giá buổi per-HV | `lib/eval/session-eval.ts` · `EvalResponse.classSessionId` | EvalForm SESSION_EVAL |
| SCORM trong lớp | — | **chưa có** nút mở SCORM trong chi tiết lớp cho GV (chỉ ở `/teaching-materials`, `/scorm`) |
| Sidebar | `components/admin/sidebar.tsx:117-129` | có mục rời: Buổi học, Điểm danh, Ảnh lớp học, Học bù |

### 4.2 Gap & việc

| # | Item | Hiện trạng | Đích | Việc (BE/FE/DB) | Phức tạp |
|---|---|---|---|---|---|
| CL-1 | 9,10 | Không có trang chi tiết lớp; buổi/điểm danh/ảnh/học bù là trang rời | **Tạo `classes/[id]/page.tsx`** gộp tab: Thông tin · Buổi học+Điểm danh · Ảnh · Học bù · (GV) Tài liệu SCORM | FE: trang chi tiết lớp đa tab, di chuyển UI từ 4 trang vào. BE: tái dùng action sẵn có | **Cao** |
| CL-2 | 9 | Chưa tự sinh điểm danh | Sau **tạo lớp + gán HV** → **tự sinh buổi học theo lịch + bản ghi điểm danh** cho từng buổi của GV | BE: mở rộng `lib/classes/generate.ts` sinh ClassSession + Attendance (PENDING) cho HV. Transaction; idempotent | **Cao** |
| CL-3 | 8 | GV lọc `teacherId`; QL xem theo center | Giữ: **QL xem hết lớp cơ sở mình; GV chỉ lớp mình dạy** (đã gần đúng — verify scopedDb + teacherId) | BE: xác nhận filter; bổ sung nếu GV vẫn thấy lớp ngoài | Thấp |
| CL-4 | 8 | Ô text đầu trang chi tiết rời rạc | **Gộp các ô thông tin gọn gàng** (1 card tóm tắt: khoá, GV, phòng, lịch, sĩ số) | FE: layout lại header chi tiết lớp | Thấp |
| CL-5 | 9 | GV chưa mở SCORM tài liệu trong lớp | GV vào lớp mình → **mở & xem file SCORM tài liệu giảng dạy** của buổi (view code cho HS) | FE: section "Tài liệu giảng dạy" trong chi tiết lớp (player SCORM, đọc-only). Phụ thuộc **SCORM bật** (QĐ-R2-3) + quyền `teaching-materials:view-own-class` | TB |
| CL-6 | 9 | Học bù rời ở `/hoc-bu` | GV **điểm danh học bù + ngày học bù** ngay trong chi tiết lớp | FE: thao tác makeup trong tab điểm danh. BE: tái dùng makeup-service | TB |
| CL-7 | 9 | Ảnh + đánh giá per-HV rời | Sau điểm danh: GV/trợ giảng **chụp ảnh + đánh giá buổi học cho từng HV** (để làm học bạ năng lực sau) | FE: trong chi tiết lớp, mỗi buổi → upload ảnh (consent) + mở phiếu đánh giá per-HV. BE: tái dùng ClassSessionMedia + SESSION_EVAL | TB |
| CL-8 | 10 | Sidebar có 4 mục rời | **Xoá khỏi sidebar**: Buổi học, Điểm danh, Ảnh lớp học, Học bù (đã gộp vào chi tiết lớp) | FE: gỡ 4 mục `sidebar.tsx`; giữ route cũ redirect hoặc xoá | Thấp |

### 4.3 User story

**US2-CLASS-1** · Là **Giáo viên**, tôi muốn **vào lớp mình dạy và thấy mọi thứ trong một trang chi tiết lớp (buổi học đã tự sinh, điểm danh cả lớp, tài liệu SCORM, ảnh, đánh giá từng HV, học bù)** để **không phải nhảy qua 4 trang rời**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 9,10 · Test T-CLASS
- AC1: Given lớp vừa tạo + đã gán HV, When mở chi tiết lớp, Then **buổi học đã được tự sinh theo lịch** và mỗi buổi có sẵn danh sách điểm danh cả lớp.
- AC2: When GV điểm danh xong 1 buổi, Then có thể upload ảnh (theo consent) + mở phiếu đánh giá cho **từng HV** của buổi.
- AC3: Given buổi bị nghỉ, When GV điểm danh học bù, Then ghi nhận **ngày học bù** của HV; trạng thái makeup cập nhật.
- AC4: Các mục Buổi học/Điểm danh/Ảnh lớp/Học bù **không còn** ở sidebar; chỉ truy cập trong chi tiết lớp.

**US2-CLASS-2** · Là **Quản lý cơ sở**, tôi muốn **CRUD lớp học của cơ sở mình; giáo viên chỉ xem lớp mình dạy** để **đúng phân quyền & cách ly cơ sở**.
- Ưu tiên: **Must** · Loại: FR/NFR(security) · Truy vết: item 8 · Test T-CLASS, T-RBAC
- AC1: Given role QL cơ sở, When mở danh sách lớp, Then thấy **mọi lớp của cơ sở mình**, không thấy lớp cơ sở khác (scopedDb).
- AC2: Given role GV, When mở danh sách lớp, Then chỉ thấy **lớp mình là GV chính/trợ giảng**.

---

## 5. EPIC E2-LMS — Khoá học / Giáo trình / Bài tập / SCORM (item 11, 12, 13, 14, 15, 16)

> **QĐ-R2-2 (chốt): GỘP TRIỆT ĐỂ DB** — hợp nhất `CoursePackage` (gói bán) vào `Course` (khoá dạy) thành **1 khái niệm "Khoá học"**; 1 tab sidebar "Khoá học". Phải **migrate Order/Payment** đang trỏ `CoursePackage` (rủi ro cao — đi 2-phase, có rollback).
> **QĐ-R2-3 (chốt): BẬT SCORM** trên prod (`SCORM_ENABLED=true` + redeploy; R2 CORS đã có).
> **Nhắc nghiệp vụ:** "Lập trình Robot" & "Luyện thi RoboSim" = **DANH MỤC** (CourseCategoryDef); khoá học thật = **Sata 1–8 + Combo 1&2**. Mọi dropdown "khoá học" phải lọc `isTeachable=true`, **không** liệt kê danh mục.

### 5.1 Hiện trạng

| Thành phần | file:line | Ghi chú |
|---|---|---|
| Course (khoá dạy) | `schema.prisma:799-858` · `/admin/courses` | `category`(enum cũ) + `categoryId`(FK CourseCategoryDef mới) + `isTeachable`; hasMany Curriculum/Class/Enrollment |
| CoursePackage (gói bán) | `schema.prisma:1651-1712` · `/admin/course-packages` | FK `courseId`; đơn vị bán/giá; **Order trỏ tới** |
| Curriculum new/edit | `curriculums/new`, `[id]/edit` | **load đúng Course** (`db.course.findMany`); edit buổi qua `LessonResources` |
| LessonResources | `curriculums/[id]/edit` (~line 263) | **hiển thị** scormPackages + lessonAssignments — nhưng **có thể read-only/gated**; cần biến thành **upload + chọn bài tập** |
| Session form (buổi lớp) | `sessions/_components/session-form.tsx` | **thiếu** upload SCORM + chọn bài tập (đúng item 15 — nhưng SCORM gắn **Lesson**, không phải ClassSession) |
| HomeworkAssignment | `schema.prisma:3765-3789` | gắn `classSessionId`+`examId`+`studentId`; **không** FK Course/Curriculum; **không có UI auto-tạo** |
| Trang "Bài tập về nhà" | `/assignments` | là `Assignment` (bài giao), **không** phải HomeworkAssignment auto |
| SCORM | `ScormPackage` (`schema.prisma:4452`) · `/scorm`, `/documents`, `/teaching-materials` | đầy đủ upload→PUBLISHED, viewer; **gated `SCORM_ENABLED` (OFF)** |
| Sidebar LMS | `sidebar.tsx:131-144` | Chương trình học · **Gói bán** · **Khoá dạy** · Khoá tiên quyết · **Tài liệu giảng dạy** · Bài tập về nhà · **Tài liệu lớp tôi** · **SCORM** |
| Tài liệu lớp 404 | `teaching-materials/page.tsx` | route **tồn tại**; 404 user gặp **nghi do quyền** `teaching-materials:view-own-class` chưa cấp / flag OFF |

### 5.2 Gap & việc

| # | Item | Hiện trạng | Đích | Việc (BE/FE/DB) | Phức tạp |
|---|---|---|---|---|---|
| LM-1 | 13,16 | Course & CoursePackage tách, 2 tab "Khoá dạy"+"Gói bán" trùng | **Gộp DB** → 1 "Khoá học"; 1 tab sidebar | DB: migrate giá/field từ CoursePackage → Course; chuyển FK Order/Payment sang Course (2-phase: thêm `Order.courseId`, backfill, deprecate `packageId`). FE: 1 màn quản lý khoá học (có giá). Xoá tab "Khoá dạy" | **Rất cao** |
| LM-2 | 11,3 | Dropdown khoá học vài nơi lọt danh mục | Mọi nơi chọn "khoá học" lọc `isTeachable=true` | BE: rà & thêm filter (curriculum new/edit đã đúng; order — OR-1; các picker khác) | Thấp |
| LM-3 | 12,15 | Sửa buổi giáo trình: SCORM/bài tập **read-only/thiếu** | Trong **edit buổi của chương trình**: (a) **upload/gắn gói SCORM**, (b) **chọn bài tập về nhà** cho buổi | FE: biến `LessonResources` thành editor (upload SCORM + picker bài tập). BE: action gắn/gỡ `ScormPackage.lessonId`, homework↔lesson. Phụ thuộc SCORM bật | **Cao** |
| LM-4 | 14 | Homework gắn classSession+exam, không theo khoá; không auto | **Bài tập về nhà tạo sẵn theo từng buổi của từng khoá**; khi **tạo lớp + add khung CT → tự add bài tập theo buổi** | DB: thêm liên kết homework template ↔ Lesson/Course (vd `HomeworkTemplate(lessonId, examId)` hoặc dùng `Assignment.lessonId`). BE: khi generate lớp (CL-2) → sinh HomeworkAssignment từ template theo buổi | **Cao** |
| LM-5 | 12 | Chưa có luồng upload tài liệu giảng dạy + SCORM cho GV view code | **Bật SCORM** + GV mở/view SCORM trong lớp (CL-5) | Ops: `SCORM_ENABLED=true` + redeploy + gán quyền. Verify viewer | TB (Ops) |
| LM-6 | 16 | Sidebar lộn xộn/trùng | **Đổi "Gói bán"→"Khoá học"**; **xoá "Khoá dạy"** (trùng); **xoá "Tài liệu giảng dạy"** (=SCORM); **xoá tab "SCORM"** (tích hợp vào sửa buổi); **sửa 404 "Tài liệu lớp tôi"** (cấp quyền) | FE: dọn `sidebar.tsx`. BE: cấp `teaching-materials:view-own-class` cho GV | TB |

### 5.3 User story tiêu biểu

**US2-LMS-1** · Là **Đào tạo**, tôi muốn **chỉ còn một khái niệm "Khoá học" (gộp gói bán + khoá dạy)** để **không bị trùng/lẫn giữa hai tab**.
- Ưu tiên: **Must** · Loại: FR/BR · Truy vết: item 13,16 · Test T-LMS
- AC1: When mở sidebar, Then chỉ có **1 tab "Khoá học"**; không còn "Gói bán" và "Khoá dạy" tách rời.
- AC2: Given đơn hàng cũ trỏ gói bán, When sau migrate, Then đơn vẫn trỏ đúng khoá học (không mất dữ liệu) — kiểm 2-phase + rollback.
- AC3: Danh sách khoá học = Sata 1–8 + Combo (isTeachable), kèm giá; **không** hiện danh mục LTR/LTRS.

**US2-LMS-2** · Là **Đào tạo**, tôi muốn **gắn file SCORM (tài liệu giảng dạy) và chọn bài tập về nhà ngay khi sửa từng buổi của chương trình học** để **mỗi buổi đủ học liệu + bài tập**.
- Ưu tiên: **Must** · Loại: FR · Truy vết: item 12,15 · Test T-LMS
- AC1: Given buổi X trong curriculum, When mở sửa buổi, Then có section "Tài liệu giảng dạy" **upload/chọn gói SCORM** (1 active/buổi) + section "Bài tập về nhà" **chọn ≥1 bài**.
- AC2: Given SCORM bật, When GV mở buổi trong lớp mình, Then xem/present được file SCORM (view code cho HS).
- AC3: Given tạo lớp + add khung CT, When sinh buổi, Then **tự add bài tập về nhà theo buổi** từ template của khoá.

---

## 6. EPIC E2-RBAC — Phân giáo viên theo cơ sở (item 17)

### 6.1 Hiện trạng (root cause)

| # | file:line | Vấn đề |
|---|---|---|
| 1 | `lib/teachers/assignable.ts:27-46` | `getAssignableTeachers()` **không có** tham số centerId → trả **toàn bộ TEACHER hệ thống** |
| 2 | `schema.prisma:711-712` | `User.centerId`/`orgUnitId` có field nhưng **GV chưa được populate** (seed chỉ 1 admin); `TeacherProfile` **không có** centerId |
| 3 | `classes/new/page.tsx:40` | gọi `getAssignableTeachers()` **không truyền centerId** của lớp |
| 4 | `class-form.tsx:358` | dropdown render hết teachers, **không lọc center** |
| 5 | `lib/db-scope.ts:34` | `User` ∈ **SCOPE_EXEMPT** → scopedDb **không** tự lọc center cho User/TeacherProfile |

### 6.2 Gap & việc

| # | Item | Đích | Việc | Phức tạp |
|---|---|---|---|---|
| RB-1 | 17 | GV được gán cơ sở | **Backfill `User.centerId`** cho mọi GV (từ EmployeeOrgAssignment/UserOrgRole→center). Script + seed test GV cho CS1, CS2 | DB/script · TB |
| RB-2 | 17 | Helper lọc theo center | Thêm param `getAssignableTeachers({ centerId, includeIds })` → `where User.centerId = centerId` (kèm GV kiêm nhiệm nếu có) | BE · TB |
| RB-3 | 17 | Form tạo lớp lọc đúng | Truyền `centerId` của lớp (orgUnit) vào helper; dropdown **chỉ GV cùng cơ sở** | BE/FE · Thấp |

### 6.3 User story

**US2-RBAC-1** · Là **Quản lý cơ sở**, tôi muốn **khi tạo lớp tại cơ sở mình chỉ thấy giáo viên thuộc cơ sở đó** để **không phân nhầm GV cơ sở khác**.
- Ưu tiên: **Must** · Loại: FR/NFR(security) · Truy vết: item 17 · Test T-RBAC
- AC1: Given lớp ở CS1, When mở dropdown GV chính/trợ giảng, Then **chỉ** hiện GV có `centerId=CS1`; **không** hiện GV CS2.
- AC2: Given GV được backfill center, When seed/test cách ly, Then list GV của CS1 ≠ CS2 (test CI).
- AC3: (Đã chốt TBD-1) **Mỗi GV thuộc 1 cơ sở duy nhất** — không xử lý ca kiêm nhiệm; lọc thuần `User.centerId = lớp.centerId`.

---

## 7. Quyết định đã chốt (TGĐ 25/06/2026)

| Mã | Nội dung | Quyết định | Ảnh hưởng |
|---|---|---|---|
| **QĐ-R2-1** | Mô hình lớp trải nghiệm | **Slot tái sử dụng** (bỏ startDate, số buổi trong form tạo, dùng lại nhiều lần) | Redesign `TrialClassV2`/`TrialClassSession` — migration 2-phase |
| **QĐ-R2-2** | Gộp Gói bán × Khoá dạy | **Gộp triệt để DB** (CoursePackage → Course) | Migrate Order/Payment FK — rủi ro cao, 2-phase + rollback |
| **QĐ-R2-3** | SCORM | **Bật prod ngay** (`SCORM_ENABLED=true`) | Mở khoá luồng tài liệu giảng dạy/view code |
| **QĐ-R2-4** | Thứ tự thực thi | **Làm trọn theo module** (LEAD→ORDER→TRIAL→CLASS+RBAC→LMS) | Plan theo wave module, không quick-win rời |

### 7.1 TBD — **ĐÃ CHỐT** (TGĐ 25/06/2026)

| TBD | Câu hỏi | Quyết định | Ảnh hưởng |
|---|---|---|---|
| TBD-1 | GV có ca **kiêm nhiệm 2 cơ sở** không? | **KHÔNG** — mỗi GV thuộc 1 cơ sở duy nhất | RB-2 lọc đơn giản `User.centerId = centerId`; bỏ AC3 edge kiêm nhiệm của US2-RBAC-1 |
| TBD-2 | "Hết số buổi → Chờ quyết định" trigger lúc nào? | **NGAY KHI đủ buổi** (không chờ Δ ngày) | TR-6: trong action điểm danh, khi `attendedSessions ≥ sessionCount` & chưa ENROLLED → set `AWAITING_DECISION` ngay |
| TBD-3 | Gộp Course/Package: giữ redirect hay xoá? | **XOÁ HẲN** `/course-packages` (không redirect) | LM-1: gỡ route + tab; backfill Order.courseId xong thì drop packageId (2-phase) |

---

## 8. Đầu ra tiếp theo

→ Chuyển `prepare-prompt` sinh ticket phase **FL-R2** theo 6 epic (file kế hoạch: `3-ke-hoach-trien-khai/phases/FL-R2-fixlms-round2.md`). Thứ tự wave: **W1 E2-LEAD · W2 E2-ORDER · W3 E2-TRIAL · W4 E2-RBAC+E2-CLASS · W5 E2-LMS** (RBAC ghép trước CLASS vì chặn tạo lớp). Spine files (schema.prisma, sidebar.tsx, permissions.ts) gom Wave-0 như FL vòng 1.
