# Đánh giá Missing Points Review + Chi tiết cải thiện HƯỚNG ĐI MỚI vs HỆ THỐNG CŨ

> **Input:** `SataRobo_Final_Blueprint_Missing_Points_Review.md` + `satarobo-final-project-blueprint-v1.md` (cùng folder).
> **Đối chiếu với:** Doc 15 v2 (blueprint chốt) + codebase hiện tại (Doc 1–12 as-is).
> **Ngày:** 2026-06-07.

---

# PHẦN 1 — ĐÁNH GIÁ FILE MISSING REVIEW: ĐÚNG HAY KHÔNG?

## 1.1 Kết luận tổng

**Review ĐÚNG về mặt chuyên môn (~95%)** — 20 điểm thiếu nêu ra đều là lớp kiến trúc nền tảng thật sự cần cho 2–5 năm, không điểm nào thừa. Tuy nhiên:

1. **Phần lớn đã được xử lý**: nội dung review chính là cơ sở cho đợt cập nhật Doc 15 ngày 2026-06-06 (§4.7–4.10, §8.1–8.3, §13–§15, A0 PR breakdown) — nên 20 điểm "thiếu" nay chỉ còn **4 gap nhỏ** (đã vá hôm nay, mục 1.3).
2. **3 chi tiết trong review SAI / bị quyết định Owner override** (mục 1.4) — không áp dụng.
3. File `satarobo-final-project-blueprint-v1.md` trong folder này là **bản tham chiếu** — nội dung đã hợp nhất toàn bộ vào Doc 15 v2; đề xuất thêm section 27–33 cho file v1 (review §23) **không thực hiện trên file v1** mà đã nằm trong Doc 15 (tránh 2 nguồn sự thật).

## 1.2 Mapping 20 điểm review → Doc 15 (trạng thái sau hôm nay)

| # | Điểm thiếu theo review | Trạng thái | Vị trí trong Doc 15 |
|---|---|---|---|
| 1 | C4 Model (L1/L2/L3 + Deployment) | ✅ (Deployment vá hôm nay) | §4.7 |
| 2 | Bounded Context + ownership + ví dụ đúng/sai | ✅ (ví dụ + SataCoin vá hôm nay) | §4.8 |
| 3 | Aggregate Root & Transaction Boundary | ✅ | §4.9 |
| 4 | Dependency Governance + CI enforce | ✅ | §4.10 |
| 5 | Feature Flag Strategy | ✅ | §13.1 |
| 6 | DB Scaling & Data Lifecycle + index | ✅ (partition monthly vá hôm nay) | §13.2 |
| 7 | Audit Scaling/Policy + AuditExportLog | ✅ | §8.1 |
| 8 | Search Strategy | ✅ (engine cụ thể = NC-6) | §13.3 |
| 9 | Observability/SLO/Runbook | ✅ | §13.4 |
| 10 | API Contract & Error Model | ✅ | §13.5 |
| 11 | Security Operation Plan | ✅ (rotation/access review/incident vá hôm nay) | §8.2 |
| 12 | Backup/Restore/DR | ✅ | §13.9 |
| 13 | Testing Strategy (pyramid) | ✅ | §14.1 + Doc 12 mục 10 |
| 14 | Cost & Capacity (S0/S1/S2) | ✅ | §15 |
| 15 | Data Migration Plan chi tiết | ✅ | §14.2 |
| 16 | Reporting Data Model (snapshot) | ✅ | §13.7 |
| 17 | Webhook Reliability | ✅ | §13.6 |
| 18 | File/Media Governance | ✅ | §8.3 |
| 19 | Environment & Deployment | ✅ | §13.8 |
| 20 | Performance Budget | ✅ | §13.10 |

## 1.3 4 gap thật còn lại — ĐÃ VÁ vào Doc 15 hôm nay (2026-06-07)

| Gap | Vá ở |
|---|---|
| Thiếu **Deployment Diagram** (C4 phụ trợ — trả lời "3 domain chung app hay tách app, Meta/Resend trong hay ngoài") | §4.7 thêm Deployment View |
| Thiếu **ví dụ Lead convert ĐÚNG vs SAI** + SataCoin chưa gán owner (Engagement) | §4.8 |
| **Partition đề xuất** mới ghi cho AuditLog — bổ sung DomainEvent + MessengerMessage (monthly by createdAt) | §13.2 |
| Security ops thiếu: **secret rotation, access review quý, password policy, rate-limit /login, data deletion/retention, incident response** | §8.2 |

