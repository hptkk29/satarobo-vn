# Kế hoạch GO-LIVE 26/07 — Vy  🩷 Hồng  ·  BẢN V4 (phạm vi thu gọn)

> **Cấp:** FE Design  ·  **Lane v4:** **LOGIN UI + UI PHÂN QUYỀN** · **SITE GIÁO VIÊN RIÊNG (UI)** · FE polish Portal/Admin · Design system  ·  **Cập nhật:** 2026-07-02  ·  **Mục tiêu:** GO-LIVE 26/07/2026
> Nguồn: v4 thu gọn + arc42 (§2 ràng buộc UI, §6 GV/Phụ huynh). Xem: [v4/README.md](v4/README.md) · [v4/yeu-cau-theo-thanh-vien.md](v4/yeu-cau-theo-thanh-vien.md).
>
> ⚠️ **Mới ở v4:** Vy nhận thêm **UI Login + UI phân quyền** (ghép BE T1/T2 + L9 — sau bàn giao 03/07 đều do **Luân**) và **UI Site Giáo viên RIÊNG** (ghép khung BE của Luân L5). Kiến trúc site GV = **như Portal PH/HV**.
> ⚠️ **Bàn giao 03/07:** Huy & Trí rời team — mọi đầu mối BE của Vy giờ là **Luân** (login/RBAC/site GV/portal) và **Kiệt** (LMS/SCORM/tài chính).

## 1. Phạm vi v4 (trong / ngoài)
- **TRONG MVP 26/07:** UI Login chung + kích hoạt TK PH · UI phân quyền (Roles/RolePermission/Users/Audit) · **UI Site Giáo viên riêng** · FE polish Portal PH/HV (mobile 375px) · Design system.
- **NGOÀI:** — (đều là lõi go-live).

## 2. Dòng công việc theo sprint
- **GĐ1 (01–06/07):** UI Login (đăng nhập chung · redirect theo vai trò · kích hoạt TK PH).
- **GĐ1–2 (06–10/07):** UI phân quyền (Roles/RolePermission editor · Users · Audit viewer) — ghép BE Luân (T2/L9).
- **GĐ2 (08–15/07):** UI Site Giáo viên RIÊNG (như portal) — ghép khung BE Luân (L5).
- **GĐ2 (16–20/07):** FE polish Portal PH/HV (22 màn, 375px).
- **Liên tục (01–25/07):** Design system + review UI các màn mới.

## 3. Ràng buộc UI (arc42 §2 / rule ui-libraries)
- **Client/Portal/Site GV** = shadcn + Magic UI + Motion; **Admin** = shadcn + Recharts (ESLint chặn cross-import — không workaround).
- **Mobile-first 375px** bắt buộc. Brand: cam `#F97316` / tím `#7C3AED`. Animation client ≤ 600ms; admin = CSS transition.
- Ảnh `next/image` (không `<img>` thuần); ảnh portal qua signed URL.

## 4. Việc chi tiết theo phần
| Mã | Việc | Ưu | Ngày | Yêu cầu chính | Nghiệm thu (DoD) | Kiểm thử | Est |
|---|---|---|---|---|---|---|---|
| **V1** | UI Login chung + redirect + kích hoạt TK PH | P0 | 01–06/07 | Màn đăng nhập chung 3 domain + UI điều hướng theo vai trò + màn `/kich-hoat` (OTP); trạng thái lỗi/không-quyền rõ; responsive 375px | Login UI chạy 3 domain, 375px, thông báo lỗi rõ | Đăng nhập từng vai trò trên mobile; nhập OTP kích hoạt | 4d |
| **V2** | UI Roles/RolePermission + Users + Audit viewer | P1 | 06–10/07 | UI ma trận tick `action × scopeType` cho từng vai trò (`setRolePermissions`, nhãn VI từ `action-labels`) + quản lý Users + gán vai trò (`org-roles`) + Audit viewer. Ghép BE Luân (T2 + L9) | SUPER_ADMIN cấu hình vai trò+quyền qua UI (không cần seed tay); mỗi thao tác nhập lý do | Tạo role + tick action×scope + gán user; xem audit | 4d |
| **V3** | UI Site Giáo viên RIÊNG (như portal) | P1 | 08–15/07 | Thiết kế + FE site GV riêng: điểm danh · giáo án/SCORM · chấm bài · đánh giá buổi · học bạ · lịch dạy · báo cáo tiến độ. Mobile-first. Ghép khung BE Luân (L5) | Đủ màn GV vận hành trên site riêng; 375px; đồng bộ design system | GV thao tác đủ luồng trên site GV mobile | 6d |
| **V4** | FE polish Portal PH/HV (22 màn) | P1 | 16–20/07 | Rà 22 màn portal: 375px, trạng thái rỗng/lỗi, signed URL ảnh, nhất quán | 22 màn portal mượt 375px; empty/error state đầy đủ | Duyệt từng màn portal trên mobile viewport | 4d |
| **V5** | Design system + review UI | P1 | 01–25/07 | Component library + tokens brand (cam/tím); review UI màn mới (Login/Roles/GV) | Màn mới dùng chung design system; brand nhất quán | Review checklist UI; đối chiếu tokens | — |

## 5. Phối hợp & phụ thuộc
- **Login/phân quyền:** Vy dựng UI trên **mock/hợp đồng interface** của Luân (T1/T2 — nhận từ Trí) sớm, ghép BE sau; Audit viewer ghép Luân (L9).
- **Site GV:** chờ khung route/host của Luân (L5) — bắt đầu thiết kế UI song song từ GĐ1, ghép khi khung sẵn GĐ2.
- **Portal:** phối hợp Luân (L7 consent ảnh, L8 presign tài liệu) để FE hiển thị đúng trạng thái.
- **DoD chung:** smoke mobile 375px + đúng ESLint UI-split + brand tokens.
