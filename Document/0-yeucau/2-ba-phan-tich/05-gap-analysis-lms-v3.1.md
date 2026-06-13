# BA #05 — Gap Analysis LMS v3.1 (SRS hợp nhất chốt cuối — TGĐ phê duyệt 12/06/2026)

> **Input:** `0-tai-lieu-goc/SataRobo_LMS_Requirements_v3.1_CHOT-CUOI.md` (SRS v3.1) · Phiếu #04 (`1-pm-tiep-nhan/04-phieu-tiep-nhan-lms-v3.1.md`) · trả lời Nhóm E của TGĐ 12/06/2026 (`1-pm-tiep-nhan/03-cau-hoi-xac-nhan-khach-hang.md`) · code hiện trạng sau A0→R5 (snapshot 12/06) · Doc 15.
> **Output:** gap từng module (hiện trạng → đích v3.1 → việc cần làm → độ phức tạp) + **bảng xung đột bắt buộc** (đã ghi quyết định TGĐ) + delta data model — đầu vào cho `06-user-stories-lms-v3.1.md` và kế hoạch phase **R7** (theo QĐ-O1).
> **Nguyên tắc:** TÁI DÙNG pipeline hiện có (Lead/Order/Enrollment/Curriculum/Attendance/MakeupNeed/Survey/AuditLog/DomainEvent). Additive trước — drop sau (2-phase). Doc 15 thắng tài liệu cũ; **code thắng doc khi mô tả hiện trạng**. Tiền/enrollment đi **transaction**; side-effect không-atomic đi **DomainEvent**; mọi đọc nghiệp vụ qua **scopedDb(actor)**; server action mở đầu bằng **can()**; mutation nhạy cảm ghi **AuditLog**; bảng mới có **`centerId`/`orgUnitId`**.
> **Trạng thái:** 🟢 **ĐÃ DUYỆT 12/06/2026** (cùng `06-user-stories-lms-v3.1.md`). **XĐ-8: TGĐ chốt PHƯƠNG ÁN 2** (mục 1.8) — toàn bộ 8 xung đột đã đóng. Kế hoạch thực thi: `3-ke-hoach-trien-khai/phases/R7-lms-v3.1.md`.

---

## 0. Quyết định TGĐ 12/06/2026 — baseline cho toàn bộ spec (QĐ-O1…O10)

