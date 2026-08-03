# Kế hoạch GO-LIVE 26/07 — Luân  🟨 Vàng  ·  BẢN V4.1 (nhận bàn giao lane Trí)

> **Cấp:** Mid  ·  **Lane v4.1:** FOUND enforcement (scopedDb · RBAC v2 flip · AuditLog) · PORTAL · **TEACHER-BE (dựng SITE GIÁO VIÊN RIÊNG)** · **LOGIN & PHÂN QUYỀN (BE) · CRM cơ bản · REPORT cơ bản** *(nhận từ Trí — rời team 03/07)*  ·  **Cập nhật:** 2026-07-03  ·  **Mục tiêu:** GO-LIVE 26/07/2026
> Nguồn: v4 thu gọn + arc42 (§6 Xương sống/GV/Phụ huynh & RBAC, §8 scopedDb, §11 nợ kỹ thuật). Xem: [v4/README.md](v4/README.md) · [v4/yeu-cau-theo-thanh-vien.md](v4/yeu-cau-theo-thanh-vien.md).
>
> ⚠️ **Thay đổi 03/07:** Huy & Trí rời team. Luân nhận **toàn bộ task T1–T6** (Login/RBAC BE · CRM · REPORT, giữ nguyên mã T* để khớp MISA). Huy bàn giao cho Kiệt (H1–H8). Điểm lợi: T2 (RBAC logic) + L4 (RBAC flip) giờ **cùng 1 người** — không còn phải chốt hợp đồng interface giữa 2 người. Tổng tải Luân ≈ 27 + 19 = **~46 ngày-công** — vượt quỹ thời gian còn lại → xem mục 7 (rủi ro tải).

## 1. Phạm vi v4.1 (trong / ngoài)
- **TRONG MVP 26/07:** scopedDb error-gate (~221 file) · WRITE guard passesScope · scope Attendance/ReportCard · RBAC v2 flip · AuditLog hợp nhất · **dựng site GV riêng + Teacher-BE** · đóng nợ kỹ thuật Portal (consent ảnh, feedback scope, request event, presign tài liệu) · **Login & phân quyền BE** (auth flow · redirect vai trò · guard · RBAC logic can() v2) · **CRM cơ bản** (lead đã ĐK · convert · lớp trải nghiệm · import lead) · **REPORT cơ bản** (dashboard đa vai trò · panels · "Cần xử lý").
- **NGOÀI (cuốn chiếu sau):** Messenger inbox · ads sync · webhook replay/ingest · SLA engine · funnel marketing · export Excel/PDF · cohort/churn/hiệu suất GV · digest tự động.

## 2. Dòng công việc theo sprint
- **GĐ0 (01–04/07):** RBAC v2 shadow + chuẩn bị scopedDb error-gate (chờ K1 migration).
- **GĐ1 (06–13/07):** scopedDb error-gate + WRITE guard + scope Attendance/ReportCard · **Login & phân quyền BE (T1/T2)** · CRM cơ bản (T3/T4, phối hợp Kiệt H3 sĩ số + review tiền).
- **GĐ2 (08–18/07):** dựng **site GV riêng** + Teacher-BE · RBAC v2 flip · AuditLog hợp nhất · đóng nợ Portal (consent/feedback/request/presign).
- **GĐ3–4 (20–26/07):** REPORT cơ bản (T5) · QA login/phân quyền + CRM (T6) · enforcement regression · tích hợp site GV (với Vy) · UAT portal/GV/sale.

## 3. 🚨 Blocker chặn go-live (của Luân)
| Mã | Blocker | Ưu | Ngày |
|---|---|---|---|
| **L1** | scopedDb error-gate: ESLint warn→error + migrate ~221 file → `scopedDb(actor)`; whitelist→0 | P0 | 06–11/07 |
| **L2** | scopedDb WRITE guard `passesScope` (8 lib-service) — chống IDOR write | P0 | 09–11/07 |
| **L3** | Scope `Attendance` & `ReportCard` (bỏ `SCOPE_EXEMPT`) | P0 | 09–12/07 |
| **L4** | RBAC v2 flip prod (shadow 7 ngày → ON) | P0 | 01–18/07 |
| **T1** | Login & phân quyền BE: auth flow + redirect vai trò × host + guard `assertCan` mọi Server Action/API *(nhận từ Trí)* | P0 | 06–10/07 |
| **T2** | RBAC logic: RoleDef/RolePermission/UserOrgRole + `can()` v2 ALLOW-wins + action-registry *(nhận từ Trí)* | P0 | 08–11/07 |

## 4. Việc chi tiết theo phần