## 1.4 3 điểm review SAI / bị Owner override — KHÔNG áp dụng

| Điểm trong review | Vì sao bác |
|---|---|
| §8: "Chỉ SUPER_ADMIN/**HO_MANAGER**/role audit được xem audit đầy đủ" | **Không có role HO_MANAGER** (Owner chốt OI-3, 2026-06-06). Doc 15 dùng: SUPER_ADMIN + role audit |
| §11: Idempotency "nên hỗ trợ" cả convert lead/create invoice/send activation ngay | Owner chốt OI-21: **bắt buộc trước cho webhook + confirm payment**, các API còn lại mở rộng sau |
| §23: đề xuất đánh số section mới "§9–§14" cho Doc 15 và thêm section 27–33 cho file v1 | Doc 15 đã có §9–§12 nội dung khác → đã bố trí lại thành §4.7–4.10, §8.1–8.3, §13–§15; file v1 không sửa (1 nguồn sự thật duy nhất là Doc 15) |

**Điểm chấm của review** (8.8 → 9.5 sau bổ sung): hợp lý. Sau khi vá đủ, Doc 15 hiện đạt mức "quản trị kiến trúc 2–5 năm" theo đúng tiêu chí review đặt ra.

---

# PHẦN 2 — CHI TIẾT CẢI THIỆN: HƯỚNG ĐI MỚI vs HỆ THỐNG HIỆN CÓ (CŨ)

> "Cũ" = codebase đang chạy (quét trong Doc 1–12, as-is). "Mới" = Doc 15 v2 (A0 → R5).
> Mỗi dòng: vấn đề thật của hệ thống cũ → giải pháp mới → lợi ích đo được.

## 2.1 Tổ chức & phân quyền

| Khía cạnh | CŨ (đang chạy) | MỚI (Doc 15) | Lợi ích đo được |
|---|---|---|---|
| Mô hình tổ chức | `User.centerId` phẳng — **không có khái niệm Hội sở**; "Kế toán Hội sở" của SR217 không biểu diễn được | `OrgUnit` tree: ROOT SataRobo → **HO/CS1/CS2 độc lập ngang hàng** (+CAMPUS/PARTNER/FRANCHISE) | Mở trung tâm mới = thêm 1 row data, **0 dòng code**; sẵn nền nhượng quyền |
| Role | Enum 8 role hardcode trong Prisma — đổi tên MANAGER→CENTER_MANAGER từng tốn 1 migration + legacy shim JWT còn gánh đến nay | `RoleDef/RolePermission` trong DB — **tạo role mới qua UI vài phút, 0 deploy**; chỉ SUPER_ADMIN + audit + reason | Thời gian thêm role: **vài ngày dev → vài phút admin** |
| Ma trận quyền | 140 action × 8 role nằm cứng trong `permissions.ts` (god-file — mọi module mới đều phải sửa) | `RolePermission` data-driven + `ACTION_REGISTRY` chỉ là danh mục action | Hết god-file; PR module mới không đụng file trung tâm → giảm conflict |
| Đa vai trò | `roles[]` vá trên User, không gắn nơi làm việc | `UserOrgRole` (user × orgUnit × role) + **effectiveFrom/To/status** | 1 người kiêm HO_MARKETING + Sale CS1 + hỗ trợ CS2 — đúng thực tế vận hành; kiêm nhiệm có thời hạn tự hết hiệu lực |
| Nhân sự vs quyền | Trộn lẫn — thuộc center nào là "có quyền" ở đó | Tách đôi: `EmployeeOrgAssignment` (nhân sự/lương/5 assignmentType/allocationPercent) **không sinh quyền**; quyền chỉ từ `UserOrgRole` | GV dạy thay CS1 tính được công cho CS1 mà không vô tình mở quyền; nền phân bổ chi phí/lương per cơ sở |
| Conflict quyền | DENY > ALLOW (grant 5.3) — phức tạp, dễ tự khóa | **ALLOW thắng nếu ≥1 role cho phép** — đơn giản, dự đoán được (DENY để phase sau) | Giảm bug phân quyền; dễ test (Doc 12 mục 10) |
| Hiệu lực khi đổi quyền | JWT chứa role/grants → phải bump `tokenVersion`, ép re-login | JWT chỉ `{userId, sessionVersion}` + ActorResolver per-request | Đổi quyền **hiệu lực ngay request kế tiếp** |

