# variables.md — Cấu hình & bí mật (INTENDED STATE)

> **[AS-BUILT US-01 · 09/08/2026]** Không thêm secret mới. Step "Sync permission registry" trong `deploy.yml`/`migrate-test.yml` tái dùng `PROD_DIRECT_URL`/`TEST_DIRECT_URL` sẵn có (SESSION pooler — tránh quirk prepared-statement của transaction pooler, tiền lệ seed-prod-roles.yml).

## Bảng biến

| Tên | Dùng bởi | Phạm vi | Nguồn | Xoay vòng | Rủi ro nếu lộ |
|---|---|---|---|---|---|
| DATABASE_URL | Prisma (server) | server | Vercel env | Khi nghi ngờ / đổi nhân sự dev | **Cao** — toàn bộ DB |
| SUPABASE_SERVICE_ROLE_KEY | Server Actions, script backfill | server | Vercel env | Như trên | **Cao** — vượt RLS |
| NEXT_PUBLIC_SUPABASE_URL / ANON_KEY | Client | client (công khai theo thiết kế) | Vercel env | Không cần | Thấp — RLS chặn |
| CRON_SECRET | Job đối soát, header xác thực | server | Vercel env | 6 tháng | Trung bình — kích hoạt job giả |
| CUTOVER_RESOLVER_FLAG | `can()` (P3–P4) | server (env hoặc bảng config) | Vercel env / DB | — | **Cao về vận hành** — đổi hành vi quyền toàn hệ; chỉ ADMIN_HO+Dev, mọi lần đổi ghi audit |
| SEPAY_WEBHOOK_SECRET | Module thanh toán (ngoài nền, liệt kê vì cùng repo) | server | Vercel env | 6 tháng | Cao — giả giao dịch |

## Xác nhận bắt buộc trước go-live

- [ ] Không secret nào xuất hiện trong bundle client (`next build` + quét chuỗi) — bài học từ đợt quét secret LandingPageQuaTang 27/07.
- [ ] Không secret hardcode trong repo (gitleaks chạy CI — đã là hạng mục hardening 27/07).
- [ ] DEV và PROD Supabase tách biệt (đã tách 16/07); script backfill chỉ chạy PROD qua checklist tay, không tự động.
- [ ] Hai account Vercel cùng domain đã gộp về một (E4 pre-mortem) — điều kiện trước P4.
- [ ] `CUTOVER_RESOLVER_FLAG` có runbook bật/tắt kèm người trực.
