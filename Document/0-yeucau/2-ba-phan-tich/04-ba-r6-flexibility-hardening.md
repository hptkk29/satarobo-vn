# BA #04 — Phase R6 "Flexibility & Hardening"

> **Input:** Audit hiện trạng sau R5 (2026-06-11) — quét hardcode toàn repo + audit lỗ hổng `Document/3-hien-trang/06-audit-lo-hong.md` + gap nghiệp vụ B1–B4.
> **Output:** bộ yêu cầu chuẩn (user story + AC + NFR + truy vết) cho phase R6 — đầu vào cho `3-ke-hoach-trien-khai/phases/R6-*`.
> **Nguyên tắc:** TÁI DÙNG model/pipeline hiện có (Enrollment, Invoice, MakeupNeed, RoleDef/UserOrgRole, AuditLog, DomainEvent). Additive trước — drop sau (2-phase). Không refactor đập bỏ. Khi xung đột → **Doc 15 thắng**.
> **Trạng thái:** BASELINE 2026-06-11 (TGĐ chốt TBD-1/3/4 — xem mục 7). Riêng **TBD-2 (công thức hoàn tiền) bổ sung sau** — phần hoàn tiền của US-R6E-2 chưa được code khi chưa chốt.
>
> ⚠️ **CẬP NHẬT BASELINE 12/06/2026 — theo QĐ-O2/O3/O7 của TGĐ khi duyệt SRS LMS v3.1** (chi tiết: `05-gap-analysis-lms-v3.1.md` mục 0):
> 1. **Học bù chéo cơ sở (V3.4/B4):** rule đổi thành **LIÊN CƠ SỞ mặc định** (CS1↔CS2, ưu tiên hiển thị cơ sở con đang học) — KHÔNG còn "cùng cơ sở + exception duyệt". Spec chi tiết chuyển sang phase **R7-08** (`3-ke-hoach-trien-khai/phases/R7/`); R6 không spec lại mục này.
> 2. **IR-2 (cấm form-builder):** bổ sung ngoại lệ — form builder **giới hạn cho khảo sát/đánh giá** với đúng 4 loại câu hỏi (thang mức 1–5 sao / radio / checkbox / textbox) theo QĐ-O3, làm ở R7-16. Page-builder tổng quát vẫn cấm.
> 3. **Nhắc nợ X ngày:** X mặc định 14 ngày = SystemSetting, **Sale nhập X per-Enrollment thì override** (QĐ-O7) — triển khai ở R7-04.

---

## 0. Bối cảnh & vấn đề (as-is)

Roadmap A0→R5 đã hoàn thành 2026-06-10 (build PASS, Vitest 308). Tuy nhiên audit hiện trạng chỉ ra **3 nhóm vấn đề** khiến hệ thống *chưa sẵn sàng mở rộng và chưa an toàn vận hành dài hạn*:

### V1 — Hardcode, không linh hoạt (vấn đề người dùng nêu trực tiếp)

| # | Hiện trạng | Bằng chứng | Hệ quả nghiệp vụ |
|---|---|---|---|
| V1.1 | Danh sách cơ sở + hotline/email cứng trong code | `lib/locations.ts:26-89` | Mở CS3 → phải sửa code + deploy (vi phạm Doc 15 "mở CS mới = thêm data") |
| V1.2 | Danh sách khóa Sata 1–8 + Combo + **giá tiền** nằm trong file `.ts` | `components/legacy-laptrinhrobot/_data/courses-pricing.ts` | Đổi giá/thêm khóa → cần dev, không tự vận hành |
| V1.3 | Tỷ lệ hoa hồng 1/1/4/2% + trần 8% cứng | `lib/crm/commission.ts:10-17` — `CommissionRateConfig` mới chỉ có trong tài liệu (US-SRB-1), **chưa có trong schema** | Đổi chính sách hoa hồng → sửa code; kế toán không tự chủ |
| V1.4 | 3 ca làm việc + giờ + dung sai + quota khẩn cấp cứng | `lib/shifts.ts` | Thêm ca / chỉnh giờ theo mùa → sửa code |
| V1.5 | Magic number rải rác: ngưỡng sắp hết khóa 5 buổi, deadline care task 2 ngày, sĩ số 5–20 | `lib/students/renewal.ts`, `lib/risk/service.ts:70`, `lib/validators/class.ts:65` | Mỗi cơ sở/giai đoạn muốn ngưỡng khác → không thể |
| V1.6 | `enum CourseCategory` chỉ 2 giá trị trong schema | `prisma/schema.prisma:723` | Thêm dòng sản phẩm mới → migration + sửa code |
| V1.7 | Landing page per-khóa = 2 folder component riêng | `components/legacy-laptrinhrobot/`, `components/legacy-luyenthirobosim/` | Thêm khóa mới → dev tạo folder mới |

### V2 — UI chỉ đủ luồng hiện tại

| # | Hiện trạng | Bằng chứng | Hệ quả |
|---|---|---|---|
| V2.1 | 48 file `_actions.ts` lặp ~70% pattern (auth → assertCan → zod → db → revalidate) | toàn `app/(admin)` | Mỗi resource mới = copy-paste; sửa pattern chung = sửa 48 chỗ |
| V2.2 | Mỗi trang list tự viết bảng, cột cứng, filter cứng | 30+ page admin | Thêm cột/filter/sort/export = sửa từng trang |
| V2.3 | Dashboard = 6 if-block theo role | `app/(admin)/admin/dashboard/page.tsx:23-55` | Role mới (RBAC động cho phép tạo) → dashboard trống, phải code |
| V2.4 | Label/màu tiếng Việt map từ enum rải rác nhiều file | `lib/leads/status.ts`, `lib/labels.ts`, `lib/notify/attendance.ts:14`… | Thiếu nhất quán; không có đường i18n |