## 2.2 An toàn dữ liệu chéo cơ sở (điểm rủi ro tiền bạc lớn nhất)

| | CŨ | MỚI |
|---|---|---|
| Cách chặn xem chéo TT | **Convention**: dev tự nhớ thêm `where: { centerId }` từng query (~30 bảng) — 1 lần quên = QL CS1 thấy doanh số/hoa hồng CS2 | `scopedDb(actor)` **tự inject** filter theo OrgUnit + ESLint **chặn import `db` trần** — quên cũng không lọt; có test 2 chiều CS1⛔CS2 trong DoD |
| HO xem toàn hệ thống | Không có cách chuẩn (phải code if-else theo role) | HO role = cross-center **theo chức năng của role** (HO_ACCOUNTANT thấy kế toán mọi TT, không thấy mảng khác) |
| Bảo chứng | Không test | Test bắt buộc trong CI: leak chéo center = build fail |

## 2.3 CRM / Tuyển sinh (SR217)

| | CŨ | MỚI |
|---|---|---|
| LEADS_1 (tin nhắn page) | **Không tồn tại trong hệ thống** — chỉ nhận lead đã có SĐT; số liệu L1 nằm trong file Excel QC | Messenger webhook realtime → `MessengerConversation/Message` + inbox CRM; đo được cả **thời gian phản hồi 5'** |
| Phễu & SLA | LeadStatus 13 trạng thái nhưng **không đo thời gian từng chặng**, không alert | Timestamps đầy đủ (qualified/handed/confirmed/assigned/firstContact/converted) + **SLA engine 7 rule tự alert** (5'/4h/30'/3h/2 ngày/báo cáo/phân bổ) |
| Hoa hồng 4 tầng | **Tính tay Excel cuối tháng** — đúng loại tranh chấp SR217 cảnh báo | Commission engine: stats realtime qua event + kỳ DRAFT→APPROVED→PAID + detail từng orderId + clawback + audit đầy đủ |
| Chi phí QC (CPL/CPA) | Kế toán tự chia file Excel trước ngày 05 | `CostAllocationPeriod` tự tính CPL/CPA/CP_TT, trạng thái DRAFT/CONFIRMED/REOPENED, alert trễ hạn |
| Đo ROI marketing | Không có (spend nằm ngoài hệ thống) | Ads Insights API sync → dashboard **spend/CTR/CPC/CPL/CPA/ROAS** + đối soát webhook vs file QC |

## 2.4 Kiến trúc code & dependency (gỡ nợ kỹ thuật)

| | CŨ | MỚI |
|---|---|---|
| Side effects | Gọi **inline trong action**: `confirmOrder` kéo 5 hệ (enrollment, kho, voucher, email, MISA) — thêm consumer = mổ action gốc, test phải mock cả 5 | **DomainEvent outbox + dispatcher**: atomic trong transaction, side-effect là handler đăng ký — thêm consumer = **1 dòng**, retry/idempotent chuẩn |
| Boundary | 138 model / 1 file schema 4000+ dòng; module nào cũng import thẳng bảng module khác | `modules/*` + bounded context ownership (§4.8) + **multi-file Prisma** + ESLint/dependency-cruiser **enforce bằng CI** (không chỉ là quy ước) |
| External call | Resend/Zalo/CAPI/GA4 gọi rải rác, mỗi nơi 1 kiểu catch | **CHỈ `modules/integration`** được gọi ngoài — retry, log, đổi provider 1 chỗ |
| Audit | 8+ bảng `*AuditLog` copy nhau — module mới lại copy tiếp | 1 bảng `AuditLog` hợp nhất + policy (mask PII, scope viewer, export-được-audit-lại, partition) |
| Transaction tiền | Đúng nhưng ngầm định, không văn bản hóa | **Aggregate root + transaction boundary tường minh** (§4.9): tiền/enrollment atomic, notify/stats đi event — chặn từ code review |