### FOUND — Nền tảng enforcement · GĐ0–GĐ2
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **L1** | scopedDb error-gate (~221 file) | P0 | 06–11/07 | Flip ESLint `app-no-direct-prisma` warn→error; migrate file `@/lib/db` trần → `scopedDb(actor)`; backfill `Enrollment/ClassSession.centerId`=100% trước khi scope | Build FAIL nếu app/** import `@/lib/db` trần; whitelist=0; không ẩn nhầm record centerId null | CI cách ly cơ sở xanh; grep `@/lib/db` trần trong app/** = 0 | 5d |
| **L2** | WRITE guard `passesScope` (8 lib-service) | P0 | 09–11/07 | Thêm guard cho update/delete/create (scopedDb chỉ auto-scope READ) | CS1 không sửa/xoá record CS2 ở mọi service | E2E IDOR write → `PERMISSION_DENIED` | 3d |
| **L3** | Scope Attendance & ReportCard | P0 | 09–12/07 | Bỏ khỏi `SCOPE_EXEMPT` → scope theo `class.centerId` (query-level) | CS1 không đọc Attendance/ReportCard CS2 | Test CI cách ly 2 model | 2d |
| **L4** | RBAC v2 flip (shadow → ON) | P0 | 01–18/07 | Shadow-compare v1↔v2 đến 0 mismatch ≥7 ngày → `RBAC_V2_ENABLED=true`; rà DENY grant cũ; cắt matrix tĩnh. (Cùng người với T2 → gộp luồng làm) | Shadow report 0 mismatch 7 ngày; sau flip `can()` matrix test xanh | Dashboard shadow-report; can.test.ts | 3d |
| **L9** | AuditLog hợp nhất viewer | P1 | 16–18/07 | `/admin/audit-log` đọc bảng AuditLog hợp nhất, scope theo `orgUnitId` + mask PII; đóng băng đọc-only 8 bảng cũ | Viewer đọc bảng hợp nhất; lọc theo cơ sở; PII che theo quyền | Xem audit 2 vai trò khác quyền → mask khác nhau | 2d |

### LOGIN & PHÂN QUYỀN (BE) · GĐ1 *(nhận từ Trí · UI: Vy V1/V2)*
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **T1** | Auth flow + redirect vai trò + guard | P0 | 06–10/07 | Auth.js login chung; redirect theo vai trò × host qua `route-policy.decideRoute`; guard `auth()+assertCan` đầu **mọi** Server Action/API; Portal thêm `assertOwnsStudent` | Mỗi vai trò login redirect đúng khu vực; action trái quyền trả `PERMISSION_DENIED` dù layout đã cho vào | `route-policy.test.ts` + `login-redirect.test.ts`; thử action trái quyền → chặn | 4d |
| **T2** | RBAC logic + can() v2 | P0 | 08–11/07 | RoleDef/RolePermission(action,scopeType)/UserOrgRole; `can()` v2 ALLOW-wins (không DENY override); `action-registry` chặn action ngoài danh mục; reason bắt buộc + `RbacAuditLog` mọi mutation. Gộp luồng với L4 (flip) — cùng người | Gán cặp (action,scope) cho vai trò; `can()` đúng scope (GLOBAL/CENTER/OWN/CLASS/ASSIGNED); action ngoài registry bị chặn | `can.test.ts` ma trận xanh; gán role qua service ghi audit + reason | 3d |

### CRM — Sale CƠ BẢN · GĐ1 *(nhận từ Trí)*
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **T3** | Quản lý lead đã ĐK + convert conflicts + REGISTERED vào Kanban | P1 | 06–11/07 | Quản lý lead đã đăng ký (list/filter/detail/ghi chú/hoạt động); convert conflicts UI; bổ sung `REGISTERED` vào `KANBAN_COLUMNS` (hiện thiếu, chỉ auto-advance). Convert đụng tiền → Kiệt review | Sale xử lý lead đã ĐK + convert; cột REGISTERED hiện trên Kanban | Convert 1 lead → Student+Enrollment; Kanban có REGISTERED | 4d |
| **T4** | Lớp trải nghiệm N buổi + import lead Excel | P1 | 10–13/07 | Widget xếp lead vào lớp trải nghiệm; import lead từ Excel (nạp danh sách lead đã ĐK hiện tại) | Xếp 1 lead vào lớp trải nghiệm; import 1 file Excel OK | Import file mẫu; xếp trải nghiệm; đối chiếu số lead | 2d |

### REPORT — Báo cáo CƠ BẢN · GĐ3 *(nhận từ Trí)*
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **T5** | Dashboard đa vai trò + panels + cần xử lý | P1 | 20–22/07 | Dashboard gộp đa vai trò: panels QL/Sale/Kế toán/GV + khu "Cần xử lý" + báo cáo lead (funnel) + doanh thu vs mục tiêu; cách ly cơ sở (scopedDb). KHÔNG export/cohort/churn | Mỗi vai trò thấy panel + số liệu đúng scope; "Cần xử lý" gom việc đúng quyền | Login từng role: panel + số liệu khớp; CS1 không thấy số CS2 | 3d |
| **T6** | QA login/phân quyền + CRM + REPORT + UAT | P1 | 22–25/07 | Regression login/RBAC + CRM + REPORT; hỗ trợ UAT Sale | Không lỗi P0/P1 login/phân quyền/CRM khi UAT | Ma trận host×role + UAT sale checklist PASS | 3d |

### TEACHER — Site Giáo viên RIÊNG (BE) · GĐ2  *(UI: Vy V3)*
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **L5** | Dựng site GV riêng (route group/subdomain như portal) | P1 | 08–11/07 | Tạo route group `(teacher)` / subdomain `giaovien.` tách khỏi admin; host routing qua `route-policy.decideRoute`; gate vai trò TEACHER | GV login vào site GV riêng (không vào admin đầy đủ); host×role test phủ | Login GV → site GV; login QL → admin; route-policy.test.ts | 3d |
| **L6** | Teacher-BE: lifecycle v2 + lịch theo lớp phân công + attendance matrix | P1 | 11–15/07 | Bật `SESSION_LIFECYCLE_V2`; `calendar-data` lọc theo `assignedClassIds` (không theo cơ sở); `markAttendance` dùng matrix `attendance:edit`; fix "GV đề xuất chỉnh bài" (LessonChangeRequest) broken cho TEACHER | GV chỉ thấy lớp mình; hoàn tất buổi v2 phát `session.taught`; điểm danh qua đúng matrix | GV 2 lớp: lịch chỉ hiện lớp phân công | 4d |

### PORTAL — Đóng nợ kỹ thuật · GĐ2  *(FE polish: Vy V4)*
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **L7** | UI cấp/thu hồi consent ảnh | P1 | 12–16/07 | `grant/revokeMediaConsent` hiện chỉ test gọi → xây UI cho PH; `/portal/hinh-anh` phụ thuộc consent | PH cấp/thu hồi consent; ảnh chỉ hiện sau khi GRANTED | PH toggle consent → ảnh có/không tương ứng | 3d |
| **L8** | Đóng 3 gap portal | P1 | 14–16/07 | (1) `/admin/parent-feedback` cách ly cơ sở; (2) `createParentRequest` phát DomainEvent + notify staff; (3) presign `fileUrl` tài liệu bài giảng | Feedback theo cơ sở; tạo yêu cầu → staff nhận thông báo; tài liệu qua signed URL | Mỗi gap 1 kịch bản kiểm chứng | 2d |

## 5. Ràng buộc kỹ thuật (bất biến mọi ticket)
`auth()` + `can()` v2 + `assertCan(actor,action,target)` đầu hàm → `scopedDb(actor)` đọc/ghi có cơ sở (WRITE tự guard `passesScope`) → nested include tự thêm `where` → convert/tiền đi **transaction** + **Kiệt review bắt buộc** → side-effect qua DomainEvent idempotent → mutation phân quyền ghi RbacAuditLog + reason bắt buộc → quyền KHÔNG lưu JWT (resolve per-request) → PII mask theo quyền; GV không xem SĐT/email PH → API lỗi `{ok:false,error:{code EN,message VI}}` → DoD: `typecheck && lint && build` + test cách ly cơ sở + smoke 375px.

## 6. Phối hợp & phụ thuộc
- **Login/phân quyền:** T1/T2 + L4 giờ cùng Luân → tự chốt interface, cung cấp hợp đồng/mock sớm cho Vy (V1/V2) dựng UI.
- **CRM:** T3/T4 phối hợp Kiệt (H3 convert sĩ số/tiên quyết + review tiền); sau convert HV được gán lớp (SIS — Kiệt).
- **REPORT:** đọc-only qua `scopedDb` (nền L1/L3 của chính Luân) — CS1 không xem CS2.
- **Site GV:** Luân dựng khung route/host (L5) sớm GĐ2 để Vy (V3) làm UI trên khung; UAT GV thật sớm.
- **Review chéo (K8):** Kiệt review PR RBAC/CRM/tiền của Luân; Luân review PR tiền/enrollment/LMS của Kiệt.
- **Phụ thuộc:** L1/T1 chờ K1 (migration prod). L3/L2 nền cho báo cáo cách ly (T5). Portal học phí phần tiền do Kiệt (K5).

## 7. ⚠️ Rủi ro tải sau bàn giao (cần PM quyết)
- Tổng tải Luân ≈ **46 ngày-công** (L* ~27 + T* ~19) trong ~20 ngày làm việc còn lại → **không khả thi nếu giữ nguyên phạm vi + deadline**.
- Điểm bù: T2+L4 cùng người tiết kiệm chi phí phối hợp; T1 guard `assertCan` trùng phạm vi rà soát với L1 (migrate 221 file) → làm chung 1 lượt quét file.
- Đề xuất giảm tải (chờ PM chốt): (1) T4 (lớp trải nghiệm + import Excel) hạ P2/cuốn chiếu; (2) T5 rút còn panel QL + Sale (bỏ panel Kế toán/GV đợt đầu); (3) L7/L8 (nợ portal) dời sau go-live nếu phải chọn — ưu tiên enforcement (L1–L4) + login (T1/T2) trước.