| # | Nguồn | Quyết định chốt |
|---|---|---|
| **QĐ-O1** | E1 | **R6 giữ nguyên = "Flexibility & Hardening"** (BA #04, chứa tiền đề C1–C3). **LMS v3.1 = phase R7**, tách **R7a (lõi vận hành)** / **R7b (nội dung đào tạo)** nếu >4 tuần |
| **QĐ-O2** | E2 / XĐ-1 | **Học bù LIÊN CƠ SỞ (CS1↔CS2) thắng** — sửa baseline BA #04 (US-R6E học bù chéo cơ sở cập nhật theo). Kỹ thuật: đọc chéo cơ sở = exception có kiểm soát trong scopedDb + audit |
| **QĐ-O3** | E3 / XĐ-2 | Form builder **giới hạn cho khảo sát/đánh giá**, đúng **4 loại câu hỏi: thang mức 1–5 sao (STAR_RATING) · radio chọn 1 (RADIO) · checkbox chọn nhiều (CHECKBOX) · textbox tự luận (TEXTBOX)**. Không kéo-thả, không conditional logic. Cập nhật wording IR-2 của BA #04 |
| **QĐ-O4** | E4 / XĐ-7 | **Mã học viên format mới `CSx-YY-RANDOM`** (kiểm soát tốt khi nhiều chi nhánh). Mã cũ `CS1.HV.26.001` giữ nguyên — 2-phase, không sửa mã đã phát hành |
| **QĐ-O5** | E5 / XĐ-6 | **SCORM thuộc scope** (gói bài giảng tương tác — khác bản chất video LMS, không vi phạm Doc 15 Q12). Nghiệm thu chống quay/chụp theo wording trung thực SRS §12.4 (mức tối đa trình duyệt hỗ trợ) |
| **QĐ-O6** | E6 / XĐ-4 | **Chặn convert khi chưa có thanh toán ghi nhận — áp dụng toàn bộ.** Không có dữ liệu thanh toán thật cũ → không cần migrate/ngoại lệ dữ liệu cũ. (Spec kỹ thuật: Enrollment có giá-phải-thu = 0 đồng coi như thỏa điều kiện — xem 2.C) |
| **QĐ-O7** | E7 / XĐ-3 | Nhắc nợ đợt 2: **X mặc định = 14 ngày trước ngày đợt 2 (ngày do PH chọn); nếu Sale nhập X thì dùng X** (override per-Enrollment, bỏ mặc định 14) |
| **QĐ-O8** | E8 | **KHÔNG migrate lead cũ** (đa phần lead test) — build theo rule mới; khi có lead thật TGĐ sẽ báo |
| **QĐ-O9** | E9 | **"Đã đăng ký" (REGISTERED) = lead đã đăng ký khóa học VÀ đã có thanh toán ghi nhận (đợt 1 hoặc full)**. Sau convert thành công → "Đã chuyển đổi". Định nghĩa L3/hoa hồng SR217 không đổi |
| **QĐ-O10** | XĐ-5 | Lớp trải nghiệm chuyển từ **cố định 4 buổi** sang **LINH ĐỘNG số buổi** — bộ phận **Đào tạo cấu hình số buổi qua trang admin**; hệ thống sinh lịch buổi theo cấu hình hiện hành (Robosim mặc định khởi tạo = 4) |

> Mọi chỗ SRS v3.1 ghi cứng "4 buổi" (SRS §6, §28.1, QĐ-2) đọc lại thành "**N buổi theo cấu hình của Đào tạo**" theo QĐ-O10. Các con số thống kê "tỷ lệ tham gia đủ 4 buổi" (SRS §24.1–24.2) → "tỷ lệ tham gia đủ N buổi của lớp".

---

## 1. BẢNG XUNG ĐỘT (bắt buộc) — v3.1 vs Doc 15 vs code hiện trạng

### 1.1 XĐ-1 — Học bù liên cơ sở ✅ ĐÃ CHỐT

- **Nguồn A — SRS v3.1 §17.4 + QĐ-31 (TGĐ 12/06):** *"Cơ sở: cho phép liên cơ sở (CS1 ↔ CS2) — hệ thống đề xuất mọi cơ sở có buổi học phù hợp, sắp xếp ưu tiên cơ sở con đang học trước"*.
- **Nguồn B — BA #04 (baseline TGĐ 11/06) mục 2:** *"Học bù chéo cơ sở: Rule mặc định: cùng cơ sở; chéo cơ sở = exception cần duyệt + audit"*; Doc 15 §4.4 scopedDb cách ly CS1≠CS2. **Code:** `lib/makeup/service.ts:51–102` `suggestMakeupSessions` lọc `courseId` + lesson order, **không lọc `centerId`** (đang "mở" do chưa enforce scopedDb — trạng thái vô tình, không phải thiết kế).
- **Phương án đã cân nhắc:** (1) cùng cơ sở mặc định + chéo là exception duyệt (theo BA #04); (2) **liên cơ sở mặc định, sort ưu tiên cơ sở nhà, mọi lượt đọc/ghi chéo cơ sở đi qua exception có kiểm soát của scopedDb + ghi AuditLog** (theo SRS); (3) liên cơ sở nhưng cần PH chọn rõ "đồng ý học khác cơ sở".
- **Khuyến nghị BA:** phương án 2 — văn bản mới hơn 1 ngày + ghi "TGĐ xác nhận lần cuối"; bổ sung audit để bù rủi ro cách ly.
- ✅ **Quyết định (QĐ-O2):** phương án 2. Sửa baseline BA #04 phần học bù; CHỈ luồng học bù được phép đọc chéo cơ sở (whitelist), mọi truy vấn khác vẫn cách ly.

### 1.2 XĐ-2 — Form builder ✅ ĐÃ CHỐT

- **Nguồn A — SRS v3.1 §21.1–21.2 + QĐ-27:** Admin tự cấu hình bộ câu hỏi + phương án trả lời cho đánh giá GV (học viên làm) và khảo sát trung tâm (PH làm).
- **Nguồn B — BA #04 IR-2:** *"KHÔNG xây form-builder / page-builder kéo-thả tổng quát"*. **Code:** `SurveyQuestionType` cứng NPS/RATING/TEXT (`prisma/schema.prisma:3727–3740`) — không có template động.
- **Phương án:** (1) giữ enum cứng, thêm loại câu hỏi khi cần (sửa code mỗi lần); (2) **form builder giới hạn**: bảng câu hỏi + phương án động per đợt, đúng N loại câu hỏi cố định, không logic điều kiện; (3) form builder tổng quát kéo-thả (vi phạm IR-2, over-engineering).
- **Khuyến nghị BA:** phương án 2 — thỏa SRS mà không phá IR-2 (IR-2 cấm page-builder *tổng quát*, không cấm cấu hình câu hỏi).
- ✅ **Quyết định (QĐ-O3):** phương án 2 với **4 loại: STAR_RATING (1–5 sao) / RADIO / CHECKBOX / TEXTBOX**. IR-2 của BA #04 cập nhật wording: "trừ form builder khảo sát/đánh giá giới hạn 4 loại câu hỏi theo QĐ-O3".

### 1.3 XĐ-3 — Nhắc công nợ X ngày ✅ ĐÃ CHỐT

- **Nguồn A — SRS v3.1 §10.2 + QĐ-10:** Sale nhập "số ngày nhắc trước X"; `Ngày nhắc = ngày dự kiến đợt 2 − X`; nếu ngày nhắc ≤ hôm nay → nhắc ngay + cảnh báo Sale.
- **Nguồn B — BA #04 mục 2:** "nhắc nợ trước X ngày (**X = setting**)" toàn hệ thống. **Code:** cron `/api/cron/debt-reminder` nhắc **cứng 14 ngày** trước `dueDate` (`app/api/cron/debt-reminder/route.ts:19`), chống spam bằng `lastReminderAt`.
- **Phương án:** (1) X = SystemSetting toàn hệ thống; (2) X per-Enrollment do Sale nhập, không có mặc định; (3) **mặc định 14 ngày, Sale nhập X thì override per-Enrollment**.
- **Khuyến nghị BA:** phương án 3 — giữ hành vi cron hiện có làm fallback, thêm field override.
- ✅ **Quyết định (QĐ-O7):** phương án 3 — X mặc định 14 ngày trước ngày đợt 2 (PH chọn ngày); Sale nhập X → dùng X.

### 1.4 XĐ-4 — Convert bắt buộc có thanh toán trước ✅ ĐÃ CHỐT

- **Nguồn A — SRS v3.1 §8.1 + QĐ-4 + §28.2:** *"Không cho convert nếu chưa có thanh toán được ghi nhận"* (≥1 khoản: đợt 1 hoặc full, Sale ghi nhận; Kế toán chưa cần xác nhận).
- **Nguồn B — Code R2 prod:** `convertLeadToEnrollment` cho `paidAmount` tuỳ chọn — Order tạo `PENDING_PAYMENT` nếu chưa thu (`lib/crm/convert-lead.ts:95–105`); `closeLeadAsEnrolled` tương tự (actions.ts:568–606).
- **Phương án:** (1) giữ convert tự do, chỉ cảnh báo; (2) **chặn cứng: convert đòi ≥1 payment Sale-recorded trong cùng transaction**; (3) chặn + cho phép vai trò cao (SUPER_ADMIN) bypass có lý do.
- **Khuyến nghị BA:** phương án 2 + quy tắc kỹ thuật: Enrollment có giá-phải-thu = 0 (học bổng 100%) coi như thỏa điều kiện (không có gì để thu); không cần bypass role vì SRS không cho ngoại lệ.
- ✅ **Quyết định (QĐ-O6):** phương án 2, áp toàn bộ; dữ liệu cũ là test — không cần xử lý chuyển tiếp.

### 1.5 XĐ-5 — Mô hình lớp trải nghiệm ✅ ĐÃ CHỐT (TGĐ chốt MỚI — thay SRS)

- **Nguồn A — SRS v3.1 §6 + QĐ-2:** lớp trải nghiệm Robosim **đúng 4 buổi** cố định.
- **Nguồn B — Code R1/R2:** `TrialClass` = **1 buổi học thử cá nhân** gắn 1 lead (`scheduledAt` đơn — schema:3182–3206), không có lớp/danh sách/sức chứa.
- **Phương án:** (1) hardcode 4 buổi đúng SRS; (2) **số buổi linh động do Đào tạo cấu hình qua admin** (Robosim khởi tạo = 4); (3) số buổi nhập tay tự do mỗi lần Sale tạo lớp (rủi ro loạn chuẩn).
- **Khuyến nghị BA:** phương án 2 — tránh magic number (đúng tinh thần BA #04 V1.5), Sale không tự quyết số buổi.
- ✅ **Quyết định (QĐ-O10 — TGĐ 12/06, điều chỉnh SRS):** phương án 2. **Lưu ý trace:** mọi AC trong SRS ghi "4 buổi" hiểu là "N buổi theo cấu hình".

### 1.6 XĐ-6 — SCORM thuộc scope ✅ ĐÃ CHỐT

- **Nguồn A — SRS v3.1 §12 + QĐ-17:** SCORM là bài giảng chính, bắt buộc trước go-live (§2.8).
- **Nguồn B — Doc 15 Q12/§6.3:** core "không build video LMS", §6.3 không nhắc SCORM; **code:** grep `scorm` = 0 kết quả, chỉ có `Document` model.
- **Phương án:** (1) loại SCORM, dùng Document/PDF hiện có; (2) **build SCORM theo SRS** (upload/giải nén/player/signed URL) — định vị là "tài liệu giảng dạy đóng gói cho GV chiếu trên web", không phải video LMS cho học viên tự học; (3) nhúng dịch vụ SCORM cloud bên thứ 3.
- **Khuyến nghị BA:** phương án 2 — học viên KHÔNG xem SCORM (SRS §12.1) nên không phải "LMS video cho HV"; phương án 3 tạo phụ thuộc + rủi ro rò nội dung.
- ✅ **Quyết định (QĐ-O5):** phương án 2; nghiệm thu blur/watermark theo giới hạn trình duyệt như SRS §12.4.

### 1.7 XĐ-7 — Format mã học viên ✅ ĐÃ CHỐT

- **Nguồn A — SRS v3.1 §8.6 + QĐ-8:** `<MA_CO_SO>-<NAM_2_SO>-<RANDOM>` (vd `CS1-26-A7K9P2`), ký tự không dễ nhầm, unique, không sửa tay (trừ Superadmin).
- **Nguồn B — Code:** `genStudentCode` sinh `CS1.HV.26.001` **tuần tự** (`lib/codegen.ts:43–48`) — đã phát hành cho học viên thật.
- **Phương án:** (1) giữ format tuần tự; (2) **format mới cho học viên tạo từ R7, mã cũ giữ nguyên (2-phase)**; (3) đổi + backfill toàn bộ mã cũ (rủi ro: mã đã in trên hồ sơ/chứng từ).
- **Khuyến nghị BA:** phương án 2.
- ✅ **Quyết định (QĐ-O4):** phương án 2 — format mới để kiểm soát đa chi nhánh.

### 1.8 XĐ-8 — Enum trạng thái điểm danh 🔴 CÒN TREO (đề nghị chốt khi duyệt file này)

- **Nguồn A — SRS v3.1 §17.1:** 6 trạng thái: Có mặt / Vắng có phép / Vắng không phép / Đi muộn / **Học bù** / **Buổi học bị hủy**.
- **Nguồn B — Doc 15 §6.3:** chốt enum `PRESENT/LATE/ABSENT_EXCUSED/ABSENT_UNEXCUSED` (migration 2-phase từ ABSENT+EXCUSED). **Code:** `Attendance.status` PRESENT/ABSENT/LATE/EXCUSED + `makeupStatus` NONE/NEEDS_MAKEUP/MADE_UP riêng (schema:1341–1365); "buổi hủy" hiện là trạng thái của `ClassSession`, không phải của Attendance.
- **Phương án:** (1) thêm đúng 6 giá trị enum như SRS (phá vỡ Doc 15 + trùng nghĩa với makeupStatus/SessionStatus); (2) **giữ kiến trúc hiện tại: Attendance 4 trạng thái theo Doc 15 (PRESENT/LATE/ABSENT_EXCUSED/ABSENT_UNEXCUSED 2-phase) + "Học bù" biểu diễn bằng `makeupStatus=MADE_UP` + "Buổi hủy" biểu diễn bằng `ClassSession.status=CANCELLED` — UI/báo cáo hiển thị đủ 6 nhãn như SRS**; (3) thêm bảng trạng thái hiển thị mới tách khỏi enum lưu trữ.
- **Khuyến nghị BA:** **phương án 2** — thỏa nhu cầu hiển thị/báo cáo của SRS mà không phá Doc 15, không double-source-of-truth. UI portal/admin map 6 nhãn từ 3 nguồn (status + makeupStatus + sessionStatus).
- ✅ **Quyết định (TGĐ 12/06/2026):** phương án 2 — triển khai tại ticket R7-08 (label registry + enum 2-phase bước A theo Doc 15 §6.3).

---

## 2. GAP ANALYSIS THEO MODULE (as-is → to-be)

> Độ phức tạp: **S** <1 ngày · **M** 1–3 ngày · **L** 3–7 ngày · **XL** >1 tuần (phải tách task). Bằng chứng hiện trạng = file:line thật (xem thêm Phiếu #04 mục 2).

### 2.A Module A — Lead & LeadChild (SRS §5, §7)

| Yêu cầu (SRS) | Hiện trạng | Đích v3.1 | Việc cần làm | ĐPT |
|---|---|---|---|---|
| LeadChild 1..N (§5.2) | Lead phẳng `childName/childAge` (schema:861–862) | Bảng `LeadChild` (họ tên, DOB/tuổi, giới tính, trường, lớp, khóa + cơ sở quan tâm, ghi chú, trạng thái học thử) 1-N theo Lead | Model mới + form "Thêm con" inline + CRUD trong lead detail; KHÔNG migrate lead cũ (QĐ-O8); field cũ giữ đọc-only 2-phase | **L** |
| SLA chăm sóc 24h cấu hình được (§5.1) | `lib/crm/sla.ts:7–14` 5 mốc hard-code + cron 15' | Thêm rule "24h không hoạt động ở trạng thái Mới/Đã phân công" → highlight + notify QL/Admin; ngưỡng đọc từ `SystemSetting` | Thêm rule vào `SLA_THRESHOLDS` + đọc setting (phụ thuộc R6 US-R6A SystemSetting); cập nhật `lastActivityAt` khi có LeadActivity | **M** |
| Luồng 10 trạng thái (§7, QĐ-O9) | `LeadStatus` 13 giá trị (schema:36–51): có TRIAL_SCHEDULED/TRIAL_ATTENDED/AWAITING_DECISION/ENROLLED | Thêm `TRIAL_IN_PROGRESS` (Đang học thử) + `REGISTERED` (Đã đăng ký = form nhập + tiền ghi nhận); ENROLLED = "Đã chuyển đổi" | Enum additive + transition guard + cập nhật Kanban/báo cáo phễu; L3 SR217 không đổi định nghĩa | **M** |
| Lịch sử trạng thái + tương tác (§5.1, §7) | ✅ `LeadAuditLog` + `LeadActivity` + `LeadAssignmentHistory` | Giữ nguyên | Không | — |

### 2.B Module B — Lớp trải nghiệm (SRS §6, QĐ-O10)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| Cấu hình chương trình trải nghiệm | Không có | Đào tạo set **số buổi N** (+ tên/mô tả) qua admin | Bảng cấu hình `TrialProgramConfig` (hoặc SystemSetting có cấu trúc) + UI admin + audit | **M** |
| Lớp trải nghiệm N buổi | `TrialClass` = 1 buổi cá nhân/lead (schema:3182–3206) | Lớp `TRIAL_ROBOSIM`: cơ sở, phòng, lịch N buổi tự sinh, giờ, sức chứa, GV + hỗ trợ, trạng thái, DS LeadChild | Model mới `TrialClassV2`(centerId!) + `TrialClassSession` + `TrialEnrollment`(leadChildId, unique active) + `TrialAttendance`; tái dùng pattern sinh lịch `lib/classes/generate.ts`; TrialClass cũ giữ đọc-only 2-phase | **XL** |
| Ràng buộc + chuyển trạng thái (§6.4) | Không có | 1 LeadChild ↔ 1 lớp trải nghiệm active; đủ N buổi → LeadChild "Đã học thử"; Lead KHÔNG tự sang "Chờ quyết định" | Unique partial index + service chuyển trạng thái + event `trial.completed` | **M** |
| GV điểm danh + nhận xét trải nghiệm (§6.2) | `TrialFeedback` 1 bản/lead (schema:3208–3219) | Điểm danh từng buổi/từng LeadChild + nhận xét học thử | TrialAttendance per session + form GV; tái dùng UI attendance | **M** |

### 2.C Module C — Convert (SRS §8)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| Chặn convert chưa thanh toán (§8.1, QĐ-O6) | `paidAmount` tuỳ chọn (convert-lead.ts:95–105) | Convert đòi ≥1 khoản Sale ghi nhận (đợt 1/full) trong cùng transaction; giá-phải-thu = 0 coi như thỏa | Validation + guard trong `convertLeadToEnrollment`/`closeLeadAsEnrolled`; lead phải ở REGISTERED | **M** |
| Form multi-học-viên (§8.3) | Convert 1 con/lần | "Thêm học viên" inline → N Student + N Enrollment, 1 transaction, idempotent, autosave draft (§27.5) | Mở rộng form + service nhận mảng students[]; idempotency-key | **L** |
| Trùng parent (§8.4) | Check email PARENT (actions.ts:451–460) + dedup phone 90 ngày (cảnh báo) | Check email **và** phone; xung đột email∈A ≠ phone∈B → **khóa convert + chuyển Admin + log xung đột** | Service dedupe 3 nhánh (mới/đã có/xung đột) + màn Admin xử lý + AuditLog | **L** |
| Trùng student (§8.5) | Dedup theo phone 90 ngày | Cảnh báo khi trùng Parent + tên chuẩn hóa + DOB → chọn Student cũ, chỉ tạo Enrollment mới | Hàm normalize tên + query + UX chọn student cũ | **M** |
| Consent ảnh tại convert (§8.2, QĐ-29) | `StudentConsent` có, set ở portal (media-consent.ts:16–30) | Ô tick tại form convert; ghi **người tick + thời điểm** (audit); PH đổi sau qua yêu cầu chính thức có log | Thêm bước consent trong convert tx + AuditLog(action=CONSENT_GRANTED, actor=sale) + ParentRequest type mới `CONSENT_CHANGE` | **M** |
| Mã học viên mới (§8.6, QĐ-O4) | `CS1.HV.26.001` tuần tự (codegen.ts:43–48) | `CSx-YY-RANDOM` (charset bỏ 0/O/1/I/L), unique, retry khi trùng, chỉ SUPER_ADMIN sửa | `genStudentCodeV2(centerCode)` + unique constraint + guard sửa; mã cũ giữ | **S** |
| Tài khoản PH + kích hoạt (§8.7) | ✅ PENDING_ACTIVATION → OTP email → `/kich-hoat` | Giữ nguyên (khớp Doc 15 Q13) | Không | — |

### 2.D Module D — Khóa học, giá, Enrollment (SRS §9)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| Ưu đãi theo khóa (§9.2) | `Voucher` theo OrderType (schema:2859–2892) | Cấu hình per-Course: giảm tiền / giảm % / học bổng / ưu đãi chương trình + điều kiện + ghi chú | Model `CourseDiscount`(courseId, type, value, note, active) + UI admin + áp vào convert | **M** |
| Snapshot giá tại Enrollment (§9.2–9.3, QĐ-8 SRS) | Snapshot nằm ở Order.totalAmount/OrderItem.unitPrice; `Enrollment.tuition` legacy | Enrollment lưu đủ 4 thành phần: giá niêm yết · loại ưu đãi · số tiền giảm · giá phải thanh toán; bất biến khi Course đổi giá | Thêm cột snapshot vào Enrollment (additive) + ghi tại convert; helper đọc thống nhất | **M** |
| Course tuổi/trình độ + chương trình mặc định (§9.1) | Course thiếu field tuổi; curriculum lấy ACTIVE mới nhất | Field độ tuổi/trình độ; quan hệ "curriculum mặc định đang xuất bản" tường minh | Cột `ageRange`/`level` + `defaultCurriculumId` (hoặc giữ convention ACTIVE-latest + ràng buộc 1 ACTIVE/course) | **S** |
| Enrollment per con per khóa (§9.3) | ✅ Enrollment (schema:1170–1223) | + sale phụ trách trên Enrollment (hiện qua Lead) | Cột `salesUserId` snapshot tại convert | **S** |

### 2.E Module E — Thanh toán & công nợ (SRS §10)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| 2 tầng trạng thái đủ (§10.3) | Order.status + `confirmedByUserId/confirmedAt` (schema:2711–2713); `confirmOrderPayment` idempotent (lib/finance/debt.ts:27) | Tầng Sale: Chưa ghi nhận / Đã ghi nhận / Xác nhận đã thu. Tầng Kế toán: Chờ xác nhận / **Đã xác nhận thực thu / Từ chối-xác minh lại / Đã hoàn tiền / Đã điều chỉnh** | Model `Payment`(orderId, amount, method, evidenceUrl, saleStatus, accountantStatus, confirmedBy, reason) tách khỏi Order-status đơn; map 2-phase từ Order hiện tại; transaction + AuditLog | **XL** |
| Kế hoạch 2 đợt + X ngày (§10.2, QĐ-O7) | `OrderInstallment` + cron 14 ngày cứng (route.ts:19) | Đợt 2: PH chọn ngày; `reminderDays` mặc định 14, Sale override; ngày nhắc ≤ hôm nay → nhắc ngay + cảnh báo Sale | Cột `reminderDays` trên OrderInstallment + sửa cron đọc per-row + tạo nhắc ngay khi tạo kế hoạch nếu quá hạn | **M** |
| PH chỉ thấy khoản đã xác nhận (§10.3) | ✅ portal hoc-phi theo Order CONFIRMED (lib/portal/billing.ts:21–57) | Giữ + đổi nguồn sang Payment.accountantStatus khi tách model | Cập nhật query portal | **S** |
| Phiếu thu (§10.4) | Order/OrderItem + OrderStatusHistory (không hard-delete ✅) | Nhiều phiếu thu/Enrollment; không gộp hóa đơn nhiều con; điều chỉnh bằng phiếu điều chỉnh (bút toán), có log | `Receipt`(enrollmentId, paymentId, code `RCP-{CENTER}-{YY}-{SEQ}`, adjustmentOf?) + quy tắc không xóa cứng | **L** |
| Công nợ đa chiều (§10.5) | `computeDebt` helper (lib/finance/debt.ts:8–10) | View công nợ theo Enrollment/HV/PH/cơ sở/Sale/ngày đến hạn/mức quá hạn | Trang admin công nợ + filter + export; công thức: phải-thu − tổng-kế-toán-đã-xác-nhận | **M** |

### 2.F Module F — Khung chương trình (SRS §11)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| Versioning + trạng thái (§11.2, 11.5) | ✅ `Curriculum`(DRAFT/ACTIVE/ARCHIVED, unique courseId+version) + `Lesson` (schema:1807–1868) | + trạng thái "Ngưng xuất bản" | Enum thêm `UNPUBLISHED` (additive) | **S** |
| Sinh N buổi + tăng/giảm an toàn (§11.4) | Lesson có `order`; chưa có UI sinh N + rule giảm | Nhập N → sinh N mục; tăng → append; giảm → cảnh báo liệt kê buổi bị loại, bắt confirm nếu buổi có SCORM/bài tập, archive thay xóa | UI accordion + service resize + soft-archive Lesson | **M** |
| Trạng thái từng buổi + khóa sửa (§11.6) | Lesson không có status | 5 mức (Chưa hoàn thiện/Đã hoàn thiện/Đang sử dụng/Cần cập nhật/Đã khóa) + khóa chỉnh sửa + đề xuất chỉnh sửa từ GV | Cột `status` + `lockedAt/lockedBy` + model `LessonChangeRequest`(GV gửi, Đào tạo xử lý) | **M** |
| Gắn Course mặc định + chặn lớp (§11.7) | Lấy ACTIVE mới nhất; không chặn | Course chưa có curriculum xuất bản → không cho kích hoạt lớp chính thức | Guard ở activate-class action | **S** |

### 2.G Module G — SCORM (SRS §12) — build mới hoàn toàn

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| Upload pipeline (§12.2–12.3) | Không có (grep=0) | zip → check type/size → quét an toàn → validate `imsmanifest.xml` (SCORM 1.2/2004) → giải nén vào R2 prefix riêng → metadata → chờ kiểm thử → Đào tạo xem thử → xuất bản | Model `ScormPackage`(programSessionId/lessonId, version, storagePath, launchUrl, size, status TEST/PUBLISHED, uploadedBy) + job giải nén qua **DB-backed queue + cron** (Doc 15 Q4 — Vercel function không giữ tiến trình dài) + upload multipart R2 | **XL** |
| Player + bảo vệ (§12.4) | Không có | Iframe player GV-only; signed URL ngắn hạn per-file; không nút tải; chặn directory listing; log mở (ai/lớp/buổi/giờ); HV/PH chặn cứng ở route + can() | Route `/admin/scorm/play/[id]` + signed URL resolver cho asset con + `ScormAccessLog` | **L** |
| Blur + watermark (§12.4) | Không có | Phủ mờ khi `blur`/`visibilitychange`/PrintScreen/DevTools/screen-share API; watermark động (tên+mã GV+giờ, vị trí dịch ngẫu nhiên) | Client component bọc player; **tuyên bố trung thực giới hạn trình duyệt giữ nguyên khi nghiệm thu (QĐ-O5)** | **L** |
| Versioning + pin lớp (§12.5) | Không có | Upload mới không xóa cũ; 1 version active/buổi; lớp giữ version đã gắn (theo ClassProgramSnapshot — 2.I); thay version của lớp = audit + reason | Quan hệ version + cột trên snapshot + AuditLog | **M** |

### 2.H Module H — Bài tập trắc nghiệm (SRS §13)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| Gắn bài tập vào buổi (§13.2) | `Lesson.homeworkDefault` text; Exam rời | Exam gắn `lessonId` + cấu hình: thời lượng, số lần làm, hạn mặc định, cách tính điểm, điểm đạt, trộn câu/đáp án, hiển thị kết quả | Cột lessonId + cột cấu hình trên Exam (additive) | **M** |
| Loại câu hỏi + ảnh (§13.3) | MULTIPLE_CHOICE/TRUE_FALSE/SHORT_ANSWER/ESSAY/CODE; ảnh = URL trong text | SINGLE/MULTI/TRUE_FALSE + **câu hỏi/đáp án có ảnh** (field riêng, upload R2) | Cột `imageUrl` trên Question/Choice + UI; map SINGLE=MULTIPLE_CHOICE 1 đáp án | **M** |
| Import Word .docx (§13.4, QĐ-15) | Chỉ import **Excel** (api/admin/import/questions/route.ts:93–288) | Parser .docx field-template (`QUESTION_CODE/QUESTION_TYPE/QUESTION_TEXT/QUESTION_IMAGE/OPTION_A.../CORRECT_ANSWER/EXPLANATION/SCORE/DIFFICULTY/TAGS`), **trích ảnh nhúng** từ package docx, map theo block; validate (mã trùng, đáp án tồn tại, thiếu nội dung, sai loại); **preview + sửa từng câu**; import thành nháp; chỉ Đào tạo xuất bản; file mẫu chuẩn tải về; **template đồng bộ với skill AI ngoài hệ thống (SRS §0.7)** | Lib parse docx (mammoth/docx + JSZip trích media) + màn preview/sửa + upsert nháp idempotent theo QUESTION_CODE; chạy job nếu file lớn (§27.2) | **XL** |
| Tự động giao bài (§13.5) | Chỉ `submitAssignment` (lib/lms/assignment.ts:1–47) | GV "đánh dấu đã dạy" → tự tạo HomeworkAssignment cho lớp/HV với hạn mặc định hoặc hạn GV chọn; GV trì hoãn/giao lại theo quyền | Trigger trong state machine buổi (2.K) qua DomainEvent `session.taught` → handler idempotent tạo Assignment | **L** |
| Phân quyền hiển thị (§13.6) | Portal ràng buộc theo con (IDOR ✅) | PH **không** thấy nội dung câu hỏi/đáp án — chỉ: đã giao/đã làm/x trên y/trạng thái/điểm tổng quan (nếu bật) | Tách query PH (aggregate) khỏi query HV (chi tiết); test T4/T10 | **M** |

### 2.I Module I + J — Lớp chính thức & gán học viên (SRS §14, §15)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| Snapshot chương trình theo lớp (§14.2, 14.6, QĐ-16 SRS) | Lớp tham chiếu curriculum "sống" qua Course (lib/classes/generate.ts gắn lessonId trực tiếp) | `ClassProgramSnapshot`: lớp pin curriculum **version** lúc tạo; đổi thứ tự/ghi chú per lớp không sửa Program gốc; nhận version mới = thao tác chủ động + audit | Cột `curriculumId+version` trên Class (Doc 15 §6.3 cùng hướng) + bảng `ClassSessionPlan` per lớp (kế thừa Lesson, cho phép reorder) — 2-phase với ClassSession.lessonId hiện tại | **L** |
| Sinh lịch (§14.3) | ✅ `generateClassSessions` (generate.ts:11–71) — thứ/giờ/tổng buổi/Holiday | Giữ | Không | — |
| Đổi lịch lặp + preview (§14.4) | ✅ preview/apply (class-reschedule.tsx:49–86) | + bắt buộc giữ đủ tổng buổi + notify PH/GV + không đụng buổi đã hoàn thành/khóa | Guard + event `class.schedule_changed` → notify | **M** |
| Điều chỉnh từng buổi (§14.5) | Có chỉnh buổi cơ bản | Đủ thao tác: đổi ngày/giờ/GV/phòng, nghỉ lễ, hủy, tạo buổi bù, đổi thứ tự bài (theo quyền) + lịch sử + notify | `SessionChangeLog` (hoặc AuditLog hợp nhất) + event notify | **M** |
| Dropdown gán đúng (§15.1) | Capacity count có (enrollments/new) | Lọc: đúng course + đúng cơ sở + trạng thái "Chờ xếp lớp"/hợp lệ + chưa thuộc lớp active + không bảo lưu | Query filter chuẩn + test T5 (không lộ enrollment cơ sở khác) | **M** |
| "Thêm toàn bộ" (§15.2) | Không có | Thêm toàn bộ theo bộ lọc hiện hành; cảnh báo vượt sức chứa; người có quyền xác nhận override | Bulk action + confirm 2 bước + audit | **M** |
| Sau gán (§15.3) | Enrollment→class + portal lịch | + sinh tiến độ per buổi + quyền bài tập + notify PH | Event `enrollment.assigned_to_class` → handlers | **M** |

### 2.K Module K — GV vận hành buổi học (SRS §16)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| State machine buổi (§16.1) | Checklist 9 mục rời (lib/lms/checklist.ts) + markAttendance | Luồng: mở buổi → SCORM → điểm danh → nhận xét lớp + từng HV → ảnh → **"Đã dạy/Hoàn tất buổi"** = cổng trigger (giao bài, tiến độ, notify) — khớp Doc 15 §6.3 "Hoàn tất buổi" | Trạng thái buổi + action `completeSession` (transaction) + emit events; lưu GV thực dạy/giờ thực tế/phòng thực tế (§16.2) | **L** |
| Nhận xét lớp (§16.1) | `StudentSessionFeedback` per HV (schema:1325–1339) | + nhận xét chung cả lớp per buổi | Cột `classComment` trên ClassSession hoặc bảng ClassComment | **S** |

### 2.L Module L — Điểm danh & học bù (SRS §17)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| Trạng thái điểm danh (§17.1) | PRESENT/ABSENT/LATE/EXCUSED + makeupStatus (schema:1341–1365) | 6 nhãn hiển thị theo SRS | Theo kết luận XĐ-8 (khuyến nghị: map từ 3 nguồn, enum theo Doc 15 2-phase) | **M** |
| Học bù liên cơ sở (§17.3–17.4, QĐ-O2) | `suggestMakeupSessions` lọc courseId + lesson, không lọc center, không sort ưu tiên (service.ts:51–102); flow PENDING→SCHEDULED→COMPLETED ✅ | Đề xuất mọi cơ sở có buổi phù hợp; **sort: cơ sở con đang học trước → lịch gần nhất**; check sức chứa + không trùng lịch HV; PH gửi yêu cầu → CRM/QL xác nhận; **đọc chéo cơ sở qua scopedDb exception + AuditLog** | Sort + capacity check + conflict check thêm vào service; khai báo exception trong scopedDb (whitelist luồng makeup); audit mỗi lần xếp bù chéo cơ sở; giữ rule "không vượt tiến độ" (Doc 15 §6.3) | **L** |
| 5 chỉ số buổi portal (§17.5) | Đếm real-time PRESENT/ABSENT/MADE_UP | Tổng buổi CT · đã tham gia · vắng · cần bù · đã bù; buổi bù tính vào hoàn thành nội dung, thống kê riêng, không tăng tổng | Helper attendance-summary chuẩn (Vitest) + UI portal | **M** |

### 2.M Module M — Portal (SRS §18)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| Tài khoản chung + chuyển profile + ko lộ studentId (§18.1–18.2) | ✅ 17 trang, SiteSwitcher, HMAC cookie (active-site-token.ts; session.ts:100) | Giữ (khớp Doc 15 Q10) | Không | — |
| Dashboard PH (§18.3) | 3 card + lớp (portal/page.tsx:22–96) | + học phí đã xác nhận, công nợ + ngày đến hạn, khảo sát đang mở, yêu cầu học bù, hồ sơ gia đình | Mở rộng page + query | **M** |
| Dashboard HV (§18.4) | Một phần | Đủ mục: 5 chỉ số buổi, bài đã làm/tổng, kết quả, ảnh, học bạ, **entry đánh giá GV** | Mở rộng + gắn các module mới | **M** |

### 2.N Module N — Hình ảnh lớp (SRS §19)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| Ảnh gắn buổi + người upload theo vai trò (§19.1–19.2) | `ClassSessionMedia` gắn lớp + duyệt + `MediaStudentTag` (schema:3364–3392) | + gắn `classSessionId` + ngày chụp; upload bởi GV lớp / **Sale phụ trách lớp** / QL/Admin | Cột sessionId (nếu thiếu) + quyền upload theo phụ trách | **M** |
| Consent enforcement (§19.3, QĐ-29) | ✅ filter `hasMediaConsent` + tag (hinh-anh/page.tsx:14–35) | + **cảnh báo người upload khi lớp có HV chưa consent**; HV không consent: không tag + loại khỏi hiển thị; "làm mờ trong ảnh chung" = **thao tác thủ công của người upload trước khi đăng** | Banner cảnh báo danh sách HV chưa consent tại màn upload; ⚠️ **KHÔNG auto-detect khuôn mặt để làm mờ** — nhận diện khuôn mặt thuộc scope ĐÃ LOẠI (Doc 15 §0 "AI camera/face recognition") | **M** |
| Signed URL (§19.3) | `fileUrl` trực tiếp | Signed URL R2 ngắn hạn; chặn truy cập chéo qua URL | Resolver signed URL khi render portal/admin (Doc 15 §8.3) | **M** |

### 2.O Module O — Học bạ (SRS §20)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| ReportCard có cấu trúc + vòng duyệt (§20, QĐ-23) | PDF transcript/progress-report + `ProgressReportLog` (schema:2202–2219); KHÔNG có model ReportCard; nền `StudentSkillAssessment` 10 kỹ năng | 1 học bạ/Enrollment: tỷ lệ tham gia, vắng, bù, kết quả bài tập, nhận xét giai đoạn, **năng lực theo tiêu chí khóa học**, tổng kết; GV nhập → QL/Đào tạo duyệt → **PHÁT HÀNH mới hiện cho PH** | Model `ReportCard`(enrollmentId unique, status DRAFT/PENDING_REVIEW/PUBLISHED, publishedAt/By) + `ReportCardCriterion`(tiêu chí theo Course) + flow duyệt + notify + PDF tái dùng lib/pdf | **L** |

### 2.P Module P — Đánh giá GV & khảo sát (SRS §21, QĐ-O3)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| Form builder giới hạn (§21.1–21.2) | `SurveyQuestionType` cứng NPS/RATING/TEXT (schema:3727–3791) | Admin cấu hình bộ câu hỏi/đợt: **STAR_RATING / RADIO / CHECKBOX / TEXTBOX** + phương án trả lời động; ngôn ngữ phù hợp lứa tuổi (emoji/mức đơn giản cho trẻ) | `EvalForm`(scope: TEACHER_EVAL/CENTER_SURVEY) + `EvalQuestion`(type, options Json, order) + `EvalResponse/EvalAnswer`; mở rộng Survey hiện có thay vì bảng song song nếu khả thi (quyết định kỹ thuật lúc design) | **L** |
| HV đánh giá GV (§21.1, QĐ-24/27) | Không có (TeacherReview = nội bộ; ParentFeedback = PH→TT) | Đợt đánh giá (giữa/cuối khóa); HV làm trong profile con; gắn Enrollment + lớp + GV; chỉ GV đang/đã dạy; chống trùng theo đợt; GV chỉ xem tổng hợp nếu được quyền; QL/Admin xem chi tiết; vào báo cáo + hồ sơ chất lượng GV | Model `EvaluationRound` + ràng buộc unique (round, enrollmentId, teacherId) + portal UI trong profile HV + aggregate view | **L** |
| PH khảo sát trung tâm (§21.2, QĐ-25) | Survey NPS + milestone ✅ | Đợt khảo sát theo trung tâm/cơ sở; chỉ gửi PH đủ điều kiện (con đang học cơ sở đó); kết quả vào báo cáo chất lượng | Gắn round + điều kiện audience theo centerId + dùng form builder | **M** |

### 2.X Chung — trạng thái, thông báo, báo cáo, Satacoin (SRS §22–24, §2)

| Yêu cầu | Hiện trạng | Đích | Việc cần làm | ĐPT |
|---|---|---|---|---|
| Trạng thái Enrollment 11 (§22.2) | 9 giá trị (schema:59–72, PAUSED=bảo lưu ✅) | + "Chờ kế toán xác nhận" + "Tái tục" — map phần còn lại vào trạng thái hiện có | Enum additive + ma trận transition + label registry | **M** |
| Thông báo 17 trigger (§23) | Notification 4 audience + StaffNotification + email Resend + Zalo stub | Phủ đủ 17 trigger in-app + email | Mỗi trigger = DomainEvent handler idempotent (Doc 15 Q4); bảng rà từng trigger trong ticket | **L** |
| Báo cáo 7 nhóm (§24) | Marketing/lead/commission/dashboard có; thiếu trial/đào tạo/trung tâm | Đủ 7 nhóm; đúng scope vai trò + cơ sở (scopedDb) | Trang báo cáo mới + snapshot/cache cho báo cáo nặng (§27.2); làm SAU khi module nguồn dữ liệu xong | **L** |
| Satacoin (§2) | Ledger + portal/satacoin đã có | **PENDING** — chỉ thiết kế bảng cấu hình điểm động (hành vi–điểm–trần–nguồn) để kích hoạt nhanh | Schema-only `CoinRuleConfig` (không UI, không tích điểm runtime) — đặt cuối R7b | **S** |

---

## 3. Gap NFR (SRS §27 — soi 5 nhóm theo chuẩn BA)

| Nhóm | SRS yêu cầu | Hiện trạng | Gap/Việc cần làm |
|---|---|---|---|
| Bảo mật (§27.1) | RBAC theo vai trò + cơ sở; check UI **và** API; signed URL; chống truy cập chéo; audit; rate limit | RBAC v1 matrix (C2 OFF); scopedDb chưa áp rộng (C1); webhook fail-open (C3); signed URL chưa có cho media/SCORM | **Tiền đề C1–C3 đóng ở R6 (QĐ-O1) — R7 không bắt đầu code tính năng đụng dữ liệu chéo cơ sở trước khi R6-00 DONE**; mọi action mới theo can() v2 + scopedDb từ đầu (không nợ thêm) |
| Hiệu năng (§27.2) | Phân trang; upload SCORM có progress; giải nén/import qua job; sinh lịch transaction; báo cáo snapshot/cache | Pagination có nơi có nơi không; chưa có job queue dùng chung | Job nền = DB-backed queue + Vercel Cron (Doc 15 Q4); LCP/Lighthouse giữ budget CLAUDE.md (portal ≥85 mobile) |
| Truy vết (§27.3) | Người tạo/sửa, before/after, lý do, IP khi cần | AuditLog hợp nhất (A0-06) ✅ | Mọi mutation mới của R7 ghi AuditLog; bắt buộc `reason` cho: thay SCORM của lớp, điều chỉnh giao dịch, sửa mã HV, xếp bù chéo cơ sở |
| Toàn vẹn (§27.4) | Convert transaction + rollback; idempotency; unique email/phone/mã HV; không sinh lịch trùng; không xếp trùng lớp | Convert tx ✅; idempotent installment/makeup ✅ | Idempotency-key cho convert multi-student; unique partial index (LeadChild-trial active, Enrollment-class active) |
| Khả dụng (§27.5) | Form dài chia section; thêm-con inline; autosave draft convert; cảnh báo mất dữ liệu; preview đổi lịch/import; responsive | Preview đổi lịch ✅; còn lại thiếu | Autosave draft convert (localStorage/server draft); mobile 375px theo CLAUDE.md |

---

## 4. Delta mô hình dữ liệu (tất cả ADDITIVE — bảng mới đều có `centerId`/`orgUnitId` khi nghiệp vụ gắn cơ sở)

**Bảng mới:** `LeadChild` · `TrialProgramConfig` · `TrialClassV2` + `TrialClassSession` + `TrialEnrollment` + `TrialAttendance` · `CourseDiscount` · `Payment` (2 tầng) · `Receipt` · `LessonChangeRequest` · `ScormPackage` + `ScormAccessLog` · `ClassSessionPlan` (snapshot buổi theo lớp) · `SessionChangeLog`* · `ReportCard` + `ReportCardCriterion` · `EvaluationRound` + `EvalForm` + `EvalQuestion` + `EvalResponse` + `EvalAnswer` · `CoinRuleConfig` (schema-only). (*có thể dùng AuditLog hợp nhất thay bảng riêng — quyết định lúc design ticket.)

**Cột thêm (2-phase, không drop):** Lead.`lastActivityAt`; LeadStatus +`TRIAL_IN_PROGRESS`,`REGISTERED`; Enrollment +snapshot giá 4 cột +`salesUserId`; OrderInstallment +`reminderDays`; Exam +`lessonId`+cấu hình; Question/Choice +`imageUrl`; Lesson +`status`+`lockedAt/By`; Class +`curriculumVersion` pin; ClassSession +`classComment`+`actualTeacherId/actualRoomId/actualStartAt`; ClassSessionMedia +`classSessionId`(nếu thiếu)+`takenAt`; EnrollmentStatus +2 giá trị; Student giữ `studentCode` (format mới chỉ áp record mới).

---

## 5. Tổng hợp khối lượng + đề xuất cấu trúc phase R7

| Cụm | Các mục | Ước lượng |
|---|---|---|
| **R7a — Lõi vận hành tuyển sinh→lớp** (sau R6) | 2.A Lead/LeadChild (L+M+M) · 2.B Trial (XL+M+M+M) · 2.C Convert (M+L+L+M+M+S) · 2.D Giá (M+M+S+S) · 2.E Thanh toán (XL+M+S+L+M) · 2.I Lớp/snapshot/gán (L+M+M+M+M+M) · 2.K buổi học (L+S) · 2.L học bù (M+L+M) · 2.M portal (M+M) · 2.N ảnh (M+M+M) | ~3.5–4.5 tuần |
| **R7b — Nội dung đào tạo + đánh giá + báo cáo** | 2.F chương trình (S+M+M+S) · 2.G SCORM (XL+L+L+M) · 2.H bài tập/import Word (M+M+XL+L+M) · 2.O học bạ (L) · 2.P đánh giá/khảo sát (L+L+M) · 2.X thông báo+báo cáo (M+L+L) + Satacoin schema (S) | ~3.5–4.5 tuần |

**Phụ thuộc cứng:** (1) **R6-00/R6 hardening DONE trước R7** (C1 scopedDb error + C2 RBAC v2 ON + C3 fail-closed) — đặc biệt học bù liên cơ sở và mọi màn admin mới; (2) **prod Supabase migrate** (~18 migration A0→R5 còn treo — quyết định Owner) phải xong trước khi R7 thêm migration mới; (3) SystemSetting (R6 epic A) cho SLA 24h + reminderDays default; (4) R2 storage đã có (R2 client `lib/storage/`) — SCORM/ảnh signed URL dựa trên đó; (5) báo cáo (2.X) làm cuối — sau khi module nguồn dữ liệu chạy.

**Regression bắt buộc (T12):** phễu SR217 (L1/L2/L3 + hoa hồng) không gãy khi thêm LeadChild/REGISTERED; convert R2 cũ → flow mới; portal R4 hiện hữu không vỡ khi thêm mục dashboard.

---

## 6. TBD còn lại

| # | Nội dung | Owner | Hạn |
|---|---|---|---|
| ~~TBD-1~~ | ✅ ĐÃ CHỐT 12/06: XĐ-8 = phương án 2 (mục 1.8) | TGĐ | done |
| TBD-2 | Quyết định kỹ thuật: form builder mở rộng bảng Survey hiện có hay bảng EvalForm mới (mục 2.P) | Tech Lead | khi viết ticket R7b |
| TBD-3 | Prod migrate ~18 migration A0→R5 (chặn mọi migration mới của R7) | TGĐ | trước khi R7 bắt đầu |
| TBD-4 | Quét an toàn file SCORM zip (§12.2 "quét an toàn"): mức nào (extension whitelist + size + manifest validate, hay tích hợp scanner ngoài?) | Tech Lead + TGĐ | khi viết ticket R7b (đề xuất: whitelist + validate, scanner ngoài = backlog) |
