# 📍 Hiện trạng dự án Sata Robo VN (snapshot 2026-06-10)

> Bộ tài liệu **mô tả ĐÚNG hiện trạng code đang chạy** (không phải kế hoạch). Dùng để onboard + triển khai yêu cầu mới. Khi xung đột với blueprint Doc 15 → Doc 15 thắng cho việc xây MỚI; bộ này thắng cho việc hiểu "đang có gì".

| # | Tài liệu | Nội dung |
|---|---|---|
| 00 | [Tổng quan hiện trạng](00-tong-quan-hien-trang.md) | Tech stack, 3 domain, trạng thái deploy, lộ trình A0→R5, cờ flag |
| 01 | [Database + ERD](01-database-erd.md) | 119 model + 54 enum, quan hệ then chốt, model scoped theo cơ sở |
| 02 | [Luồng Backend](02-luong-backend.md) | RBAC v1/v2, scopedDb, DomainEvent/outbox, 9 cron, services, webhook |
| 03 | [UI Admin](03-ui-admin.md) | ~158 route admin nhóm 13 domain + quyền + luồng |
| 04 | [UI Public/Portal/Auth](04-ui-public-portal-auth.md) | Trang ngoài, portal phụ huynh, login/kích hoạt, host routing |
| 05 | [Luồng nghiệp vụ chính](05-luong-nghiep-vu-chinh.md) | Lead→Enrollment, tạo lớp+sinh buổi, điểm danh, chấm công, setup account |
| 06 | [⚠️ Audit lỗ hổng](06-audit-lo-hong.md) | Phát hiện bảo mật xếp theo mức độ + đề xuất khắc phục |

## Tóm tắt 1 phút
- **Kiến trúc:** Next.js 16 modular monolith, 1 app / 3 domain (public `satarobo.vn`, admin `admin.satarobo.vn`, portal `hocvien.satarobo.vn`).
- **Quy mô:** 119 Prisma model · 54 enum · ~158 route admin · 41 route public/portal · 9 cron · ~63 file server actions.
- **Trạng thái:** lộ trình A0→R5 đã đóng (test 434 PASS, build PASS), schema prod Supabase đã đồng bộ, 6+ cron bảo vệ bằng CRON_SECRET.
- **2 trụ bảo mật CHƯA "live" (xem [06](06-audit-lo-hong.md)):** `scopedDb` (cách ly cơ sở) mới áp ở 2 file; **RBAC v2 động đang TẮT** (`RBAC_V2_ENABLED=false`) → quyền chạy matrix tĩnh v1. Đây là điểm cần ưu tiên trước khi mở rộng đa cơ sở.

## Khi triển khai yêu cầu MỚI — đọc nhanh
1. Model có sẵn chưa? → [01](01-database-erd.md).
2. Có service/luồng tái dùng được? → [02](02-luong-backend.md) + [05](05-luong-nghiep-vu-chinh.md).
3. Đặt route ở đâu (admin/public/portal)? → [03](03-ui-admin.md) / [04](04-ui-public-portal-auth.md).
4. Gate quyền + cách ly cơ sở đúng chưa? → [06](06-audit-lo-hong.md) (tránh lặp lỗ hổng C1/C2).