### V3 — Lỗ nghiệp vụ + an toàn chưa đóng

| # | Hiện trạng | Bằng chứng | Mức |
|---|---|---|---|
| V3.1 (B1) | Học phí trả góp: Invoice/Payment chỉ ghi nhận đơn lẻ, không có lịch trả nợ theo kỳ | Doc 15 §6.4 không có InstallmentSchedule; câu hỏi B1 chưa chốt | NGHIÊM TRỌNG |
| V3.2 (B2) | Hoàn tiền + chuyển lớp giữa kỳ: chưa có business rule (% hoàn, pro-rate, clawback) | US-SRB-2 AC3 ghi "[chờ chốt B4]" — chưa spec | NGHIÊM TRỌNG |
| V3.3 (B3) | Bảo lưu: ParentRequest duyệt xong nhưng enrollment không đổi trạng thái, không có ngày quay lại | R4 C5.1–C5.3 | NGHIÊM TRỌNG |
| V3.4 (B4) | Học bù chéo cơ sở: MakeupNeed không định nghĩa phạm vi cơ sở — va chạm rule cách ly scopedDb | `lib/makeup/service.ts:51-102` lọc theo courseId, không theo center | NGHIÊM TRỌNG |
| V3.5 (C1) | scopedDb chưa enforce: ~219 file import `@/lib/db` trần | Audit 06-audit-lo-hong.md C1 | NGHIÊM TRỌNG |
| V3.6 (C2) | RBAC v2 đang OFF (shadow mode), prod chạy matrix tĩnh v1 | Audit C2 | NGHIÊM TRỌNG |
| V3.7 | Chưa có: restore-test backup, race-condition test (2 sale convert cùng lead), metric/alert SLO | Doc 15 §13.4/13.9 có chiến lược, chưa có task | TRUNG BÌNH |

**Mục tiêu R6:** (G1) vận hành tự chủ — thay đổi tham số nghiệp vụ không cần dev; (G2) thêm resource/role/khóa/cơ sở mới với chi phí code tối thiểu; (G3) đóng 4 lỗ nghiệp vụ B1–B4; (G4) bật 2 lớp an toàn đã xây ở A0 (scopedDb + RBAC v2) và hardening vận hành.

---

## 1. Phạm vi / KHÔNG phạm vi (inverse requirements)

**Trong phạm vi:** 7 epic R6-A → R6-G (mục 3).