## 2.5 Trải nghiệm người dùng & nghiệp vụ

| | CŨ | MỚI |
|---|---|---|
| Login | Mỗi host login riêng | **Cổng chung `satarobo.vn/login`** tự nhận role redirect (staff `@satarobo.vn` → admin; parent → hocvien) |
| Portal | Parent portal có, route lộ ngữ cảnh con qua cookie nhưng UX site chưa tách rõ | **Site phụ huynh + site từng con**, route đẹp `/lich-hoc /bai-tap /hinh-anh...` — **không lộ studentId trên URL** |
| Activation | Tài khoản tạo sẵn (nguy cơ mật khẩu mặc định) | **Không mật khẩu mặc định** — activation email Resend, parent tự đặt; OTP provider abstraction (SMS/Zalo cắm sau) |
| Media lớp | Upload + duyệt có; tag tùy chọn; chưa consent | **Tag bắt buộc**, PH chỉ thấy media tag con mình, **consent CLASS_MEDIA cấp/thu hồi được**, private bucket + signed URL 15' |
| Privacy trẻ em | Chưa có chính sách hệ thống | **Privacy-first chốt cứng**: không giấy tờ tùy thân, không sinh trắc học, không định vị HS, PII phân loại 4 mức + mask theo quyền |
| LMS | Đủ khối (giáo trình/bài tập/thi) nhưng buổi học chưa có checklist chuẩn, giáo trình đổi ảnh hưởng lớp cũ | **Curriculum version per lớp** (lớp cũ không vỡ), teacher checklist 7 bước/buổi, học bù không vượt tiến độ |

## 2.6 Vận hành production (trước đây gần như không có)

| | CŨ | MỚI |
|---|---|---|
| Observability | Sentry errors, hết | 8 metrics + **7 SLO đo được** (webhook 99%, event <5', p95 admin 1.5s...) + 6 runbook |
| Rollout | Deploy là bật cho tất cả | **Feature flag** env→DB, bật CS1 trước → CS2 → toàn hệ thống; cấm bypass security bằng flag |
| Webhook | Nhận rồi xử lý, fail là mất dấu | `WebhookDelivery` log + **UI replay** + idempotent theo externalEventId — chặn R1 live nếu chưa có |
| Backup/DR | Mặc định Supabase, chưa cam kết | **RPO 24h / RTO 4–8h** + restore test monthly + staging restore mask PII |
| API | Response/lỗi mỗi nơi một kiểu | Chuẩn `{ok, data, meta}` / error `{code EN, message VI, requestId}` + 8 nhóm error code + **idempotency webhook/payment** |
| Hiệu năng | Không có budget | p95 budget từng loại trang + pagination bắt buộc + export >5k dòng đi background |
| Chi phí | Không dự toán | 3 mức S0/S1/S2 + 8 nhóm chi phí theo dõi |

## 2.7 Tổng kết giá trị (1 dòng cho CEO)

> Hệ thống cũ là **MVP vận hành tốt cho 1 lớp center phẳng**; hướng đi mới biến nó thành **nền tảng đa cơ sở chuẩn Hội sở**: thêm trung tâm/role không cần dev, tiền và dữ liệu chéo cơ sở được khóa bằng kiến trúc (không phải bằng trí nhớ dev), toàn bộ phễu tuyển sinh SR217 (L1→L3, SLA, hoa hồng, CPL/CPA, ROAS) chạy tự động có audit — và đã có đủ lớp governance để sống ổn định 2–5 năm.

## 2.8 Việc còn lại để bắt đầu

1. **PR-A0-01** (OrgUnit schema) — mọi điều kiện đã chốt, bắt đầu được ngay.
2. Chặn R1 (không chặn A0): Meta App Review + page token (OI-22) · 3 file Excel hoa hồng (OI-23) · webhook replay UI trước Messenger live (OI-20).
3. NC-1→NC-7 trong Doc 15 §11 — xác nhận dần khi chạm tới.
