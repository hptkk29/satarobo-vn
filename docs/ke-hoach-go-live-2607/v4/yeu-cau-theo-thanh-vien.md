# Yêu cầu & Requirement chi tiết theo thành viên — GO-LIVE v4.1

> Viết lại theo **phạm vi v4 thu gọn** + **tài liệu kiến trúc arc42** (C4/arc42, `E:\satarobo_document`). Mỗi phần gồm: Mục tiêu · Phạm vi (trong/ngoài v4) · Yêu cầu chức năng · Ràng buộc kỹ thuật (phi chức năng) · Tiêu chí nghiệm thu (DoD) · Phụ thuộc/Task.
>
> ⚠️ **Bàn giao 03/07:** Huy & Trí rời team. Lane Huy (SIS/LMS/NOTIF, task H1–H8) → **Kiệt**; lane Trí (Login/RBAC BE · CRM · REPORT, task T1–T6) → **Luân**. Mã task giữ nguyên.
>
> **Ràng buộc kỹ thuật chung (áp cho tất cả — arc42 §2, §4, §8):**
> - Server-first (RSC); mutation qua Server Action `'use server'`; **không** `useEffect` fetch. Strict TS, Zod là source-of-truth type.
> - **Mọi Server Action/API:** `auth()` + `assertCan(actor, 'res:action')` ngay đầu hàm (defense-in-depth, không dựa layout). Portal thêm `assertOwnsStudent`.
> - **Cách ly cơ sở:** đọc/ghi model có cơ sở phải qua `scopedDb(actor)` / `passesScope` — CS1 không thấy/sửa dữ liệu CS2 (test CI bắt buộc).
> - **Atomic vs Event:** tiền · invoice · enrollment · kho → **trong transaction**; thông báo · thống kê · đồng bộ ngoài · auto-homework → **DomainEvent** (handler idempotent, `dedupeKey`).
> - **External call** (Resend/Zalo/Meta/GA4…) chỉ qua `modules/integration`. Webhook + confirm payment **bắt buộc idempotent**.
> - **PII:** `canViewParentContact` chặn TEACHER/MARKETING/HR xem SĐT/email PH; không lộ `studentId` trên URL portal; ảnh tôn trọng `StudentConsent`; AuditLog + mask PII theo quyền.
> - Verify trước khi báo PASS: `pnpm typecheck && pnpm lint && pnpm build` + smoke mobile 375px.

---

## 👤 KIỆT — Tài chính cơ bản · Deploy/migration · Review chéo · *(+ SIS/LMS/NOTIF nhận từ Huy — xem mục dưới)*

### K.1 — Deploy & migration prod 2 cơ sở  *(Task K1, K2, K7)*
- **Mục tiêu:** đưa hệ thống + dữ liệu tổ chức lên prod cho CS1 + CS2 chạy thật.
- **Phạm vi:** apply migration A0→R7; seed OrgUnit/RoleDef/UserOrgRole; commit các fix đang treo (PH-1/PH-2/C4/C5 + migration `20260629142518`); chốt 3 TBD.
- **Yêu cầu chức năng:**
  1. Apply toàn bộ migration qua `DIRECT_URL` (session pooler :5432); runtime dùng transaction pooler :6543.
  2. Seed cây tổ chức ROOT → HO/CS1/CS2 (HO độc lập, không dùng address suy quan hệ).
  3. Tạo tài khoản thật + gán `UserOrgRole` đúng cơ sở/vai trò.
  4. Bật feature-flag cần cho go-live theo trình tự shadow → flip.
- **Ràng buộc:** không sửa migration đã apply (tạo mới); restart để tránh Prisma Client stale; test **không bao giờ** trỏ Supabase.
- **DoD:** `prisma migrate status` = up-to-date; mỗi vai trò login đúng scope; CI xanh sau commit.

