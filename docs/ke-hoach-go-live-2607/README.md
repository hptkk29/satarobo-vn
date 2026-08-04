# Kế hoạch GO-LIVE 26/07/2026 — Sata Robo VN (bản kỹ thuật cho team)

> **Ngày lập:** 2026-07-01 · **Cập nhật:** 2026-07-03 (Huy & Trí rời team — bàn giao Huy→Kiệt, Trí→Luân) · **Go-live:** 26/07/2026 · **Lịch:** 6 ngày/tuần (nghỉ CN) · **Nguồn:** kiểm kê 282 tính năng (12 module) + `docs/tong-hop-phase-thoi-gian-du-an.md`.
> File gửi khách (nghiệp vụ + kỹ thuật): `E:\LandingPage_data\SataRobo_DacTaTinhNang_KeHoach_GoLive_2607_v3.xlsx`.

## 1. Nhân sự & màu

> ⚠️ **03/07:** Huy (🟦) & Trí (🟪) rời team. Task giữ nguyên mã H*/T* trên MISA, đổi người thực hiện.

| Người | Cấp | Màu | Module phụ trách |
|---|---|---|---|
| **Kiệt** | Mid · Tech-lead | 🟩 Xanh lá | FIN · Deploy · PUBLIC · **SIS · LMS · NOTIF** *(nhận từ Huy)* · HR/MKT (sau go-live) |
| **Luân** | Mid | 🟨 Vàng | FOUND (enforcement) · PORTAL · TEACHER-BE · **LOGIN/RBAC-BE · CRM · REPORT** *(nhận từ Trí)* |
| **Vy** | FE Design | 🩷 Hồng | LOGIN UI · UI phân quyền · TEACHER UI · FE polish Portal/Admin |
| ~~Huy~~ | — | 🟦 | *Rời team 03/07 — bàn giao SIS/LMS/NOTIF cho Kiệt ([HUY.md](HUY.md))* |
| ~~Trí~~ | — | 🟪 | *Rời team 03/07 — bàn giao LOGIN-BE/CRM/REPORT cho Luân ([TRI.md](TRI.md))* |

## 2. Module × Người × Ngày

| Module | Người | GĐ | Ngày | Số TN | ✅ done | 🟡⬜ còn |
|---|---|---|---|---|---|---|
| FOUND — Nền tảng & Phân quyền | Luân | GĐ0–GĐ2 | 01/07→18/07 | 23 | 16 | 7 |
| CRM — Sale & CRM | Luân *(từ Trí)* | GĐ1 | 06/07→13/07 | 24 | 20 | 4 |
| SIS — Học viên·Lớp·Điểm danh | Kiệt *(từ Huy)* | GĐ1 | 06/07→13/07 | 32 | 30 | 2 |
| FIN — Tài chính | Kiệt | GĐ0–GĐ1 | 01/07→13/07 | 23 | 22 | 1 |
| LMS — Đào tạo & LMS | Kiệt *(từ Huy)* | GĐ1–GĐ2 | 06/07→18/07 | 20 | 16 | 4 |
| TEACHER — Giáo viên (Site/UI) | Luân +Vy | GĐ2 | 08/07→18/07 | 22 | 17 | 5 |
| PORTAL — Portal PH & HV | Luân | GĐ2 | 08/07→18/07 | 23 | 20 | 3 |
| HR — HR & Chấm công | Kiệt | GĐ2 | 14/07→18/07 | 19 | 18 | 1 |
| MKT — Marketing & Hoa hồng | Kiệt | Sau | Sau 26/7 | 16 | 9 | 7 |
| REPORT — Báo cáo & Dashboard | Luân *(từ Trí)* | GĐ3 | 20/07→22/07 | 21 | 19 | 2 |
| NOTIF — Thông báo & Tích hợp | Kiệt *(từ Huy)* | GĐ1–GĐ3 | 06/07→22/07 | 24 | 18 | 6 |
| PUBLIC — Public site & SEO | Kiệt | GĐ2 | 14/07→18/07 | 24 | 24 | 0 |

## 3. Sprint go-live

