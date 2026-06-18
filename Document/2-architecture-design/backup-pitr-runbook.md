# Backup / PITR Runbook (ERD-C7)

> Khôi phục dữ liệu Supabase Postgres. RPO mục tiêu 24h / RTO 4–8h (Doc 15). Đây là
> **cấu hình hạ tầng + quy trình** (không phải code) — chủ tài khoản Supabase thực hiện.

## 1. Bật & xác nhận backup

- **PITR (Point-in-Time Recovery):** Supabase Dashboard → Project → Database → Backups
  → bật **PITR** (gói Pro trở lên). PITR cho khôi phục tới từng giây trong cửa sổ
  giữ (mặc định 7 ngày). Daily backup (logical) bật mặc định.
- Xác nhận cửa sổ giữ ≥ 7 ngày (đủ phát hiện sự cố trước khi mất bản sao).

## 2. Khi cần khôi phục (sự cố mất/hỏng dữ liệu)

1. **Khoá ghi:** tạm dừng app (Vercel → Pause / hoặc xoay `DATABASE_URL` về read-only)
   để không ghi đè trong lúc điều tra.
2. **Chọn mốc:** Dashboard → Backups → PITR → chọn timestamp NGAY TRƯỚC sự cố.
3. **Restore:** Supabase tạo restore (project mới hoặc in-place tuỳ gói). Lấy connection
   string mới.
4. **Trỏ app:** cập nhật `DATABASE_URL` / `DIRECT_URL` (pooler — xem rules/prisma-db.md
   về IPv6/pooler) → redeploy.
5. **Kiểm tra toàn vẹn:** chạy smoke (login, đọc 1 lớp/HV/đơn), đối chiếu số bản ghi
   tài chính gần nhất.

## 3. Migration & restore

- Mọi migration trong `prisma/migrations/` là nguồn schema. Sau restore, chạy
  `prisma migrate deploy` nếu mốc khôi phục cũ hơn migration mới nhất.
- ⚠️ KHÔNG `prisma migrate reset` trên prod (hook chặn).

## 4. Test restore định kỳ (BẮT BUỘC để RTO có thật)

- Mỗi quý: restore sang project tạm → smoke → đo thời gian (RTO) → ghi nhật ký.
- Backup không test = không có backup.

## 5. Dữ liệu nhạy cảm (NĐ13)

- Bản backup chứa PII trẻ em → cùng nghĩa vụ bảo vệ; giới hạn quyền truy cập Supabase
  Dashboard (chỉ DPO/super-admin). Export thủ công phải có watermark + audit (xem
  `lib/compliance/*`).

## 6. Trách nhiệm

| Việc | Ai |
|---|---|
| Bật PITR + giữ ≥7 ngày | Chủ tài khoản Supabase |
| Test restore hàng quý | DevOps/DPO |
| Quyết định khôi phục khi sự cố | SUPER_ADMIN + DPO |