### K.2 — Tài chính CƠ BẢN  *(Task K3, K4, K5)*
- **Mục tiêu:** thu học phí đủ để "add học viên vào lớp" có ghi nhận tiền.
- **Phạm vi TRONG v4:** tạo Order thủ công · Sale ghi nhận khoản (tối đa 2 đợt) · Kế toán xác nhận → sinh Receipt (mã theo `OrgUnit.code`) · công nợ `/admin/cong-no` · nối Portal học phí (khoản CONFIRMED). Vá cộng đôi Payment (PAY-DEDUP).
- **NGOÀI v4 (cuốn chiếu):** hoàn tiền/pro-rata · voucher · VietQR · pricing/CourseDiscount · product catalog · cấu hình tài chính nâng cao.
- **Yêu cầu chức năng:**
  1. Order state machine + đổi trạng thái đơn có kiểm soát.
  2. Ghi nhận khoản (Sale) → xác nhận (Kế toán) sinh phiếu thu; **1 khoản = 1 dòng ledger** (lọc `accountantStatus=ADJUSTED` khi tổng hợp).
  3. Công nợ theo ghi danh cập nhật đúng sau xác nhận.
  4. Portal chỉ hiện `Payment` đã CONFIRMED (`getParentConfirmedPayments`).
- **Ràng buộc:** **tiền + enrollment atomic trong transaction**; `payment.confirmed` phát qua DomainEvent; idempotent confirm.
- **DoD:** e2e 1 đơn 2 đợt: Sale ghi nhận → KT xác nhận → phiếu thu + công nợ đúng → PH thấy đúng trên portal.

### K.3 — Bật SCORM prod · Review chéo · Deploy go-live  *(Task K6, K8, K9)*
- **Yêu cầu:** SCORM_ENABLED + R2 creds/CORS + e2e blur/watermark/IDOR (gộp với H6 — cùng Kiệt làm sau bàn giao); **review chéo Kiệt↔Luân** mọi PR đụng tiền/quyền/enrollment (thay mentor Huy/Trí); deploy go-live 26/07 + rollback plan; hỗ trợ UAT.
- **DoD:** SCORM prod chạy, IDOR chặn; go-live thành công, P0=0.

---

## 👤 LUÂN — Nền tảng enforcement · Portal · Teacher-BE (site GV riêng)

### L.1 — scopedDb enforcement (cách ly cơ sở)  *(Task L1, L2, L3)*
- **Mục tiêu:** đảm bảo mục tiêu chất lượng #1 (arc42 §1): CS1 không xem/sửa dữ liệu CS2.
- **Yêu cầu chức năng:**
  1. Flip ESLint `app-no-direct-prisma` warn→error; migrate ~221 file `@/lib/db` trần → `scopedDb(actor)`; whitelist→0.
  2. Thêm `passesScope` guard cho **write** (update/delete/create) ở 8 lib-service — `scopedDb` chỉ auto-scope READ (chống IDOR write).
  3. Đưa `Attendance` & `ReportCard` ra khỏi `SCOPE_EXEMPT` → scope theo `class.centerId`.
  4. Backfill `Enrollment/ClassSession.centerId` = 100% trước khi scope (tránh ẩn record `centerId=null`).