| GĐ | Tên | Thời gian | Trọng tâm |
|---|---|---|---|
| **GĐ0** | Enforcement & Deploy nền | 01–04/07 | migration prod 2 CS · vá Payment · RBAC v2 shadow · chốt TBD |
| **GĐ1** | Lõi Sale→Lớp→Tiền→Giáo trình | 06–13/07 | CRM sale + Login/RBAC BE (Luân) · SIS xếp lớp/điểm danh + Finance + email/notif (Kiệt) · scopedDb error-gate (Luân) |
| **GĐ2** | Portal + Site Giáo viên | 08–18/07 | Portal 100% (Luân+Vy) · Teacher UI · RBAC flip + Roles/Audit (Luân) · LMS SCORM + SCORM prod (Kiệt) |
| **GĐ3** | Báo cáo · Hardening · Regression | 20–22/07 | Báo cáo QL cơ sở (Luân) · security · regression QA |
| **GĐ4** | UAT 2 cơ sở + GO-LIVE | 23–26/07 | UAT CS1+CS2 · fix P0/P1 · GO-LIVE 26/07 |
| **Sau** | Cuốn chiếu & R&D | sau 26/07 | Zalo/MISA/cổng TT · commission · Satacoin · PWA · marketplace/proctoring |

## 4. 🚨 Tồn đọng CHẶN go-live (checklist)

| # | Hạng mục | Người | GĐ/Ngày | TT | Ưu tiên |
|---|---|---|---|---|---|
| 1 | **Apply migration Supabase prod (2 cơ sở)** — Apply ~18+ migration A0→R7 lên prod (DIRECT_URL session pooler) + seed OrgUnit CS1/CS2 + RoleDef/UserOrgRole tài khoản thật + flip flags | Kiệt | GĐ0 · 01–02/07 | ⬜ | P0 |
| 2 | **Vá cộng đôi Payment (PAY-DEDUP)** — Commit+push 14 file + 2 migration đang dở; lấp double-read trong lib/payments/summary.ts (lọc accountantStatus=ADJUSTED); verify typecheck/lint/build | Kiệt | GĐ0 · 01–03/07 | 🟡 | P0 |
| 3 | **scopedDb error-gate** — ESLint app-no-direct-prisma warn→error + migrate ~221 file import @/lib/db trần → scopedDb(actor); whitelist→0 | Luân | GĐ1 · 06–11/07 | ⬜ | P0 |
| 4 | **8 file lib-service passesScope** — Thêm guard passesScope cho update/delete/create (scopedDb chỉ auto-scope READ — IDOR write) | Luân | GĐ1 · 09–11/07 | ⬜ | P0 |
| 5 | **RBAC v2 flip prod** — Shadow-diff sạch N≈7 ngày → RBAC_V2_ENABLED=true; rà DENY grant cũ | Luân | GĐ0 shadow→GĐ2 flip | 🟡 | P0 |
| 6 | **Bật SCORM prod** — SCORM_ENABLED=true + R2 creds/CORS trên Vercel + e2e browser staging (blur/watermark/IDOR) | Kiệt *(từ Huy)* | GĐ2 · 15–17/07 | ⬜ | P1 |
| 7 | **Điểm danh 6 nhãn (hoàn tất)** — Hoàn thiện UI 6 nhãn điểm danh + null-row (no PENDING enum) — P0 vận hành lớp | Kiệt *(từ Huy)* | GĐ1 · 06–09/07 | 🟡 | P0 |
| 8 | **Portal học phí PH (hoàn tất)** — PH xem công nợ + khoản đã xác nhận (nối Finance ↔ Portal); getParentConfirmedPayments | Luân+Kiệt | GĐ2 · 08–12/07 | 🟡 | P1 |
| 9 | **Site/UI Giáo viên riêng** — Vy design FE + Luân BE (đang thiết kế) — hoàn thiện cho GV dùng | Luân+Vy | GĐ2 · 08–18/07 | ⬜ | P1 |
| 10 | **Roles editor + Audit viewer UI** — UI ma trận action×scope per role (setRolePermissions) + trang /admin/audit-log hợp nhất (gộp 8 bảng cũ) | Luân | GĐ2 · 14–18/07 | 🟡 | P1 |
| 11 | **Quyết định treo (TBD-2/3/4)** — Công thức hoàn tiền/pro-rate/clawback (TBD-2) · chốt migrate prod (TBD-3) · mức quét file SCORM zip (TBD-4) | TGĐ + Kiệt | GĐ0–GĐ1 | ⬜ | P0 |
| 12 | **UAT 2 cơ sở + regression** — Chạy thật CS1+CS2, fix P0/P1, e2e browser còn skip | Cả nhóm | GĐ4 · 23–25/07 | ⬜ | P0 |
| 13 | **⚠️ Tái cân đối tải sau khi Huy+Trí rời** — Kiệt ~39 ngày-công, Luân ~46 ngày-công / ~20 ngày còn lại → PM phải cắt scope hoặc dời deadline (xem đề xuất trong [KIET.md](KIET.md) §7 · [LUAN.md](LUAN.md) §7) | PM + TGĐ | Ngay 03–04/07 | ⬜ | P0 |

