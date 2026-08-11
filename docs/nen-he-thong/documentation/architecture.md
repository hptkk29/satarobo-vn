# architecture.md — Nền Hệ thống satarobo (INTENDED STATE)

> Tài liệu tả trạng thái ĐÍCH sau P5, không phải hiện trạng. Dùng làm chuẩn so sánh cho audit "documented == implemented".

## Tổng quan

Lõi "Thiết lập › Hệ thống" của satarobo: cây tổ chức 3 tầng + pháp nhân, vị trí/phân công/nơi tác nghiệp, registry quyền + resolver `can()` 4 mức dataScope, nhóm người dùng, hợp đồng nhượng quyền, danh mục kế thừa, khuôn mẫu đơn vị, audit log. Mọi module nghiệp vụ (chat, lớp học, học phí, chấm công...) cắm vào lõi này — không module nào tự chế cơ chế quyền.

**Giả định then chốt:** (1) một dev thi công tuần tự theo 6 pha, không song song với đợt chat; (2) dữ liệu sheet của Sale nằm ngoài phạm vi backfill; (3) MISA giữ Kế toán + Tiền lương/BHXH/Thuế TNCN — seam là file bảng công + doanh thu tháng đẩy sang.

## Stack

Next.js App Router (một app duy nhất) · Server Actions là tầng nghiệp vụ · Prisma → Supabase Postgres · Vercel (+ Vercel Cron) · Không backend tách riêng, không microservice (quyết định 26/07).

## Auth & claims end-to-end

1. Đăng nhập Supabase Auth → session JWT chứa `userId` (KHÔNG nhúng role/scope vào token — nguồn quyền là DB, tránh token cũ giữ quyền đã thu).
2. Mỗi Server Action: lấy `userId` từ session → `can(actor, permissionKey, target)`.
3. `can()` resolve: Assignment còn hiệu lực → Position → Role + UserGroup → PermissionGrant (DENY > ALLOW > kế thừa) → dataScope theo `OrgUnit.path` ∪ WorkScope → với grant `derivedFrom`: kiểm trạng thái FranchiseContract tại thời điểm chạy.
4. Cache resolve theo request, không cache phiên.

## Ranh giới tin cậy

| Ranh giới | Luật |
|---|---|
| Browser → Server Action | Mọi input validate (zod); không tin ID client gửi — mọi target đi qua `can()` |
| Service-role key (Supabase) | Chỉ server; client dùng anon key + RLS |
| Job (Vercel Cron) → app | Xác thực bằng secret riêng (xem variables.md), idempotent |
| satarobo → MISA (seam kế toán) | Một chiều đẩy file; MISA không gọi ngược vào satarobo |
| Phụ huynh | Ngoài cây tổ chức; scope duy nhất = OWN qua bảng Guardian–Student |

## Known risks / assumptions (bám mã)

- Fallback `can()` về logic `centerId` tồn tại từ P0 đến P4 — hai đường quyền song song, chỉ được gỡ sau cutover (xem flows.md F6).
- `path LIKE prefix` là điểm nóng hiệu năng duy nhất của resolver; index prefix bắt buộc, đo ở P3.
- Cột `centerId` deprecated sau P4 nhưng chưa drop — code mới cấm đọc nó (lint).
- Chuỗi 4 điều kiện chương trình dạy là bề mặt IDOR rủi ro nhất — bắt buộc kiểm ở server, TS-18 chặn merge.

## Tài liệu liên quan

flows.md · permissions.md · variables.md · cron.md · tests.md
Không có emails.md (nền không gửi email — ZNS/notification thuộc module khác). Không có seo.md (toàn bộ là màn admin sau đăng nhập). Không có automation.md (nền không nhúng agent; Claude Code là công cụ thi công, không phải thành phần runtime).