- **Ràng buộc:** nested include phải tự thêm `where`; soft-delete ở tầng base.
- **DoD:** build FAIL nếu app/** import `@/lib/db` trần; **test CI cách ly cơ sở xanh**; e2e IDOR write bị chặn.

### L.2 — RBAC v2 flip + AuditLog hợp nhất  *(Task L4, L9)*  — *RBAC logic (T2) nay cũng do Luân — gộp luồng; UI: Vy*
- **Yêu cầu:** vận hành shadow-compare v1↔v2 đến 0 mismatch ≥7 ngày → `RBAC_V2_ENABLED=true`; cắt matrix tĩnh (Phase C). Viewer `/admin/audit-log` đọc **AuditLog hợp nhất**, scope theo `orgUnitId`, mask PII; đóng băng đọc-only 8 bảng cũ.
- **DoD:** shadow report 0 mismatch 7 ngày; sau flip `can()` matrix test xanh; audit viewer scope + mask đúng theo quyền.

### L.3 — SITE GIÁO VIÊN RIÊNG (BE) + Teacher-BE  *(Task L5, L6)*  — *arc42 §6 Giáo viên*
- **Mục tiêu:** tách site GV thành **site riêng như Portal PH/HV** (không lẫn admin đầy đủ), siết owner-scope theo lớp phân công.
- **Yêu cầu chức năng:**
  1. Dựng route group `(teacher)` / subdomain `giaovien.` + host routing qua `route-policy.decideRoute` + gate vai trò TEACHER.
  2. Bật `SESSION_LIFECYCLE_V2` (hoàn tất buổi v2 → phát `session.taught` → auto giao bài).
  3. Sửa `calendar-data` lọc theo **lớp phân công** (`assignedClassIds`), không theo cơ sở.
  4. `markAttendance` dùng đúng matrix `attendance:edit` (bỏ `requireTeacherOrAdmin` đọc `user.role` đơn).
  5. Fix "GV đề xuất chỉnh bài" (LessonChangeRequest) — hiện **broken** cho TEACHER (gate `questions:author`/`curriculum:edit` không cấp GV → cấp quyền đề-xuất riêng, không phải quyền sửa trực tiếp).
- **Ràng buộc:** GV **không** xem SĐT/email PH; **không** biên soạn nội dung LMS; **không** duyệt lớp/học bạ (chỉ nhập).
- **DoD:** GV login vào site GV riêng; chỉ thấy lớp mình trên lịch; hoàn tất buổi v2 chạy; host×role test phủ.

### L.4 — Portal đóng nợ kỹ thuật  *(Task L7, L8)*  — *arc42 §6 Phụ huynh/Học viên, §11*
- **Yêu cầu chức năng:**
  1. **UI cấp/thu hồi consent ảnh** (`grant/revokeMediaConsent`) — hiện chỉ test gọi → `/portal/hinh-anh` rỗng. Xây UI cho PH.
  2. `/admin/parent-feedback` **cách ly cơ sở** (đang thấy toàn hệ thống).
  3. `createParentRequest` phát DomainEvent + notify staff (hiện im lặng).
  4. Presign `fileUrl` tài liệu bài giảng (đang lộ URL thô).
- **DoD:** PH cấp consent → ảnh hiện; feedback theo cơ sở; tạo yêu cầu → staff nhận thông báo; tài liệu tải qua signed URL.

---

## 👤 KIỆT *(bàn giao từ Huy 03/07)* — SIS · LMS (đầy đủ) · NOTIF

### H.1 — Điểm danh & vận hành lớp  *(Task H1, H3)*  — *arc42 §6 Quản lý lớp*
- **Mục tiêu:** khâu điểm danh là trái tim luồng lõi.
- **Yêu cầu chức năng:**
  1. Điểm danh **6 nhãn** (null-row, không enum PENDING); vắng → `MakeupNeed` + `StudentRiskAlert` + thông báo PH.
  2. `convertLeadV2` **re-check sĩ số (Serializable) + check tiên quyết** (hiện thiếu → rủi ro vượt sĩ số khi convert song song) — phối hợp Luân (T3 convert UI/CRM).
- **Ràng buộc:** side-effect điểm danh nên đi qua DomainEvent (giảm dính chùm); enrollment atomic.
- **DoD:** điểm danh 1 buổi tạo đúng MakeupNeed/risk/email; 2 convert song song lớp gần đầy → chỉ 1 thành công.

### H.2 — LMS đầy đủ  *(Task H2, H5, H6, H7)*  — *arc42 §6 Phòng Đào tạo, §11*
- **Phạm vi TRONG v4:** curriculum · **fix HomeworkAssignment.status** · Assignment nộp/chấm rubric · Exam/ExamAttempt · phiếu đánh giá buổi (SESSION_EVAL) · ReportCard duyệt→phát hành · **SCORM** pipeline/player.
- **Yêu cầu chức năng:**
  1. Fix `HomeworkAssignment.status` (🔴) — hiện tạo `ASSIGNED` qua `createMany`, không update → nối `ASSIGNED→SUBMITTED→GRADED`.
  2. Cấp quyền `TRAINING` duyệt/phát hành `ReportCard` & `CourseCompletion` (🔴 permission gap).
  3. SCORM: ingest/validate zip an toàn · pipeline upload→publish · player vé HMAC 10p + blur/watermark (gộp với K6 bật prod — cùng người).
  4. Verify SESSION_EVAL + Exam + học bạ chạy trơn end-to-end.
- **DoD:** HV nộp → GV chấm → trạng thái đúng ở portal; TRAINING phát hành học bạ; SCORM upload→publish→play + chống IDOR.

### H.3 — NOTIF email cơ bản  *(Task H4, H8)*  — *arc42 §8.3 DomainEvent*
- **Phạm vi TRONG v4:** email queue/worker (Resend) · 17 trigger DomainEvent · notification center admin · feed PH · chuông NS · cron nhắc lịch/công nợ. **NGOÀI:** Zalo/MISA/tích hợp ngoài.
- **Ràng buộc:** handler **idempotent** (event trùng `dedupeKey` không gửi 2 lần); external call qua `modules/integration`.
- **DoD:** bắn từng event (kích hoạt TK, xác nhận thu, nhận xét, nhắc nợ) → đúng 1 email; regression LMS/NOTIF sạch.

---

## 👤 LUÂN *(bàn giao từ Trí 03/07)* — Login & Phân quyền (BE) · CRM cơ bản · REPORT cơ bản

### T.1 — LOGIN & PHÂN QUYỀN (logic/BE)  *(Task T1, T2)*  — *arc42 §6 Xương sống & RBAC, §8.1*
- **Mục tiêu:** cổng đăng nhập chung + quyền tối thiểu chính xác cho Sale/GV/Đào tạo/Kế toán/PH.
- **Yêu cầu chức năng:**
  1. Auth.js login chung 3 domain; redirect theo **vai trò × host** qua `route-policy.decideRoute`.
  2. Guard `auth() + assertCan` đầu **mọi** Server Action/API; Portal thêm `assertOwnsStudent`; lỗi trả `PERMISSION_DENIED`.
  3. RBAC động: `RoleDef` + `RolePermission(action, scopeType GLOBAL/CENTER/CLASS/OWN/CHILDREN/ASSIGNED)` + `UserOrgRole`; engine `can()` v2 **ALLOW-wins** (không DENY override); `action-registry` chặn action ngoài danh mục; **reason bắt buộc** + `RbacAuditLog` mọi mutation.
- **Ràng buộc:** quyền = union UserOrgRole còn hiệu lực, nở theo subtree OrgUnit; quyền KHÔNG lưu JWT (resolve per-request, cache 1 query); SUPER_ADMIN bypass.
- **DoD:** mỗi vai trò login redirect đúng khu vực; action trái quyền bị chặn dù layout đã cho vào; `route-policy.test.ts` + `login-redirect.test.ts` + `can.test.ts` xanh.

### T.2 — CRM cơ bản  *(Task T3, T4)*  — *arc42 §6 Đào tạo (convert), §12*
- **Phạm vi TRONG v4:** quản lý lead **đã đăng ký** (list/filter/detail/ghi chú/hoạt động) · convert conflicts UI · REGISTERED vào `KANBAN_COLUMNS` · lớp trải nghiệm N buổi · import lead Excel.
- **NGOÀI v4:** Messenger inbox · ads sync · webhook ingest · SLA engine · funnel marketing.
- **Yêu cầu chức năng:**
  1. Sale xử lý lead đã ĐK → convert → `Student + Enrollment` (atomic, phối hợp Kiệt H3 về sĩ số/tiên quyết + review tiền).
  2. Bổ sung cột `REGISTERED` vào Kanban (hiện chỉ auto-advance, thiếu cột).
  3. Import lead Excel để nạp danh sách lead hiện tại.
- **DoD:** convert 1 lead thành HV+Enrollment; Kanban có REGISTERED; import file mẫu OK.

### T.3 — REPORT cơ bản  *(Task T5, T6)*
- **Phạm vi TRONG v4:** dashboard gộp đa vai trò · panels QL/Sale/Kế toán/GV · khu "Cần xử lý" · báo cáo lead (funnel) · doanh thu vs mục tiêu · cách ly cơ sở. **NGOÀI:** export Excel/PDF · cohort · churn · hiệu suất GV · digest.
- **DoD:** mỗi vai trò thấy panel + số liệu đúng scope; CS1 không thấy số CS2; hỗ trợ UAT sale.

---

## 👤 VY — Login UI · UI phân quyền · Site GV UI (riêng) · Portal FE · Design system

> **Ràng buộc UI (arc42 §2 / ui-libraries):** admin = shadcn + Recharts; client/portal/GV = shadcn + Magic UI + Motion (ESLint enforce). Mobile-first 375px. Brand: cam `#F97316` / tím `#7C3AED`.

### V.1 — UI LOGIN + UI PHÂN QUYỀN  *(Task V1, V2)*  — *ghép BE của Luân (T1/T2 nhận từ Trí + L9)*
- **Yêu cầu chức năng:**
  1. Màn đăng nhập chung 3 domain + UI điều hướng theo vai trò + màn kích hoạt TK phụ huynh (`/kich-hoat`, OTP); trạng thái lỗi/không-quyền rõ ràng; responsive 375px.
  2. UI **Roles/RolePermission editor**: ma trận tick `action × scopeType` cho từng vai trò (`setRolePermissions`), nhãn tiếng Việt từ `action-labels`; buộc nhập lý do.
  3. UI **Users** + gán vai trò theo đơn vị (`org-roles`) + **Audit viewer**.
- **DoD:** SUPER_ADMIN cấu hình vai trò+quyền qua UI (không cần seed tay); mỗi thao tác ghi lý do; login UI chạy mobile.

### V.2 — SITE GIÁO VIÊN RIÊNG (UI)  *(Task V3)*  — *ghép khung BE của Luân (L5)*
- **Yêu cầu chức năng:** đủ màn cho GV vận hành trên **site riêng** (kiến trúc như portal): điểm danh · giáo án/SCORM · chấm bài · đánh giá buổi · học bạ · lịch dạy · báo cáo tiến độ. Mobile-first.
- **DoD:** GV thao tác đủ luồng trên site GV mobile; đồng bộ design system.

### V.3 — Portal FE polish + Design system  *(Task V4, V5)*
- **Yêu cầu:** rà 22 màn portal (mobile 375px, empty/error state, ảnh signed URL); component library + tokens brand; review UI các màn mới (Login/Roles/GV).
- **DoD:** portal mượt 375px; màn mới dùng chung design system nhất quán.

---

## Phụ lục — Bản đồ nợ kỹ thuật (arc42 §11) → Task

| Nợ kỹ thuật (bằng chứng) | Người | Task |
|---|---|---|
| Consent ảnh không có UI (`media-consent.ts:17,26`) | Luân | L7 |
| `HomeworkAssignment.status` không chuyển (`assignment.ts:164`) | Kiệt *(từ Huy)* | H2 |
| `convertLeadV2` không re-check sĩ số/tiên quyết (`convert-lead-v2.ts:194`) | Kiệt+Luân *(từ Huy+Trí)* | H3 |
| `scopedDb` chưa auto-scope WRITE + nested include | Luân | L2 |
| `Attendance`/`ReportCard` còn `SCOPE_EXEMPT` | Luân | L3 |
| `/admin/parent-feedback` không cách ly cơ sở | Luân | L8 |
| "GV đề xuất chỉnh bài" broken cho TEACHER | Luân | L6 |
| Lịch dạy GV lọc theo cơ sở, không theo lớp | Luân | L6 |
| `markAttendance` bỏ qua matrix `attendance:edit` | Luân | L6 |
| Tài liệu bài giảng lộ `fileUrl` thô | Luân | L8 |
| `createParentRequest` không phát event/notify | Luân | L8 |
| `REGISTERED` thiếu khỏi `KANBAN_COLUMNS` | Luân *(từ Trí)* | T3 |
| `TRAINING` không có quyền phát hành ReportCard/CourseCompletion | Kiệt *(từ Huy)* | H5 |
| Split-brain Payment / Lead→REGISTERED (chưa commit) | Kiệt | K2, K3 |