## 5. Rủi ro chính

- **🚨 Mất 2 nhân sự giữa sprint (03/07):** tổng ~103 ngày-công cho 3 người / ~20 ngày làm việc → **quá tải ~2x**. Bắt buộc chọn: cắt scope (đề xuất tại KIET.md §7, LUAN.md §7) hoặc dời go-live. Cần TGĐ chốt trong GĐ0.
- **Kiệt gánh FIN + SIS + LMS/SCORM + NOTIF + deploy** → ưu tiên đúng thứ tự P0 (K1→K4→H1→H2→H3); H4 có thể rút subset trigger; SCORM đã live bản cơ bản — phần còn lại (e2e blur/watermark/IDOR) có thể dời.
- **Luân gánh FOUND + PORTAL + TEACHER + LOGIN/RBAC + CRM + REPORT** → điểm bù: T2+L4 cùng người (bớt phối hợp); T1 guard trùng lượt quét file với L1. Ưu tiên enforcement + login trước; T4/L7/L8 là ứng viên cắt.
- **Không còn mentor/junior** → K8 chuyển thành review chéo Kiệt↔Luân cho mọi PR đụng tiền/quyền/enrollment.
- **Migration prod + flip RBAC/scopedDb** → làm sớm GĐ0 · shadow 7 ngày trước flip · rollback plan.
- **Portal 100% + Site GV mới** → Vy FE song song · Luân BE · UAT sớm người thật.
- **3 quyết định treo (hoàn tiền/migrate/SCORM)** → chốt TGĐ tuần 1.

## 6. Docs theo người

- [Kiệt](KIET.md) — FIN · Deploy/migration prod · **SIS · LMS · NOTIF** *(nhận từ Huy)*
- [Luân](LUAN.md) — FOUND (RBAC/scopedDb enforcement) · PORTAL · TEACHER-BE · **LOGIN/RBAC-BE · CRM · REPORT** *(nhận từ Trí)*
- [Vy](VY.md) — LOGIN UI · UI phân quyền · TEACHER UI · FE polish Portal/Admin · Design system
- ~~[Huy](HUY.md)~~ — rời team 03/07, file giữ làm biên bản bàn giao
- ~~[Trí](TRI.md)~~ — rời team 03/07, file giữ làm biên bản bàn giao

## 7. Ngoài scope 26/07 (cuốn chiếu + R&D)
- Tích hợp bên thứ 3: Zalo OA/ZNS · cổng thanh toán online (VNPay/Tingee) · MISA AMIS.
- Nghiệp vụ nâng cao: Commission/Marketing · Satacoin runtime · đánh giá hiệu suất HR · xếp lớp tự động.
- R&D: marketplace · multi-tenant nhượng quyền · proctoring · PWA/app native.
- **Đã LOẠI (khách chốt 05/06):** AI camera/sinh trắc/chatbot/gợi ý lộ trình · Web3/NFT · student login riêng · online video LMS · teacher domain riêng · lưu giấy tờ tuỳ thân HS.