**KHÔNG phạm vi (Won't — chống scope creep):**
- ❌ **IR-1:** KHÔNG đưa **status workflow** (ClassStatus, EnrollmentStatus, MakeupStatus, LeadStatus…) vào DB. Đây là state machine có logic chuyển trạng thái gắn trong code — đưa vào DB không tạo giá trị, chỉ tạo rủi ro. Chỉ tập trung **label/màu** về 1 registry (US-R6D-4).
- ❌ **IR-2:** KHÔNG xây form-builder / page-builder kéo-thả tổng quát. Content-block landing (R6-C) giới hạn ở **bộ section đã định nghĩa sẵn** (registry), thêm section type mới vẫn là việc dev.
- ❌ **IR-3:** KHÔNG xây workflow engine tổng quát (BPMN…). Workflow duyệt (lớp, refund, bảo lưu) là code có audit.
- ❌ **IR-4:** KHÔNG đưa sidebar/menu admin vào DB — menu sinh từ resource-registry trong code, lọc theo permission runtime.
- ❌ **IR-5:** KHÔNG tích hợp payment gateway (VNPay/Tingee) trong R6 — trả góp R6 là **ghi nhận thủ công + kế toán xác nhận** (giữ nguyên Q14 Doc 15); gateway ở backlog.
- ❌ **IR-6:** Tôn trọng scope ĐÃ LOẠI Doc 15 §0 (AI camera, Web3, marketplace, video LMS, AI learning-path…).
- ❌ **IR-7:** KHÔNG drop cột/enum cũ trong R6 — mọi thay đổi schema theo 2-phase (additive R6, drop ở phase sau khi prod ổn định ≥ 2–3 ngày).

---

## 2. Gap analysis tóm tắt (as-is → to-be)

| Nhóm | As-is | To-be (R6) | Tái dùng |
|---|---|---|---|
| Tham số vận hành | Hằng số trong code | `SystemSetting` (toàn hệ thống) + `CenterSetting` (override theo OrgUnit) + UI admin + audit | OrgUnit tree (A0-01), AuditLog (A0-06) |
| Hoa hồng | `DEFAULT_RATES` cứng | `CommissionRateConfig` trong DB, có hiệu lực theo kỳ, trần tổng do SUPER_ADMIN đặt | CommissionPeriod/Item (R1), pattern effectiveFrom/To của UserOrgRole |
| Ca làm việc | `SHIFT_DEFS` cứng | Bảng `WorkShift` per-center, UI quản lý | HR check-in (R5) đọc shift từ DB |
| Loại khóa | enum 2 giá trị | Bảng danh mục `CourseCategory` (2-phase migration) | Course model hiện có |
| Landing khóa học | 2 folder component | `CoursePage` + `PageSection(type, order, content Json)` + section-registry render | PageContent pattern hiện có, markdown-renderer |
| Học phí 2 đợt | Invoice/Payment đơn lẻ, không có lịch đợt 2 | Đóng đủ HOẶC đúng 2 đợt (đợt 1 = ngày đăng ký, đợt 2 = PH chọn ngày); nhắc nợ trước X ngày (X = setting) | Invoice/Payment (R2), email/Zalo notifier, cron nhắc nợ R2-06 |
| Hoàn tiền/chuyển lớp | Không có rule | `RefundRequest` workflow + transfer enrollment trong transaction + clawback event (công thức hoàn: chờ TBD-2) | Enrollment.transferredToId (đã có field), CommissionItem âm (US-SRB-2 AC3), DomainEvent |
| Bảo lưu | Duyệt request rời rạc | EnrollmentStatus dùng `PAUSED` (đã có) + `suspendedUntil`; duyệt request → đổi trạng thái atomic; tự nhắc khi đến hạn | ParentRequest (R4), EnrollmentStatus PAUSED có sẵn, cron |
| Học bù chéo cơ sở | Không định nghĩa | Rule mặc định: cùng cơ sở; chéo cơ sở = exception cần duyệt + audit | MakeupNeed (R3), scopedDb exception pattern |
| CRUD admin | 48 file lặp | Action factory chuẩn (auth→can→zod→scopedDb→audit→revalidate) + DataTable generic | scopedDb (A0-04), can() v2 (A0-03) |
| Dashboard | if-block theo role | Widget registry + cấu hình widget theo role/permission trong DB | RoleDef (A0-02) |
| An toàn | scopedDb wire chưa enforce; RBAC v2 shadow | ESLint `@/lib/db` → error trong `app/**`; bật `RBAC_V2=true` sau khi shadow-diff = 0 | A0-03/04 đã xây sẵn |

---

## 3. User stories theo epic

> Format: `US-R6<epic>-<n>` · Ưu tiên MoSCoW · Loại BR/FR/NFR · AC Given/When/Then rút gọn · Truy vết Doc 15/phase/test.

---

### EPIC R6-A — Cấu hình hệ thống 2 tầng (nền tảng) — **Must**

**US-R6A-1** · Là **SUPER_ADMIN/CENTER_MANAGER**, tôi muốn xem và sửa các tham số vận hành (ngưỡng cảnh báo, sĩ số mặc định, dung sai chấm công, quota khẩn cấp, hotline/email hiển thị…) trên UI admin để điều chỉnh vận hành mà không cần dev.
- Ưu tiên: Must · Loại: FR
- AC1: Given setting có scope GLOBAL, When CENTER_MANAGER mở trang cấu hình, Then chỉ xem — chỉ SUPER_ADMIN sửa được GLOBAL.
- AC2: Given setting cho phép override theo cơ sở, When CENTER_MANAGER của CS1 sửa giá trị, Then chỉ CS1 nhận giá trị mới; CS2 vẫn dùng GLOBAL (kiểm chứng qua API đọc setting 2 cơ sở).
- AC3: Mỗi lần sửa ghi AuditLog (actor, key, old→new, reason bắt buộc).
- AC4: Giá trị sai kiểu/khoảng (ví dụ sĩ số min > max, % > 100) → từ chối lưu, lỗi chỉ rõ field (validate bằng schema từng key — key không có schema thì không cho tạo).
- Truy vết: Doc 15 §11 OI-17 (DB flag/config) · Phase R6-A · Test T2 (RBAC), T4 (audit), T1 (unit validate).

**US-R6A-2** · Là **hệ thống**, tôi muốn mọi điểm code đang dùng hằng số vận hành đọc qua 1 service cấu hình duy nhất (ưu tiên Center → fallback Global → fallback default trong code) để giá trị thay đổi có hiệu lực mà không deploy.
- Ưu tiên: Must · Loại: FR
- AC1: Given key `student.nearEndThreshold` đổi 5 → 3 trên UI, When portal tính "sắp hết khóa", Then dùng 3 trong vòng ≤ 60s (cache TTL) mà không restart.
- AC2: Given key chưa có trong DB, When code đọc, Then trả default an toàn (giá trị hardcode hiện tại) — không lỗi runtime.
- AC3: Danh sách key bắt buộc migrate trong R6 (tối thiểu): `student.nearEndThreshold` · `risk.careTaskDueDays` · `class.minStudents.default` / `class.maxStudents.default` · `shift.toleranceMinutes` · `shift.emergencyMonthlyLimit` · `shift.proposalWindow` · `contact.hotlines` / `contact.emails` (thay `lib/locations.ts`) · `finance.debtReminderDaysBefore` (nhắc công nợ trước đợt 2 — US-R6E-1) · `enrollment.suspendMaxMonths` (trần bảo lưu — US-R6E-3).
- AC4 (Inverse): Hằng số **kỹ thuật** (safety guard vòng lặp, page size mặc định, TTL cache) KHÔNG đưa vào setting — giữ trong code.
- Truy vết: Doc 15 §2 OrgUnit (override theo cây) · Phase R6-A · Test T1, T7 (cache/perf).

---

### EPIC R6-B — Danh mục động thay hardcode — **Must/Should**

**US-R6B-1** · Là **Kế toán/TGĐ**, tôi muốn quản lý tỷ lệ hoa hồng theo tầng và theo thời gian hiệu lực trong DB để thay đổi chính sách không cần sửa code.
- Ưu tiên: Must · Loại: BR + FR
- AC1: Bảng cấu hình rate theo tầng (HO_MARKETING/HO_SALE/SALE/QL_TT theo nguồn commissionSource) có `effectiveFrom/effectiveTo`; kỳ hoa hồng tháng N dùng config hiệu lực tại thời điểm chốt kỳ.
- AC2: Tổng rate vượt trần (mặc định 8%, trần là setting GLOBAL chỉ SUPER_ADMIN sửa) → từ chối lưu (giữ AC4 US-SRB-1).
- AC3: Đổi config khi kỳ DRAFT → recalc được; kỳ APPROVED không bị ảnh hưởng hồi tố (kiểm chứng: approve kỳ → đổi rate → số kỳ cũ không đổi).
- AC4: Code không còn đọc `DEFAULT_RATES` — hằng số chỉ còn vai trò seed lần đầu.
- Truy vết: US-SRB-1 (file 03) · Doc 15 §5 Commission · Phase R6-B · Test T1, T6 (idempotent recalc), T4.

**US-R6B-2** · Là **HR/CENTER_MANAGER**, tôi muốn quản lý ca làm việc (tên, giờ bắt đầu/kết thúc, áp dụng cơ sở nào) trong admin để thêm/sửa ca theo mùa mà không cần dev.
- Ưu tiên: Should · Loại: FR
- AC1: CRUD ca theo quyền; ca đang được phân công không xóa được (chỉ ngừng hiệu lực).
- AC2: Check-in R5 đối chiếu giờ + dung sai từ DB; sửa giờ ca → lần check-in sau dùng giờ mới.
- AC3: 2-phase: 3 ca hiện tại được seed y nguyên (CA_SANG/CA_CHIEU/CA_TOI) — dữ liệu phân ca cũ không hỏng.
- Truy vết: R5 HR check-in · Phase R6-B · Test T1, T3 (e2e check-in).

**US-R6B-3** · Là **quản trị nội dung**, tôi muốn loại khóa học là danh mục quản lý được (thêm "Robotics mầm non", "AI cơ bản"…) để mở dòng sản phẩm mới không cần migration.
- Ưu tiên: Should · Loại: FR
- AC1: Thêm category mới qua UI → tạo được Course thuộc category đó, filter list theo category hoạt động.
- AC2: 2-phase: enum `CourseCategory` cũ giữ nguyên trong R6 (cột mới chạy song song, backfill từ enum); KHÔNG drop enum trong R6 (IR-7).
- AC3: Category đang có Course không xóa được (chỉ ẩn).
- Truy vết: Doc 15 §6.2 Course · Phase R6-B · Test T1, T5 (migration).

**US-R6B-4** · Là **quản trị nội dung**, tôi muốn giá và danh sách gói khóa học (Sata 1–8, Combo) đọc từ DB để đổi giá trên admin, hiệu lực ngay trên web public.
- Ưu tiên: Must · Loại: FR
- AC1: Trang public hiển thị giá từ DB (CoursePackage); đổi giá trên admin → public cập nhật sau revalidate (≤ 60s ISR).
- AC2: File `courses-pricing.ts` không còn là nguồn giá (xóa hoặc chỉ còn seed).
- AC3: Lịch sử đổi giá ghi audit (ai, khi nào, old→new).
- Truy vết: V1.2 · Phase R6-B · Test T1, T3.

---

### EPIC R6-C — Landing khóa học content-block — **Could**

**US-R6C-1** · Là **Marketing**, tôi muốn tạo/sửa trang giới thiệu khóa học từ các khối nội dung định sẵn (Hero, Curriculum, Pricing, FAQ, Testimonial, CTA…) để ra mắt khóa mới không cần dev tạo folder component.
- Ưu tiên: Could (làm sau R6-A/B/E/F nếu còn thời lượng) · Loại: FR
- AC1: Tạo trang cho khóa mới = chọn section + nhập nội dung theo schema từng section (validate Zod); xuất bản → có URL `/khoa-hoc/<slug>` đầy đủ SEO metadata + JSON-LD.
- AC2: 2 landing hiện tại (laptrinhrobot, luyenthirobosim) render KHÔNG đổi pixel-level hoặc được migrate có đối chiếu thủ công — không gãy SEO (giữ canonical, metadata).
- AC3 (Inverse): Bộ section type là cố định trong registry code (IR-2) — thêm type mới là việc dev.
- AC4: Lighthouse mobile ≥ 85, LCP < 2.5s giữ nguyên budget.
- Truy vết: V1.7 · Phase R6-C · Test T3 (e2e render), NFR perf.

---

### EPIC R6-D — UI generic & chuẩn hóa admin — **Must/Should**

**US-R6D-1** · Là **dev đội dự án** (stakeholder nội bộ), tôi muốn mọi Server Action CRUD đi qua 1 pipeline chuẩn (auth → can() → validate → **scopedDb** → mutation → audit → revalidate) để resource mới chỉ cần khai báo schema + permission, và không thể quên gate bảo mật.
- Ưu tiên: Must · Loại: FR + NFR(security)
- AC1: Action tạo qua factory thiếu permission/schema → fail ngay khi build/test (không thể khai báo thiếu).
- AC2: Mọi mutation qua factory tự ghi AuditLog (actor, entity, diff) — kiểm chứng bằng test chung 1 lần cho factory.
- AC3: Tối thiểu 10 resource CRUD đơn giản nhất migrate sang factory trong R6 (danh sách chốt ở task breakdown); resource có logic đặc thù (convert lead, hoa hồng) KHÔNG ép vào factory (Inverse — tránh gold-plating).
- AC4: Pattern lỗi trả về thống nhất API contract Doc 15 §10: `{ok:false, error:{code(EN), message(VI), field?}}`.
- Truy vết: Doc 15 §10 API contract, §3 scopedDb · Phase R6-D · Test T1 (factory unit), T2 (authz).

**US-R6D-2** · Là **nhân viên admin**, tôi muốn mọi bảng danh sách có cùng năng lực: sort, filter, phân trang server-side, chọn cột hiển thị — để thao tác dữ liệu lớn nhất quán trên mọi màn hình.
- Ưu tiên: Should · Loại: FR + NFR(usability)
- AC1: DataTable dùng chung nhận khai báo cột/filter per-resource; tối thiểu 5 trang list lưu lượng cao nhất (leads, students, classes, enrollments, invoices) migrate trong R6.
- AC2: Phân trang server-side bắt buộc — không trang nào load toàn bộ bảng (kiểm chứng: 1.000 record → response < 1s, payload 1 trang).
- AC3: Trạng thái filter/sort giữ trên URL (share được link).
- Truy vết: Doc 15 §13.10 pagination bắt buộc · Phase R6-D · Test T3, T7 (perf).

**US-R6D-3** · Là **người dùng admin có role bất kỳ** (kể cả role mới tạo qua RBAC động), tôi muốn dashboard hiển thị các widget đúng với quyền của tôi để role mới không gặp dashboard trống.
- Ưu tiên: Should · Loại: FR
- AC1: Widget đăng ký trong registry kèm permission yêu cầu; dashboard render = lọc widget theo `can(actor, …)` — KHÔNG theo tên role.
- AC2: Tạo role mới qua UI RBAC + gán permission → user role đó thấy đúng widget tương ứng, không sửa code.
- AC3: 6 dashboard hiện tại (manager/teacher/sales/accountant/marketing/HR) tách thành widget — nội dung từng widget không đổi so với hiện trạng.
- Truy vết: Doc 15 §2 RBAC động · Phase R6-D · Test T2, T3.

**US-R6D-4** · Là **dev đội dự án**, tôi muốn toàn bộ label/màu của enum nghiệp vụ tập trung 1 registry để nhất quán UI và mở đường i18n.
- Ưu tiên: Should · Loại: NFR(usability/maintainability)
- AC1: 1 module registry duy nhất; các map rải rác (`STATUS_LABEL`, `LEAD_STATUS_LABEL`, `ROLE_LABELS`, `STATUS_INFO`…) re-export hoặc xóa dần.
- AC2: Enum có giá trị chưa có label → test fail (exhaustiveness check) — hết cảnh status mới hiển thị mã thô.
- Truy vết: V2.4 · Phase R6-D · Test T1.

---

### EPIC R6-E — Đóng lỗ nghiệp vụ B1–B4 — **Must**

**US-R6E-1 (B1 — Học phí 2 đợt)** · Là **Kế toán/Sale**, tôi muốn ghi nhận học phí đóng **đủ 1 lần** hoặc **chia đúng 2 đợt** (đợt 1 = ngày đăng ký, đợt 2 = ngày phụ huynh chọn) để hệ thống tự nhắc công nợ trước hạn đợt 2 và số liệu doanh số chính xác.
- Ưu tiên: Must · Loại: BR + FR
- **BR (chốt 2026-06-11):** KHÔNG có trả góp N đợt tự do. Chỉ 2 hình thức: (a) đóng đủ; (b) 2 đợt — đợt 1 thu tại ngày đăng ký, đợt 2 có `số tiền + ngày hẹn do PH chọn`. Tổng 2 đợt = học phí.
- AC1: Khi convert lead, chọn "đóng đủ" hoặc "2 đợt" (nhập tiền đợt 1 + tiền đợt 2 + ngày hẹn đợt 2; tổng lệch học phí → từ chối). Ghi nhận trong **cùng transaction** convert (atomic — Doc 15 quy tắc tiền). L3 chốt khi xác nhận đợt 1 (giữ quyết định hiện hữu "LEADS_3 = CONFIRMED đợt 1").
- AC2: Trước hạn đợt 2 **X ngày** (X = setting `finance.debtReminderDaysBefore`, chỉnh trên admin) → nhắc PH qua Notifier (email/Zalo) + hiện trong màn công nợ; quá hạn → tiếp tục hiển thị quá hạn + alert giáo vụ/kế toán. Nhắc đi qua DomainEvent idempotent (không nhắc trùng).
- AC3: Ghi nhận thanh toán đợt 2 → Invoice PAID; portal phụ huynh hiển thị đúng trạng thái đợt còn lại của con (không lộ dữ liệu HS khác).
- AC4: Doanh số tính hoa hồng = **tổng học phí hợp đồng**, chốt tại thời điểm CONFIRMED đợt 1 (nhất quán với L3 = đợt 1). Đợt 2 không trả → xử lý theo quy trình công nợ/hoàn (US-R6E-2), không tính lại hoa hồng tự động trong R6.
- Truy vết: Doc 15 §6.4, câu hỏi B1 (chốt 2026-06-11) · Phase R6-E · Test T1, T6 (atomic + idempotent), T3.

**US-R6E-2 (B2 — Hoàn tiền & chuyển lớp giữa kỳ)** · Là **QL Trung tâm/Kế toán**, tôi muốn xử lý yêu cầu hoàn tiền hoặc chuyển lớp giữa kỳ theo quy trình duyệt 2 bước để tiền và sĩ số luôn khớp, hoa hồng được điều chỉnh đúng.
- Ưu tiên: Must · Loại: BR + FR
- AC1 (chuyển lớp): Duyệt chuyển → trong 1 transaction: enrollment cũ WITHDRAWN + `transferredToId`, enrollment mới tạo ở lớp đích (check sức chứa — đầy thì chặn theo US-M1-1 AC3), attendance/tiến độ cũ giữ nguyên tham chiếu. Chuyển khác mức học phí → sinh chênh lệch thu thêm/hoàn theo công thức [chờ TBD-2 — bổ sung sau]; trong R6 chuyển **cùng mức học phí** hoạt động đầy đủ.
- AC2 (hoàn tiền) [chờ TBD-2 — bổ sung sau, KHÔNG code khi chưa chốt]: RefundRequest (số tiền, lý do) → Kế toán duyệt → ghi Payment âm/Refund record + Invoice cập nhật; enrollment WITHDRAWN. Công thức số tiền hoàn sẽ bổ sung khi TGĐ + Kế toán chốt TBD-2.
- AC3 (clawback): Lead L3 bị hoàn trong kỳ hoa hồng đã APPROVED → kỳ sau tự sinh dòng âm tương ứng (đóng nốt US-SRB-2 AC3) — qua DomainEvent, idempotent. (Phụ thuộc AC2 → cùng đợt bổ sung TBD-2.)
- AC4 (chốt 2026-06-11): Chuyển lớp **chéo cơ sở ĐƯỢC PHÉP** — cần **CENTER_MANAGER duyệt** (QL của cơ sở tiếp nhận; SUPER_ADMIN duyệt được mọi trường hợp); ghi AuditLog + reason. Mọi bước khác cũng ghi AuditLog.
- Truy vết: Doc 15 §6.4 + quy tắc atomic · Phase R6-E · Test T1, T6, T4.

**US-R6E-3 (B3 — Bảo lưu)** · Là **phụ huynh**, tôi muốn xin bảo lưu cho con có thời hạn, và là **Giáo vụ**, tôi muốn duyệt bảo lưu là enrollment tự chuyển trạng thái + tự nhắc khi đến hạn — để không phải theo dõi tay.
- Ưu tiên: Must · Loại: BR + FR
- AC1 (chốt 2026-06-11): ParentRequest loại bảo lưu có `ngày bắt đầu + thời hạn` — **tối đa 6 tháng, không thu phí giữ chỗ** (6 tháng là setting `enrollment.suspendMaxMonths`, chỉnh được). Duyệt → enrollment `PAUSED` + `suspendedUntil` trong cùng transaction; buổi học trong thời gian bảo lưu không tính vắng, không sinh MakeupNeed.
- AC2: Đến `suspendedUntil` − 7 ngày → notify PH + giáo vụ (DomainEvent). Quá hạn không quay lại → giữ PAUSED + đánh dấu quá hạn trên màn giáo vụ (không tự WITHDRAWN — quyết định là của người).
- AC3: Quay lại học: giáo vụ chọn lớp tiếp nhận (cùng khóa, tiến độ ≤ tiến độ đã học) → enrollment STUDYING; số buổi đã học bảo toàn.
- AC4: Trong thời gian PAUSED, portal hiển thị trạng thái "đang bảo lưu đến <ngày>" — không hiện lịch học.
- Truy vết: R4 C5 ParentRequest, EnrollmentStatus PAUSED (đã có) · Phase R6-E · Test T1, T3, T8 (portal).

**US-R6E-4 (B4 — Học bù chéo cơ sở)** · Là **Giáo vụ**, tôi muốn quy tắc học bù nói rõ phạm vi cơ sở: mặc định gợi ý buổi bù **cùng cơ sở**; trường hợp đặc biệt cần bù chéo cơ sở phải có duyệt + audit — để không phá rule cách ly dữ liệu.
- Ưu tiên: Must · Loại: BR
- AC1: Gợi ý buổi bù lọc thêm điều kiện cùng `centerId` với lớp gốc (giữ nguyên rule cùng khóa + không vượt tiến độ).
- AC2 (chốt 2026-06-11 — CHO PHÉP chéo cơ sở): **CENTER_MANAGER duyệt** (QL cơ sở tiếp nhận; SUPER_ADMIN duyệt được mọi trường hợp); ghi audit + reason; GV cơ sở tiếp nhận thấy HS bù trong danh sách điểm danh buổi đó (exception scopedDb có kiểm soát, đường đi rõ ràng — không mở rộng scope đọc nào khác).
- AC3: Test cách ly: user CS1 không liệt kê được buổi/HS CS2 qua bất kỳ màn học bù nào, trừ đúng record exception đã duyệt.
- Truy vết: Doc 15 §3 scopedDb · Phase R6-E · Test T2 (isolation — CI bắt buộc), T1.

---

### EPIC R6-F — Bật lớp an toàn đã xây (A0) — **Must**

**US-R6F-1** · Là **chủ hệ thống**, tôi muốn mọi truy vấn nghiệp vụ trong `app/**` bắt buộc đi qua `scopedDb(actor)` để nhân viên CS1 không thể xem dữ liệu CS2 (đóng lỗ C1).
- Ưu tiên: Must · Loại: NFR(security)
- AC1: ESLint rule chặn import `@/lib/db` trong `app/**` chuyển sang **error**; CI fail nếu còn vi phạm. (~219 file migrate dần — action factory US-R6D-1 là đường migrate chính; whitelist tạm thời phải về 0 trước khi đóng R6.)
- AC2: Test cách ly CI: với mỗi nhóm resource chính (leads, students, classes, invoices), actor CS1 query → 0 record CS2.
- AC3: Cron/webhook (không có actor người) dùng system-actor có scope tường minh — không bypass im lặng.
- Truy vết: Doc 15 §3 · Audit C1 · Phase R6-F · Test T2 (CI bắt buộc).

**US-R6F-2** · Là **chủ hệ thống**, tôi muốn bật RBAC v2 (role động từ DB) làm nguồn quyền chính thức để quyền đúng theo thiết kế Doc 15 (đóng lỗ C2).
- Ưu tiên: Must · Loại: NFR(security)
- AC1: Tiền điều kiện bật: shadow-diff (v1 vs v2) = 0 lệch trong N ngày liên tục (N = 7 mặc định, TBD-5) — có báo cáo diff làm bằng chứng.
- AC2: Grant DENY còn tồn từ Sprint 5.3 được rà + thay bằng cấu trúc role/ALLOW trước khi cắt (NC-3 Doc 15) — danh sách rà có ký xác nhận.
- AC3: Bật bằng flag, có đường rollback ≤ 5 phút (tắt flag); sự cố quyền sau bật ghi nhận qua `permission_denied_count`.
- AC4: Sau bật ổn định, matrix v1 đánh dấu deprecated (chưa xóa — IR-7).
- Truy vết: Doc 15 §2, §11 NC-3 · Audit C2 · Phase R6-F · Test T2.

---

### EPIC R6-G — Hardening vận hành — **Should**

**US-R6G-1** · Là **chủ hệ thống**, tôi muốn có bằng chứng backup khôi phục được (restore test định kỳ) để RPO 24h/RTO 4–8h không chỉ nằm trên giấy.
- Ưu tiên: Should · Loại: NFR(reliability)
- AC1: Quy trình restore từ backup Supabase vào môi trường tách biệt chạy thành công ≥ 1 lần trong R6, có runbook từng bước + thời gian đo được (so với RTO 4–8h).
- AC2: Lịch restore-test định kỳ hằng tháng được thiết lập (checklist vận hành, owner rõ).
- Truy vết: Doc 15 §13.9, OI-16 · Phase R6-G.

**US-R6G-2** · Là **hệ thống**, tôi muốn các thao tác tiền/chuyển đổi chống được thao tác đồng thời để 2 nhân viên cùng lúc không tạo dữ liệu trùng/sai.
- Ưu tiên: Should · Loại: NFR(reliability)
- AC1: 2 request convert đồng thời cùng 1 lead → đúng 1 bộ Student/Enrollment/Invoice được tạo, request còn lại nhận lỗi rõ ràng (unique constraint/lock — kiểm chứng bằng test song song).
- AC2: 2 request confirm cùng 1 payment / cùng đợt installment → ghi nhận đúng 1 lần (idempotency key).
- AC3: 2 GV cùng điểm danh 1 buổi → upsert không tạo bản ghi trùng (đã có `@@unique(sessionId, studentId)` — bổ sung test).
- Truy vết: Doc 15 §10 idempotency, §14 T6 · Phase R6-G · Test T6.

**US-R6G-3** · Là **chủ hệ thống**, tôi muốn các chỉ số sức khỏe tối thiểu có cảnh báo chủ động (event outbox tồn đọng, webhook fail, email queue nghẽn, cron không chạy) để phát hiện sự cố trước người dùng.
- Ưu tiên: Should · Loại: NFR(ops)
- AC1: 4 metric tối thiểu từ Doc 15 §13.4: `domain_event_pending_count`, `messenger_webhook_failed_count`, `email_queue_pending_count`, `cron_last_success_at` — vượt ngưỡng (ngưỡng = setting) → alert email/Sentry cho SUPER_ADMIN.
- AC2: Alert dedupe (1 sự cố không spam liên tục), có link tới màn xử lý tương ứng.
- Truy vết: Doc 15 §13.4 SLO · Phase R6-G · Test T1.

---

## 4. NFR toàn phase (áp lên mọi epic)

| Nhóm | Yêu cầu | Ngưỡng kiểm chứng |
|---|---|---|
| Performance | Đọc setting/danh mục không làm chậm request | overhead p95 < 5ms (cache); public pages giữ Lighthouse ≥ 85 mobile, LCP < 2.5s; admin ≥ 90 |
| Security | Mọi UI cấu hình mới gate bằng `can()`; sửa cấu hình tiền/quyền cần reason + audit | Test T2/T4 per màn |
| Reliability | Mọi thay đổi schema R6 là additive (IR-7); migration có đường rollback ghi trong PR | Review checklist migration |
| Usability | UI admin mới: tiếng Việt, mobile 375px dùng được; lỗi hiển thị theo field | Smoke test 375px |
| Ops | Seed idempotent cho mọi bảng danh mục mới (settings, shifts, rates, categories) — chạy lại không nhân đôi | Test seed 2 lần |

---

## 5. Ưu tiên & thứ tự đề xuất (MoSCoW)

| Ưu tiên | Hạng mục | Lý do thứ tự |
|---|---|---|
| **Must — đợt 1** | R6-A (settings) → R6-F1 (scopedDb enforce) + R6-D1 (action factory) | A là nền mọi epic khác; F1+D1 đi cùng nhau (factory là đường migrate 219 file) |
| **Must — đợt 2** | R6-E (theo thứ tự E1 học phí 2 đợt → E3 bảo lưu → E4 bù chéo → E2 chuyển lớp cùng mức phí) + R6-B1/B4 (rate + giá) | E1/E3/E4 đã chốt nghiệp vụ, code được ngay; phần hoàn tiền E2 chờ TBD-2 — KHÔNG chặn các phần còn lại |
| **Must — đợt 3** | R6-F2 (bật RBAC v2) | Cần shadow-diff sạch N ngày — bắt đầu đo từ đầu R6, bật cuối phase |
| **Should** | R6-B2/B3 (shift, category) · R6-D2/D3/D4 (DataTable, dashboard widget, label registry) · R6-G (hardening) | Giá trị cao, không chặn nghiệp vụ |
| **Could** | R6-C (landing content-block) | Làm khi Must/Should xong; cần Marketing tham gia migrate nội dung |
| **Won't (R6)** | IR-1 → IR-7 mục 1 | Chống scope creep |

---

## 6. Truy vết tổng hợp

| Epic | Doc 15 | Audit/Gap nguồn | Test nhóm |
|---|---|---|---|
| R6-A | §11 OI-17, §2 OrgUnit | V1.1, V1.4, V1.5 | T1, T2, T4, T7 |
| R6-B | §5, §6.2, §6.4 | V1.2, V1.3, V1.4, V1.6; US-SRB-1 | T1, T3, T5, T6 |
| R6-C | §7 public site | V1.7 | T3, NFR perf |
| R6-D | §10 API contract, §2 RBAC | V2.1–V2.4 | T1, T2, T3, T7 |
| R6-E | §6.4, §3, quy tắc atomic/event | B1–B4 (audit 2026-06-11) | T1, T2, T3, T4, T6, T8 |
| R6-F | §2, §3, §11 NC-3 | Audit C1, C2 | T2 (CI bắt buộc) |
| R6-G | §13.4, §13.9, §14 | V3.7 | T1, T6 |

---

## 7. TBD — trạng thái quyết định (TGĐ chốt 2026-06-11)

| ID | Câu hỏi | Quyết định | Trạng thái |
|---|---|---|---|
| TBD-1 | Mô hình thanh toán học phí + cơ sở tính hoa hồng? | ✅ **KHÔNG trả góp N đợt.** Chỉ: đóng đủ HOẶC **2 đợt** — đợt 1 = ngày đăng ký, đợt 2 = ngày PH chọn. Nhắc công nợ trước **X ngày** đến hạn đợt 2, X tùy chỉnh trên admin (setting). Hoa hồng: tổng học phí hợp đồng, chốt tại CONFIRMED đợt 1 (nhất quán L3 = đợt 1). | **CHỐT** — US-R6E-1 đã cập nhật |
| TBD-2 | Công thức hoàn tiền/pro-rate (số tiền hoàn, phí hành chính, thời hiệu)? | ⏳ **Bổ sung sau** (TGĐ 2026-06-11). Phần hoàn tiền US-R6E-2 AC2/AC3 + chênh lệch phí khi chuyển lớp **KHÔNG code** khi chưa chốt; chuyển lớp cùng mức phí vẫn triển khai. | **MỞ** — owner TGĐ + Kế toán · hạn: trước khi code R6-E2 hoàn tiền |
| TBD-3 | Cho phép chuyển lớp / học bù chéo cơ sở? Ai duyệt? | ✅ **CÓ** — **CENTER_MANAGER duyệt** (QL cơ sở tiếp nhận; SUPER_ADMIN duyệt mọi trường hợp), audit + reason. | **CHỐT** — US-R6E-2 AC4, US-R6E-4 AC2 đã cập nhật |
| TBD-4 | Thời hạn bảo lưu tối đa? Phí giữ chỗ? | ✅ **Tối đa 6 tháng, không phí** (trần là setting chỉnh được). | **CHỐT** — US-R6E-3 AC1 đã cập nhật |
| TBD-5 | Số ngày shadow-diff sạch trước khi bật RBAC v2? | Đề xuất 7 ngày liên tục, 0 lệch | **MỞ** — owner Tech lead · hạn: đầu R6 |
| TBD-6 | Danh sách 10 resource đầu migrate action factory + 5 trang DataTable đợt 1 | Đề xuất tại task breakdown R6-D | **MỞ** — owner Tech lead · hạn: khi lập task R6-D |

---

## 8. Rủi ro yêu cầu & biện pháp

| Rủi ro | Biện pháp trong bộ yêu cầu này |
|---|---|
| Gold-plating "cái gì cũng config" → hệ thống khó hiểu hơn | IR-1…IR-4 + AC4 US-R6A-2 (hằng số kỹ thuật KHÔNG vào setting); mỗi key setting phải có schema + người dùng thật cần đổi nó |
| Migrate 219 file scopedDb kéo dài, nửa vời | Gắn vào action factory (1 đường duy nhất) + ESLint error là exit criteria cứng của R6-F1 — không đóng phase khi whitelist > 0 |
| Bật RBAC v2 gây sự cố quyền diện rộng | Tiền điều kiện shadow-diff = 0 (US-R6F-2 AC1) + rollback flag ≤ 5' + rà DENY trước (NC-3) |
| TBD-2 (hoàn tiền) chốt chậm → treo E2 | Đã khoanh vùng: chỉ AC2/AC3 (hoàn tiền + clawback) và chênh lệch phí chuyển lớp bị treo; toàn bộ phần còn lại của R6-E code được ngay. Khi TBD-2 chốt → bổ sung AC qua change-control (ghi lý do + ảnh hưởng) |
| 2-phase migration bỏ quên bước drop | Ghi nợ rõ: mọi cột/enum cũ giữ lại trong R6 phải có ticket drop ở phase sau (theo dõi trong task breakdown) |
| Landing migrate gãy SEO | US-R6C-1 AC2 đối chiếu thủ công + giữ canonical; epic xếp Could — không ép tiến độ |

---

*Soạn: BA (Claude) — 2026-06-11 · BASELINE 2026-06-11 (TGĐ chốt TBD-1/3/4; TBD-2 bổ sung sau; TBD-5/6 thuộc tech lead, không chặn baseline nghiệp vụ) · Thay đổi sau baseline đi qua change-control (ghi lý do + ảnh hưởng) · Bước tiếp: `prepare-prompt` sinh phase prompt R6 trong `3-ke-hoach-trien-khai/phases/`.*
