# Kế hoạch GO-LIVE 26/07/2026 — BẢN V4.1 (phạm vi thu gọn · bàn giao 03/07)

> **Cập nhật:** 2026-07-03 (Huy & Trí rời team — bàn giao Huy→Kiệt, Trí→Luân) · **Go-live:** 26/07/2026 · **Lịch:** 6 ngày/tuần (nghỉ CN)
> **Nguồn:** v3 (kiểm kê 271 tính năng / 12 module) + tài liệu kiến trúc arc42 (`E:\satarobo_document` → https://hptkk29.github.io/SataRoBo_DocumentLikeC4-ARC42/), đặc biệt **§11 Rủi ro & Nợ kỹ thuật** (đối chiếu code `file:line`).
> **File khách:** `E:\LandingPage_data\SataRobo_DacTaTinhNang_KeHoach_GoLive_2607_v4.xlsx` (sheet "V4 — PHẠM VI THU GỌN").
> **Tasks MISA:** `E:\LandingPage_data\SataRobo_Tasks_MISA_v4.xlsx` · bản markdown: [tasks-danh-sach.md](tasks-danh-sach.md).
> **Yêu cầu chi tiết:** [yeu-cau-theo-thanh-vien.md](yeu-cau-theo-thanh-vien.md).

## 0. V4 khác v3 ở đâu · V4.1 khác v4 ở đâu

**Mục tiêu v4:** thu nhỏ phạm vi để chạy được **1 luồng vận hành đầy đủ** ngay ngày go-live, thay vì ôm cả 271 tính năng.

**Luồng lõi (chạy thật CS1 + CS2):**
`Lead (đã đăng ký) → Convert (Sale) → Học viên chính thức → Xếp vào lớp → Điểm danh (GV) → Đánh giá buổi học → Học bạ → Phụ huynh/HV xem trên Portal.`

**Trong MVP v4 (187/271 TN):** Nền tảng/Login/RBAC (đầy đủ, giữ blocker) · CRM cơ bản · SIS · Tài chính cơ bản · **LMS đầy đủ (cả SCORM + Exam)** · **Site Giáo viên RIÊNG** (tách như portal) · Portal PH/HV đầy đủ · Báo cáo cơ bản · Email cơ bản · Public (maintain).

**Cuốn chiếu SAU 26/07:** Marketing/Hoa hồng · HR chấm công (QR/geofence/ca/bảng công) · Zalo/MISA/cổng thanh toán online · Báo cáo nâng cao + export · Tài chính nâng cao (hoàn tiền/voucher/VietQR/pricing) · SataCoin/PWA/marketplace/proctoring.

**⚠️ V4.1 (03/07) — thay đổi nhân sự:** Huy & Trí rời team.
1. **Huy → Kiệt:** toàn bộ SIS · LMS (gồm SCORM) · NOTIF — task **H1–H8** giữ nguyên mã, đổi người thực hiện trên MISA.
2. **Trí → Luân:** toàn bộ LOGIN & PHÂN QUYỀN (BE) · CRM cơ bản · REPORT cơ bản — task **T1–T6** giữ nguyên mã.
3. Task mentor **K8** → **review chéo Kiệt↔Luân** (không ai tự merge PR đụng tiền/quyền của mình).
4. **Tải vượt ~2x** (Kiệt ~39 · Luân ~46 ngày-công / ~20 ngày còn lại) → PM+TGĐ phải chốt cắt scope hoặc dời deadline (đề xuất tại [../KIET.md](../KIET.md) §7 · [../LUAN.md](../LUAN.md) §7).

## 1. Nhân sự & lane (v4.1)

| Người | Cấp | Lane v4.1 |
|---|---|---|
| **Kiệt** | Mid · Tech-lead | FIN cơ bản · Deploy/migration prod · **SIS · LMS (đầy đủ, gồm SCORM) · NOTIF (email)** *(nhận từ Huy)* |
| **Luân** | Mid | FOUND enforcement (scopedDb · RBAC v2 flip · audit) · PORTAL · TEACHER-BE (site GV riêng) · **LOGIN & PHÂN QUYỀN (BE) · CRM cơ bản · REPORT cơ bản** *(nhận từ Trí)* |
| **Vy** | FE Design | **LOGIN UI + UI phân quyền** · **SITE GV UI (riêng)** · Portal FE polish · Design system |
| ~~Huy~~ | — | *Rời team 03/07 — xem [../HUY.md](../HUY.md)* |
| ~~Trí~~ | — | *Rời team 03/07 — xem [../TRI.md](../TRI.md)* |

## 2. Module × phạm vi v4 (MVP/tổng)

| Module | Người | MVP/tổng | Ghi chú v4 |
|---|---|---|---|
| FOUND — Nền tảng/Login/RBAC | Luân (+Vy UI) | 23/23 | Giữ blocker đầy đủ; BE login/RBAC gộp về Luân |
| CRM — Sale | Luân *(từ Trí)* | 15/24 | Cơ bản: quản lý lead đã ĐK + convert |
| SIS — HV·Lớp·Điểm danh | Kiệt *(từ Huy)* | 25/32 | Bỏ kho/phòng/import lớp |
| FIN — Tài chính | Kiệt | 10/23 | Cơ bản: thu/xác nhận/phiếu thu/công nợ |
| LMS — Đào tạo | Kiệt *(từ Huy)* | 20/20 | **Đầy đủ** (SCORM + Exam) |
| TEACHER — Site GV riêng | Luân + Vy | 22/22 | **Tách site riêng** |
| PORTAL — PH/HV | Luân | 19/23 | Đầy đủ (trừ SataCoin/khảo sát) |
| HR — Nhân sự | Kiệt | 5/19 | Chỉ hồ sơ NS (phục vụ phân quyền) |
| MKT — Marketing | — | 0/16 | Cuốn chiếu sau |
| REPORT — Báo cáo | Luân *(từ Trí)* | 10/21 | Cơ bản: dashboard + panels |
| NOTIF — Thông báo | Kiệt *(từ Huy)* | 14/24 | Email cơ bản (bỏ Zalo/MISA) |
| PUBLIC — Public | Kiệt | 24/24 | Maintain |

## 3. Sprint go-live (giữ khung v3)

| GĐ | Thời gian | Trọng tâm v4.1 |
|---|---|---|
| **GĐ0** | 01–04/07 | Migration prod 2 CS · commit fix Payment · chốt TBD · shadow RBAC · **tái cân đối tải sau bàn giao** |
| **GĐ1** | 06–13/07 | Lõi: Login&RBAC BE (Luân) + UI (Vy) · CRM cơ bản (Luân) · Điểm danh 6 nhãn (Kiệt) · Finance cơ bản (Kiệt) · scopedDb error-gate (Luân) |
| **GĐ2** | 08–18/07 | Portal 100% + **Site GV riêng** (Luân BE + Vy UI) · RBAC v2 flip + audit · LMS SCORM + prod (Kiệt) |
| **GĐ3** | 20–22/07 | Báo cáo cơ bản (Luân) · hardening · regression |
| **GĐ4** | 23–26/07 | UAT 2 cơ sở · fix P0/P1 · GO-LIVE |

## 4. 🚨 Blocker chặn go-live (P0)

| # | Hạng mục | Người | Task |
|---|---|---|---|
| 1 | Apply migration prod 2 CS + seed tổ chức | Kiệt | K1 |
| 2 | Commit fix PH-1/PH-2/C4/C5 + migration treo | Kiệt | K2 |
| 3 | Vá cộng đôi Payment (PAY-DEDUP) | Kiệt | K3 |
| 4 | scopedDb error-gate (~221 file) | Luân | L1 |
| 5 | scopedDb WRITE guard passesScope | Luân | L2 |
| 6 | RBAC v2 flip (shadow 7 ngày) | Luân | L4, T2 |
| 7 | Login & phân quyền BE + guard | Luân *(từ Trí)* | T1 |
| 8 | UI Login | Vy | V1 |
| 9 | Điểm danh 6 nhãn | Kiệt *(từ Huy)* | H1 |
| 10 | Fix HomeworkAssignment.status + convertLeadV2 sĩ số | Kiệt *(từ Huy)* | H2, H3 |
| 11 | Finance cơ bản end-to-end | Kiệt | K4 |
| 12 | Chốt 3 TBD (hoàn tiền/migrate/SCORM) | TGĐ+Kiệt | K7 |
| 13 | **Tái cân đối tải/scope sau khi mất 2 nhân sự** | PM+TGĐ | — |
| 14 | UAT 2 cơ sở + deploy | Cả nhóm | K9, H8, T6 |

## 5. Rủi ro & cách kiểm soát

- **🚨 Mất 2 nhân sự giữa sprint (03/07):** còn 3 người gánh ~103 ngày-công / ~20 ngày → quá tải ~2x. **Bắt buộc** cắt scope (đề xuất KIET.md §7 / LUAN.md §7: rút H4 subset trigger, H7 verify-only, dời phần e2e SCORM; hạ T4, rút T5, dời L7/L8) hoặc dời go-live — TGĐ chốt trong GĐ0.
- **Kiệt ôm FIN+SIS+LMS+NOTIF+deploy; Luân ôm FOUND+PORTAL+TEACHER+LOGIN/RBAC+CRM+REPORT** → ưu tiên nghiêm ngặt P0 trước, P1 sau, P2 cắt; mọi PR đụng tiền/quyền review chéo Kiệt↔Luân (K8).
- **Điểm bù từ bàn giao:** T2 (RBAC logic) + L4 (flip) cùng Luân → không còn chi phí chốt interface; T1 (guard assertCan) làm chung lượt quét file với L1; H6+K6 (SCORM) cùng Kiệt → không còn bước bàn giao staging→prod.
- **Login/RBAC còn 2 người (Luân BE · Vy UI)** → Luân chốt hợp đồng interface sớm; Vy dựng UI trên mock, ghép BE sau.
- **Site GV mới tinh** → Luân dựng khung route/host GĐ2 sớm; Vy làm UI trên khung; UAT GV thật sớm.
- **Nợ kỹ thuật §11 (consent ảnh, homework status, scope write, convert sĩ số)** → đã tách thành task riêng có DoD + test, không để "dính chùm".
- **Kiểm soát chất lượng:** mỗi task MISA có **Tiêu chí nghiệm thu (DoD)** + **Cách kiểm thử** — không đánh "hoàn thành" nếu chưa qua bước kiểm thử; task đụng tiền/quyền phải có review chéo.
- **Kiểm soát khối lượng:** cột **Ước lượng (ngày-công)** + **Ngày BĐ→Hạn** trên MISA; theo dõi % hoàn thành theo GĐ.
